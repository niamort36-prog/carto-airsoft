// Modèles côté client des réponses de l'API (contrat OpenAPI).

/// Hiérarchie §5 — plus le rang est petit, plus le grade est élevé.
const Map<String, int> kRoleRanks = {
  'commandant': 0,
  'capitaine': 1,
  'chef_escouade': 2,
  'joueur': 3,
};

int roleRank(String role) => kRoleRanks[role] ?? 9;

String roleLabel(String role) => switch (role) {
      'commandant' => 'Commandant',
      'capitaine' => 'Capitaine',
      'chef_escouade' => 'Chef d’escouade',
      _ => 'Joueur',
    };

class GameSummary {
  const GameSummary({
    required this.id,
    required this.name,
    required this.status,
    required this.role,
    this.permissions = const [],
  });

  final String id;
  final String name;
  final String status;
  final String role;

  /// Mes permissions dans cette partie, telles que le serveur les calcule
  /// (§5) — l'app n'interprète jamais le rôle elle-même.
  final List<String> permissions;

  bool can(String permission) => permissions.contains(permission);

  factory GameSummary.fromJson(Map<String, dynamic> json) {
    final game = json['game'] as Map<String, dynamic>;
    return GameSummary(
      id: game['id'] as String,
      name: game['name'] as String,
      status: game['status'] as String,
      role: json['role'] as String,
      permissions: [
        for (final p in (json['permissions'] as List<dynamic>? ?? []))
          p as String,
      ],
    );
  }
}

/// Clés de permission (miroir du catalogue serveur).
abstract final class Perm {
  static const gameManage = 'game:manage';
  static const membersPromote = 'members:promote';
  static const membersKick = 'members:kick';
  static const membersBadge = 'members:badge';
  static const invitesManage = 'invites:manage';
  static const markersDeleteAny = 'markers:delete_any';
  static const chatCommand = 'chat:command';
  static const teamsManage = 'teams:manage';
}

/// Statuts de vie (§7.5) — mêmes valeurs que l'API.
enum LifeStatus {
  alive('alive', 'Vivant'),
  dead('dead', 'Mort'),
  medicNeeded('medic_needed', 'Médic !'),
  support('support', 'Soutien');

  const LifeStatus(this.wire, this.label);

  final String wire;
  final String label;

  static LifeStatus fromWire(String wire) => LifeStatus.values.firstWhere(
        (s) => s.wire == wire,
        orElse: () => LifeStatus.alive,
      );
}

/// Résultat d'un scan (§7.2, §7.8, §7.9) : c'est le SERVEUR qui a décidé de
/// quoi il s'agissait, l'app se contente de l'annoncer au joueur.
sealed class ScanOutcome {
  const ScanOutcome();

  factory ScanOutcome.fromJson(Map<String, dynamic> json) =>
      switch (json['type'] as String) {
        'objective' => ObjectiveCaptured(
            name: json['name'] as String,
            pointsAwarded: json['pointsAwarded'] as int? ?? 0,
            teamScore: json['teamScore'] as int? ?? 0,
          ),
        'bonus' => BonusRedeemed(
            name: json['name'] as String,
            pointsAwarded: json['pointsAwarded'] as int? ?? 0,
            attachmentUrl: json['attachmentUrl'] as String?,
          ),
        _ => GameJoined(
            gameId: json['gameId'] as String,
            gameName: json['gameName'] as String,
            role: json['role'] as String,
          ),
      };
}

class GameJoined extends ScanOutcome {
  const GameJoined({
    required this.gameId,
    required this.gameName,
    required this.role,
  });
  final String gameId;
  final String gameName;
  final String role;
}

class ObjectiveCaptured extends ScanOutcome {
  const ObjectiveCaptured({
    required this.name,
    required this.pointsAwarded,
    required this.teamScore,
  });
  final String name;
  final int pointsAwarded;
  final int teamScore;
}

class BonusRedeemed extends ScanOutcome {
  const BonusRedeemed({
    required this.name,
    required this.pointsAwarded,
    this.attachmentUrl,
  });
  final String name;
  final int pointsAwarded;
  final String? attachmentUrl;
}

/// Drapeau à capturer (§7.8).
class ObjectiveView {
  const ObjectiveView({
    required this.id,
    required this.name,
    required this.lat,
    required this.lng,
    required this.holderTeamId,
    this.captureOrder,
  });

  final String id;
  final String name;
  final double lat;
  final double lng;
  final String? holderTeamId;
  final int? captureOrder;

  factory ObjectiveView.fromJson(Map<String, dynamic> json) => ObjectiveView(
        id: json['id'] as String,
        name: json['name'] as String,
        lat: (json['lat'] as num).toDouble(),
        lng: (json['lng'] as num).toDouble(),
        holderTeamId: json['holderTeamId'] as String?,
        captureOrder: json['captureOrder'] as int?,
      );
}

class TeamScore {
  const TeamScore({
    required this.id,
    required this.name,
    required this.color,
    required this.score,
  });

  final String id;
  final String name;
  final String color;
  final int score;

  factory TeamScore.fromJson(Map<String, dynamic> json) => TeamScore(
        id: json['id'] as String,
        name: json['name'] as String,
        color: json['color'] as String,
        score: json['score'] as int? ?? 0,
      );
}

/// Perk et son état pour MON équipe (§7.7) — stock et recharge calculés
/// serveur, l'app ne fait que les afficher.
class PerkView {
  const PerkView({
    required this.id,
    required this.type,
    required this.radiusMeters,
    required this.durationSeconds,
    this.remaining,
    this.availableAt,
  });

  final String id;
  final String type;
  final int radiusMeters;
  final int durationSeconds;
  final int? remaining;
  final DateTime? availableAt;

  String get label => switch (type) {
        'drone' => 'Drone',
        'jammer' => 'Brouilleur',
        _ => type,
      };

  bool get ready =>
      (remaining == null || remaining! > 0) &&
      (availableAt == null || availableAt!.isBefore(DateTime.now()));

  factory PerkView.fromJson(Map<String, dynamic> json) => PerkView(
        id: json['id'] as String,
        type: json['type'] as String,
        radiusMeters: json['radiusMeters'] as int? ?? 300,
        durationSeconds: json['durationSeconds'] as int? ?? 30,
        remaining: json['remaining'] as int?,
        availableAt: json['availableAt'] != null
            ? DateTime.tryParse(json['availableAt'] as String)
            : null,
      );
}

/// Contact hostile révélé par un drone — éphémère par construction.
class RevealedContact {
  const RevealedContact({
    required this.membershipId,
    required this.lat,
    required this.lng,
    this.pseudo,
  });

  final String membershipId;
  final double lat;
  final double lng;
  final String? pseudo;

  factory RevealedContact.fromJson(Map<String, dynamic> json) =>
      RevealedContact(
        membershipId: json['membershipId'] as String,
        lat: (json['lat'] as num).toDouble(),
        lng: (json['lng'] as num).toDouble(),
        pseudo: json['pseudo'] as String?,
      );
}

class PerkActivation {
  const PerkActivation({
    required this.type,
    required this.endsAt,
    required this.contacts,
    required this.jammed,
  });

  final String type;
  final DateTime endsAt;
  final List<RevealedContact> contacts;
  final int jammed;

  factory PerkActivation.fromJson(Map<String, dynamic> json) => PerkActivation(
        type: json['type'] as String,
        endsAt: DateTime.parse(json['endsAt'] as String),
        contacts: [
          for (final c in (json['contacts'] as List<dynamic>? ?? []))
            RevealedContact.fromJson(c as Map<String, dynamic>),
        ],
        jammed: json['jammed'] as int? ?? 0,
      );
}

/// Invitation par QR (§7.2). Le jeton n'est présent qu'à la création —
/// ensuite le serveur ne le connaît plus (il n'en garde que l'empreinte).
class InviteView {
  const InviteView({
    required this.id,
    required this.role,
    required this.maxUses,
    required this.useCount,
    required this.active,
    required this.createdAt,
    this.expiresAt,
    this.revokedAt,
    this.token,
    this.url,
  });

  final String id;
  final String role;
  final int? maxUses;
  final int useCount;
  final bool active;
  final DateTime createdAt;
  final DateTime? expiresAt;
  final DateTime? revokedAt;

  /// Jeton en clair — uniquement au retour de la création.
  final String? token;
  final String? url;

  String get usageLabel {
    if (maxUses == null) return 'réutilisable · $useCount scan(s)';
    return '$useCount / $maxUses usage(s)';
  }

  String get stateLabel {
    if (revokedAt != null) return 'révoquée';
    if (expiresAt != null && expiresAt!.isBefore(DateTime.now())) {
      return 'expirée';
    }
    if (!active) return 'épuisée';
    return 'active';
  }

  factory InviteView.fromJson(Map<String, dynamic> json) => InviteView(
        id: json['id'] as String,
        role: json['role'] as String,
        maxUses: json['maxUses'] as int?,
        useCount: json['useCount'] as int? ?? 0,
        active: json['active'] as bool? ?? false,
        createdAt: DateTime.parse(json['createdAt'] as String),
        expiresAt: json['expiresAt'] != null
            ? DateTime.tryParse(json['expiresAt'] as String)
            : null,
        revokedAt: json['revokedAt'] != null
            ? DateTime.tryParse(json['revokedAt'] as String)
            : null,
        token: json['token'] as String?,
        url: json['url'] as String?,
      );
}

/// Canal de discussion (§7.4) — la liste reçue est déjà filtrée par le
/// serveur selon le grade.
class ChannelView {
  const ChannelView({
    required this.id,
    required this.scope,
    required this.name,
  });

  final String id;
  final String scope;
  final String name;

  factory ChannelView.fromJson(Map<String, dynamic> json) => ChannelView(
        id: json['id'] as String,
        scope: json['scope'] as String,
        name: json['name'] as String,
      );
}

class MessageView {
  const MessageView({
    required this.id,
    required this.channelId,
    required this.body,
    required this.authorMembershipId,
    required this.authorName,
    required this.createdAt,
    this.pending = false,
  });

  final String id;
  final String channelId;
  final String body;
  final String authorMembershipId;
  final String authorName;
  final DateTime createdAt;

  /// true = pas encore accepté par le serveur (« en attente d'envoi »).
  final bool pending;

  factory MessageView.fromJson(Map<String, dynamic> json) => MessageView(
        id: json['id'] as String,
        channelId: json['channelId'] as String,
        body: json['body'] as String,
        authorMembershipId: json['authorMembershipId'] as String,
        authorName: json['authorName'] as String,
        createdAt: DateTime.parse(json['createdAt'] as String),
      );
}

/// Objet tactique posé sur la carte (marqueur d'unité, waypoint…).
class MapObjectView {
  const MapObjectView({
    required this.id,
    required this.kind,
    required this.markerType,
    required this.lat,
    required this.lng,
    required this.properties,
    required this.authorMembershipId,
    required this.createdAt,
    required this.deletedAt,
    this.geometry,
    this.pending = false,
  });

  final String id;
  final String kind;
  final String markerType;
  final double lat;
  final double lng;
  final Map<String, dynamic> properties;
  final String authorMembershipId;
  final DateTime createdAt;
  final DateTime? deletedAt;

  /// GeoJSON LineString/Polygon pour les kinds line/zone.
  final Map<String, dynamic>? geometry;

  /// true = pas encore accepté par le serveur (« en attente de synchro »).
  final bool pending;

  String? get icon => properties['icon'] as String?;
  String? get label => properties['label'] as String?;
  bool get isDeleted => deletedAt != null;

  factory MapObjectView.fromJson(Map<String, dynamic> json) => MapObjectView(
        id: json['id'] as String,
        kind: json['kind'] as String,
        markerType: json['markerType'] as String,
        lat: (json['lat'] as num).toDouble(),
        lng: (json['lng'] as num).toDouble(),
        properties:
            (json['properties'] as Map?)?.cast<String, dynamic>() ?? {},
        geometry: (json['geometry'] as Map?)?.cast<String, dynamic>(),
        authorMembershipId: json['authorMembershipId'] as String,
        createdAt: DateTime.parse(json['createdAt'] as String),
        deletedAt: json['deletedAt'] != null
            ? DateTime.tryParse(json['deletedAt'] as String)
            : null,
      );
}

class MemberView {
  const MemberView({
    required this.membershipId,
    required this.pseudo,
    required this.email,
    required this.role,
    required this.unitType,
    this.teamId,
    this.squadId,
    required this.lifeStatus,
    required this.lat,
    required this.lng,
    required this.isConnected,
    required this.lastSeenAt,
  });

  final String membershipId;
  final String? pseudo;
  final String? email;
  final String role;

  /// Insigne du joueur (type d'unité du pack d'icônes).
  final String unitType;

  /// Rattachement (§4) — null tant que le joueur n'est pas affecté.
  final String? teamId;
  final String? squadId;
  final LifeStatus lifeStatus;
  final double? lat;
  final double? lng;
  final bool isConnected;
  final DateTime? lastSeenAt;

  String get displayName =>
      pseudo ?? (email != null ? email!.split('@').first : 'Joueur');

  factory MemberView.fromJson(Map<String, dynamic> json) {
    final pos = json['lastPosition'] as Map<String, dynamic>?;
    return MemberView(
      membershipId: json['membershipId'] as String,
      pseudo: json['pseudo'] as String?,
      email: json['email'] as String?,
      role: json['role'] as String,
      unitType: json['unitType'] as String? ?? 'infantry',
      teamId: json['teamId'] as String?,
      squadId: json['squadId'] as String?,
      lifeStatus: LifeStatus.fromWire(json['lifeStatus'] as String),
      // PostGIS : x = longitude, y = latitude.
      lng: (pos?['x'] as num?)?.toDouble(),
      lat: (pos?['y'] as num?)?.toDouble(),
      isConnected: json['isConnected'] as bool? ?? false,
      lastSeenAt: json['lastSeenAt'] != null
          ? DateTime.tryParse(json['lastSeenAt'] as String)
          : null,
    );
  }
}
