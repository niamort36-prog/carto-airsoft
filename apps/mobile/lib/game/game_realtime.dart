import 'package:socket_io_client/socket_io_client.dart' as sio;
import 'package:supabase_flutter/supabase_flutter.dart';

import '../app_config.dart';
import 'models.dart';

/// Liaison temps réel avec l'arbitre (§7.3).
///
/// Reconnexion automatique gérée par Socket.IO ; à chaque (re)connexion on
/// rejoint la partie et on reçoit un instantané complet des membres — la
/// réconciliation après une coupure réseau est donc automatique.
class GameRealtime {
  GameRealtime({
    required this.gameId,
    required this.onSnapshot,
    required this.onMemberUpdate,
    required this.onConnectionChanged,
    this.onObjectUpsert,
  });

  final String gameId;
  final void Function(List<MemberView> members, String myMembershipId)
      onSnapshot;
  final void Function(MemberView member) onMemberUpdate;
  final void Function(bool connected) onConnectionChanged;
  final void Function(MapObjectView object)? onObjectUpsert;

  /// Branché par l'écran de messagerie tant qu'il est ouvert (§7.4).
  void Function(MessageView message)? onChatMessage;

  /// Appelé à chaque (re)connexion réussie — sert à vider les files
  /// d'attente sans attendre une action du joueur (§7.6).
  void Function()? onReconnected;

  /// Événement de perk : activation (avec sa zone) ou brouillage.
  void Function(Map<String, dynamic> event)? onPerkEvent;

  sio.Socket? _socket;

  void connect() {
    final base = AppConfig.apiBaseUrl.replaceFirst(RegExp(r'/v1/?$'), '');
    final token =
        Supabase.instance.client.auth.currentSession?.accessToken ?? '';
    final socket = sio.io(
      '$base/game',
      sio.OptionBuilder()
          .setTransports(['websocket'])
          .setAuth({'token': token})
          .enableReconnection()
          .build(),
    );
    _socket = socket;

    socket.onConnect((_) {
      socket.emitWithAck('game:join', {'gameId': gameId}, ack: (dynamic ack) {
        if (ack is Map && ack['ok'] == true) {
          final members = [
            for (final m in (ack['members'] as List<dynamic>))
              MemberView.fromJson((m as Map).cast<String, dynamic>()),
          ];
          onSnapshot(members, ack['membershipId'] as String);
          onConnectionChanged(true);
          onReconnected?.call();
        } else {
          onConnectionChanged(false);
        }
      });
    });

    socket.on('member:update', (dynamic data) {
      if (data is Map) {
        onMemberUpdate(MemberView.fromJson(data.cast<String, dynamic>()));
      }
    });

    socket.on('object:upsert', (dynamic data) {
      if (data is Map) {
        onObjectUpsert
            ?.call(MapObjectView.fromJson(data.cast<String, dynamic>()));
      }
    });

    socket.on('chat:message', (dynamic data) {
      if (data is Map) {
        onChatMessage
            ?.call(MessageView.fromJson(data.cast<String, dynamic>()));
      }
    });

    socket.on('perk:event', (dynamic data) {
      if (data is Map) onPerkEvent?.call(data.cast<String, dynamic>());
    });

    socket.onDisconnect((_) => onConnectionChanged(false));
    socket.onConnectError((_) => onConnectionChanged(false));
  }

  void sendPosition(double lat, double lng) {
    _socket?.emit('position', {'gameId': gameId, 'lat': lat, 'lng': lng});
  }

  void sendStatus(LifeStatus status) {
    _socket?.emit('status', {'gameId': gameId, 'lifeStatus': status.wire});
  }

  void dispose() {
    _socket?.dispose();
    _socket = null;
  }
}
