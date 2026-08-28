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

  group('champs modificateurs OTAN', () {
    // Le rendu natif garde la PREMIÈRE image enregistrée sous un
    // identifiant : deux jeux de champs différents doivent donner deux
    // identifiants, sinon le second n'apparaîtrait jamais.
    test('deux jeux de champs donnent deux images distinctes', () {
      expect(
        UnitIcons.fieldedId(
          'infantry_allied_outline',
          const SymbolFields(info: '446.00625'),
        ),
        isNot(UnitIcons.fieldedId(
          'infantry_allied_outline',
          const SymbolFields(info: '446.09375'),
        )),
      );
    });

    test('la position du champ compte autant que son texte', () {
      // « ALPHA » en désignation (à gauche) et « ALPHA » en information
      // complémentaire (à droite) ne disent pas la même chose : deux
      // images.
      expect(
        UnitIcons.fieldedId('infantry_allied', const SymbolFields(
          designation: 'ALPHA',
        )),
        isNot(UnitIcons.fieldedId('infantry_allied', const SymbolFields(
          info: 'ALPHA',
        ))),
      );
    });

    test('aucun champ, aucun suffixe', () {
      const base = 'infantry_allied_outline';
      expect(UnitIcons.fieldedId(base, const SymbolFields()), base);
      expect(UnitIcons.fieldedId(base, const SymbolFields(info: '')), base);
      expect(UnitIcons.fieldedId(base, const SymbolFields(info: '   ')), base);
      expect(const SymbolFields(info: '  ').isEmpty, isTrue);
    });

    test('« ENY » distingue un symbole hostile', () {
      expect(
        UnitIcons.fieldedId('infantry_hostile', const SymbolFields(
          dtg: '14h05',
          hostile: true,
        )),
        isNot(UnitIcons.fieldedId('infantry_hostile', const SymbolFields(
          dtg: '14h05',
        ))),
      );
    });

    test('les champs entrent dans l’identifiant d’une escouade', () {
      const champs = SymbolFields(designation: 'Alpha', info: '446.00625');
      expect(
        UnitIcons.squadId('alpha', 4, champs),
        isNot(UnitIcons.squadId('alpha', 4, const SymbolFields())),
      );
      // L'effectif reste discriminant : un homme qui rejoint le groupe
      // change le marqueur même si les champs ne bougent pas.
      expect(
        UnitIcons.squadId('alpha', 4, champs),
        isNot(UnitIcons.squadId('alpha', 5, champs)),
      );
    });

    test('l’échelon suit les fourchettes de la norme', () {
      expect(SymbolEchelon.forHeadcount(1), isNull, reason: 'pas d’unité');
      expect(SymbolEchelon.forHeadcount(2), SymbolEchelon.equipe);
      expect(SymbolEchelon.forHeadcount(4), SymbolEchelon.equipe);
      expect(SymbolEchelon.forHeadcount(10), SymbolEchelon.groupe);
      expect(SymbolEchelon.forHeadcount(30), SymbolEchelon.section);
      expect(SymbolEchelon.forHeadcount(120), SymbolEchelon.compagnie);
      expect(SymbolEchelon.forHeadcount(800), SymbolEchelon.bataillon);
      expect(SymbolEchelon.forHeadcount(2500), SymbolEchelon.regiment);
      expect(SymbolEchelon.forHeadcount(4000), SymbolEchelon.brigade);
      expect(SymbolEchelon.forHeadcount(15000), SymbolEchelon.division);
      expect(SymbolEchelon.forHeadcount(40000), SymbolEchelon.corps);
      expect(SymbolEchelon.forHeadcount(200000), SymbolEchelon.armee);
    });

    test('l’échelle ne saute aucun effectif', () {
      // Le tableau officiel laisse des trous (il ne dit rien de 6 ou 7
      // hommes) ; l'app doit quand même savoir quoi dessiner.
      for (var n = 2; n <= 300; n++) {
        expect(
          SymbolEchelon.forHeadcount(n),
          isNotNull,
          reason: 'aucun échelon pour $n hommes',
        );
      }
    });

    test('l’échelon se dessine, il ne s’écrit pas', () {
      // Un « ● » dépend d'une police qui peut manquer ; des formes
      // pleines ne dépendent de rien.
      expect(SymbolEchelon.equipe.mark, EchelonMark.equipe);
      expect(SymbolEchelon.groupe.mark, EchelonMark.point);
      expect(SymbolEchelon.groupe.count, 1);
      expect(SymbolEchelon.section.mark, EchelonMark.point);
      expect(SymbolEchelon.section.count, 3);
      expect(SymbolEchelon.compagnie.mark, EchelonMark.barre);
      expect(SymbolEchelon.regiment.count, 3);
      expect(SymbolEchelon.brigade.mark, EchelonMark.croix);
    });

    test('la marque monte avec l’échelon', () {
      // Ordre de la norme : ovale, points, barres, croix.
      const ordre = [
        EchelonMark.equipe,
        EchelonMark.point,
        EchelonMark.barre,
        EchelonMark.croix,
      ];
      var precedent = -1;
      for (final e in SymbolEchelon.values) {
        final rang = ordre.indexOf(e.mark);
        expect(rang, greaterThanOrEqualTo(precedent),
            reason: '${e.label} redescend dans l’échelle');
        precedent = rang;
      }
    });

    test('l’échelon entre dans l’identifiant', () {
      expect(
        UnitIcons.squadId('alpha', 4, const SymbolFields(
          echelon: SymbolEchelon.groupe,
        )),
        isNot(UnitIcons.squadId('alpha', 4, const SymbolFields(
          echelon: SymbolEchelon.section,
        ))),
      );
    });
  });
}