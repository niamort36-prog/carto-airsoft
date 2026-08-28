import 'package:carto_airsoft/game/models.dart';
import 'package:carto_airsoft/map/squad_grouping.dart';
import 'package:flutter_test/flutter_test.dart';

MemberView _homme(
  String id, {
  String? squadId,
  double? lat,
  double? lng,
  bool connected = true,
}) =>
    MemberView(
      membershipId: id,
      pseudo: id,
      email: null,
      role: 'joueur',
      unitType: 'infantry',
      squadId: squadId,
      lifeStatus: LifeStatus.alive,
      lat: lat,
      lng: lng,
      isConnected: connected,
      lastSeenAt: null,
    );

/// Une escouade serrée de quatre hommes, plus un isolé.
final _section = [
  _homme('a', squadId: 'alpha', lat: 48.4042, lng: 2.6320),
  _homme('b', squadId: 'alpha', lat: 48.4046, lng: 2.6326),
  _homme('c', squadId: 'alpha', lat: 48.4047, lng: 2.6314),
  _homme('d', squadId: 'alpha', lat: 48.4051, lng: 2.6322),
  _homme('seul', lat: 48.4010, lng: 2.6410),
];

AlliesLayout _layout(
  List<MemberView> membres, {
  double zoom = 12,
  String? moi,
}) =>
    layoutAllies(
      members: membres,
      myMembershipId: moi,
      zoom: zoom,
      unitNames: const {'alpha': 'Alpha'},
    );

void main() {
  group('regroupement des alliés au dézoom', () {
    test('carte zoomée : chacun garde son insigne', () {
      final vue = _layout(_section, zoom: kSquadGroupingZoom);
      expect(vue.squads, isEmpty);
      expect(vue.individuals.length, 5);
    });

    test('carte dézoomée : l’escouade parle d’une seule voix', () {
      final vue = _layout(_section, zoom: kSquadGroupingZoom - 0.1);
      expect(vue.squads.length, 1);
      expect(vue.squads.single.name, 'Alpha');
      expect(vue.squads.single.members.length, 4);
      // L'isolé garde le sien : lui ne chevauche personne.
      expect(vue.individuals.map((m) => m.membershipId), ['seul']);
    });

    test('le marqueur se pose au barycentre, pas sur un homme', () {
      final groupe = _layout(_section).squads.single;
      expect(groupe.lat, closeTo((48.4042 + 48.4046 + 48.4047 + 48.4051) / 4, 1e-9));
      expect(groupe.lng, closeTo((2.6320 + 2.6326 + 2.6314 + 2.6322) / 4, 1e-9));
    });

    test('un homme seul dans son escouade reste un homme', () {
      // Replier un groupe d'un seul n'économise aucun chevauchement et
      // effacerait une information.
      final vue = _layout([
        _homme('x', squadId: 'alpha', lat: 48.40, lng: 2.63),
        _homme('y', lat: 48.41, lng: 2.64),
      ]);
      expect(vue.squads, isEmpty);
      expect(vue.individuals.length, 2);
    });

    test('ma propre position n’est jamais regroupée', () {
      // Elle est rendue par mon insigne à contour épais, pas par la couche
      // des alliés.
      final vue = _layout(_section, moi: 'a');
      expect(
        vue.squads.single.members,
        isNot(contains('a')),
      );
      expect(vue.squads.single.members.length, 3);
      expect(vue.individuals.map((m) => m.membershipId), ['seul']);
    });

    test('les hommes sans position sont ignorés des deux côtés', () {
      final vue = _layout([
        ..._section,
        _homme('fantome', squadId: 'alpha'),
      ]);
      expect(vue.squads.single.members, isNot(contains('fantome')));
      expect(
        vue.individuals.map((m) => m.membershipId),
        isNot(contains('fantome')),
      );
    });

    test('un seul homme en ligne suffit à donner sa présence au groupe', () {
      final endormis = [
        _homme('a', squadId: 'alpha', lat: 48.40, lng: 2.63, connected: false),
        _homme('b', squadId: 'alpha', lat: 48.41, lng: 2.64, connected: false),
      ];
      expect(_layout(endormis).squads.single.anyConnected, isFalse);

      final unEveille = [
        endormis.first,
        _homme('b', squadId: 'alpha', lat: 48.41, lng: 2.64),
      ];
      expect(_layout(unEveille).squads.single.anyConnected, isTrue);
    });

    test('deux escouades donnent deux marqueurs distincts', () {
      final vue = layoutAllies(
        members: [
          _homme('a', squadId: 'alpha', lat: 48.40, lng: 2.63),
          _homme('b', squadId: 'alpha', lat: 48.401, lng: 2.631),
          _homme('c', squadId: 'bravo', lat: 48.41, lng: 2.64),
          _homme('d', squadId: 'bravo', lat: 48.411, lng: 2.641),
        ],
        myMembershipId: null,
        zoom: 12,
        unitNames: const {'alpha': 'Alpha', 'bravo': 'Bravo'},
      );
      expect(vue.squads.length, 2);
      expect(
        vue.squads.map((g) => g.name).toList()..sort(),
        ['Alpha', 'Bravo'],
      );
      expect(vue.individuals, isEmpty);
    });

    test('le marqueur de groupe porte l’étiquette du réseau', () {
      // La fréquence radio appartient au groupe, pas à ses hommes : c'est
      // le marqueur d'escouade qui la porte pour tous.
      final vue = layoutAllies(
        members: _section,
        myMembershipId: null,
        zoom: 12,
        unitNames: const {'alpha': 'Alpha'},
        squadNotes: const {'alpha': '446.00625'},
      );
      expect(vue.squads.single.note, '446.00625');
    });

    test('une escouade sans étiquette n’en invente pas', () {
      expect(_layout(_section).squads.single.note, isNull);
    });

    test('une escouade sans nom connu reste lisible', () {
      final vue = layoutAllies(
        members: [
          _homme('a', squadId: 'inconnue', lat: 48.40, lng: 2.63),
          _homme('b', squadId: 'inconnue', lat: 48.401, lng: 2.631),
        ],
        myMembershipId: null,
        zoom: 12,
        unitNames: const {},
      );
      expect(vue.squads.single.name, 'Escouade');
    });
  });
}
