// Coordonnées et visée, façon carte d'état-major.
//
// L'affichage de référence est le carroyage MGRS : c'est ce qui s'annonce à
// la radio (« zéro-un-huit zéro-un-trois »), pas des degrés décimaux. Le
// calcul est local et sans réseau — indispensable hors ligne (§2.3).

import 'dart:math' as math;

/// Point cardinal d'un azimut, en français (O pour ouest).
String cardinalOf(double bearingDeg) {
  const points = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'];
  final normalized = (bearingDeg % 360 + 360) % 360;
  return points[((normalized + 22.5) ~/ 45) % 8];
}

/// Azimut de `from` vers `to`, en degrés depuis le nord géographique.
double bearingBetween(double lat1, double lng1, double lat2, double lng2) {
  final phi1 = lat1 * math.pi / 180;
  final phi2 = lat2 * math.pi / 180;
  final dLambda = (lng2 - lng1) * math.pi / 180;
  final y = math.sin(dLambda) * math.cos(phi2);
  final x = math.cos(phi1) * math.sin(phi2) -
      math.sin(phi1) * math.cos(phi2) * math.cos(dLambda);
  return (math.atan2(y, x) * 180 / math.pi + 360) % 360;
}

/// Distance en mètres (haversine — suffisant à l'échelle d'un terrain).
double distanceBetween(double lat1, double lng1, double lat2, double lng2) {
  const earth = 6371008.8;
  final phi1 = lat1 * math.pi / 180;
  final phi2 = lat2 * math.pi / 180;
  final dPhi = (lat2 - lat1) * math.pi / 180;
  final dLambda = (lng2 - lng1) * math.pi / 180;
  final a = math.sin(dPhi / 2) * math.sin(dPhi / 2) +
      math.cos(phi1) * math.cos(phi2) * math.sin(dLambda / 2) *
          math.sin(dLambda / 2);
  return earth * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a));
}

/// « 480 m » en dessous du kilomètre, « 1,2 km » au-delà.
String formatDistance(double meters) {
  if (meters < 1000) return '${meters.round()} m';
  return '${(meters / 1000).toStringAsFixed(1).replaceAll('.', ',')} km';
}

/// Dénivelé signé, ou « — » quand l'altitude du point est inconnue.
String formatElevationDelta(double? meters) {
  if (meters == null) return '—';
  final sign = meters >= 0 ? '+' : '−';
  return '$sign${meters.abs().round()} m';
}

/// Référence MGRS d'un point WGS84.
class MgrsRef {
  const MgrsRef({
    required this.zone,
    required this.band,
    required this.square,
    required this.easting,
    required this.northing,
  });

  final int zone;
  final String band;
  final String square;

  /// Mètres à l'intérieur du carré de 100 km.
  final int easting;
  final int northing;

  /// Les chiffres qu'on annonce, à la précision demandée (3 = 100 m).
  /// C'est la forme courte affichée en haut de l'écran, ex. « 018013 ».
  String digits({int precision = 3}) {
    final divisor = math.pow(10, 5 - precision).toInt();
    final e = (easting ~/ divisor).toString().padLeft(precision, '0');
    final n = (northing ~/ divisor).toString().padLeft(precision, '0');
    return '$e$n';
  }

  /// Forme complète, celle qu'on donne quand la zone n'est pas évidente.
  String full({int precision = 3}) =>
      '$zone$band $square ${digits(precision: precision)}';

  @override
  String toString() => full();
}

/// Lettres de bande de latitude MGRS (I et O exclues).
const _latBands = 'CDEFGHJKLMNPQRSTUVWXX';

/// Colonnes/lignes des carrés de 100 km, par jeu de trois zones.
const _e100 = ['ABCDEFGH', 'JKLMNPQR', 'STUVWXYZ'];
const _n100 = ['ABCDEFGHJKLMNPQRSTUV', 'FGHJKLMNPQRSTUVABCDE'];

/// Conversion WGS84 → MGRS. Hors des bandes polaires (|lat| > 84), on rend
/// null : l'app affiche alors les degrés décimaux.
MgrsRef? toMgrs(double lat, double lng) {
  if (lat > 84 || lat < -80) return null;

  final zone = ((lng + 180) ~/ 6 + 1).clamp(1, 60);
  final band = _latBands[((lat + 80) ~/ 8).clamp(0, 20).toInt()];

  // Projection UTM (WGS84).
  const a = 6378137.0;
  const f = 1 / 298.257223563;
  const k0 = 0.9996;
  final e2 = f * (2 - f);
  final ep2 = e2 / (1 - e2);

  final phi = lat * math.pi / 180;
  final lambda = lng * math.pi / 180;
  final lambda0 = ((zone - 1) * 6 - 180 + 3) * math.pi / 180;

  final n = a / math.sqrt(1 - e2 * math.sin(phi) * math.sin(phi));
  final t = math.tan(phi) * math.tan(phi);
  final c = ep2 * math.cos(phi) * math.cos(phi);
  final aa = math.cos(phi) * (lambda - lambda0);

  final m = a *
      ((1 - e2 / 4 - 3 * e2 * e2 / 64 - 5 * e2 * e2 * e2 / 256) * phi -
          (3 * e2 / 8 + 3 * e2 * e2 / 32 + 45 * e2 * e2 * e2 / 1024) *
              math.sin(2 * phi) +
          (15 * e2 * e2 / 256 + 45 * e2 * e2 * e2 / 1024) * math.sin(4 * phi) -
          (35 * e2 * e2 * e2 / 3072) * math.sin(6 * phi));

  final easting = k0 *
          n *
          (aa +
              (1 - t + c) * aa * aa * aa / 6 +
              (5 - 18 * t + t * t + 72 * c - 58 * ep2) *
                  math.pow(aa, 5) /
                  120) +
      500000.0;

  var northing = k0 *
      (m +
          n *
              math.tan(phi) *
              (aa * aa / 2 +
                  (5 - t + 9 * c + 4 * c * c) * math.pow(aa, 4) / 24 +
                  (61 - 58 * t + t * t + 600 * c - 330 * ep2) *
                      math.pow(aa, 6) /
                      720));
  if (lat < 0) northing += 10000000.0;

  // Carré de 100 km : colonne cyclique sur trois zones, ligne alternée.
  final col = (easting / 100000).floor();
  final row = (northing / 100000).floor() % 20;
  final square = '${_e100[(zone - 1) % 3][(col - 1).clamp(0, 7)]}'
      '${_n100[(zone - 1) % 2][row]}';

  return MgrsRef(
    zone: zone,
    band: band,
    square: square,
    easting: (easting % 100000).floor(),
    northing: (northing % 100000).floor(),
  );
}

/// Forme courte affichée en permanence, avec repli en degrés décimaux.
String gridLabel(double? lat, double? lng) {
  if (lat == null || lng == null) return '— — — — — —';
  final ref = toMgrs(lat, lng);
  if (ref == null) {
    return '${lat.toStringAsFixed(4)} ${lng.toStringAsFixed(4)}';
  }
  return ref.digits();
}
