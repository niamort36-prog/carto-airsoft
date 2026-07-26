// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'local_db.dart';

// ignore_for_file: type=lint
class $LocalObjectsTable extends LocalObjects
    with TableInfo<$LocalObjectsTable, LocalObject> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $LocalObjectsTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _idMeta = const VerificationMeta('id');
  @override
  late final GeneratedColumn<String> id = GeneratedColumn<String>(
    'id',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _gameIdMeta = const VerificationMeta('gameId');
  @override
  late final GeneratedColumn<String> gameId = GeneratedColumn<String>(
    'game_id',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _kindMeta = const VerificationMeta('kind');
  @override
  late final GeneratedColumn<String> kind = GeneratedColumn<String>(
    'kind',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _markerTypeMeta = const VerificationMeta(
    'markerType',
  );
  @override
  late final GeneratedColumn<String> markerType = GeneratedColumn<String>(
    'marker_type',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _latMeta = const VerificationMeta('lat');
  @override
  late final GeneratedColumn<double> lat = GeneratedColumn<double>(
    'lat',
    aliasedName,
    false,
    type: DriftSqlType.double,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _lngMeta = const VerificationMeta('lng');
  @override
  late final GeneratedColumn<double> lng = GeneratedColumn<double>(
    'lng',
    aliasedName,
    false,
    type: DriftSqlType.double,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _propertiesJsonMeta = const VerificationMeta(
    'propertiesJson',
  );
  @override
  late final GeneratedColumn<String> propertiesJson = GeneratedColumn<String>(
    'properties_json',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _geometryJsonMeta = const VerificationMeta(
    'geometryJson',
  );
  @override
  late final GeneratedColumn<String> geometryJson = GeneratedColumn<String>(
    'geometry_json',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _authorMembershipIdMeta =
      const VerificationMeta('authorMembershipId');
  @override
  late final GeneratedColumn<String> authorMembershipId =
      GeneratedColumn<String>(
        'author_membership_id',
        aliasedName,
        false,
        type: DriftSqlType.string,
        requiredDuringInsert: true,
      );
  static const VerificationMeta _createdAtMeta = const VerificationMeta(
    'createdAt',
  );
  @override
  late final GeneratedColumn<DateTime> createdAt = GeneratedColumn<DateTime>(
    'created_at',
    aliasedName,
    false,
    type: DriftSqlType.dateTime,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _deletedAtMeta = const VerificationMeta(
    'deletedAt',
  );
  @override
  late final GeneratedColumn<DateTime> deletedAt = GeneratedColumn<DateTime>(
    'deleted_at',
    aliasedName,
    true,
    type: DriftSqlType.dateTime,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _pendingMeta = const VerificationMeta(
    'pending',
  );
  @override
  late final GeneratedColumn<bool> pending = GeneratedColumn<bool>(
    'pending',
    aliasedName,
    false,
    type: DriftSqlType.bool,
    requiredDuringInsert: false,
    defaultConstraints: GeneratedColumn.constraintIsAlways(
      'CHECK ("pending" IN (0, 1))',
    ),
    defaultValue: const Constant(false),
  );
  @override
  List<GeneratedColumn> get $columns => [
    id,
    gameId,
    kind,
    markerType,
    lat,
    lng,
    propertiesJson,
    geometryJson,
    authorMembershipId,
    createdAt,
    deletedAt,
    pending,
  ];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'local_objects';
  @override
  VerificationContext validateIntegrity(
    Insertable<LocalObject> instance, {
    bool isInserting = false,
  }) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('id')) {
      context.handle(_idMeta, id.isAcceptableOrUnknown(data['id']!, _idMeta));
    } else if (isInserting) {
      context.missing(_idMeta);
    }
    if (data.containsKey('game_id')) {
      context.handle(
        _gameIdMeta,
        gameId.isAcceptableOrUnknown(data['game_id']!, _gameIdMeta),
      );
    } else if (isInserting) {
      context.missing(_gameIdMeta);
    }
    if (data.containsKey('kind')) {
      context.handle(
        _kindMeta,
        kind.isAcceptableOrUnknown(data['kind']!, _kindMeta),
      );
    } else if (isInserting) {
      context.missing(_kindMeta);
    }
    if (data.containsKey('marker_type')) {
      context.handle(
        _markerTypeMeta,
        markerType.isAcceptableOrUnknown(data['marker_type']!, _markerTypeMeta),
      );
    } else if (isInserting) {
      context.missing(_markerTypeMeta);
    }
    if (data.containsKey('lat')) {
      context.handle(
        _latMeta,
        lat.isAcceptableOrUnknown(data['lat']!, _latMeta),
      );
    } else if (isInserting) {
      context.missing(_latMeta);
    }
    if (data.containsKey('lng')) {
      context.handle(
        _lngMeta,
        lng.isAcceptableOrUnknown(data['lng']!, _lngMeta),
      );
    } else if (isInserting) {
      context.missing(_lngMeta);
    }
    if (data.containsKey('properties_json')) {
      context.handle(
        _propertiesJsonMeta,
        propertiesJson.isAcceptableOrUnknown(
          data['properties_json']!,
          _propertiesJsonMeta,
        ),
      );
    } else if (isInserting) {
      context.missing(_propertiesJsonMeta);
    }
    if (data.containsKey('geometry_json')) {
      context.handle(
        _geometryJsonMeta,
        geometryJson.isAcceptableOrUnknown(
          data['geometry_json']!,
          _geometryJsonMeta,
        ),
      );
    }
    if (data.containsKey('author_membership_id')) {
      context.handle(
        _authorMembershipIdMeta,
        authorMembershipId.isAcceptableOrUnknown(
          data['author_membership_id']!,
          _authorMembershipIdMeta,
        ),
      );
    } else if (isInserting) {
      context.missing(_authorMembershipIdMeta);
    }
    if (data.containsKey('created_at')) {
      context.handle(
        _createdAtMeta,
        createdAt.isAcceptableOrUnknown(data['created_at']!, _createdAtMeta),
      );
    } else if (isInserting) {
      context.missing(_createdAtMeta);
    }
    if (data.containsKey('deleted_at')) {
      context.handle(
        _deletedAtMeta,
        deletedAt.isAcceptableOrUnknown(data['deleted_at']!, _deletedAtMeta),
      );
    }
    if (data.containsKey('pending')) {
      context.handle(
        _pendingMeta,
        pending.isAcceptableOrUnknown(data['pending']!, _pendingMeta),
      );
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {id};
  @override
  LocalObject map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return LocalObject(
      id: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}id'],
      )!,
      gameId: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}game_id'],
      )!,
      kind: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}kind'],
      )!,
      markerType: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}marker_type'],
      )!,
      lat: attachedDatabase.typeMapping.read(
        DriftSqlType.double,
        data['${effectivePrefix}lat'],
      )!,
      lng: attachedDatabase.typeMapping.read(
        DriftSqlType.double,
        data['${effectivePrefix}lng'],
      )!,
      propertiesJson: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}properties_json'],
      )!,
      geometryJson: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}geometry_json'],
      ),
      authorMembershipId: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}author_membership_id'],
      )!,
      createdAt: attachedDatabase.typeMapping.read(
        DriftSqlType.dateTime,
        data['${effectivePrefix}created_at'],
      )!,
      deletedAt: attachedDatabase.typeMapping.read(
        DriftSqlType.dateTime,
        data['${effectivePrefix}deleted_at'],
      ),
      pending: attachedDatabase.typeMapping.read(
        DriftSqlType.bool,
        data['${effectivePrefix}pending'],
      )!,
    );
  }

  @override
  $LocalObjectsTable createAlias(String alias) {
    return $LocalObjectsTable(attachedDatabase, alias);
  }
}

class LocalObject extends DataClass implements Insertable<LocalObject> {
  /// UUID généré côté client — clé d'idempotence de bout en bout.
  final String id;
  final String gameId;
  final String kind;
  final String markerType;
  final double lat;
  final double lng;
  final String propertiesJson;

  /// GeoJSON LineString/Polygon (kinds line/zone), null pour les marqueurs.
  final String? geometryJson;
  final String authorMembershipId;
  final DateTime createdAt;
  final DateTime? deletedAt;

  /// true = pas encore accepté par le serveur (« en attente de synchro »).
  final bool pending;
  const LocalObject({
    required this.id,
    required this.gameId,
    required this.kind,
    required this.markerType,
    required this.lat,
    required this.lng,
    required this.propertiesJson,
    this.geometryJson,
    required this.authorMembershipId,
    required this.createdAt,
    this.deletedAt,
    required this.pending,
  });
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['id'] = Variable<String>(id);
    map['game_id'] = Variable<String>(gameId);
    map['kind'] = Variable<String>(kind);
    map['marker_type'] = Variable<String>(markerType);
    map['lat'] = Variable<double>(lat);
    map['lng'] = Variable<double>(lng);
    map['properties_json'] = Variable<String>(propertiesJson);
    if (!nullToAbsent || geometryJson != null) {
      map['geometry_json'] = Variable<String>(geometryJson);
    }
    map['author_membership_id'] = Variable<String>(authorMembershipId);
    map['created_at'] = Variable<DateTime>(createdAt);
    if (!nullToAbsent || deletedAt != null) {
      map['deleted_at'] = Variable<DateTime>(deletedAt);
    }
    map['pending'] = Variable<bool>(pending);
    return map;
  }

  LocalObjectsCompanion toCompanion(bool nullToAbsent) {
    return LocalObjectsCompanion(
      id: Value(id),
      gameId: Value(gameId),
      kind: Value(kind),
      markerType: Value(markerType),
      lat: Value(lat),
      lng: Value(lng),
      propertiesJson: Value(propertiesJson),
      geometryJson: geometryJson == null && nullToAbsent
          ? const Value.absent()
          : Value(geometryJson),
      authorMembershipId: Value(authorMembershipId),
      createdAt: Value(createdAt),
      deletedAt: deletedAt == null && nullToAbsent
          ? const Value.absent()
          : Value(deletedAt),
      pending: Value(pending),
    );
  }

  factory LocalObject.fromJson(
    Map<String, dynamic> json, {
    ValueSerializer? serializer,
  }) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return LocalObject(
      id: serializer.fromJson<String>(json['id']),
      gameId: serializer.fromJson<String>(json['gameId']),
      kind: serializer.fromJson<String>(json['kind']),
      markerType: serializer.fromJson<String>(json['markerType']),
      lat: serializer.fromJson<double>(json['lat']),
      lng: serializer.fromJson<double>(json['lng']),
      propertiesJson: serializer.fromJson<String>(json['propertiesJson']),
      geometryJson: serializer.fromJson<String?>(json['geometryJson']),
      authorMembershipId: serializer.fromJson<String>(
        json['authorMembershipId'],
      ),
      createdAt: serializer.fromJson<DateTime>(json['createdAt']),
      deletedAt: serializer.fromJson<DateTime?>(json['deletedAt']),
      pending: serializer.fromJson<bool>(json['pending']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'id': serializer.toJson<String>(id),
      'gameId': serializer.toJson<String>(gameId),
      'kind': serializer.toJson<String>(kind),
      'markerType': serializer.toJson<String>(markerType),
      'lat': serializer.toJson<double>(lat),
      'lng': serializer.toJson<double>(lng),
      'propertiesJson': serializer.toJson<String>(propertiesJson),
      'geometryJson': serializer.toJson<String?>(geometryJson),
      'authorMembershipId': serializer.toJson<String>(authorMembershipId),
      'createdAt': serializer.toJson<DateTime>(createdAt),
      'deletedAt': serializer.toJson<DateTime?>(deletedAt),
      'pending': serializer.toJson<bool>(pending),
    };
  }

  LocalObject copyWith({
    String? id,
    String? gameId,
    String? kind,
    String? markerType,
    double? lat,
    double? lng,
    String? propertiesJson,
    Value<String?> geometryJson = const Value.absent(),
    String? authorMembershipId,
    DateTime? createdAt,
    Value<DateTime?> deletedAt = const Value.absent(),
    bool? pending,
  }) => LocalObject(
    id: id ?? this.id,
    gameId: gameId ?? this.gameId,
    kind: kind ?? this.kind,
    markerType: markerType ?? this.markerType,
    lat: lat ?? this.lat,
    lng: lng ?? this.lng,
    propertiesJson: propertiesJson ?? this.propertiesJson,
    geometryJson: geometryJson.present ? geometryJson.value : this.geometryJson,
    authorMembershipId: authorMembershipId ?? this.authorMembershipId,
    createdAt: createdAt ?? this.createdAt,
    deletedAt: deletedAt.present ? deletedAt.value : this.deletedAt,
    pending: pending ?? this.pending,
  );
  LocalObject copyWithCompanion(LocalObjectsCompanion data) {
    return LocalObject(
      id: data.id.present ? data.id.value : this.id,
      gameId: data.gameId.present ? data.gameId.value : this.gameId,
      kind: data.kind.present ? data.kind.value : this.kind,
      markerType: data.markerType.present
          ? data.markerType.value
          : this.markerType,
      lat: data.lat.present ? data.lat.value : this.lat,
      lng: data.lng.present ? data.lng.value : this.lng,
      propertiesJson: data.propertiesJson.present
          ? data.propertiesJson.value
          : this.propertiesJson,
      geometryJson: data.geometryJson.present
          ? data.geometryJson.value
          : this.geometryJson,
      authorMembershipId: data.authorMembershipId.present
          ? data.authorMembershipId.value
          : this.authorMembershipId,
      createdAt: data.createdAt.present ? data.createdAt.value : this.createdAt,
      deletedAt: data.deletedAt.present ? data.deletedAt.value : this.deletedAt,
      pending: data.pending.present ? data.pending.value : this.pending,
    );
  }

  @override
  String toString() {
    return (StringBuffer('LocalObject(')
          ..write('id: $id, ')
          ..write('gameId: $gameId, ')
          ..write('kind: $kind, ')
          ..write('markerType: $markerType, ')
          ..write('lat: $lat, ')
          ..write('lng: $lng, ')
          ..write('propertiesJson: $propertiesJson, ')
          ..write('geometryJson: $geometryJson, ')
          ..write('authorMembershipId: $authorMembershipId, ')
          ..write('createdAt: $createdAt, ')
          ..write('deletedAt: $deletedAt, ')
          ..write('pending: $pending')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode => Object.hash(
    id,
    gameId,
    kind,
    markerType,
    lat,
    lng,
    propertiesJson,
    geometryJson,
    authorMembershipId,
    createdAt,
    deletedAt,
    pending,
  );
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is LocalObject &&
          other.id == this.id &&
          other.gameId == this.gameId &&
          other.kind == this.kind &&
          other.markerType == this.markerType &&
          other.lat == this.lat &&
          other.lng == this.lng &&
          other.propertiesJson == this.propertiesJson &&
          other.geometryJson == this.geometryJson &&
          other.authorMembershipId == this.authorMembershipId &&
          other.createdAt == this.createdAt &&
          other.deletedAt == this.deletedAt &&
          other.pending == this.pending);
}

class LocalObjectsCompanion extends UpdateCompanion<LocalObject> {
  final Value<String> id;
  final Value<String> gameId;
  final Value<String> kind;
  final Value<String> markerType;
  final Value<double> lat;
  final Value<double> lng;
  final Value<String> propertiesJson;
  final Value<String?> geometryJson;
  final Value<String> authorMembershipId;
  final Value<DateTime> createdAt;
  final Value<DateTime?> deletedAt;
  final Value<bool> pending;
  final Value<int> rowid;
  const LocalObjectsCompanion({
    this.id = const Value.absent(),
    this.gameId = const Value.absent(),
    this.kind = const Value.absent(),
    this.markerType = const Value.absent(),
    this.lat = const Value.absent(),
    this.lng = const Value.absent(),
    this.propertiesJson = const Value.absent(),
    this.geometryJson = const Value.absent(),
    this.authorMembershipId = const Value.absent(),
    this.createdAt = const Value.absent(),
    this.deletedAt = const Value.absent(),
    this.pending = const Value.absent(),
    this.rowid = const Value.absent(),
  });
  LocalObjectsCompanion.insert({
    required String id,
    required String gameId,
    required String kind,
    required String markerType,
    required double lat,
    required double lng,
    required String propertiesJson,
    this.geometryJson = const Value.absent(),
    required String authorMembershipId,
    required DateTime createdAt,
    this.deletedAt = const Value.absent(),
    this.pending = const Value.absent(),
    this.rowid = const Value.absent(),
  }) : id = Value(id),
       gameId = Value(gameId),
       kind = Value(kind),
       markerType = Value(markerType),
       lat = Value(lat),
       lng = Value(lng),
       propertiesJson = Value(propertiesJson),
       authorMembershipId = Value(authorMembershipId),
       createdAt = Value(createdAt);
  static Insertable<LocalObject> custom({
    Expression<String>? id,
    Expression<String>? gameId,
    Expression<String>? kind,
    Expression<String>? markerType,
    Expression<double>? lat,
    Expression<double>? lng,
    Expression<String>? propertiesJson,
    Expression<String>? geometryJson,
    Expression<String>? authorMembershipId,
    Expression<DateTime>? createdAt,
    Expression<DateTime>? deletedAt,
    Expression<bool>? pending,
    Expression<int>? rowid,
  }) {
    return RawValuesInsertable({
      if (id != null) 'id': id,
      if (gameId != null) 'game_id': gameId,
      if (kind != null) 'kind': kind,
      if (markerType != null) 'marker_type': markerType,
      if (lat != null) 'lat': lat,
      if (lng != null) 'lng': lng,
      if (propertiesJson != null) 'properties_json': propertiesJson,
      if (geometryJson != null) 'geometry_json': geometryJson,
      if (authorMembershipId != null)
        'author_membership_id': authorMembershipId,
      if (createdAt != null) 'created_at': createdAt,
      if (deletedAt != null) 'deleted_at': deletedAt,
      if (pending != null) 'pending': pending,
      if (rowid != null) 'rowid': rowid,
    });
  }

  LocalObjectsCompanion copyWith({
    Value<String>? id,
    Value<String>? gameId,
    Value<String>? kind,
    Value<String>? markerType,
    Value<double>? lat,
    Value<double>? lng,
    Value<String>? propertiesJson,
    Value<String?>? geometryJson,
    Value<String>? authorMembershipId,
    Value<DateTime>? createdAt,
    Value<DateTime?>? deletedAt,
    Value<bool>? pending,
    Value<int>? rowid,
  }) {
    return LocalObjectsCompanion(
      id: id ?? this.id,
      gameId: gameId ?? this.gameId,
      kind: kind ?? this.kind,
      markerType: markerType ?? this.markerType,
      lat: lat ?? this.lat,
      lng: lng ?? this.lng,
      propertiesJson: propertiesJson ?? this.propertiesJson,
      geometryJson: geometryJson ?? this.geometryJson,
      authorMembershipId: authorMembershipId ?? this.authorMembershipId,
      createdAt: createdAt ?? this.createdAt,
      deletedAt: deletedAt ?? this.deletedAt,
      pending: pending ?? this.pending,
      rowid: rowid ?? this.rowid,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (id.present) {
      map['id'] = Variable<String>(id.value);
    }
    if (gameId.present) {
      map['game_id'] = Variable<String>(gameId.value);
    }
    if (kind.present) {
      map['kind'] = Variable<String>(kind.value);
    }
    if (markerType.present) {
      map['marker_type'] = Variable<String>(markerType.value);
    }
    if (lat.present) {
      map['lat'] = Variable<double>(lat.value);
    }
    if (lng.present) {
      map['lng'] = Variable<double>(lng.value);
    }
    if (propertiesJson.present) {
      map['properties_json'] = Variable<String>(propertiesJson.value);
    }
    if (geometryJson.present) {
      map['geometry_json'] = Variable<String>(geometryJson.value);
    }
    if (authorMembershipId.present) {
      map['author_membership_id'] = Variable<String>(authorMembershipId.value);
    }
    if (createdAt.present) {
      map['created_at'] = Variable<DateTime>(createdAt.value);
    }
    if (deletedAt.present) {
      map['deleted_at'] = Variable<DateTime>(deletedAt.value);
    }
    if (pending.present) {
      map['pending'] = Variable<bool>(pending.value);
    }
    if (rowid.present) {
      map['rowid'] = Variable<int>(rowid.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('LocalObjectsCompanion(')
          ..write('id: $id, ')
          ..write('gameId: $gameId, ')
          ..write('kind: $kind, ')
          ..write('markerType: $markerType, ')
          ..write('lat: $lat, ')
          ..write('lng: $lng, ')
          ..write('propertiesJson: $propertiesJson, ')
          ..write('geometryJson: $geometryJson, ')
          ..write('authorMembershipId: $authorMembershipId, ')
          ..write('createdAt: $createdAt, ')
          ..write('deletedAt: $deletedAt, ')
          ..write('pending: $pending, ')
          ..write('rowid: $rowid')
          ..write(')'))
        .toString();
  }
}

class $SyncCursorsTable extends SyncCursors
    with TableInfo<$SyncCursorsTable, SyncCursor> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $SyncCursorsTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _gameIdMeta = const VerificationMeta('gameId');
  @override
  late final GeneratedColumn<String> gameId = GeneratedColumn<String>(
    'game_id',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _cursorMeta = const VerificationMeta('cursor');
  @override
  late final GeneratedColumn<String> cursor = GeneratedColumn<String>(
    'cursor',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  @override
  List<GeneratedColumn> get $columns => [gameId, cursor];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'sync_cursors';
  @override
  VerificationContext validateIntegrity(
    Insertable<SyncCursor> instance, {
    bool isInserting = false,
  }) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('game_id')) {
      context.handle(
        _gameIdMeta,
        gameId.isAcceptableOrUnknown(data['game_id']!, _gameIdMeta),
      );
    } else if (isInserting) {
      context.missing(_gameIdMeta);
    }
    if (data.containsKey('cursor')) {
      context.handle(
        _cursorMeta,
        cursor.isAcceptableOrUnknown(data['cursor']!, _cursorMeta),
      );
    } else if (isInserting) {
      context.missing(_cursorMeta);
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {gameId};
  @override
  SyncCursor map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return SyncCursor(
      gameId: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}game_id'],
      )!,
      cursor: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}cursor'],
      )!,
    );
  }

  @override
  $SyncCursorsTable createAlias(String alias) {
    return $SyncCursorsTable(attachedDatabase, alias);
  }
}

class SyncCursor extends DataClass implements Insertable<SyncCursor> {
  final String gameId;
  final String cursor;
  const SyncCursor({required this.gameId, required this.cursor});
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['game_id'] = Variable<String>(gameId);
    map['cursor'] = Variable<String>(cursor);
    return map;
  }

  SyncCursorsCompanion toCompanion(bool nullToAbsent) {
    return SyncCursorsCompanion(gameId: Value(gameId), cursor: Value(cursor));
  }

  factory SyncCursor.fromJson(
    Map<String, dynamic> json, {
    ValueSerializer? serializer,
  }) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return SyncCursor(
      gameId: serializer.fromJson<String>(json['gameId']),
      cursor: serializer.fromJson<String>(json['cursor']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'gameId': serializer.toJson<String>(gameId),
      'cursor': serializer.toJson<String>(cursor),
    };
  }

  SyncCursor copyWith({String? gameId, String? cursor}) =>
      SyncCursor(gameId: gameId ?? this.gameId, cursor: cursor ?? this.cursor);
  SyncCursor copyWithCompanion(SyncCursorsCompanion data) {
    return SyncCursor(
      gameId: data.gameId.present ? data.gameId.value : this.gameId,
      cursor: data.cursor.present ? data.cursor.value : this.cursor,
    );
  }

  @override
  String toString() {
    return (StringBuffer('SyncCursor(')
          ..write('gameId: $gameId, ')
          ..write('cursor: $cursor')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode => Object.hash(gameId, cursor);
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is SyncCursor &&
          other.gameId == this.gameId &&
          other.cursor == this.cursor);
}

class SyncCursorsCompanion extends UpdateCompanion<SyncCursor> {
  final Value<String> gameId;
  final Value<String> cursor;
  final Value<int> rowid;
  const SyncCursorsCompanion({
    this.gameId = const Value.absent(),
    this.cursor = const Value.absent(),
    this.rowid = const Value.absent(),
  });
  SyncCursorsCompanion.insert({
    required String gameId,
    required String cursor,
    this.rowid = const Value.absent(),
  }) : gameId = Value(gameId),
       cursor = Value(cursor);
  static Insertable<SyncCursor> custom({
    Expression<String>? gameId,
    Expression<String>? cursor,
    Expression<int>? rowid,
  }) {
    return RawValuesInsertable({
      if (gameId != null) 'game_id': gameId,
      if (cursor != null) 'cursor': cursor,
      if (rowid != null) 'rowid': rowid,
    });
  }

  SyncCursorsCompanion copyWith({
    Value<String>? gameId,
    Value<String>? cursor,
    Value<int>? rowid,
  }) {
    return SyncCursorsCompanion(
      gameId: gameId ?? this.gameId,
      cursor: cursor ?? this.cursor,
      rowid: rowid ?? this.rowid,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (gameId.present) {
      map['game_id'] = Variable<String>(gameId.value);
    }
    if (cursor.present) {
      map['cursor'] = Variable<String>(cursor.value);
    }
    if (rowid.present) {
      map['rowid'] = Variable<int>(rowid.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('SyncCursorsCompanion(')
          ..write('gameId: $gameId, ')
          ..write('cursor: $cursor, ')
          ..write('rowid: $rowid')
          ..write(')'))
        .toString();
  }
}

class $LocalGamesTable extends LocalGames
    with TableInfo<$LocalGamesTable, LocalGame> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $LocalGamesTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _idMeta = const VerificationMeta('id');
  @override
  late final GeneratedColumn<String> id = GeneratedColumn<String>(
    'id',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _nameMeta = const VerificationMeta('name');
  @override
  late final GeneratedColumn<String> name = GeneratedColumn<String>(
    'name',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _statusMeta = const VerificationMeta('status');
  @override
  late final GeneratedColumn<String> status = GeneratedColumn<String>(
    'status',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _roleMeta = const VerificationMeta('role');
  @override
  late final GeneratedColumn<String> role = GeneratedColumn<String>(
    'role',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  @override
  List<GeneratedColumn> get $columns => [id, name, status, role];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'local_games';
  @override
  VerificationContext validateIntegrity(
    Insertable<LocalGame> instance, {
    bool isInserting = false,
  }) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('id')) {
      context.handle(_idMeta, id.isAcceptableOrUnknown(data['id']!, _idMeta));
    } else if (isInserting) {
      context.missing(_idMeta);
    }
    if (data.containsKey('name')) {
      context.handle(
        _nameMeta,
        name.isAcceptableOrUnknown(data['name']!, _nameMeta),
      );
    } else if (isInserting) {
      context.missing(_nameMeta);
    }
    if (data.containsKey('status')) {
      context.handle(
        _statusMeta,
        status.isAcceptableOrUnknown(data['status']!, _statusMeta),
      );
    } else if (isInserting) {
      context.missing(_statusMeta);
    }
    if (data.containsKey('role')) {
      context.handle(
        _roleMeta,
        role.isAcceptableOrUnknown(data['role']!, _roleMeta),
      );
    } else if (isInserting) {
      context.missing(_roleMeta);
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {id};
  @override
  LocalGame map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return LocalGame(
      id: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}id'],
      )!,
      name: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}name'],
      )!,
      status: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}status'],
      )!,
      role: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}role'],
      )!,
    );
  }

  @override
  $LocalGamesTable createAlias(String alias) {
    return $LocalGamesTable(attachedDatabase, alias);
  }
}

class LocalGame extends DataClass implements Insertable<LocalGame> {
  final String id;
  final String name;
  final String status;
  final String role;
  const LocalGame({
    required this.id,
    required this.name,
    required this.status,
    required this.role,
  });
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['id'] = Variable<String>(id);
    map['name'] = Variable<String>(name);
    map['status'] = Variable<String>(status);
    map['role'] = Variable<String>(role);
    return map;
  }

  LocalGamesCompanion toCompanion(bool nullToAbsent) {
    return LocalGamesCompanion(
      id: Value(id),
      name: Value(name),
      status: Value(status),
      role: Value(role),
    );
  }

  factory LocalGame.fromJson(
    Map<String, dynamic> json, {
    ValueSerializer? serializer,
  }) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return LocalGame(
      id: serializer.fromJson<String>(json['id']),
      name: serializer.fromJson<String>(json['name']),
      status: serializer.fromJson<String>(json['status']),
      role: serializer.fromJson<String>(json['role']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'id': serializer.toJson<String>(id),
      'name': serializer.toJson<String>(name),
      'status': serializer.toJson<String>(status),
      'role': serializer.toJson<String>(role),
    };
  }

  LocalGame copyWith({
    String? id,
    String? name,
    String? status,
    String? role,
  }) => LocalGame(
    id: id ?? this.id,
    name: name ?? this.name,
    status: status ?? this.status,
    role: role ?? this.role,
  );
  LocalGame copyWithCompanion(LocalGamesCompanion data) {
    return LocalGame(
      id: data.id.present ? data.id.value : this.id,
      name: data.name.present ? data.name.value : this.name,
      status: data.status.present ? data.status.value : this.status,
      role: data.role.present ? data.role.value : this.role,
    );
  }

  @override
  String toString() {
    return (StringBuffer('LocalGame(')
          ..write('id: $id, ')
          ..write('name: $name, ')
          ..write('status: $status, ')
          ..write('role: $role')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode => Object.hash(id, name, status, role);
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is LocalGame &&
          other.id == this.id &&
          other.name == this.name &&
          other.status == this.status &&
          other.role == this.role);
}

class LocalGamesCompanion extends UpdateCompanion<LocalGame> {
  final Value<String> id;
  final Value<String> name;
  final Value<String> status;
  final Value<String> role;
  final Value<int> rowid;
  const LocalGamesCompanion({
    this.id = const Value.absent(),
    this.name = const Value.absent(),
    this.status = const Value.absent(),
    this.role = const Value.absent(),
    this.rowid = const Value.absent(),
  });
  LocalGamesCompanion.insert({
    required String id,
    required String name,
    required String status,
    required String role,
    this.rowid = const Value.absent(),
  }) : id = Value(id),
       name = Value(name),
       status = Value(status),
       role = Value(role);
  static Insertable<LocalGame> custom({
    Expression<String>? id,
    Expression<String>? name,
    Expression<String>? status,
    Expression<String>? role,
    Expression<int>? rowid,
  }) {
    return RawValuesInsertable({
      if (id != null) 'id': id,
      if (name != null) 'name': name,
      if (status != null) 'status': status,
      if (role != null) 'role': role,
      if (rowid != null) 'rowid': rowid,
    });
  }

  LocalGamesCompanion copyWith({
    Value<String>? id,
    Value<String>? name,
    Value<String>? status,
    Value<String>? role,
    Value<int>? rowid,
  }) {
    return LocalGamesCompanion(
      id: id ?? this.id,
      name: name ?? this.name,
      status: status ?? this.status,
      role: role ?? this.role,
      rowid: rowid ?? this.rowid,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (id.present) {
      map['id'] = Variable<String>(id.value);
    }
    if (name.present) {
      map['name'] = Variable<String>(name.value);
    }
    if (status.present) {
      map['status'] = Variable<String>(status.value);
    }
    if (role.present) {
      map['role'] = Variable<String>(role.value);
    }
    if (rowid.present) {
      map['rowid'] = Variable<int>(rowid.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('LocalGamesCompanion(')
          ..write('id: $id, ')
          ..write('name: $name, ')
          ..write('status: $status, ')
          ..write('role: $role, ')
          ..write('rowid: $rowid')
          ..write(')'))
        .toString();
  }
}

abstract class _$LocalDb extends GeneratedDatabase {
  _$LocalDb(QueryExecutor e) : super(e);
  $LocalDbManager get managers => $LocalDbManager(this);
  late final $LocalObjectsTable localObjects = $LocalObjectsTable(this);
  late final $SyncCursorsTable syncCursors = $SyncCursorsTable(this);
  late final $LocalGamesTable localGames = $LocalGamesTable(this);
  @override
  Iterable<TableInfo<Table, Object?>> get allTables =>
      allSchemaEntities.whereType<TableInfo<Table, Object?>>();
  @override
  List<DatabaseSchemaEntity> get allSchemaEntities => [
    localObjects,
    syncCursors,
    localGames,
  ];
}

typedef $$LocalObjectsTableCreateCompanionBuilder =
    LocalObjectsCompanion Function({
      required String id,
      required String gameId,
      required String kind,
      required String markerType,
      required double lat,
      required double lng,
      required String propertiesJson,
      Value<String?> geometryJson,
      required String authorMembershipId,
      required DateTime createdAt,
      Value<DateTime?> deletedAt,
      Value<bool> pending,
      Value<int> rowid,
    });
typedef $$LocalObjectsTableUpdateCompanionBuilder =
    LocalObjectsCompanion Function({
      Value<String> id,
      Value<String> gameId,
      Value<String> kind,
      Value<String> markerType,
      Value<double> lat,
      Value<double> lng,
      Value<String> propertiesJson,
      Value<String?> geometryJson,
      Value<String> authorMembershipId,
      Value<DateTime> createdAt,
      Value<DateTime?> deletedAt,
      Value<bool> pending,
      Value<int> rowid,
    });

class $$LocalObjectsTableFilterComposer
    extends Composer<_$LocalDb, $LocalObjectsTable> {
  $$LocalObjectsTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<String> get id => $composableBuilder(
    column: $table.id,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get gameId => $composableBuilder(
    column: $table.gameId,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get kind => $composableBuilder(
    column: $table.kind,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get markerType => $composableBuilder(
    column: $table.markerType,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<double> get lat => $composableBuilder(
    column: $table.lat,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<double> get lng => $composableBuilder(
    column: $table.lng,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get propertiesJson => $composableBuilder(
    column: $table.propertiesJson,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get geometryJson => $composableBuilder(
    column: $table.geometryJson,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get authorMembershipId => $composableBuilder(
    column: $table.authorMembershipId,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<DateTime> get createdAt => $composableBuilder(
    column: $table.createdAt,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<DateTime> get deletedAt => $composableBuilder(
    column: $table.deletedAt,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<bool> get pending => $composableBuilder(
    column: $table.pending,
    builder: (column) => ColumnFilters(column),
  );
}

class $$LocalObjectsTableOrderingComposer
    extends Composer<_$LocalDb, $LocalObjectsTable> {
  $$LocalObjectsTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<String> get id => $composableBuilder(
    column: $table.id,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get gameId => $composableBuilder(
    column: $table.gameId,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get kind => $composableBuilder(
    column: $table.kind,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get markerType => $composableBuilder(
    column: $table.markerType,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<double> get lat => $composableBuilder(
    column: $table.lat,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<double> get lng => $composableBuilder(
    column: $table.lng,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get propertiesJson => $composableBuilder(
    column: $table.propertiesJson,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get geometryJson => $composableBuilder(
    column: $table.geometryJson,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get authorMembershipId => $composableBuilder(
    column: $table.authorMembershipId,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<DateTime> get createdAt => $composableBuilder(
    column: $table.createdAt,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<DateTime> get deletedAt => $composableBuilder(
    column: $table.deletedAt,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<bool> get pending => $composableBuilder(
    column: $table.pending,
    builder: (column) => ColumnOrderings(column),
  );
}

class $$LocalObjectsTableAnnotationComposer
    extends Composer<_$LocalDb, $LocalObjectsTable> {
  $$LocalObjectsTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<String> get id =>
      $composableBuilder(column: $table.id, builder: (column) => column);

  GeneratedColumn<String> get gameId =>
      $composableBuilder(column: $table.gameId, builder: (column) => column);

  GeneratedColumn<String> get kind =>
      $composableBuilder(column: $table.kind, builder: (column) => column);

  GeneratedColumn<String> get markerType => $composableBuilder(
    column: $table.markerType,
    builder: (column) => column,
  );

  GeneratedColumn<double> get lat =>
      $composableBuilder(column: $table.lat, builder: (column) => column);

  GeneratedColumn<double> get lng =>
      $composableBuilder(column: $table.lng, builder: (column) => column);

  GeneratedColumn<String> get propertiesJson => $composableBuilder(
    column: $table.propertiesJson,
    builder: (column) => column,
  );

  GeneratedColumn<String> get geometryJson => $composableBuilder(
    column: $table.geometryJson,
    builder: (column) => column,
  );

  GeneratedColumn<String> get authorMembershipId => $composableBuilder(
    column: $table.authorMembershipId,
    builder: (column) => column,
  );

  GeneratedColumn<DateTime> get createdAt =>
      $composableBuilder(column: $table.createdAt, builder: (column) => column);

  GeneratedColumn<DateTime> get deletedAt =>
      $composableBuilder(column: $table.deletedAt, builder: (column) => column);

  GeneratedColumn<bool> get pending =>
      $composableBuilder(column: $table.pending, builder: (column) => column);
}

class $$LocalObjectsTableTableManager
    extends
        RootTableManager<
          _$LocalDb,
          $LocalObjectsTable,
          LocalObject,
          $$LocalObjectsTableFilterComposer,
          $$LocalObjectsTableOrderingComposer,
          $$LocalObjectsTableAnnotationComposer,
          $$LocalObjectsTableCreateCompanionBuilder,
          $$LocalObjectsTableUpdateCompanionBuilder,
          (
            LocalObject,
            BaseReferences<_$LocalDb, $LocalObjectsTable, LocalObject>,
          ),
          LocalObject,
          PrefetchHooks Function()
        > {
  $$LocalObjectsTableTableManager(_$LocalDb db, $LocalObjectsTable table)
    : super(
        TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () =>
              $$LocalObjectsTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () =>
              $$LocalObjectsTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () =>
              $$LocalObjectsTableAnnotationComposer($db: db, $table: table),
          updateCompanionCallback:
              ({
                Value<String> id = const Value.absent(),
                Value<String> gameId = const Value.absent(),
                Value<String> kind = const Value.absent(),
                Value<String> markerType = const Value.absent(),
                Value<double> lat = const Value.absent(),
                Value<double> lng = const Value.absent(),
                Value<String> propertiesJson = const Value.absent(),
                Value<String?> geometryJson = const Value.absent(),
                Value<String> authorMembershipId = const Value.absent(),
                Value<DateTime> createdAt = const Value.absent(),
                Value<DateTime?> deletedAt = const Value.absent(),
                Value<bool> pending = const Value.absent(),
                Value<int> rowid = const Value.absent(),
              }) => LocalObjectsCompanion(
                id: id,
                gameId: gameId,
                kind: kind,
                markerType: markerType,
                lat: lat,
                lng: lng,
                propertiesJson: propertiesJson,
                geometryJson: geometryJson,
                authorMembershipId: authorMembershipId,
                createdAt: createdAt,
                deletedAt: deletedAt,
                pending: pending,
                rowid: rowid,
              ),
          createCompanionCallback:
              ({
                required String id,
                required String gameId,
                required String kind,
                required String markerType,
                required double lat,
                required double lng,
                required String propertiesJson,
                Value<String?> geometryJson = const Value.absent(),
                required String authorMembershipId,
                required DateTime createdAt,
                Value<DateTime?> deletedAt = const Value.absent(),
                Value<bool> pending = const Value.absent(),
                Value<int> rowid = const Value.absent(),
              }) => LocalObjectsCompanion.insert(
                id: id,
                gameId: gameId,
                kind: kind,
                markerType: markerType,
                lat: lat,
                lng: lng,
                propertiesJson: propertiesJson,
                geometryJson: geometryJson,
                authorMembershipId: authorMembershipId,
                createdAt: createdAt,
                deletedAt: deletedAt,
                pending: pending,
                rowid: rowid,
              ),
          withReferenceMapper: (p0) => p0
              .map((e) => (e.readTable(table), BaseReferences(db, table, e)))
              .toList(),
          prefetchHooksCallback: null,
        ),
      );
}

typedef $$LocalObjectsTableProcessedTableManager =
    ProcessedTableManager<
      _$LocalDb,
      $LocalObjectsTable,
      LocalObject,
      $$LocalObjectsTableFilterComposer,
      $$LocalObjectsTableOrderingComposer,
      $$LocalObjectsTableAnnotationComposer,
      $$LocalObjectsTableCreateCompanionBuilder,
      $$LocalObjectsTableUpdateCompanionBuilder,
      (LocalObject, BaseReferences<_$LocalDb, $LocalObjectsTable, LocalObject>),
      LocalObject,
      PrefetchHooks Function()
    >;
typedef $$SyncCursorsTableCreateCompanionBuilder =
    SyncCursorsCompanion Function({
      required String gameId,
      required String cursor,
      Value<int> rowid,
    });
typedef $$SyncCursorsTableUpdateCompanionBuilder =
    SyncCursorsCompanion Function({
      Value<String> gameId,
      Value<String> cursor,
      Value<int> rowid,
    });

class $$SyncCursorsTableFilterComposer
    extends Composer<_$LocalDb, $SyncCursorsTable> {
  $$SyncCursorsTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<String> get gameId => $composableBuilder(
    column: $table.gameId,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get cursor => $composableBuilder(
    column: $table.cursor,
    builder: (column) => ColumnFilters(column),
  );
}

class $$SyncCursorsTableOrderingComposer
    extends Composer<_$LocalDb, $SyncCursorsTable> {
  $$SyncCursorsTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<String> get gameId => $composableBuilder(
    column: $table.gameId,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get cursor => $composableBuilder(
    column: $table.cursor,
    builder: (column) => ColumnOrderings(column),
  );
}

class $$SyncCursorsTableAnnotationComposer
    extends Composer<_$LocalDb, $SyncCursorsTable> {
  $$SyncCursorsTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<String> get gameId =>
      $composableBuilder(column: $table.gameId, builder: (column) => column);

  GeneratedColumn<String> get cursor =>
      $composableBuilder(column: $table.cursor, builder: (column) => column);
}

class $$SyncCursorsTableTableManager
    extends
        RootTableManager<
          _$LocalDb,
          $SyncCursorsTable,
          SyncCursor,
          $$SyncCursorsTableFilterComposer,
          $$SyncCursorsTableOrderingComposer,
          $$SyncCursorsTableAnnotationComposer,
          $$SyncCursorsTableCreateCompanionBuilder,
          $$SyncCursorsTableUpdateCompanionBuilder,
          (
            SyncCursor,
            BaseReferences<_$LocalDb, $SyncCursorsTable, SyncCursor>,
          ),
          SyncCursor,
          PrefetchHooks Function()
        > {
  $$SyncCursorsTableTableManager(_$LocalDb db, $SyncCursorsTable table)
    : super(
        TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () =>
              $$SyncCursorsTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () =>
              $$SyncCursorsTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () =>
              $$SyncCursorsTableAnnotationComposer($db: db, $table: table),
          updateCompanionCallback:
              ({
                Value<String> gameId = const Value.absent(),
                Value<String> cursor = const Value.absent(),
                Value<int> rowid = const Value.absent(),
              }) => SyncCursorsCompanion(
                gameId: gameId,
                cursor: cursor,
                rowid: rowid,
              ),
          createCompanionCallback:
              ({
                required String gameId,
                required String cursor,
                Value<int> rowid = const Value.absent(),
              }) => SyncCursorsCompanion.insert(
                gameId: gameId,
                cursor: cursor,
                rowid: rowid,
              ),
          withReferenceMapper: (p0) => p0
              .map((e) => (e.readTable(table), BaseReferences(db, table, e)))
              .toList(),
          prefetchHooksCallback: null,
        ),
      );
}

typedef $$SyncCursorsTableProcessedTableManager =
    ProcessedTableManager<
      _$LocalDb,
      $SyncCursorsTable,
      SyncCursor,
      $$SyncCursorsTableFilterComposer,
      $$SyncCursorsTableOrderingComposer,
      $$SyncCursorsTableAnnotationComposer,
      $$SyncCursorsTableCreateCompanionBuilder,
      $$SyncCursorsTableUpdateCompanionBuilder,
      (SyncCursor, BaseReferences<_$LocalDb, $SyncCursorsTable, SyncCursor>),
      SyncCursor,
      PrefetchHooks Function()
    >;
typedef $$LocalGamesTableCreateCompanionBuilder =
    LocalGamesCompanion Function({
      required String id,
      required String name,
      required String status,
      required String role,
      Value<int> rowid,
    });
typedef $$LocalGamesTableUpdateCompanionBuilder =
    LocalGamesCompanion Function({
      Value<String> id,
      Value<String> name,
      Value<String> status,
      Value<String> role,
      Value<int> rowid,
    });

class $$LocalGamesTableFilterComposer
    extends Composer<_$LocalDb, $LocalGamesTable> {
  $$LocalGamesTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<String> get id => $composableBuilder(
    column: $table.id,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get name => $composableBuilder(
    column: $table.name,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get status => $composableBuilder(
    column: $table.status,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get role => $composableBuilder(
    column: $table.role,
    builder: (column) => ColumnFilters(column),
  );
}

class $$LocalGamesTableOrderingComposer
    extends Composer<_$LocalDb, $LocalGamesTable> {
  $$LocalGamesTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<String> get id => $composableBuilder(
    column: $table.id,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get name => $composableBuilder(
    column: $table.name,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get status => $composableBuilder(
    column: $table.status,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get role => $composableBuilder(
    column: $table.role,
    builder: (column) => ColumnOrderings(column),
  );
}

class $$LocalGamesTableAnnotationComposer
    extends Composer<_$LocalDb, $LocalGamesTable> {
  $$LocalGamesTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<String> get id =>
      $composableBuilder(column: $table.id, builder: (column) => column);

  GeneratedColumn<String> get name =>
      $composableBuilder(column: $table.name, builder: (column) => column);

  GeneratedColumn<String> get status =>
      $composableBuilder(column: $table.status, builder: (column) => column);

  GeneratedColumn<String> get role =>
      $composableBuilder(column: $table.role, builder: (column) => column);
}

class $$LocalGamesTableTableManager
    extends
        RootTableManager<
          _$LocalDb,
          $LocalGamesTable,
          LocalGame,
          $$LocalGamesTableFilterComposer,
          $$LocalGamesTableOrderingComposer,
          $$LocalGamesTableAnnotationComposer,
          $$LocalGamesTableCreateCompanionBuilder,
          $$LocalGamesTableUpdateCompanionBuilder,
          (LocalGame, BaseReferences<_$LocalDb, $LocalGamesTable, LocalGame>),
          LocalGame,
          PrefetchHooks Function()
        > {
  $$LocalGamesTableTableManager(_$LocalDb db, $LocalGamesTable table)
    : super(
        TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () =>
              $$LocalGamesTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () =>
              $$LocalGamesTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () =>
              $$LocalGamesTableAnnotationComposer($db: db, $table: table),
          updateCompanionCallback:
              ({
                Value<String> id = const Value.absent(),
                Value<String> name = const Value.absent(),
                Value<String> status = const Value.absent(),
                Value<String> role = const Value.absent(),
                Value<int> rowid = const Value.absent(),
              }) => LocalGamesCompanion(
                id: id,
                name: name,
                status: status,
                role: role,
                rowid: rowid,
              ),
          createCompanionCallback:
              ({
                required String id,
                required String name,
                required String status,
                required String role,
                Value<int> rowid = const Value.absent(),
              }) => LocalGamesCompanion.insert(
                id: id,
                name: name,
                status: status,
                role: role,
                rowid: rowid,
              ),
          withReferenceMapper: (p0) => p0
              .map((e) => (e.readTable(table), BaseReferences(db, table, e)))
              .toList(),
          prefetchHooksCallback: null,
        ),
      );
}

typedef $$LocalGamesTableProcessedTableManager =
    ProcessedTableManager<
      _$LocalDb,
      $LocalGamesTable,
      LocalGame,
      $$LocalGamesTableFilterComposer,
      $$LocalGamesTableOrderingComposer,
      $$LocalGamesTableAnnotationComposer,
      $$LocalGamesTableCreateCompanionBuilder,
      $$LocalGamesTableUpdateCompanionBuilder,
      (LocalGame, BaseReferences<_$LocalDb, $LocalGamesTable, LocalGame>),
      LocalGame,
      PrefetchHooks Function()
    >;

class $LocalDbManager {
  final _$LocalDb _db;
  $LocalDbManager(this._db);
  $$LocalObjectsTableTableManager get localObjects =>
      $$LocalObjectsTableTableManager(_db, _db.localObjects);
  $$SyncCursorsTableTableManager get syncCursors =>
      $$SyncCursorsTableTableManager(_db, _db.syncCursors);
  $$LocalGamesTableTableManager get localGames =>
      $$LocalGamesTableTableManager(_db, _db.localGames);
}
