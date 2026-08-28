import '../game/models.dart';

/// Regroupement des alliés par escouade quand la carte est trop dézoomée.
///
/// Le problème qu'il résout : à petite échelle, quatre hommes d'un même
/// groupe tiennent dans quelques pixels et leurs insignes se recouvrent — on
/// ne lit plus ni qui est là, ni combien. Un marqueur d'escouade dit les deux
/// d'un coup.
///
/// Écrit à part du composant carte pour être vérifiable : c'est de la règle,
/// pas de l'affichage.

/// Sous ce zoom, les insignes d'un même groupe se chevauchent.
const double kSquadGroupingZoom = 14.0;

/// Une escouade réduite à un seul marqueur.
class SquadCluster {
  const SquadCluster({
    required this.squadId,
    required this.name,
    required this.members,
    required this.lat,
    required this.lng,
    required this.anyConnected,
    this.note,
  });

  final String squadId;
  final String name;

  /// Étiquette libre du groupe, peinte à côté du marqueur (fréquence radio
  /// du réseau, indicatif). Nulle quand l'escouade n'en porte pas.
  final String? note;

  /// Identifiants des hommes que ce marqueur remplace.
  final List<String> members;
  final double lat;
  final double lng;

  /// Un seul homme en ligne suffit à donner au groupe sa pleine opacité :
  /// l'escouade est là, même si certains de ses hommes ont décroché.
  final bool anyConnected;
}

/// Ce que la carte doit dessiner à un zoom donné.
class AlliesLayout {
  const AlliesLayout({required this.individuals, required this.squads});

  /// Alliés gardant leur insigne propre.
  final List<MemberView> individuals;

  /// Escouades repliées en un marqueur.
  final List<SquadCluster> squads;
}

/// Répartit les alliés entre insignes individuels et marqueurs d'escouade.
///
/// [myMembershipId] est exclu : sa position est rendue par son propre
/// insigne, à contour épais.
AlliesLayout layoutAllies({
  required Iterable<MemberView> members,
  required String? myMembershipId,
  required double zoom,
  required Map<String, String> unitNames,
  Map<String, String> squadNotes = const {},
}) {
  final positionnes = [
    for (final m in members)
      if (m.membershipId != myMembershipId && m.lat != null && m.lng != null)
        m,
  ];

  if (zoom >= kSquadGroupingZoom) {
    return AlliesLayout(individuals: positionnes, squads: const []);
  }

  final parEscouade = <String, List<MemberView>>{};
  for (final m in positionnes) {
    if (m.squadId == null) continue;
    parEscouade.putIfAbsent(m.squadId!, () => []).add(m);
  }

  final clusters = <SquadCluster>[];
  final regroupes = <String>{};
  for (final entry in parEscouade.entries) {
    // Un homme seul reste un homme : replier une escouade d'un seul membre
    // n'économiserait aucun chevauchement et effacerait une information.
    if (entry.value.length < 2) continue;
    regroupes.addAll(entry.value.map((m) => m.membershipId));
    clusters.add(
      SquadCluster(
        squadId: entry.key,
        name: unitNames[entry.key] ?? 'Escouade',
        note: squadNotes[entry.key],
        members: [for (final m in entry.value) m.membershipId],
        // Barycentre : le marqueur se pose au milieu du groupe, pas sur
        // l'un de ses hommes.
        lat: entry.value.map((m) => m.lat!).reduce((a, b) => a + b) /
            entry.value.length,
        lng: entry.value.map((m) => m.lng!).reduce((a, b) => a + b) /
            entry.value.length,
        anyConnected: entry.value.any((m) => m.isConnected),
      ),
    );
  }

  return AlliesLayout(
    individuals: [
      for (final m in positionnes)
        if (!regroupes.contains(m.membershipId)) m,
    ],
    squads: clusters,
  );
}
