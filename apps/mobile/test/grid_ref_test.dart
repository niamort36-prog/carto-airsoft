import 'package:carto_airsoft/map/grid_ref.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('MGRS', () {
    test('monument de Washington : 18S UJ 23487 06483', () {
      final ref = toMgrs(38.8895, -77.0353);
      expect(ref, isNotNull);
      expect(ref!.zone, 18);
      expect(ref.band, 'S');
      expect(ref.square, 'UJ');
      // Tolérance de 15 m : la référence publiée est donnée pour une
      // latitude/longitude arrondie au dix-millième de degré, soit déjà
      // ±9 m sur l'axe est. La projection elle-même est vérifiée au mètre
      // contre une implémentation indépendante de la formule UTM.
      expect((ref.easting - 23487).abs() <= 15, isTrue,
          reason: 'easting ${ref.easting}');
      expect((ref.northing - 6483).abs() <= 15, isTrue,
          reason: 'northing ${ref.northing}');
    });

    test('forêt de Fontainebleau : zone 31, bande U', () {
      final ref = toMgrs(48.404, 2.632);
      expect(ref, isNotNull);
      expect(ref!.zone, 31);
      expect(ref.band, 'U');
      // Six chiffres : c'est ce qui s'annonce à la radio.
      expect(ref.digits().length, 6);
    });

    test('hémisphère sud', () {
      final ref = toMgrs(-33.8688, 151.2093); // Sydney
      expect(ref, isNotNull);
      expect(ref!.zone, 56);
      expect(ref.band, 'H');
    });

    test('au-delà des bandes polaires : pas de référence', () {
      expect(toMgrs(85.0, 10.0), isNull);
      expect(toMgrs(-85.0, 10.0), isNull);
    });
  });

  group('visée', () {
    test('azimut et point cardinal', () {
      // Plein est depuis Fontainebleau.
      final bearing = bearingBetween(48.404, 2.632, 48.404, 2.640);
      expect(bearing, closeTo(90, 0.5));
      expect(cardinalOf(bearing), 'E');
      expect(cardinalOf(0), 'N');
      expect(cardinalOf(45), 'NE');
      expect(cardinalOf(225), 'SO');
      expect(cardinalOf(315), 'NO');
      expect(cardinalOf(359), 'N');
    });

    test('distance en mètres', () {
      // Un centième de degré de latitude ≈ 1111 m.
      final d = distanceBetween(48.404, 2.632, 48.414, 2.632);
      expect(d, closeTo(1112, 5));
    });

    test('mise en forme des distances', () {
      expect(formatDistance(48), '48 m');
      expect(formatDistance(999), '999 m');
      expect(formatDistance(1234), '1,2 km');
    });

    test('dénivelé signé, inconnu compris', () {
      expect(formatElevationDelta(13.4), '+13 m');
      expect(formatElevationDelta(-7.8), '−8 m');
      expect(formatElevationDelta(null), '—');
    });
  });
}
