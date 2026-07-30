import 'package:flutter/material.dart';

/// Fonds de carte commutables (§7.1 du cahier des charges).
///
/// Chaque fond est un style MapLibre JSON présent à deux endroits qui DOIVENT
/// rester synchronisés (mêmes URLs de tuiles → cache partagé) :
///  - `assets/styles/` dans l'app : lu par le widget carte (fonctionne offline) ;
///  - servi par l'API (`GET /v1/map-styles/<fichier>`) : utilisé par le
///    téléchargement de régions hors-ligne, qui exige une URL http(s).
enum MapBasemap { osm, planIgn, orthoIgn, relief }

extension MapBasemapStyle on MapBasemap {
  String get label => switch (this) {
        MapBasemap.osm => 'OSM',
        MapBasemap.planIgn => 'Plan IGN',
        MapBasemap.orthoIgn => 'Satellite',
        MapBasemap.relief => 'Relief',
      };

  /// Aperçu du fond dans le sélecteur.
  IconData get icon => switch (this) {
        MapBasemap.osm => Icons.map_outlined,
        MapBasemap.planIgn => Icons.grid_on,
        MapBasemap.orthoIgn => Icons.satellite_alt_outlined,
        MapBasemap.relief => Icons.terrain_outlined,
      };

  String get fileName => switch (this) {
        MapBasemap.osm => 'osm.json',
        MapBasemap.planIgn => 'plan_ign.json',
        MapBasemap.orthoIgn => 'ortho_ign.json',
        MapBasemap.relief => 'relief.json',
      };

  /// Clé d'asset Flutter pour `rootBundle.loadString`.
  String get assetKey => 'assets/styles/$fileName';
}
