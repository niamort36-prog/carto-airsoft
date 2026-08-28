import 'dart:convert';

import 'package:http/http.dart' as http;
import 'package:supabase_flutter/supabase_flutter.dart';

import '../app_config.dart';
import 'models.dart';

/// Client REST de l'API arbitre (principe API-first §2.2 :
/// l'app ne parle jamais directement à la base).
class GamesApi {
  static Map<String, String> _headers() => {
        'Authorization':
            'Bearer ${Supabase.instance.client.auth.currentSession?.accessToken ?? ''}',
        'Content-Type': 'application/json',
      };

  static Uri _uri(String path) => Uri.parse('${AppConfig.apiBaseUrl}$path');

  static Future<List<GameSummary>> myGames() async {
    final res = await http.get(_uri('/games'), headers: _headers());
    _ensureOk(res);
    final list = jsonDecode(res.body) as List<dynamic>;
    return [
      for (final item in list)
        GameSummary.fromJson(item as Map<String, dynamic>),
    ];
  }

  static Future<GameSummary> createGame(String name) async {
    final res = await http.post(
      _uri('/games'),
      headers: _headers(),
      body: jsonEncode({'name': name}),
    );
    _ensureOk(res);
    final game = jsonDecode(res.body) as Map<String, dynamic>;
    return GameSummary.fromJson({'game': game, 'role': 'orga'});
  }

  static Future<void> joinGame(String gameId) async {
    final res = await http.post(
      _uri('/games/$gameId/join'),
      headers: _headers(),
    );
    _ensureOk(res);
  }

  /// Quitter une partie rejointe. Le serveur refuse au créateur de quitter
  /// la sienne — le message d'erreur est remonté tel quel.
  static Future<void> leaveGame(String gameId) async {
    final res = await http.post(
      _uri('/games/$gameId/leave'),
      headers: _headers(),
    );
    _ensureOk(res);
  }

  /// Nomination (commandant), changement d'insigne ou pose d'étiquette
  /// (fréquence radio) — validé serveur. [note] absent ne touche à rien ;
  /// une chaîne vide efface l'étiquette.
  static Future<void> updateMember(
    String gameId,
    String membershipId, {
    String? role,
    String? unitType,
    Object? note = _absent,
  }) async {
    final body = <String, dynamic>{
      'role': ?role,
      'unitType': ?unitType,
    };
    if (!identical(note, _absent)) body['note'] = note;
    final res = await http.patch(
      _uri('/games/$gameId/members/$membershipId'),
      headers: _headers(),
      body: jsonEncode(body),
    );
    _ensureOk(res);
  }

  /// Pousse un lot d'objets carte — idempotent sur l'id client (§7.6).
  static Future<List<MapObjectView>> pushObjects(
    String gameId,
    List<Map<String, dynamic>> objects,
  ) async {
    final res = await http.post(
      _uri('/games/$gameId/map-objects/batch'),
      headers: _headers(),
      body: jsonEncode({'objects': objects}),
    );
    _ensureOk(res);
    final list = jsonDecode(res.body) as List<dynamic>;
    return [
      for (final o in list)
        MapObjectView.fromJson(o as Map<String, dynamic>),
    ];
  }

  /// Delta de synchro : tout ce qui a changé depuis [since] (§7.6).
  static Future<({String serverTime, List<MapObjectView> objects})>
      syncObjects(String gameId, {String? since}) async {
    final query = since != null ? '?since=${Uri.encodeComponent(since)}' : '';
    final res =
        await http.get(_uri('/games/$gameId/sync$query'), headers: _headers());
    _ensureOk(res);
    final body = jsonDecode(res.body) as Map<String, dynamic>;
    return (
      serverTime: body['serverTime'] as String,
      objects: [
        for (final o in (body['objects'] as List<dynamic>))
          MapObjectView.fromJson(o as Map<String, dynamic>),
      ],
    );
  }

  /// Escouades du camp d'un joueur, pour l'affecter en partie.
  static Future<List<SquadSummary>> squadsOfTeam(
    String gameId,
    String? teamId,
  ) async {
    final res = await http.get(
      _uri('/games/$gameId/teams'),
      headers: _headers(),
    );
    _ensureOk(res);
    final out = <SquadSummary>[];
    for (final t in (jsonDecode(res.body) as List<dynamic>)) {
      final team = t as Map<String, dynamic>;
      if (teamId != null && team['id'] != teamId) continue;
      for (final sq in (team['squads'] as List<dynamic>)) {
        final squad = sq as Map<String, dynamic>;
        out.add(SquadSummary(
          id: squad['id'] as String,
          name: squad['name'] as String,
          teamId: team['id'] as String,
          leaderMembershipId: squad['leaderMembershipId'] as String?,
          reportsToMembershipId: squad['reportsToMembershipId'] as String?,
          note: squad['note'] as String?,
        ));
      }
    }
    return out;
  }

  /// Forme une escouade dans un camp (permission `squads:manage`).
  static Future<SquadSummary> createSquad(
    String gameId,
    String teamId,
    String name,
  ) async {
    final res = await http.post(
      _uri('/games/$gameId/squads'),
      headers: _headers(),
      body: jsonEncode({'teamId': teamId, 'name': name}),
    );
    _ensureOk(res);
    final body = jsonDecode(res.body) as Map<String, dynamic>;
    return SquadSummary(
      id: body['id'] as String,
      name: body['name'] as String,
      teamId: body['teamId'] as String,
      leaderMembershipId: body['leaderMembershipId'] as String?,
      reportsToMembershipId: body['reportsToMembershipId'] as String?,
      note: body['note'] as String?,
    );
  }

  /// Modifie une escouade : son nom, ou l'étiquette affichée à côté de son
  /// marqueur (fréquence radio du réseau). Un champ absent n'est pas touché.
  static Future<void> updateSquad(
    String gameId,
    String squadId, {
    String? name,
    Object? note = _absent,
  }) async {
    final body = <String, dynamic>{'name': ?name};
    if (!identical(note, _absent)) body['note'] = note;
    final res = await http.patch(
      _uri('/games/$gameId/squads/$squadId'),
      headers: _headers(),
      body: jsonEncode(body),
    );
    _ensureOk(res);
  }

  /// Affecte un membre : camp, escouade, supérieur direct. Un champ absent
  /// n'est pas touché ; `null` retire le rattachement.
  static Future<void> assignMember(
    String gameId,
    String membershipId, {
    Object? teamId = _absent,
    Object? squadId = _absent,
    Object? reportsToMembershipId = _absent,
  }) async {
    final body = <String, dynamic>{};
    if (!identical(teamId, _absent)) body['teamId'] = teamId;
    if (!identical(squadId, _absent)) body['squadId'] = squadId;
    if (!identical(reportsToMembershipId, _absent)) {
      body['reportsToMembershipId'] = reportsToMembershipId;
    }
    final res = await http.patch(
      _uri('/games/$gameId/members/$membershipId/assignment'),
      headers: _headers(),
      body: jsonEncode(body),
    );
    _ensureOk(res);
  }

  /// Sentinelle « champ non fourni » — distincte de `null`, qui veut dire
  /// « retirer le rattachement ».
  static const _absent = Object();

  /// Organisation de la partie : équipes et escouades (§4). Sert à grouper
  /// les alliés et à nommer les rattachements.
  static Future<Map<String, String>> unitNames(String gameId) async =>
      (await organisation(gameId)).names;

  /// Noms des unités ET étiquettes des escouades, en un seul appel : les
  /// deux viennent de la même réponse, les demander séparément doublerait
  /// le trafic pour rien.
  static Future<({Map<String, String> names, Map<String, String> notes})>
      organisation(String gameId) async {
    final res = await http.get(
      _uri('/games/$gameId/teams'),
      headers: _headers(),
    );
    _ensureOk(res);
    final names = <String, String>{};
    final notes = <String, String>{};
    for (final t in (jsonDecode(res.body) as List<dynamic>)) {
      final team = t as Map<String, dynamic>;
      names[team['id'] as String] = team['name'] as String;
      for (final s in (team['squads'] as List<dynamic>)) {
        final squad = s as Map<String, dynamic>;
        names[squad['id'] as String] = squad['name'] as String;
        final note = (squad['note'] as String?)?.trim() ?? '';
        if (note.isNotEmpty) notes[squad['id'] as String] = note;
      }
    }
    return (names: names, notes: notes);
  }

  /// Mes permissions dans une partie (§5) — l'app s'y conforme pour
  /// n'afficher que les actions réellement possibles.
  static Future<List<String>> myPermissions(String gameId) async {
    final res = await http.get(
      _uri('/games/$gameId/permissions'),
      headers: _headers(),
    );
    _ensureOk(res);
    final body = jsonDecode(res.body) as Map<String, dynamic>;
    return [for (final p in (body['mine'] as List<dynamic>)) p as String];
  }

  // --- Invitations QR (§7.2) -----------------------------------------------

  static Future<List<InviteView>> invites(String gameId) async {
    final res = await http.get(
      _uri('/games/$gameId/invites'),
      headers: _headers(),
    );
    _ensureOk(res);
    return [
      for (final i in (jsonDecode(res.body) as List<dynamic>))
        InviteView.fromJson(i as Map<String, dynamic>),
    ];
  }

  /// Génère un QR pour un rôle. Le jeton en clair n'est renvoyé qu'ici.
  static Future<InviteView> createInvite(
    String gameId, {
    required String role,
    int? maxUses,
  }) async {
    final res = await http.post(
      _uri('/games/$gameId/invites'),
      headers: _headers(),
      body: jsonEncode({'role': role, 'maxUses': ?maxUses}),
    );
    _ensureOk(res);
    return InviteView.fromJson(jsonDecode(res.body) as Map<String, dynamic>);
  }

  static Future<void> revokeInvite(String gameId, String inviteId) async {
    final res = await http.delete(
      _uri('/games/$gameId/invites/$inviteId'),
      headers: _headers(),
    );
    _ensureOk(res);
  }

  /// Présente un jeton scanné. Le serveur reconnaît seul sa nature —
  /// invitation, capture d'objectif ou bonus (§7.2, §7.8, §7.9) — et arbitre.
  static Future<ScanOutcome> scan(String token) async {
    final res = await http.post(
      _uri('/scan'),
      headers: _headers(),
      body: jsonEncode({'token': token}),
    );
    _ensureOk(res);
    return ScanOutcome.fromJson(
      jsonDecode(res.body) as Map<String, dynamic>,
    );
  }

  // --- Gamification (§7.7-7.9) ---------------------------------------------

  static Future<List<ObjectiveView>> objectives(String gameId) async {
    final res = await http.get(
      _uri('/games/$gameId/objectives'),
      headers: _headers(),
    );
    _ensureOk(res);
    return [
      for (final o in (jsonDecode(res.body) as List<dynamic>))
        ObjectiveView.fromJson(o as Map<String, dynamic>),
    ];
  }

  static Future<List<TeamScore>> scores(String gameId) async {
    final res = await http.get(
      _uri('/games/$gameId/scores'),
      headers: _headers(),
    );
    _ensureOk(res);
    return [
      for (final s in (jsonDecode(res.body) as List<dynamic>))
        TeamScore.fromJson(s as Map<String, dynamic>),
    ];
  }

  static Future<List<PerkView>> perks(String gameId) async {
    final res =
        await http.get(_uri('/games/$gameId/perks'), headers: _headers());
    _ensureOk(res);
    return [
      for (final p in (jsonDecode(res.body) as List<dynamic>))
        PerkView.fromJson(p as Map<String, dynamic>),
    ];
  }

  /// Active un perk sur une zone. Le serveur valide et calcule le résultat.
  static Future<PerkActivation> activatePerk(
    String gameId,
    String perkId, {
    required double lat,
    required double lng,
  }) async {
    final res = await http.post(
      _uri('/games/$gameId/perks/$perkId/activate'),
      headers: _headers(),
      body: jsonEncode({'lat': lat, 'lng': lng}),
    );
    _ensureOk(res);
    return PerkActivation.fromJson(
      jsonDecode(res.body) as Map<String, dynamic>,
    );
  }

  // --- Messagerie (§7.4) ---------------------------------------------------

  static Future<List<ChannelView>> channels(String gameId) async {
    final res =
        await http.get(_uri('/games/$gameId/channels'), headers: _headers());
    _ensureOk(res);
    return [
      for (final c in (jsonDecode(res.body) as List<dynamic>))
        ChannelView.fromJson(c as Map<String, dynamic>),
    ];
  }

  static Future<({String serverTime, List<MessageView> messages})> messages(
    String gameId,
    String channelId, {
    String? since,
  }) async {
    final query = since != null ? '?since=${Uri.encodeComponent(since)}' : '';
    final res = await http.get(
      _uri('/games/$gameId/channels/$channelId/messages$query'),
      headers: _headers(),
    );
    _ensureOk(res);
    final body = jsonDecode(res.body) as Map<String, dynamic>;
    return (
      serverTime: body['serverTime'] as String,
      messages: [
        for (final m in (body['messages'] as List<dynamic>))
          MessageView.fromJson(m as Map<String, dynamic>),
      ],
    );
  }

  static Future<MessageView> sendMessage(
    String gameId,
    String channelId, {
    required String id,
    required String body,
    required DateTime createdAt,
  }) async {
    final res = await http.post(
      _uri('/games/$gameId/channels/$channelId/messages'),
      headers: _headers(),
      body: jsonEncode({
        'id': id,
        'body': body,
        'createdAt': createdAt.toUtc().toIso8601String(),
      }),
    );
    _ensureOk(res);
    return MessageView.fromJson(jsonDecode(res.body) as Map<String, dynamic>);
  }

  static void _ensureOk(http.Response res) {
    if (res.statusCode < 200 || res.statusCode >= 300) {
      String message = 'Erreur ${res.statusCode}';
      try {
        final body = jsonDecode(res.body) as Map<String, dynamic>;
        if (body['message'] is String) message = body['message'] as String;
      } catch (_) {}
      throw GamesApiException(message, res.statusCode);
    }
  }
}

class GamesApiException implements Exception {
  const GamesApiException(this.message, this.statusCode);

  final String message;
  final int statusCode;

  @override
  String toString() => message;
}
