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
  });

  final String id;
  final String name;
  final String status;
  final String role;

  factory GameSummary.fromJson(Map<String, dynamic> json) {
    final game = json['game'] as Map<String, dynamic>;
    return GameSummary(
      id: game['id'] as String,
      name: game['name'] as String,
      status: game['status'] as String,
      role: json['role'] as String,
    );
  }
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
