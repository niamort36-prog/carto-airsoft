import 'package:flutter/material.dart';

import 'unit_icons.dart';

/// Symbole choisi : son identifiant d'icône et sa famille.
typedef SymbolChoice = ({String iconId, SymbolFamily family});

/// Sélecteur de symbole. On choisit d'abord le CAMP, puis la CATÉGORIE
/// (unité, structure, dessin, point d'ordre) — organisation demandée par le
/// propriétaire du projet. Les points d'ordre n'ont pas de camp : le
/// sélecteur de camp disparaît alors.
class UnitPickerSheet extends StatefulWidget {
  const UnitPickerSheet({super.key, this.families = SymbolFamily.values});

  /// Familles proposées — restreint aux motifs quand on trace un dessin.
  final List<SymbolFamily> families;

  @override
  State<UnitPickerSheet> createState() => _UnitPickerSheetState();
}

class _UnitPickerSheetState extends State<UnitPickerSheet> {
  // Sur le terrain on signale surtout l'ennemi : camp par défaut.
  UnitAffiliation _affiliation = UnitAffiliation.hostile;
  late SymbolFamily _family = widget.families.first;

  @override
  Widget build(BuildContext context) {
    final slugs = UnitIcons.slugsOf(_family)
        .where((s) => UnitIcons.exists(_family, s, _affiliation))
        .toList();

    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              'Poser un symbole',
              style: Theme.of(context).textTheme.titleLarge,
            ),
            const SizedBox(height: 12),

            // 1. Le camp — masqué pour les points d'ordre, qui n'en ont pas.
            if (_family.hasAffiliation)
              SingleChildScrollView(
                scrollDirection: Axis.horizontal,
                child: SegmentedButton<UnitAffiliation>(
                  showSelectedIcon: false,
                  style: const ButtonStyle(
                    visualDensity: VisualDensity.compact,
                  ),
                  segments: [
                    for (final a in UnitAffiliation.values)
                      ButtonSegment(
                        value: a,
                        label: Text(a.label),
                        icon: Icon(Icons.circle, size: 12, color: a.color),
                      ),
                  ],
                  selected: {_affiliation},
                  onSelectionChanged: (s) =>
                      setState(() => _affiliation = s.first),
                ),
              ),

            // 2. La catégorie.
            if (widget.families.length > 1) ...[
              const SizedBox(height: 8),
              SingleChildScrollView(
                scrollDirection: Axis.horizontal,
                child: SegmentedButton<SymbolFamily>(
                  showSelectedIcon: false,
                  style: const ButtonStyle(
                    visualDensity: VisualDensity.compact,
                  ),
                  segments: [
                    for (final f in widget.families)
                      ButtonSegment(value: f, label: Text(f.label)),
                  ],
                  selected: {_family},
                  onSelectionChanged: (s) => setState(() => _family = s.first),
                ),
              ),
            ],

            const SizedBox(height: 12),
            Flexible(
              child: GridView.builder(
                shrinkWrap: true,
                gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                  crossAxisCount: 4,
                  mainAxisSpacing: 8,
                  crossAxisSpacing: 8,
                  childAspectRatio: 0.78,
                ),
                itemCount: slugs.length,
                itemBuilder: (context, i) {
                  final slug = slugs[i];
                  final id = UnitIcons.iconId(_family, slug, _affiliation);
                  return InkWell(
                    borderRadius: BorderRadius.circular(8),
                    onTap: () => Navigator.pop<SymbolChoice>(
                      context,
                      (iconId: id, family: _family),
                    ),
                    child: Column(
                      children: [
                        Expanded(
                          child: Padding(
                            padding: const EdgeInsets.all(6),
                            child: Image.asset(
                              UnitIcons.assetKey(id),
                              fit: BoxFit.contain,
                            ),
                          ),
                        ),
                        Text(
                          UnitIcons.labelOf(id),
                          style: Theme.of(context).textTheme.labelSmall,
                          maxLines: 2,
                          textAlign: TextAlign.center,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ],
                    ),
                  );
                },
              ),
            ),
          ],
        ),
      ),
    );
  }
}
