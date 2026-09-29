import 'package:carto_airsoft/game/models.dart';
import 'package:carto_airsoft/map/command_tree.dart';
import 'package:flutter_test/flutter_test.dart';

MemberView _homme(
  String id, {
  String role = 'joueur',
  String? squadId,
  String? reportsTo,
}) =>
    MemberView(
      membershipId: id,
      pseudo: id,
      email: null,
      role: role,
      unitType: 'infantry',
      squadId: squadId,
      reportsToMembershipId: reportsTo,
      lifeStatus: LifeStatus.alive,
      lat: null,
      lng: null,
      isConnected: true,
      lastSeenAt: null,
    );

SquadSummary _escouade(
  String id, {
  String nom = 'Alpha',
  String? chef,
  String? rattacheA,
  String echelon = 'groupe',
  String? dans,
}) =>
    SquadSummary(
      id: id,
      name: nom,
      teamId: 'bleu',
      leaderMembershipId: chef,
      reportsToMembershipId: rattacheA,
      echelon: echelon,
      parentSquadId: dans,
    );

/// Cherche un nœud par identifiant d'homme, en profondeur.
CommandNode? _trouver(Iterable<CommandNode> noeuds, String id) {
  for (final n in noeuds) {
    if (n.member?.membershipId == id) return n;
    final trouve = _trouver(n.children, id);
    if (trouve != null) return trouve;
  }
  return null;
}

CommandNode? _trouverEscouade(Iterable<CommandNode> noeuds, String id) {
  for (final n in noeuds) {
    if (n.squadId == id) return n;
    final trouve = _trouverEscouade(n.children, id);
    if (trouve != null) return trouve;
  }
  return null;
}

void main() {
  group('organigramme de la chaîne de commandement', () {
    test('le commandant est le sommet', () {
      final arbre = buildCommandTree(
        members: [_homme('chef', role: 'commandant'), _homme('bidasse')],
        squads: const [],
      );
      expect(arbre.roots.length, 1);
      expect(arbre.roots.single.member!.membershipId, 'chef');
    });

    test('une escouade pend sous le gradé dont elle dépend', () {
      final arbre = buildCommandTree(
        members: [
          _homme('chef', role: 'commandant'),
          _homme('cap', role: 'capitaine'),
        ],
        squads: [_escouade('alpha', rattacheA: 'cap')],
      );
      final cap = _trouver(arbre.roots, 'cap')!;
      expect(cap.children.single.squadId, 'alpha');
    });

    test('une escouade sans rattachement relève du commandant', () {
      // Elle est dans sa partie ; elle n'est pas hors de sa chaîne.
      final arbre = buildCommandTree(
        members: [_homme('chef', role: 'commandant')],
        squads: [_escouade('alpha')],
      );
      expect(arbre.roots.single.children.single.squadId, 'alpha');
    });

    test('un homme d’escouade pend sous son escouade', () {
      final arbre = buildCommandTree(
        members: [
          _homme('chef', role: 'commandant'),
          _homme('a', squadId: 'alpha'),
          _homme('b', squadId: 'alpha'),
        ],
        squads: [_escouade('alpha')],
      );
      final alpha = _trouverEscouade(arbre.roots, 'alpha')!;
      expect(
        alpha.children.map((n) => n.member!.membershipId).toList()..sort(),
        ['a', 'b'],
      );
    });

    test('le rattachement explicite l’emporte sur l’escouade', () {
      // Un capitaine prend un homme sous ses ordres : l'ordre donné à la
      // main prime sur toute déduction.
      final arbre = buildCommandTree(
        members: [
          _homme('chef', role: 'commandant'),
          _homme('cap', role: 'capitaine'),
          _homme('a', squadId: 'alpha', reportsTo: 'cap'),
        ],
        squads: [_escouade('alpha', rattacheA: 'cap')],
      );
      final cap = _trouver(arbre.roots, 'cap')!;
      expect(
        cap.children.any((n) => n.member?.membershipId == 'a'),
        isTrue,
        reason: 'il doit pendre au capitaine, pas à l’escouade',
      );
      final alpha = _trouverEscouade(arbre.roots, 'alpha')!;
      expect(alpha.children, isEmpty);
    });

    test('un homme sous les ordres sans grade ni escouade est placé', () {
      final arbre = buildCommandTree(
        members: [
          _homme('chef', role: 'commandant'),
          _homme('cap', role: 'capitaine'),
          _homme('a', reportsTo: 'cap'),
        ],
        squads: const [],
      );
      expect(_trouver(arbre.roots, 'a'), isNotNull);
      expect(arbre.unattached, isEmpty);
    });

    test('un gradé sans rien remonte au commandant', () {
      final arbre = buildCommandTree(
        members: [
          _homme('chef', role: 'commandant'),
          _homme('cap', role: 'capitaine'),
        ],
        squads: const [],
      );
      expect(
        arbre.roots.single.children.single.member!.membershipId,
        'cap',
      );
    });

    test('un joueur que rien ne rattache se voit à part', () {
      // Un homme oublié de la chaîne est précisément ce qu'un organigramme
      // doit faire voir — pas ce qu'il doit cacher.
      final arbre = buildCommandTree(
        members: [_homme('chef', role: 'commandant'), _homme('perdu')],
        squads: const [],
      );
      expect(arbre.unattached.map((m) => m.membershipId), ['perdu']);
      expect(_trouver(arbre.roots, 'perdu'), isNull);
    });

    test('une boucle de rattachement ne fait pas tourner l’affichage', () {
      // « A répond à B, B répond à A » : sans garde-fou, l'arbre serait
      // infini.
      final arbre = buildCommandTree(
        members: [
          _homme('chef', role: 'commandant'),
          _homme('a', role: 'capitaine', reportsTo: 'b'),
          _homme('b', role: 'capitaine', reportsTo: 'a'),
        ],
        squads: const [],
      );
      expect(arbre.roots.length, 1);
      // Les deux restent visibles quelque part, aucun n'est perdu.
      final vus = <String>{};
      void parcourir(CommandNode n) {
        if (n.member != null) vus.add(n.member!.membershipId);
        n.children.forEach(parcourir);
      }
      arbre.roots.forEach(parcourir);
      vus.addAll(arbre.unattached.map((m) => m.membershipId));
      expect(vus, containsAll(['a', 'b']));
    });

    test('on ne peut pas se commander soi-même', () {
      final arbre = buildCommandTree(
        members: [
          _homme('chef', role: 'commandant'),
          _homme('a', role: 'capitaine', reportsTo: 'a'),
        ],
        squads: const [],
      );
      final a = _trouver(arbre.roots, 'a')!;
      expect(a.children, isEmpty);
    });

    test('l’effectif sous un gradé compte les hommes, pas les groupes', () {
      final arbre = buildCommandTree(
        members: [
          _homme('chef', role: 'commandant'),
          _homme('cap', role: 'capitaine'),
          _homme('a', squadId: 'alpha'),
          _homme('b', squadId: 'alpha'),
        ],
        squads: [_escouade('alpha', rattacheA: 'cap')],
      );
      final cap = _trouver(arbre.roots, 'cap')!;
      expect(cap.subordinateCount, 2);
      expect(arbre.roots.single.subordinateCount, 3);
    });

    test('chaque niveau se lit par grade, les escouades ensuite', () {
      final arbre = buildCommandTree(
        members: [
          _homme('chef', role: 'commandant'),
          _homme('zoulou', role: 'joueur', reportsTo: 'chef'),
          _homme('alpha', role: 'capitaine', reportsTo: 'chef'),
        ],
        squads: [_escouade('sq', rattacheA: 'chef')],
      );
      final sous = arbre.roots.single.children;
      expect(sous[0].member!.membershipId, 'alpha', reason: 'capitaine d’abord');
      expect(sous[1].member!.membershipId, 'zoulou');
      expect(sous[2].isSquad, isTrue, reason: 'les groupes ferment le niveau');
    });

    test('le chef désigné se signale, quel que soit son grade', () {
      // On peut commander un groupe sans porter le grade, et porter le
      // grade sans commander celui-ci.
      final arbre = buildCommandTree(
        members: [
          _homme('chef', role: 'commandant'),
          _homme('a', squadId: 'alpha'),
          _homme('b', squadId: 'alpha'),
        ],
        squads: [_escouade('alpha', chef: 'a')],
      );
      expect(_trouver(arbre.roots, 'a')!.isSquadLeader, isTrue);
      expect(_trouver(arbre.roots, 'b')!.isSquadLeader, isFalse);
    });

    test('l’arbre mis à plat se lit dans l’ordre, du haut vers le bas', () {
      final arbre = buildCommandTree(
        members: [
          _homme('chef', role: 'commandant'),
          _homme('cap', role: 'capitaine'),
          _homme('a', squadId: 'alpha'),
        ],
        squads: [_escouade('alpha', rattacheA: 'cap')],
      );
      final lignes = flattenCommandTree(arbre.roots);
      expect(lignes.length, 4, reason: 'chef, cap, alpha, a');
      expect(lignes[0].depth, 0);
      expect(lignes[1].depth, 1);
      expect(lignes[2].depth, 2, reason: 'l’escouade sous le capitaine');
      expect(lignes[3].depth, 3, reason: 'l’homme sous son escouade');
    });

    test('le dernier enfant ferme sa branche', () {
      final arbre = buildCommandTree(
        members: [
          _homme('chef', role: 'commandant'),
          _homme('a', role: 'capitaine', reportsTo: 'chef'),
          _homme('b', role: 'capitaine', reportsTo: 'chef'),
        ],
        squads: const [],
      );
      final lignes = flattenCommandTree(arbre.roots);
      final capitaines =
          lignes.where((l) => l.depth == 1).toList();
      expect(capitaines.length, 2);
      expect(capitaines.first.isLast, isFalse);
      expect(capitaines.last.isLast, isTrue);
    });

    test('un trait vertical ne continue que sous une branche ouverte', () {
      // « a » a un frère en dessous : la colonne de ses enfants doit garder
      // son trait. Ceux de « b », dernier, ne l'ont pas.
      final arbre = buildCommandTree(
        members: [
          _homme('chef', role: 'commandant'),
          _homme('a', role: 'capitaine', reportsTo: 'chef'),
          _homme('b', role: 'capitaine', reportsTo: 'chef'),
          _homme('filsA', reportsTo: 'a'),
          _homme('filsB', reportsTo: 'b'),
        ],
        squads: const [],
      );
      final lignes = flattenCommandTree(arbre.roots);
      final fa = lignes.firstWhere((l) => l.node.member?.membershipId == 'filsA');
      final fb = lignes.firstWhere((l) => l.node.member?.membershipId == 'filsB');
      expect(fa.guides.last, isTrue, reason: 'la branche de « a » continue');
      expect(fb.guides.last, isFalse, reason: 'celle de « b » est close');
    });

    test('les unités s’emboîtent sur toute la profondeur', () {
      // Compagnie › section › groupe › équipe : c'est la chaîne réelle
      // d'une unité d'infanterie.
      final arbre = buildCommandTree(
        members: [_homme('chef', role: 'commandant')],
        squads: [
          _escouade('cie', nom: '1re Cie', echelon: 'compagnie'),
          _escouade('sec', nom: '1re Sec', echelon: 'section', dans: 'cie'),
          _escouade('grp', nom: 'Groupe 1', echelon: 'groupe', dans: 'sec'),
          _escouade('eq', nom: 'Équipe B', echelon: 'equipe', dans: 'grp'),
        ],
      );
      final lignes = flattenCommandTree(arbre.roots);
      final profondeurs = {
        for (final l in lignes)
          if (l.node.squadId != null) l.node.squadId!: l.depth,
      };
      expect(profondeurs['cie'], 1, reason: 'sous le commandant');
      expect(profondeurs['sec'], 2);
      expect(profondeurs['grp'], 3);
      expect(profondeurs['eq'], 4);
    });

    test('un homme pend sous l’unité qui le porte, si profonde soit-elle', () {
      final arbre = buildCommandTree(
        members: [
          _homme('chef', role: 'commandant'),
          _homme('a', squadId: 'grp'),
        ],
        squads: [
          _escouade('cie', echelon: 'compagnie'),
          _escouade('grp', echelon: 'groupe', dans: 'cie'),
        ],
      );
      final lignes = flattenCommandTree(arbre.roots);
      final lui = lignes.firstWhere((l) => l.node.member?.membershipId == 'a');
      expect(lui.depth, 3, reason: 'commandant › compagnie › groupe › lui');
    });

    test('une unité peut relever d’un commandant sans échelon au-dessus', () {
      // La demande explicite : une escouade rattachée directement au
      // commandant, sans section intermédiaire.
      final arbre = buildCommandTree(
        members: [_homme('chef', role: 'commandant')],
        squads: [
          _escouade('cie', echelon: 'compagnie'),
          _escouade('autonome', echelon: 'groupe', rattacheA: 'chef'),
        ],
      );
      final sommet = arbre.roots.single;
      expect(
        sommet.children.map((n) => n.squadId).toList()..sort(),
        ['autonome', 'cie'],
        reason: 'les deux pendent au commandant, au même niveau',
      );
    });

    test('deux commandants donnent deux sommets', () {
      final arbre = buildCommandTree(
        members: [
          _homme('alpha', role: 'commandant'),
          _homme('bravo', role: 'commandant'),
        ],
        squads: const [],
      );
      expect(arbre.roots.length, 2);
      expect(
        arbre.roots.map((n) => n.member!.membershipId).toList(),
        ['alpha', 'bravo'],
      );
    });

    test('à deux commandants, rien n’est rattaché au hasard', () {
      // Accrocher au premier venu inventerait une subordination que
      // personne n'a donnée : l'unité devient un sommet, qui se voit.
      final arbre = buildCommandTree(
        members: [
          _homme('alpha', role: 'commandant'),
          _homme('bravo', role: 'commandant'),
        ],
        squads: [_escouade('orpheline')],
      );
      expect(arbre.roots.length, 3);
      expect(arbre.roots.map((n) => n.squadId), contains('orpheline'));
    });

    test('une unité ne se contient pas, même à travers trois échelons', () {
      final arbre = buildCommandTree(
        members: [_homme('chef', role: 'commandant')],
        squads: [
          _escouade('a', echelon: 'compagnie', dans: 'c'),
          _escouade('b', echelon: 'section', dans: 'a'),
          _escouade('c', echelon: 'groupe', dans: 'b'),
        ],
      );
      // Aucune ne disparaît, et l'aplatissement se termine.
      final lignes = flattenCommandTree(arbre.roots);
      final vues = lignes
          .where((l) => l.node.squadId != null)
          .map((l) => l.node.squadId!)
          .toSet();
      expect(vues, containsAll(['a', 'b', 'c']));
    });

    test('les grandes unités se lisent avant les petites', () {
      final arbre = buildCommandTree(
        members: [_homme('chef', role: 'commandant')],
        squads: [
          _escouade('grp', nom: 'Groupe', echelon: 'groupe'),
          _escouade('cie', nom: 'Compagnie', echelon: 'compagnie'),
        ],
      );
      final sous = arbre.roots.single.children;
      expect(sous.first.squadId, 'cie');
      expect(sous.last.squadId, 'grp');
    });

    test('sans commandant, l’arbre garde plusieurs sommets', () {
      // Mieux vaut plusieurs racines qu'un arbre vide.
      final arbre = buildCommandTree(
        members: [_homme('a', role: 'capitaine')],
        squads: [_escouade('alpha')],
      );
      expect(arbre.roots.map((n) => n.squadId), contains('alpha'));
      expect(arbre.unattached, isEmpty);
    });
  });
}
