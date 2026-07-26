import 'package:drift/drift.dart';
import 'package:drift_flutter/drift_flutter.dart';

part 'local_db.g.dart';

/// Miroir local des objets tactiques (§7.6) : ce que l'app affiche vient
/// TOUJOURS d'ici. Le serveur reste l'arbitre ; cette base n'est que le
/// cache + la file d'attente du téléphone.
class LocalObjects extends Table {
  /// UUID généré côté client — clé d'idempotence de bout en bout.
  TextColumn get id => text()();
  TextColumn get gameId => text()();
  TextColumn get kind => text()();
  TextColumn get markerType => text()();
  RealColumn get lat => real()();
  RealColumn get lng => real()();
  TextColumn get propertiesJson => text()();

  /// GeoJSON LineString/Polygon (kinds line/zone), null pour les marqueurs.
  TextColumn get geometryJson => text().nullable()();
  TextColumn get authorMembershipId => text()();
  DateTimeColumn get createdAt => dateTime()();
  DateTimeColumn get deletedAt => dateTime().nullable()();

  /// true = pas encore accepté par le serveur (« en attente de synchro »).
  BoolColumn get pending => boolean().withDefault(const Constant(false))();

  @override
  Set<Column> get primaryKey => {id};
}

/// Curseur de synchro delta par partie : « j'ai tout jusqu'à cet instant ».
class SyncCursors extends Table {
  TextColumn get gameId => text()();
  TextColumn get cursor => text()();

  @override
  Set<Column> get primaryKey => {gameId};
}

/// Messages en cache + file d'attente (§7.4 + §7.6) : un message écrit hors
/// réseau part tout seul à la reconnexion, comme un marqueur.
class LocalMessages extends Table {
  TextColumn get id => text()();
  TextColumn get gameId => text()();
  TextColumn get channelId => text()();
  TextColumn get body => text()();
  TextColumn get authorMembershipId => text()();
  TextColumn get authorName => text()();
  DateTimeColumn get createdAt => dateTime()();
  BoolColumn get pending => boolean().withDefault(const Constant(false))();

  @override
  Set<Column> get primaryKey => {id};
}

/// Canaux en cache : ouvrir la messagerie hors réseau doit donner accès aux
/// mêmes canaux que la dernière fois (le serveur reste seul juge des droits,
/// il revalide à chaque envoi).
class LocalChannels extends Table {
  TextColumn get id => text()();
  TextColumn get gameId => text()();
  TextColumn get scope => text()();
  TextColumn get name => text()();

  @override
  Set<Column> get primaryKey => {id};
}

/// Cache de « Mes parties » : l'accueil doit s'ouvrir en pleine forêt (§2.3)
/// pour atteindre la carte et les marqueurs déjà en cache.
class LocalGames extends Table {
  TextColumn get id => text()();
  TextColumn get name => text()();
  TextColumn get status => text()();
  TextColumn get role => text()();

  @override
  Set<Column> get primaryKey => {id};
}

@DriftDatabase(
  tables: [
    LocalObjects,
    SyncCursors,
    LocalGames,
    LocalMessages,
    LocalChannels,
  ],
)
class LocalDb extends _$LocalDb {
  LocalDb() : super(driftDatabase(name: 'carto_airsoft'));

  static final LocalDb instance = LocalDb();

  @override
  int get schemaVersion => 5;

  @override
  MigrationStrategy get migration => MigrationStrategy(
        onUpgrade: (m, from, to) async {
          if (from < 2) {
            await m.createTable(localGames);
          }
          if (from < 3) {
            await m.addColumn(localObjects, localObjects.geometryJson);
          }
          if (from < 4) {
            await m.createTable(localMessages);
          }
          if (from < 5) {
            await m.createTable(localChannels);
          }
        },
      );

  Future<List<LocalChannel>> channelsForGame(String gameId) =>
      (select(localChannels)..where((c) => c.gameId.equals(gameId))).get();

  Future<void> saveChannels(
    String gameId,
    List<LocalChannelsCompanion> rows,
  ) =>
      batch((b) {
        b.deleteWhere(localChannels, (c) => c.gameId.equals(gameId));
        b.insertAll(localChannels, rows);
      });

  Future<List<LocalMessage>> messagesForChannel(String channelId) =>
      (select(localMessages)
            ..where((m) => m.channelId.equals(channelId))
            ..orderBy([(m) => OrderingTerm(expression: m.createdAt)]))
          .get();

  Future<List<LocalMessage>> pendingMessages(String gameId) => (select(
        localMessages,
      )..where((m) => m.gameId.equals(gameId) & m.pending.equals(true)))
          .get();

  Future<void> upsertMessage(LocalMessagesCompanion row) =>
      into(localMessages).insertOnConflictUpdate(row);

  Future<List<LocalGame>> cachedGames() => select(localGames).get();

  Future<void> saveGames(List<LocalGamesCompanion> rows) =>
      batch((b) {
        b.deleteAll(localGames);
        b.insertAll(localGames, rows);
      });

  Future<List<LocalObject>> objectsForGame(String gameId) =>
      (select(localObjects)..where((o) => o.gameId.equals(gameId))).get();

  Future<List<LocalObject>> pendingForGame(String gameId) => (select(
        localObjects,
      )..where((o) => o.gameId.equals(gameId) & o.pending.equals(true)))
          .get();

  Future<void> upsertObject(LocalObjectsCompanion row) =>
      into(localObjects).insertOnConflictUpdate(row);

  Future<String?> getCursor(String gameId) async {
    final row = await (select(syncCursors)
          ..where((c) => c.gameId.equals(gameId)))
        .getSingleOrNull();
    return row?.cursor;
  }

  Future<void> setCursor(String gameId, String cursor) =>
      into(syncCursors).insertOnConflictUpdate(
        SyncCursorsCompanion.insert(gameId: gameId, cursor: cursor),
      );
}
