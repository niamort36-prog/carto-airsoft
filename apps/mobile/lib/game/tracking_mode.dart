import 'package:flutter/foundation.dart'
    show TargetPlatform, defaultTargetPlatform, kIsWeb;
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

  /// Réglages de la plateforme.
  ///
  /// Les deux systèmes gardent une app vivante écran éteint, mais par des
  /// moyens opposés : Android exige un service de premier plan avec sa
  /// notification persistante, iOS exige le mode d'arrière-plan `location`
  /// et l'autorisation « Toujours ». Servir les réglages Android à iOS
  /// laisserait le suivi s'arrêter dès la mise en poche — le contraire de
  /// ce que demande le §9.
  LocationSettings toLocationSettings() {
    // Dans un navigateur, ni service de premier plan ni mode d'arrière-plan :
    // le suivi s'arrête quand l'onglet passe en arrière-plan, et aucun
    // réglage n'y changerait rien (voir docs/WEB.md).
    if (kIsWeb) {
      return LocationSettings(
        accuracy: LocationAccuracy.high,
        distanceFilter: distanceFilterMeters,
      );
    }
    if (defaultTargetPlatform == TargetPlatform.iOS ||
        defaultTargetPlatform == TargetPlatform.macOS) {
      return AppleSettings(
        accuracy: LocationAccuracy.high,
        distanceFilter: distanceFilterMeters,
        // Sans cela, iOS suspend les mises à jour dès que l'app passe en
        // arrière-plan : les alliés verraient une position figée (§2.4).
        allowBackgroundLocationUpdates: true,
        // La pastille bleue « position utilisée » reste visible : le joueur
        // sait qu'il est suivi, et on ne le suit jamais à son insu.
        showBackgroundLocationIndicator: true,
        // iOS coupe volontiers le GPS quand il croit l'utilisateur immobile.
        // En airsoft, une immobilité de dix minutes est une embuscade, pas
        // une fin de trajet.
        pauseLocationUpdatesAutomatically: false,
        activityType: ActivityType.fitness,
      );
    }
    return AndroidSettings(
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
}
