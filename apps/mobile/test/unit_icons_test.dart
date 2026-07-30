import 'package:carto_airsoft/map/unit_icons.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('registre du pack', () {
    test('chaque symbole proposé est enregistrable', () {
      // Le sélecteur ne propose que ce qui existe ; le rendu n'affiche que
      // ce que `isKnown` reconnaît. Les deux doivent coïncider, sans quoi
      // un symbole se pose sans jamais apparaître sur la carte.
      for (final family in SymbolFamily.values) {
        for (final slug in UnitIcons.slugsOf(family)) {
          final ids = family.hasAffiliation
              ? [
                  for (final a in UnitAffiliation.values)
                    if (UnitIcons.exists(family, slug, a))
                      UnitIcons.iconId(family, slug, a),
                ]
              : [UnitIcons.iconId(family, slug)];
          for (final id in ids) {
            expect(
              UnitIcons.isKnown(id),
              isTrue,
              reason: '$id (${family.label}) absent du registre',
            );
          }
        }
      }
    });

    test('les points d’ordre n’ont pas de suffixe de camp', () {
      final id = UnitIcons.iconId(SymbolFamily.point, 'waypoint');
      expect(id, 'waypoint');
      expect(UnitIcons.affiliationOf(id), isNull);
      expect(UnitIcons.familyOf(id), SymbolFamily.point);
      expect(UnitIcons.assetKey(id), 'assets/icons/points/waypoint.png');
      expect(UnitIcons.isKnown(id), isTrue);
    });

    test('chaque famille est représentée dans le registre', () {
      final ids = UnitIcons.allIconIds;
      for (final family in SymbolFamily.values) {
        expect(
          ids.any((id) => UnitIcons.familyOf(id) == family),
          isTrue,
          reason: 'aucune icône pour ${family.label}',
        );
      }
    });
  });
}
