import 'dart:async';

import 'package:maplibre_gl/maplibre_gl.dart';

import '../app_config.dart';
import '../map/map_styles.dart';

/// Téléchargement et gestion des cartes hors-ligne (§7.1 / jalon 4).
///
/// MapLibre pin les tuiles d'une région dans sa base locale : elles restent
/// disponibles sans réseau, en plus du cache ambiant (tuiles déjà vues).
/// Le moteur exige une URL http(s) pour le style du téléchargement : l'API
/// sert les mêmes styles que les assets embarqués (mêmes URLs de tuiles →
/// cache partagé). Télécharger exige le réseau de toute façon.
class OfflineMapService {
  static const double minZoom = 11;
  static const double maxZoom = 16;

  /// Télécharge la zone [bounds] pour le fond [basemap].
  /// [onProgress] reçoit un pourcentage 0–100.
  static Future<void> downloadRegion({
    required MapBasemap basemap,
    required LatLngBounds bounds,
    required String label,
    void Function(double percent)? onProgress,
  }) async {
    final completer = Completer<void>();
    await downloadOfflineRegion(
      OfflineRegionDefinition(
        bounds: bounds,
        mapStyleUrl: '${AppConfig.apiBaseUrl}/map-styles/${basemap.fileName}',
        minZoom: minZoom,
        maxZoom: maxZoom,
      ),
      metadata: {
        'label': label,
        'basemap': basemap.name,
        'createdAt': DateTime.now().toIso8601String(),
      },
      onEvent: (status) {
        if (status is InProgress) {
          onProgress?.call(status.progress);
        } else if (status is Success) {
          if (!completer.isCompleted) completer.complete();
        } else if (status is Error) {
          if (!completer.isCompleted) {
            completer.completeError(Exception(status.cause.message));
          }
        }
      },
    );
    return completer.future;
  }

  static Future<List<OfflineRegion>> listRegions() => getListOfRegions();

  static Future<void> deleteRegion(int id) => deleteOfflineRegion(id);
}
