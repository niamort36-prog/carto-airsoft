// Habillage de la carte : bandeau d'état, boîte de visée et menu d'outils.
//
// Ces widgets ne connaissent que des valeurs déjà calculées — aucune logique
// de jeu ici. La carte reste visible au maximum : le bandeau est fin, le menu
// ne dépasse jamais le quart de l'écran et la boîte de visée est translucide.

import 'package:flutter/material.dart';

import 'grid_ref.dart';
import 'map_styles.dart';
import 'unit_icons.dart';

/// Bandeau supérieur, façon terminal tactique : batterie, cap, heure,
/// coordonnées de quadrillage, réseau. Pas de nom de partie — l'écran de
/// carte sert à lire le terrain, pas à rappeler où l'on est inscrit.
class TacticalTopBar extends StatelessWidget {
  const TacticalTopBar({
    super.key,
    required this.batteryLevel,
    required this.batteryCharging,
    required this.heading,
    required this.clock,
    required this.grid,
    required this.online,
    required this.linked,
    this.onGridTap,
  });

  final int? batteryLevel;
  final bool batteryCharging;

  /// Cap de l'appareil, ou null tant que la boussole n'a rien donné.
  final double? heading;
  final String clock;
  final String grid;

  /// Réseau du téléphone présent, et liaison à l'arbitre établie.
  final bool online;
  final bool linked;
  final VoidCallback? onGridTap;

  @override
  Widget build(BuildContext context) {
    const style = TextStyle(
      color: Colors.white,
      fontSize: 15,
      fontWeight: FontWeight.w600,
      letterSpacing: 1.2,
      fontFeatures: [FontFeature.tabularFigures()],
    );

    return Container(
      color: Colors.black.withValues(alpha: 0.86),
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      child: SafeArea(
        bottom: false,
        child: Row(
          children: [
            Icon(
              batteryCharging
                  ? Icons.battery_charging_full
                  : _batteryIcon(batteryLevel),
              size: 20,
              color: (batteryLevel ?? 100) <= 15 && !batteryCharging
                  ? Colors.red.shade400
                  : Colors.white,
            ),
            const SizedBox(width: 4),
            Text(
              batteryLevel == null ? '--' : '$batteryLevel',
              style: style.copyWith(fontSize: 13),
            ),
            const Spacer(),
            // Cap : point cardinal puis azimut, comme sur une planchette.
            Text(
              heading == null ? '--' : cardinalOf(heading!),
              style: style,
            ),
            const SizedBox(width: 8),
            Text(
              heading == null
                  ? '---°'
                  : '${(heading!.round() % 360).toString().padLeft(3, '0')}°',
              style: style,
            ),
            const Spacer(),
            Text(clock, style: style),
            const Spacer(),
            // Coordonnées : appui pour la référence complète.
            InkWell(
              onTap: onGridTap,
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 4),
                child: Text(grid, style: style),
              ),
            ),
            const Spacer(),
            Icon(
              online ? Icons.signal_cellular_alt : Icons.signal_cellular_off,
              size: 20,
              color: online ? Colors.white : Colors.orange.shade300,
            ),
            const SizedBox(width: 3),
            // Pastille de liaison à l'arbitre : verte = temps réel actif.
            Icon(
              Icons.circle,
              size: 9,
              color: linked ? Colors.lightGreenAccent : Colors.orange,
            ),
          ],
        ),
      ),
    );
  }

  static IconData _batteryIcon(int? level) => switch (level) {
        null => Icons.battery_unknown,
        <= 15 => Icons.battery_1_bar,
        <= 35 => Icons.battery_3_bar,
        <= 65 => Icons.battery_5_bar,
        <= 90 => Icons.battery_6_bar,
        _ => Icons.battery_full,
      };
}

/// Bandeau d'avertissement du navigateur.
///
/// Un onglet est suspendu dès qu'il passe en arrière-plan ou que l'écran
/// s'éteint : la position cesse alors d'être transmise. Les alliés voient
/// bien le joueur passer « hors ligne » avec sa dernière position (§2.4),
/// mais LUI doit le savoir avant d'engager une partie là-dessus — sans quoi
/// il croira être suivi alors qu'il a disparu de la carte de son équipe.
class WebLimitsBanner extends StatelessWidget {
  const WebLimitsBanner({super.key, required this.onDismiss});

  final VoidCallback onDismiss;

  @override
  Widget build(BuildContext context) {
    return Container(
      color: Colors.orange.shade900,
      padding: const EdgeInsets.fromLTRB(12, 6, 6, 6),
      child: Row(
        children: [
          const Icon(Icons.warning_amber, size: 18, color: Colors.white),
          const SizedBox(width: 8),
          const Expanded(
            child: Text(
              'Gardez cet écran allumé et au premier plan : un onglet mis '
              'de côté ou un téléphone verrouillé cesse d’émettre votre '
              'position, et vous disparaissez de la carte de votre équipe.',
              style: TextStyle(color: Colors.white, fontSize: 12),
            ),
          ),
          InkWell(
            onTap: onDismiss,
            child: const Padding(
              padding: EdgeInsets.all(4),
              child: Icon(Icons.close, size: 18, color: Colors.white),
            ),
          ),
        ],
      ),
    );
  }
}

/// Point visé : ce qu'il faut pour s'y rendre sans quitter la carte des yeux.
class GuidanceTarget {
  const GuidanceTarget({
    required this.label,
    required this.lat,
    required this.lng,
    this.elevation,
  });

  final String label;
  final double lat;
  final double lng;

  /// Altitude du point, quand les tuiles de terrain ont pu la donner.
  final double? elevation;
}

/// Boîte de visée translucide, en bas à gauche : coordonnées, distance,
/// dénivelé et azimut à suivre.
class GuidanceBox extends StatelessWidget {
  const GuidanceBox({
    super.key,
    required this.target,
    required this.myLat,
    required this.myLng,
    required this.myElevation,
    required this.onClose,
  });

  final GuidanceTarget target;
  final double? myLat;
  final double? myLng;
  final double? myElevation;
  final VoidCallback onClose;

  @override
  Widget build(BuildContext context) {
    final known = myLat != null && myLng != null;
    final distance =
        known ? distanceBetween(myLat!, myLng!, target.lat, target.lng) : null;
    final bearing =
        known ? bearingBetween(myLat!, myLng!, target.lat, target.lng) : null;
    final delta = (target.elevation != null && myElevation != null)
        ? target.elevation! - myElevation!
        : null;

    const style = TextStyle(
      color: Colors.white,
      fontSize: 17,
      fontWeight: FontWeight.w600,
      letterSpacing: 1.5,
      fontFeatures: [FontFeature.tabularFigures()],
    );

    return Container(
      padding: const EdgeInsets.fromLTRB(14, 8, 6, 10),
      decoration: BoxDecoration(
        color: Colors.black.withValues(alpha: 0.45),
        borderRadius: BorderRadius.circular(6),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.end,
        mainAxisSize: MainAxisSize.min,
        children: [
          Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Flexible(
                child: Text(
                  target.label,
                  style: style.copyWith(
                    fontSize: 13,
                    color: Colors.white70,
                    letterSpacing: 0.5,
                  ),
                  overflow: TextOverflow.ellipsis,
                ),
              ),
              InkWell(
                onTap: onClose,
                child: const Padding(
                  padding: EdgeInsets.only(left: 8),
                  child: Icon(Icons.close, size: 18, color: Colors.white70),
                ),
              ),
            ],
          ),
          Text(gridLabel(target.lat, target.lng), style: style),
          Text(distance == null ? '—' : formatDistance(distance), style: style),
          Text(formatElevationDelta(delta), style: style),
          Text(
            bearing == null
                ? '—'
                : '${(bearing.round() % 360).toString().padLeft(3, '0')}°  '
                    '${cardinalOf(bearing)}',
            style: style,
          ),
        ],
      ),
    );
  }
}

/// Une entrée du menu d'outils.
class ToolAction {
  const ToolAction({
    required this.icon,
    required this.label,
    required this.onPressed,
    this.badge,
    this.selected = false,
  });

  final IconData icon;
  final String label;
  final VoidCallback onPressed;

  /// Pastille chiffrée (nombre d'alliés, par exemple).
  final String? badge;
  final bool selected;
}

/// Menu d'outils repliable : rail d'icônes à droite en paysage, en bas en
/// portrait. Déplié, il est borné au quart de l'écran pour ne jamais manger
/// la carte.
class ToolRail extends StatelessWidget {
  const ToolRail({
    super.key,
    required this.actions,
    required this.expanded,
    required this.onToggle,
    required this.landscape,
  });

  final List<ToolAction> actions;
  final bool expanded;
  final VoidCallback onToggle;
  final bool landscape;

  @override
  Widget build(BuildContext context) {
    final size = MediaQuery.sizeOf(context);
    final maxWidth = size.width / 4;
    final maxHeight = size.height / 4;

    final toggle = _RailButton(
      icon: landscape
          ? (expanded ? Icons.chevron_right : Icons.chevron_left)
          : (expanded ? Icons.expand_more : Icons.expand_less),
      label: 'Menu',
      expanded: expanded,
      onPressed: onToggle,
      landscape: landscape,
    );

    final children = [
      toggle,
      for (final a in actions)
        _RailButton(
          icon: a.icon,
          label: a.label,
          badge: a.badge,
          selected: a.selected,
          expanded: expanded,
          onPressed: a.onPressed,
          landscape: landscape,
        ),
    ];

    return Container(
      constraints: landscape
          ? BoxConstraints(maxWidth: maxWidth)
          : BoxConstraints(maxHeight: maxHeight),
      decoration: BoxDecoration(
        color: Colors.black.withValues(alpha: 0.55),
        borderRadius: BorderRadius.circular(10),
      ),
      padding: const EdgeInsets.all(4),
      child: landscape
          ? SingleChildScrollView(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: children,
              ),
            )
          : SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              child: Row(mainAxisSize: MainAxisSize.min, children: children),
            ),
    );
  }
}

class _RailButton extends StatelessWidget {
  const _RailButton({
    required this.icon,
    required this.label,
    required this.expanded,
    required this.onPressed,
    required this.landscape,
    this.badge,
    this.selected = false,
  });

  final IconData icon;
  final String label;
  final bool expanded;
  final VoidCallback onPressed;
  final bool landscape;
  final String? badge;
  final bool selected;

  @override
  Widget build(BuildContext context) {
    final color = selected
        ? Theme.of(context).colorScheme.primary
        : Colors.white;
    final glyph = Stack(
      clipBehavior: Clip.none,
      children: [
        Icon(icon, color: color, size: 24),
        if (badge != null)
          Positioned(
            right: -6,
            top: -4,
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 1),
              decoration: BoxDecoration(
                color: Theme.of(context).colorScheme.primary,
                borderRadius: BorderRadius.circular(8),
              ),
              child: Text(
                badge!,
                style: const TextStyle(fontSize: 10, color: Colors.black),
              ),
            ),
          ),
      ],
    );

    return InkWell(
      onTap: onPressed,
      borderRadius: BorderRadius.circular(8),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 9),
        child: expanded && landscape
            ? Row(
                children: [
                  glyph,
                  const SizedBox(width: 10),
                  Flexible(
                    child: Text(
                      label,
                      style: TextStyle(color: color, fontSize: 13),
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                ],
              )
            : Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  glyph,
                  if (expanded) ...[
                    const SizedBox(height: 3),
                    Text(
                      label,
                      style: TextStyle(color: color, fontSize: 10),
                    ),
                  ],
                ],
              ),
      ),
    );
  }
}

/// Panneau de tracé. Posé sur un fond opaque comme le reste de l'habillage :
/// les boutons transparents sur la carte devenaient illisibles dès que le
/// fond était clair. Tout tient sans défilement, et le dernier point posé
/// peut être repris — sur le terrain on se trompe d'un pas.
class DrawingPanel extends StatelessWidget {
  const DrawingPanel({
    super.key,
    required this.pointCount,
    required this.pattern,
    required this.onPickPattern,
    required this.onClearPattern,
    required this.onUndo,
    required this.onCancel,
    required this.onFinish,
  });

  final int pointCount;

  /// Motif habillant le tracé, ou null pour un trait uni.
  final String? pattern;
  final VoidCallback onPickPattern;
  final VoidCallback onClearPattern;
  final VoidCallback onUndo;
  final VoidCallback onCancel;
  final ValueChanged<String> onFinish;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Container(
      constraints: const BoxConstraints(maxWidth: 460),
      decoration: BoxDecoration(
        color: Colors.black.withValues(alpha: 0.78),
        borderRadius: BorderRadius.circular(14),
      ),
      padding: const EdgeInsets.fromLTRB(10, 8, 10, 10),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              // Motif : aperçu de l'image, et croix pour revenir au trait uni.
              Flexible(
                child: InkWell(
                  onTap: onPickPattern,
                  borderRadius: BorderRadius.circular(8),
                  child: Padding(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 6,
                      vertical: 4,
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        if (pattern == null)
                          const Icon(Icons.gesture,
                              size: 20, color: Colors.white)
                        else
                          Image.asset(
                            UnitIcons.assetKey(pattern!),
                            width: 26,
                            height: 20,
                            fit: BoxFit.contain,
                          ),
                        const SizedBox(width: 6),
                        Flexible(
                          child: Text(
                            pattern == null
                                ? 'Trait uni'
                                : UnitIcons.labelOf(pattern!),
                            style: const TextStyle(
                              color: Colors.white,
                              fontSize: 13,
                            ),
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                        if (pattern != null)
                          InkWell(
                            onTap: onClearPattern,
                            child: const Padding(
                              padding: EdgeInsets.only(left: 4),
                              child: Icon(Icons.close,
                                  size: 15, color: Colors.white54),
                            ),
                          ),
                      ],
                    ),
                  ),
                ),
              ),
              const Spacer(),
              Text(
                '$pointCount pt${pointCount > 1 ? 's' : ''}',
                style: const TextStyle(
                  color: Colors.white,
                  fontSize: 13,
                  fontWeight: FontWeight.bold,
                ),
              ),
              IconButton(
                tooltip: 'Retirer le dernier point',
                visualDensity: VisualDensity.compact,
                onPressed: pointCount > 0 ? onUndo : null,
                icon: const Icon(Icons.undo, size: 20),
                color: Colors.white,
                disabledColor: Colors.white24,
              ),
              IconButton(
                tooltip: 'Quitter le tracé',
                visualDensity: VisualDensity.compact,
                onPressed: onCancel,
                icon: const Icon(Icons.close, size: 20),
                color: Colors.white,
              ),
            ],
          ),
          const SizedBox(height: 6),
          Row(
            children: [
              Expanded(
                child: _ShapeButton(
                  icon: Icons.timeline,
                  label: 'Ligne',
                  enabled: pointCount >= 2,
                  color: scheme.primary,
                  onPressed: () => onFinish('line'),
                ),
              ),
              const SizedBox(width: 6),
              Expanded(
                child: _ShapeButton(
                  icon: Icons.pentagon_outlined,
                  label: 'Zone',
                  enabled: pointCount >= 3,
                  color: scheme.primary,
                  onPressed: () => onFinish('zone'),
                ),
              ),
              const SizedBox(width: 6),
              Expanded(
                child: _ShapeButton(
                  icon: Icons.hexagon_outlined,
                  label: 'Octogone',
                  enabled: pointCount >= 2,
                  color: scheme.primary,
                  onPressed: () => onFinish('octagon'),
                ),
              ),
            ],
          ),
          const SizedBox(height: 6),
          Text(
            pointCount == 0
                ? 'Touchez la carte pour poser des points'
                : 'Octogone : 1er point = centre, 2e = rayon',
            style: const TextStyle(color: Colors.white60, fontSize: 11),
            textAlign: TextAlign.center,
          ),
        ],
      ),
    );
  }
}

class _ShapeButton extends StatelessWidget {
  const _ShapeButton({
    required this.icon,
    required this.label,
    required this.enabled,
    required this.color,
    required this.onPressed,
  });

  final IconData icon;
  final String label;
  final bool enabled;
  final Color color;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: enabled ? color : Colors.white10,
      borderRadius: BorderRadius.circular(9),
      child: InkWell(
        onTap: enabled ? onPressed : null,
        borderRadius: BorderRadius.circular(9),
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 9, horizontal: 4),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(
                icon,
                size: 20,
                color: enabled ? Colors.black : Colors.white30,
              ),
              const SizedBox(height: 2),
              Text(
                label,
                style: TextStyle(
                  fontSize: 11,
                  fontWeight: FontWeight.w600,
                  color: enabled ? Colors.black : Colors.white30,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Bouton d'angle qui déroule les fonds de carte disponibles.
class BasemapButton extends StatelessWidget {
  const BasemapButton({
    super.key,
    required this.current,
    required this.onSelected,
  });

  final MapBasemap current;
  final ValueChanged<MapBasemap> onSelected;

  @override
  Widget build(BuildContext context) {
    return PopupMenuButton<MapBasemap>(
      tooltip: 'Fond de carte',
      position: PopupMenuPosition.under,
      onSelected: onSelected,
      itemBuilder: (context) => [
        for (final m in MapBasemap.values)
          PopupMenuItem(
            value: m,
            child: Row(
              children: [
                Icon(
                  m.icon,
                  size: 20,
                  color: m == current
                      ? Theme.of(context).colorScheme.primary
                      : null,
                ),
                const SizedBox(width: 10),
                Text(m.label),
              ],
            ),
          ),
      ],
      child: Container(
        padding: const EdgeInsets.all(9),
        decoration: BoxDecoration(
          color: Colors.black.withValues(alpha: 0.55),
          borderRadius: BorderRadius.circular(10),
        ),
        child: Icon(current.icon, color: Colors.white, size: 24),
      ),
    );
  }
}
