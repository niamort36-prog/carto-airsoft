import 'package:flutter/material.dart';

import 'unit_icons.dart';

/// Choix retourné par le sélecteur d'unité.
typedef UnitChoice = ({UnitType type, UnitAffiliation affiliation});

/// Grille des icônes du pack, filtrée par affiliation (symbolique APP-6 :
/// bleu allié, rouge ennemi, vert neutre, jaune inconnu).
class UnitPickerSheet extends StatefulWidget {
  const UnitPickerSheet({super.key});

  @override
  State<UnitPickerSheet> createState() => _UnitPickerSheetState();
}

class _UnitPickerSheetState extends State<UnitPickerSheet> {
  // Sur le terrain on signale surtout l'ennemi : affiliation par défaut.
  UnitAffiliation _affiliation = UnitAffiliation.hostile;

  @override
  Widget build(BuildContext context) {
    final types = [
      for (final t in UnitType.values)
        if (UnitIcons.exists(t, _affiliation)) t,
    ];
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              'Poser un marqueur',
              style: Theme.of(context).textTheme.titleLarge,
            ),
            const SizedBox(height: 12),
            SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              child: SegmentedButton<UnitAffiliation>(
                showSelectedIcon: false,
                style: const ButtonStyle(
                  visualDensity: VisualDensity.compact,
                ),
                segments: [
                  for (final a in UnitAffiliation.values)
                    ButtonSegment(value: a, label: Text(a.label)),
                ],
                selected: {_affiliation},
                onSelectionChanged: (s) =>
                    setState(() => _affiliation = s.first),
              ),
            ),
            const SizedBox(height: 12),
            Flexible(
              child: GridView.builder(
                shrinkWrap: true,
                gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                  crossAxisCount: 4,
                  mainAxisSpacing: 8,
                  crossAxisSpacing: 8,
                  childAspectRatio: 0.82,
                ),
                itemCount: types.length,
                itemBuilder: (context, i) {
                  final type = types[i];
                  final iconId = UnitIcons.iconId(type, _affiliation);
                  return InkWell(
                    borderRadius: BorderRadius.circular(8),
                    onTap: () => Navigator.pop<UnitChoice>(
                      context,
                      (type: type, affiliation: _affiliation),
                    ),
                    child: Column(
                      children: [
                        Expanded(
                          child: Padding(
                            padding: const EdgeInsets.all(6),
                            child: Image.asset(
                              UnitIcons.assetKey(iconId),
                              fit: BoxFit.contain,
                            ),
                          ),
                        ),
                        Text(
                          type.label,
                          style: Theme.of(context).textTheme.labelSmall,
                          maxLines: 1,
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
