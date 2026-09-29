import '../game/models.dart';

/// Construction de l'organigramme d'une partie : qui commande qui, et
/// quelle escouade dépend de quel gradé (§5).
///
/// Le problème qu'il résout : une liste à plat dit qui est là, jamais qui
/// répond à qui. Sur le terrain la question n'est pas « qui joue ? » mais
/// « à qui je passe cet ordre, et par qui il descend ». Un arbre répond aux
/// deux d'un coup.
///
/// Écrit à part du composant carte pour être vérifiable : c'est de la
/// règle, pas de l'affichage. Trois sources se combinent, dans cet ordre :
///
/// 1. Le **rattachement explicite** d'un homme (`reportsToMembershipId`) —
///    il l'emporte toujours : un capitaine peut prendre quelqu'un sous ses
///    ordres sans lui donner de grade ni l'enfermer dans une escouade.
/// 2. Son **escouade**, qui pend elle-même sous le gradé dont elle dépend.
/// 3. À défaut, son **grade** : les gradés remontent au commandant.

/// Un nœud de l'organigramme : un homme, ou une escouade.
///
/// Les deux cohabitent dans le même arbre à dessein — une escouade est un
/// échelon de commandement au même titre qu'un homme, et la masquer
/// obligerait à deviner pourquoi quatre hommes pendent au même capitaine.
class CommandNode {
  CommandNode.person(MemberView this.member)
      : squadId = null,
        squadName = null,
        squadNote = null,
        leaderId = null;

  CommandNode.squad({
    required String this.squadId,
    required String this.squadName,
    this.squadNote,
    this.leaderId,
  }) : member = null;

  /// L'homme, quand le nœud en est un.
  final MemberView? member;

  /// L'escouade, quand le nœud en est une.
  final String? squadId;
  final String? squadName;
  final String? squadNote;

  /// Chef de l'escouade, s'il en a un — porté par le nœud d'escouade.
  final String? leaderId;

  /// Vrai quand cet homme est le chef DÉSIGNÉ d'une escouade.
  ///
  /// Distinct du grade : on peut porter « chef d'escouade » sans commander
  /// de groupe, et commander un groupe sans porter le grade. C'est la
  /// désignation qui compte pour savoir à qui parler.
  bool isSquadLeader = false;

  final List<CommandNode> children = [];

  bool get isSquad => squadId != null;

  /// Effectif total sous ce nœud, lui non compris. Sert à dire d'un coup
  /// d'œil ce qu'un gradé a réellement sous ses ordres.
  int get subordinateCount => children.fold(
        0,
        (total, enfant) => total + (enfant.isSquad ? 0 : 1) + enfant.subordinateCount,
      );
}

/// L'organigramme complet.
class CommandTree {
  const CommandTree({required this.roots, required this.unattached});

  /// Sommets de la chaîne — le commandant en tête quand il y en a un.
  final List<CommandNode> roots;

  /// Ceux que rien ne rattache : ni grade, ni escouade, ni supérieur. Ils
  /// ne sont pas cachés — un homme oublié de la chaîne est précisément ce
  /// qu'un organigramme doit faire voir.
  final List<MemberView> unattached;
}

/// Assemble l'organigramme à partir des membres et des escouades.
CommandTree buildCommandTree({
  required Iterable<MemberView> members,
  required Iterable<SquadSummary> squads,
}) {
  final hommes = {for (final m in members) m.membershipId: m};
  final noeuds = {
    for (final m in members) m.membershipId: CommandNode.person(m),
  };
  final noeudsEscouade = {
    for (final s in squads)
      s.id: CommandNode.squad(
        squadId: s.id,
        squadName: s.name,
        squadNote: s.note,
        leaderId: s.leaderMembershipId,
      ),
  };

  final racines = <CommandNode>[];
  final orphelins = <MemberView>[];
  final places = <String>{};

  // Le commandant est le sommet. À défaut (partie sans commandant actif),
  // l'arbre aura plusieurs racines — mieux vaut plusieurs sommets qu'un
  // arbre vide.
  final commandant = hommes.values
      .where((m) => m.role == 'commandant')
      .firstOrNull;
  if (commandant != null) {
    racines.add(noeuds[commandant.membershipId]!);
    places.add(commandant.membershipId);
  }

  /// Remonte la chaîne des rattachements explicites pour vérifier qu'on ne
  /// referme pas une boucle. Sans ce garde-fou, « A répond à B, B répond à
  /// A » ferait tourner l'affichage à l'infini.
  bool creeUneBoucle(String depart, String vise) {
    var courant = vise;
    final vus = <String>{};
    while (vus.add(courant)) {
      if (courant == depart) return true;
      final suivant = hommes[courant]?.reportsToMembershipId;
      if (suivant == null) return false;
      courant = suivant;
    }
    return true;
  }

  // --- Les escouades pendent sous le gradé dont elles dépendent ----------
  for (final squad in squads) {
    final noeud = noeudsEscouade[squad.id]!;
    final chef = squad.reportsToMembershipId;
    if (chef != null && noeuds[chef] != null) {
      noeuds[chef]!.children.add(noeud);
    } else if (commandant != null) {
      // Une escouade sans rattachement relève du commandant : elle est dans
      // sa partie, elle n'est pas hors de sa chaîne.
      noeuds[commandant.membershipId]!.children.add(noeud);
    } else {
      racines.add(noeud);
    }
  }

  // --- Puis les hommes --------------------------------------------------
  // Ordre hiérarchique : un capitaine doit être posé avant les hommes qui
  // lui répondent, sinon il pendrait sous l'un d'eux.
  final restants = hommes.values.where((m) => !places.contains(m.membershipId)).toList()
    ..sort((a, b) => roleRank(a.role) - roleRank(b.role));

  for (final m in restants) {
    final noeud = noeuds[m.membershipId]!;

    // 1. Le rattachement explicite l'emporte : c'est un ordre donné à la
    //    main, il prime sur toute déduction.
    final superieur = m.reportsToMembershipId;
    if (superieur != null &&
        noeuds[superieur] != null &&
        superieur != m.membershipId &&
        !creeUneBoucle(m.membershipId, superieur)) {
      noeuds[superieur]!.children.add(noeud);
      places.add(m.membershipId);
      continue;
    }

    // 2. Sinon son escouade, si elle est connue.
    final squadId = m.squadId;
    if (squadId != null && noeudsEscouade[squadId] != null) {
      noeudsEscouade[squadId]!.children.add(noeud);
      places.add(m.membershipId);
      continue;
    }

    // 3. Sinon son grade : un gradé relève du commandant — et à défaut de
    //    commandant, c'est lui le sommet. Un capitaine n'est jamais un
    //    homme égaré.
    if (m.role != 'joueur') {
      if (commandant != null) {
        noeuds[commandant.membershipId]!.children.add(noeud);
      } else {
        racines.add(noeud);
      }
      places.add(m.membershipId);
      continue;
    }

    // 4. Rien ne le rattache. On le montre à part plutôt que de l'accrocher
    //    arbitrairement : c'est une information, pas un défaut d'affichage.
    orphelins.add(m);
  }

  // Les chefs désignés se signalent, quel que soit leur grade.
  for (final squad in squads) {
    final chef = squad.leaderMembershipId;
    if (chef != null && noeuds[chef] != null) {
      noeuds[chef]!.isSquadLeader = true;
    }
  }

  // Chaque niveau se lit dans l'ordre des grades, puis alphabétique — le
  // même ordre que la liste des alliés, pour ne pas dérouter.
  void trier(CommandNode noeud) {
    noeud.children.sort((a, b) {
      // Les escouades après les hommes du même niveau : un chef d'abord,
      // ses groupes ensuite.
      if (a.isSquad != b.isSquad) return a.isSquad ? 1 : -1;
      if (a.isSquad) return a.squadName!.compareTo(b.squadName!);
      final rang = roleRank(a.member!.role) - roleRank(b.member!.role);
      if (rang != 0) return rang;
      return a.member!.displayName.compareTo(b.member!.displayName);
    });
    for (final enfant in noeud.children) {
      trier(enfant);
    }
  }

  for (final racine in racines) {
    trier(racine);
  }
  orphelins.sort((a, b) => a.displayName.compareTo(b.displayName));

  return CommandTree(roots: racines, unattached: orphelins);
}

/// Une ligne de l'organigramme mis à plat, prête à dessiner.
class CommandRow {
  const CommandRow({
    required this.node,
    required this.depth,
    required this.guides,
    required this.isLast,
  });

  final CommandNode node;

  /// Profondeur dans l'arbre — 0 pour un sommet.
  final int depth;

  /// Pour chaque niveau au-dessus, l'ancêtre a-t-il encore des frères en
  /// dessous ? C'est ce qui décide si le trait vertical continue dans cette
  /// colonne, ou si la branche est close.
  final List<bool> guides;

  /// Dernier enfant de son parent : le raccord se dessine en coude plutôt
  /// qu'en té.
  final bool isLast;
}

/// Met l'arbre à plat, dans l'ordre de lecture, en calculant les traits de
/// liaison de chaque ligne.
///
/// Ce calcul est de la règle et non du dessin : c'est lui qui dit où une
/// branche continue et où elle se referme. Le rendu n'a plus qu'à tracer.
List<CommandRow> flattenCommandTree(List<CommandNode> roots) {
  final lignes = <CommandRow>[];

  void descendre(CommandNode noeud, int depth, List<bool> guides, bool isLast) {
    lignes.add(CommandRow(
      node: noeud,
      depth: depth,
      guides: List.unmodifiable(guides),
      isLast: isLast,
    ));
    for (var i = 0; i < noeud.children.length; i++) {
      final dernier = i == noeud.children.length - 1;
      descendre(
        noeud.children[i],
        depth + 1,
        [...guides, !isLast],
        dernier,
      );
    }
  }

  for (var i = 0; i < roots.length; i++) {
    descendre(roots[i], 0, const [], i == roots.length - 1);
  }
  return lignes;
}
