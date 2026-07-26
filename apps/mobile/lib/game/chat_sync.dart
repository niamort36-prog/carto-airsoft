import 'package:drift/drift.dart' show Value;

import '../db/local_db.dart';
import 'games_api.dart';
import 'models.dart';

/// Synchronisation offline-first de la messagerie (§7.4 + §7.6).
///
/// Même contrat que les objets carte : l'affichage lit la base LOCALE, un
/// message écrit hors réseau y entre avec `pending=true` et part tout seul
/// à la reconnexion. L'envoi étant idempotent sur l'id client, rejouer la
/// file ne duplique jamais un message.
class ChatSyncService {
  ChatSyncService(this.gameId);

  final String gameId;
  final LocalDb _db = LocalDb.instance;

  Future<List<MessageView>> loadLocal(String channelId) async {
    final rows = await _db.messagesForChannel(channelId);
    return [for (final r in rows) _toView(r)];
  }

  /// Mon identifiant de membre, mémorisé pour que « mes » messages restent
  /// reconnaissables même sans socket (hors réseau).
  Future<String?> myMembershipId() => _db.getCursor('me:$gameId');

  static Future<void> rememberMembership(String gameId, String membershipId) =>
      LocalDb.instance.setCursor('me:$gameId', membershipId);

  /// Canaux du dernier passage — permet d'ouvrir la messagerie hors réseau.
  Future<List<ChannelView>> cachedChannels() async {
    final rows = await _db.channelsForGame(gameId);
    return [
      for (final r in rows)
        ChannelView(id: r.id, scope: r.scope, name: r.name),
    ];
  }

  Future<void> cacheChannels(List<ChannelView> channels) => _db.saveChannels(
        gameId,
        [
          for (final c in channels)
            LocalChannelsCompanion.insert(
              id: c.id,
              gameId: gameId,
              scope: c.scope,
              name: c.name,
            ),
        ],
      );

  Future<void> saveLocal(MessageView m, {required bool pending}) =>
      _db.upsertMessage(_toRow(m, pending: pending));

  /// Dernière erreur de synchro, pour l'afficher au joueur (un message qui
  /// ne part jamais doit se voir, pas rester silencieusement en attente).
  String? lastError;

  /// Vide la file puis tire le delta de chaque canal. `true` si tout a réussi.
  Future<bool> trySync(List<String> channelIds) async {
    try {
      for (final p in await _db.pendingMessages(gameId)) {
        final sent = await GamesApi.sendMessage(
          gameId,
          p.channelId,
          id: p.id,
          body: p.body,
          createdAt: p.createdAt,
        );
        await saveLocal(sent, pending: false);
      }
      for (final channelId in channelIds) {
        final since = await _db.getCursor('chat:$channelId');
        final delta = await GamesApi.messages(
          gameId,
          channelId,
          since: since,
        );
        for (final m in delta.messages) {
          await saveLocal(m, pending: false);
        }
        await _db.setCursor('chat:$channelId', delta.serverTime);
      }
      lastError = null;
      return true;
    } catch (e) {
      lastError = _humanError(e);
      return false;
    }
  }

  /// Message lisible sur le terrain : le joueur a besoin de savoir s'il doit
  /// attendre le réseau ou si quelque chose d'autre bloque.
  static String _humanError(Object e) {
    if (e is GamesApiException) {
      return switch (e.statusCode) {
        401 || 403 => 'Accès refusé à ce canal.',
        _ => e.message,
      };
    }
    return 'Serveur injoignable — envoi dès le retour du réseau.';
  }

  MessageView _toView(LocalMessage r) => MessageView(
        id: r.id,
        channelId: r.channelId,
        body: r.body,
        authorMembershipId: r.authorMembershipId,
        authorName: r.authorName,
        createdAt: r.createdAt,
        pending: r.pending,
      );

  LocalMessagesCompanion _toRow(MessageView m, {required bool pending}) =>
      LocalMessagesCompanion.insert(
        id: m.id,
        gameId: gameId,
        channelId: m.channelId,
        body: m.body,
        authorMembershipId: m.authorMembershipId,
        authorName: m.authorName,
        createdAt: m.createdAt,
        pending: Value(pending),
      );
}
