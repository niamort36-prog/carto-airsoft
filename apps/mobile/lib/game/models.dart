// Modèles côté client des réponses de l'API (contrat OpenAPI).

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

class MemberView {
  const MemberView({
    required this.membershipId,
    required this.pseudo,
    required this.email,
    required this.role,
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
