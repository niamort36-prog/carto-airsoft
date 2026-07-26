import 'dart:convert';

import 'package:drift/drift.dart' show Value;

import '../db/local_db.dart';
import 'games_api.dart';
import 'models.dart';

/// Synchronisation offline-first des objets tactiques (§7.6).
///
/// Principe : l'affichage lit TOUJOURS la base locale. Une pose hors ligne
/// y entre avec `pending=true` (affichée « en attente »), la file est vidée
/// vers le serveur dès que possible — l'upsert serveur étant idempotent sur
/// l'id client, rejouer la file ne crée jamais de doublon. La réconciliation
/// inverse passe par le delta `sync?since=<curseur>` (tombstones compris).
class ObjectSyncService {
  ObjectSyncService(this.gameId);

  final String gameId;
  final LocalDb _db = LocalDb.instance;

  /// Objets affichables (tombstones exclus), y compris ceux en attente.
  Future<List<MapObjectView>> loadLocal() async {
    final rows = await _db.objectsForGame(gameId);
    return [
      for (final r in rows)
        if (r.deletedAt == null) _toView(r),
    ];
  }

  Future<void> saveLocal(MapObjectView o, {required bool pending}) =>
      _db.upsertObject(_toRow(o, pending: pending));

  /// Vide la file d'attente puis tire le delta. `true` si tout a réussi.
  Future<bool> trySync() async {
    try {
      final pending = await _db.pendingForGame(gameId);
      if (pending.isNotEmpty) {
        await GamesApi.pushObjects(gameId, [
          for (final p in pending) _toDto(p),
        ]);
        for (final p in pending) {
          await _db.upsertObject(_toRow(_toView(p), pending: false));
        }
      }
      final since = await _db.getCursor(gameId);
      final delta = await GamesApi.syncObjects(gameId, since: since);
      for (final o in delta.objects) {
        await saveLocal(o, pending: false);
      }
      await _db.setCursor(gameId, delta.serverTime);
      return true;
    } catch (_) {
      // Hors ligne ou serveur injoignable : la file attend son heure.
      return false;
    }
  }

  MapObjectView _toView(LocalObject r) => MapObjectView(
        id: r.id,
        kind: r.kind,
        markerType: r.markerType,
        lat: r.lat,
        lng: r.lng,
        properties:
            (jsonDecode(r.propertiesJson) as Map).cast<String, dynamic>(),
        geometry: r.geometryJson != null
            ? (jsonDecode(r.geometryJson!) as Map).cast<String, dynamic>()
            : null,
        authorMembershipId: r.authorMembershipId,
        createdAt: r.createdAt,
        deletedAt: r.deletedAt,
        pending: r.pending,
      );

  LocalObjectsCompanion _toRow(MapObjectView o, {required bool pending}) =>
      LocalObjectsCompanion.insert(
        id: o.id,
        gameId: gameId,
        kind: o.kind,
        markerType: o.markerType,
        lat: o.lat,
        lng: o.lng,
        propertiesJson: jsonEncode(o.properties),
        geometryJson:
            Value(o.geometry != null ? jsonEncode(o.geometry) : null),
        authorMembershipId: o.authorMembershipId,
        createdAt: o.createdAt,
        deletedAt: Value(o.deletedAt),
        pending: Value(pending),
      );

  Map<String, dynamic> _toDto(LocalObject r) => {
        'id': r.id,
        'kind': r.kind,
        'markerType': r.markerType,
        'lat': r.lat,
        'lng': r.lng,
        'properties':
            (jsonDecode(r.propertiesJson) as Map).cast<String, dynamic>(),
        if (r.geometryJson != null)
          'geometry':
              (jsonDecode(r.geometryJson!) as Map).cast<String, dynamic>(),
        'createdAt': r.createdAt.toUtc().toIso8601String(),
        if (r.deletedAt != null) 'deleted': true,
      };
}
