import 'package:flutter/material.dart';

import '../game/models.dart';
import 'command_tree.dart';
import 'unit_icons.dart';

/// Affichage de l'organigramme : qui commande qui, en arbre plutôt qu'en
/// liste.
///
/// Une liste à plat dit qui est là ; elle ne dit jamais à qui l'on passe un
/// ordre ni par qui il descend. L'arbre répond aux deux — et fait voir du
/// même coup les hommes que rien ne rattache, ce qu'une liste noie.
///
/// Le tracé est volontairement en arbre INDENTÉ et non en carte radiale :
/// sur un écran de téléphone tenu à une main, vingt joueurs disposés en
/// étoile deviennent illisibles, là où l'indentation reste lisible aussi
/// loin qu'elle descend.
class CommandTreeView extends StatelessWidget {
  const CommandTreeView({
    super.key,
    required this.tree,
    required this.myMembershipId,
    this.onTapMember,
    this.onTapSquad,
  });

  final CommandTree tree;
  final String? myMembershipId;

  /// Appelé quand on touche un homme — pour le montrer sur la carte.
  final void Function(MemberView)? onTapMember;

  /// Appelé quand on touche une unité — pour la réorganiser. L'arbre est
  /// l'endroit où l'on LIT la structure : c'est donc l'endroit naturel
  /// pour la modifier.
  final void Function(CommandNode)? onTapSquad;

  static const double _colonne = 20;
  static const double _hauteurLigne = 46;

  @override
  Widget build(BuildContext context) {
    final lignes = flattenCommandTree(tree.roots);
    final theme = Theme.of(context);

    return ListView(
      shrinkWrap: true,
      children: [
        for (final ligne in lignes) _ligne(context, ligne),
        if (tree.unattached.isNotEmpty) ...[
          const Divider(height: 24),
          Padding(
            padding: const EdgeInsets.fromLTRB(8, 0, 8, 4),
            child: Text(
              'HORS CHAÎNE',
              style: theme.textTheme.labelSmall?.copyWith(
                fontWeight: FontWeight.bold,
                letterSpacing: 1.2,
                color: theme.colorScheme.error,
              ),
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(8, 0, 8, 8),
            child: Text(
              'Ni grade, ni escouade, ni supérieur — personne ne les commande.',
              style: theme.textTheme.bodySmall,
            ),
          ),
          for (final m in tree.unattached)
            _corps(context, CommandNode.person(m), 0),
        ],
      ],
    );
  }

  Widget _ligne(BuildContext context, CommandRow ligne) {
    return SizedBox(
      height: _hauteurLigne,
      child: Row(
        children: [
          // Les colonnes de raccord : un trait vertical là où une branche
          // continue plus bas, rien là où elle s'est refermée.
          for (final continue_ in ligne.guides)
            SizedBox(
              width: _colonne,
              height: _hauteurLigne,
              child: CustomPaint(
                painter: _Raccord(
                  vertical: continue_,
                  couleur: _traitCouleur(context),
                ),
              ),
            ),
          if (ligne.depth > 0)
            SizedBox(
              width: _colonne,
              height: _hauteurLigne,
              child: CustomPaint(
                painter: _Raccord(
                  branche: true,
                  vertical: !ligne.isLast,
                  couleur: _traitCouleur(context),
                ),
              ),
            ),
          Expanded(child: _corps(context, ligne.node, ligne.depth)),
        ],
      ),
    );
  }

  Color _traitCouleur(BuildContext context) =>
      Theme.of(context).colorScheme.outline.withValues(alpha: 0.6);

  Widget _corps(BuildContext context, CommandNode noeud, int depth) {
    final theme = Theme.of(context);
    if (noeud.isSquad) {
      final effectif = noeud.children.length;
      return InkWell(
        onTap: onTapSquad == null ? null : () => onTapSquad!(noeud),
        child: Row(
          children: [
            Icon(Icons.groups, size: 26, color: theme.colorScheme.primary),
            const SizedBox(width: 8),
            Expanded(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    noeud.squadName!.toUpperCase(),
                    style: theme.textTheme.bodyMedium?.copyWith(
                      fontWeight: FontWeight.bold,
                      letterSpacing: 0.8,
                    ),
                    overflow: TextOverflow.ellipsis,
                  ),
                  Text(
                    [
                      // L'échelon DÉCLARÉ, pas celui que l'effectif du
                      // moment laisserait deviner : une section reste une
                      // section le jour où six hommes sont là.
                      SymbolEchelon.fromWire(noeud.echelon).label,
                      if (effectif > 0)
                        '$effectif ${effectif > 1 ? 'éléments' : 'élément'}',
                      if ((noeud.squadNote ?? '').isNotEmpty) noeud.squadNote!,
                    ].join(' · '),
                    style: theme.textTheme.bodySmall,
                    overflow: TextOverflow.ellipsis,
                  ),
                ],
              ),
            ),
          ],
        ),
      );
    }

    final m = noeud.member!;
    final moi = m.membershipId == myMembershipId;
    final chefIci = noeud.isSquadLeader;
    final sous = noeud.subordinateCount;

    return InkWell(
      onTap: onTapMember == null ? null : () => onTapMember!(m),
      child: Opacity(
        opacity: m.isConnected ? 1 : 0.45,
        child: Row(
          children: [
            Image.asset(
              UnitIcons.assetKey('${m.unitType}_allied'),
              width: 30,
              height: 30,
              fit: BoxFit.contain,
            ),
            const SizedBox(width: 8),
            Expanded(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    moi ? '${m.displayName} (moi)' : m.displayName,
                    style: theme.textTheme.bodyMedium?.copyWith(
                      fontWeight: moi ? FontWeight.bold : FontWeight.w500,
                    ),
                    overflow: TextOverflow.ellipsis,
                  ),
                  Text(
                    [
                      roleLabel(m.role),
                      if ((m.note ?? '').isNotEmpty) m.note!,
                      if (!m.isConnected) 'hors ligne',
                    ].join(' · '),
                    style: theme.textTheme.bodySmall,
                    overflow: TextOverflow.ellipsis,
                  ),
                ],
              ),
            ),
            // Ce qu'un gradé a réellement sous ses ordres : la seule chose
            // qu'on cherche vraiment en ouvrant un organigramme.
            if (sous > 0)
              Padding(
                padding: const EdgeInsets.only(left: 4),
                child: Chip(
                  visualDensity: VisualDensity.compact,
                  materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
                  padding: EdgeInsets.zero,
                  labelPadding: const EdgeInsets.symmetric(horizontal: 6),
                  label: Text('$sous', style: theme.textTheme.labelSmall),
                ),
              ),
            if (chefIci)
              const Padding(
                padding: EdgeInsets.only(left: 4),
                child: Tooltip(
                  message: 'Chef désigné de son escouade',
                  child: Icon(Icons.star, size: 16),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

/// Trace une colonne de raccord : le trait vertical d'une branche ouverte,
/// et le coude ou le té qui rejoint la ligne.
class _Raccord extends CustomPainter {
  const _Raccord({
    required this.couleur,
    this.vertical = false,
    this.branche = false,
  });

  /// La branche de cette colonne continue-t-elle sous cette ligne ?
  final bool vertical;

  /// Cette colonne porte-t-elle le raccord horizontal vers le nœud ?
  final bool branche;
  final Color couleur;

  @override
  void paint(Canvas canvas, Size size) {
    final trait = Paint()
      ..color = couleur
      ..strokeWidth = 1.4
      ..strokeCap = StrokeCap.round;
    final x = size.width / 2;
    final milieu = size.height / 2;

    if (branche) {
      // Du haut jusqu'au milieu, puis vers la droite : le coude. Si la
      // branche continue, le trait descend jusqu'en bas — c'est un té.
      canvas.drawLine(
        Offset(x, 0),
        Offset(x, vertical ? size.height : milieu),
        trait,
      );
      canvas.drawLine(Offset(x, milieu), Offset(size.width, milieu), trait);
    } else if (vertical) {
      canvas.drawLine(Offset(x, 0), Offset(x, size.height), trait);
    }
  }

  @override
  bool shouldRepaint(_Raccord old) =>
      old.vertical != vertical ||
      old.branche != branche ||
      old.couleur != couleur;
}
