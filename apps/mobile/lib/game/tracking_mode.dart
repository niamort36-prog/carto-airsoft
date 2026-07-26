import 'package:geolocator/geolocator.dart';

/// Compromis batterie / précision (§9). Le GPS continu est le premier poste
/// de consommation : le joueur choisit sa cadence selon la durée de partie.
enum TrackingMode {
  precise('precise', 'Précis', '~5 s · partie courte', 5, 5),
  balanced('balanced', 'Équilibré', '~15 s · défaut', 15, 10),
  eco('eco', 'Éco', '~60 s · longue journée', 60, 40);

  const TrackingMode(
    this.wire,
    this.label,
    this.hint,
    this.intervalSeconds,
    this.distanceFilterMeters,
  );

  final String wire;
  final String label;
  final String hint;
  final int intervalSeconds;
  final int distanceFilterMeters;

  static TrackingMode fromWire(String? wire) => TrackingMode.values.firstWhere(
        (m) => m.wire == wire,
        orElse: () => TrackingMode.balanced,
      );

  /// Réglages de la plateforme, avec service de premier plan sur Android :
  /// la notification persistante est ce qui empêche le système de geler
  /// l'app quand l'écran s'éteint.
  LocationSettings toLocationSettings() => AndroidSettings(
        accuracy: LocationAccuracy.high,
        distanceFilter: distanceFilterMeters,
        intervalDuration: Duration(seconds: intervalSeconds),
        foregroundNotificationConfig: ForegroundNotificationConfig(
          notificationTitle: 'Carto Airsoft — partie en cours',
          notificationText:
              'Votre position est partagée avec vos alliés ($label).',
          notificationChannelName: 'Suivi de position',
          enableWakeLock: true,
          setOngoing: true,
        ),
      );
}
