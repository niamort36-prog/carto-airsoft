// Registre du pack de symboles fourni par le propriétaire du projet
// (symbolique OTAN/APP-6 : bleu allié, rouge hostile, vert neutre,
// jaune inconnu).
//
// Le rendu est piloté par les données : un objet de carte référence une clé
// d'icône (`properties.icon`), résolue ici vers un asset. Ajouter un symbole
// = déposer le PNG normalisé + une entrée d'enum. Rien n'est codé en dur
// dans le code de rendu.

import 'dart:math' as math;
import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';

/// Camp d'un symbole. Détermine la couleur — y compris celle de l'heure
/// de pose affichée à côté (mise en page voulue par le propriétaire).
enum UnitAffiliation {
  allied('allied', 'Allié', Color(0xFF2196F3)),
  hostile('hostile', 'Ennemi', Color(0xFFF44336)),
  neutral('neutral', 'Neutre', Color(0xFF4CAF50)),
  unknown('unknown', 'Inconnu', Color(0xFFFFC107));

  const UnitAffiliation(this.wire, this.label, this.color);

  final String wire;
  final String label;
  final Color color;

  static UnitAffiliation fromWire(String? wire) =>
      UnitAffiliation.values.firstWhere(
        (a) => a.wire == wire,
        orElse: () => UnitAffiliation.unknown,
      );

  /// Couleur au format `#RRGGBB`, pour les styles MapLibre.
  String get hex =>
      '#${color.toARGB32().toRadixString(16).padLeft(8, '0').substring(2)}';
}

/// Familles de symboles. Les structures et les dessins ont leur propre
/// catégorie tout en gardant les quatre camps ; les points d'ordre n'ont
/// pas de camp.
enum SymbolFamily {
  unit('units', 'Unité'),
  structure('structures', 'Structure'),
  point('points', 'Point'),
  pattern('patterns', 'Dessin');

  const SymbolFamily(this.folder, this.label);

  final String folder;
  final String label;

  bool get hasAffiliation => this != SymbolFamily.point;
}

enum UnitType {
  infantry('infantry', 'Infanterie'),
  infantryMotorized('infantry_motorized', 'Inf. motorisée'),
  armor('armor', 'Blindé/mécanisé'),
  antiTank('anti_tank', 'Antichar'),
  recon('recon', 'Reco'),
  sniper('sniper', 'Sniper'),
  sf('sf', 'Forces spéciales'),
  mortar('mortar', 'Mortier'),
  engineer('engineer', 'Génie'),
  medical('medical', 'Médical'),
  command('command', 'Commandement'),
  radio('radio', 'Radio'),
  relayRadio('relay_radio', 'Relais radio'),
  uav('uav', 'Drone (UAV)'),
  uavOperator('uav_operator', 'Opérateur UAV'),
  transport('transport', 'Transport');

  const UnitType(this.slug, this.label);

  final String slug;
  final String label;

  static UnitType fromSlug(String? slug) => UnitType.values.firstWhere(
        (t) => t.slug == slug,
        orElse: () => UnitType.infantry,
      );
}

enum StructureType {
  bunker('bunker', 'Bunker'),
  fob('fob', 'FOB'),
  foxhole('foxhole', 'Trou de combat'),
  outpost('outpost', 'Avant-poste'),
  roadblock('roadblock', 'Barrage');

  const StructureType(this.slug, this.label);

  final String slug;
  final String label;
}

/// Motifs de tracé : lignes et polygones s'habillent de ces symboles.
enum PatternType {
  barbeles('barbeles', 'Barbelés'),
  fortifie('fortifie', 'Fortifié');

  const PatternType(this.slug, this.label);

  final String slug;
  final String label;
}

/// Points de désignation et d'ordre — sans camp, ils valent pour tous.
enum PointType {
  waypoint('waypoint', 'Point de passage'),
  rally('rally', 'Point de ralliement'),
  rendezvous('rendezvous', 'Rendez-vous'),
  start('start', 'Point de départ'),
  passage('passage', 'Passage'),
  contact('contact', 'Point de contact'),
  coordination('coordination', 'Coordination'),
  checkpoint('checkpoint', 'Checkpoint'),
  trafficControl('traffic_control', 'Contrôle routier'),
  surveyControl('survey_control', 'Point de relevé'),
  rescueControl('rescue_control', 'Contrôle secours'),
  interest('interest', 'Point d’intérêt'),
  target('target', 'Objectif de tir'),
  destroyTarget('destroy_target', 'Cible à détruire'),
  firing('firing', 'Position de tir'),
  hide('hide', 'Cache'),
  reload('reload', 'Rechargement'),
  rearmRefuel('rearm_refuel', 'Réarmement/ravitaillement'),
  ammunitionSupply('ammunition_supply', 'Dépôt de munitions'),
  casualtyCollect('casualty_collect', 'Ramassage blessés'),
  ambulanceExchange('ambulance_exchange', 'Relais ambulance');

  const PointType(this.slug, this.label);

  final String slug;
  final String label;
}

class UnitIcons {
  /// Combinaisons absentes du pack livré (aucune à ce jour).
  static const _missing = <String>{};

  /// Identifiant d'icône = nom de fichier sans extension. Sert aussi d'id
  /// d'image MapLibre et de valeur `properties.icon`.
  static String iconId(
    SymbolFamily family,
    String slug, [
    UnitAffiliation? affiliation,
  ]) =>
      family.hasAffiliation ? '${slug}_${affiliation!.wire}' : slug;

  static bool exists(
    SymbolFamily family,
    String slug, [
    UnitAffiliation? affiliation,
  ]) =>
      !_missing.contains(iconId(family, slug, affiliation));

  /// Chemin de l'asset. La famille se déduit de l'identifiant.
  static String assetKey(String iconId) =>
      'assets/icons/${familyOf(iconId).folder}/$iconId.png';

  /// Retrouve la famille d'un identifiant (les points n'ont pas de suffixe
  /// de camp, les motifs et structures ont leurs propres listes de slugs).
  static SymbolFamily familyOf(String iconId) {
    final slug = slugOf(iconId);
    if (StructureType.values.any((s) => s.slug == slug)) {
      return SymbolFamily.structure;
    }
    if (PatternType.values.any((p) => p.slug == slug)) {
      return SymbolFamily.pattern;
    }
    if (PointType.values.any((p) => p.slug == slug)) return SymbolFamily.point;
    return SymbolFamily.unit;
  }

  /// Slug (type) d'un identifiant, camp retiré.
  static String slugOf(String iconId) {
    for (final a in UnitAffiliation.values) {
      final suffix = '_${a.wire}';
      if (iconId.endsWith(suffix)) {
        return iconId.substring(0, iconId.length - suffix.length);
      }
    }
    return iconId;
  }

  /// Camp d'un identifiant, ou null pour un point d'ordre.
  static UnitAffiliation? affiliationOf(String iconId) {
    for (final a in UnitAffiliation.values) {
      if (iconId.endsWith('_${a.wire}')) return a;
    }
    return null;
  }

  /// Libellé lisible d'un identifiant.
  static String labelOf(String iconId) {
    final slug = slugOf(iconId);
    final type = UnitType.values.where((t) => t.slug == slug).firstOrNull;
    if (type != null) return type.label;
    final structure =
        StructureType.values.where((s) => s.slug == slug).firstOrNull;
    if (structure != null) return structure.label;
    final pattern = PatternType.values.where((p) => p.slug == slug).firstOrNull;
    if (pattern != null) return pattern.label;
    final point = PointType.values.where((p) => p.slug == slug).firstOrNull;
    if (point != null) return point.label;
    return slug;
  }

  /// Le même symbole dans un autre camp — sert à changer l'appartenance
  /// d'un marqueur déjà posé.
  static String withAffiliation(String iconId, UnitAffiliation affiliation) {
    final family = familyOf(iconId);
    if (!family.hasAffiliation) return iconId;
    return '${slugOf(iconId)}_${affiliation.wire}';
  }

  static List<String> slugsOf(SymbolFamily family) => switch (family) {
        SymbolFamily.unit => UnitType.values.map((t) => t.slug).toList(),
        SymbolFamily.structure =>
          StructureType.values.map((s) => s.slug).toList(),
        SymbolFamily.pattern => PatternType.values.map((p) => p.slug).toList(),
        SymbolFamily.point => PointType.values.map((p) => p.slug).toList(),
      };

  /// Tous les identifiants du pack, à enregistrer dans le style MapLibre.
  static List<String> get allIconIds => [
        for (final family in SymbolFamily.values)
          for (final slug in slugsOf(family))
            if (family.hasAffiliation)
              for (final a in UnitAffiliation.values)
                if (exists(family, slug, a)) iconId(family, slug, a)
            else
              slug,
      ];

  static final Set<String> _known = allIconIds.toSet();

  /// Vrai si l'image est bien enregistrée dans le style — garde-fou avant
  /// d'écrire un `iconImage` construit à partir d'une valeur serveur.
  static bool isKnown(String iconId) => _known.contains(iconId);

  /// Identifiants des motifs de tracé : chacun devient un `line-pattern`.
  static List<String> get patternIconIds => [
        for (final p in PatternType.values)
          for (final a in UnitAffiliation.values)
            iconId(SymbolFamily.pattern, p.slug, a),
      ];

  /// Icônes de perks : le drone allié et sa version hostile (§7.7).
  static const droneAllied = 'drone_allied';
  static const droneHostile = 'drone_hostile';
  static List<String> get perkIconIds => [droneAllied, droneHostile];
  static String perkAssetKey(String id) => 'assets/icons/perks/$id.png';

  static final Map<String, Uint8List> _outlineCache = {};

  /// PNG de l'icône posée sur un fond blanc arrondi : lisibilité sur fond
  /// forêt (alliés) et mise en évidence de sa propre position (contour épais).
  static Future<Uint8List> outlinedPng(
    String iconId,
    Uint8List src, {
    required double border,
  }) async {
    final key = '$iconId/$border';
    final cached = _outlineCache[key];
    if (cached != null) return cached;

    final codec = await ui.instantiateImageCodec(src);
    final frame = await codec.getNextFrame();
    final image = frame.image;
    final width = image.width + border * 2;
    final height = image.height + border * 2;

    final recorder = ui.PictureRecorder();
    final canvas = ui.Canvas(recorder);
    canvas.drawRRect(
      ui.RRect.fromRectAndRadius(
        ui.Rect.fromLTWH(0, 0, width, height),
        ui.Radius.circular(border * 2),
      ),
      ui.Paint()..color = const ui.Color(0xFFFFFFFF),
    );
    canvas.drawImage(image, ui.Offset(border, border), ui.Paint());
    final rendered =
        await recorder.endRecording().toImage(width.round(), height.round());
    final data = await rendered.toByteData(format: ui.ImageByteFormat.png);
    image.dispose();
    rendered.dispose();

    final bytes = data!.buffer.asUint8List();
    _outlineCache[key] = bytes;
    return bytes;
  }

  /// Ré-encode un PNG du pack via le moteur de rendu Flutter. MapLibre
  /// n'accepte pas tous les PNG livrés tels quels : repasser par un canevas
  /// garantit un RGBA non prémultiplié standard, seul format qui s'affiche
  /// de façon fiable une fois enregistré dans le style.
  static Future<Uint8List> normalizedPng(Uint8List src) async {
    final codec = await ui.instantiateImageCodec(src);
    final frame = await codec.getNextFrame();
    final image = frame.image;
    final recorder = ui.PictureRecorder();
    ui.Canvas(recorder).drawImage(image, ui.Offset.zero, ui.Paint());
    final rendered =
        await recorder.endRecording().toImage(image.width, image.height);
    final data = await rendered.toByteData(format: ui.ImageByteFormat.png);
    image.dispose();
    rendered.dispose();
    return data!.buffer.asUint8List();
  }

  /// Identifiant d'image « symbole + heure » — une image par couple.
  static String stampId(String iconId, String time) => '$iconId@$time';

  /// Identifiant d'image « symbole pivoté » — le cap est arrondi au pas de
  /// [rotationStep] pour ne fabriquer qu'un nombre fini d'images.
  static const rotationStep = 15;
  static String rotatedId(String iconId, double bearing) =>
      '$iconId#${quantizeBearing(bearing)}';
  static int quantizeBearing(double bearing) =>
      ((bearing % 360) / rotationStep).round() * rotationStep % 360;

  /// PNG du symbole pivoté de [bearing] degrés, dans une toile carrée assez
  /// large pour qu'aucun angle ne soit rogné. Pivoter l'image plutôt que la
  /// couche évite `icon-rotate`, que le rendu natif n'honore pas ici.
  static Future<Uint8List> rotatedPng(Uint8List src, double bearing) async {
    final codec = await ui.instantiateImageCodec(src);
    final frame = await codec.getNextFrame();
    final image = frame.image;
    final side = math
        .sqrt(image.width * image.width + image.height * image.height)
        .ceil();

    final recorder = ui.PictureRecorder();
    final canvas = ui.Canvas(recorder)
      ..translate(side / 2, side / 2)
      ..rotate(bearing * math.pi / 180);
    canvas.drawImage(
      image,
      ui.Offset(-image.width / 2, -image.height / 2),
      ui.Paint(),
    );
    final rendered = await recorder.endRecording().toImage(side, side);
    final data = await rendered.toByteData(format: ui.ImageByteFormat.png);
    image.dispose();
    rendered.dispose();
    return data!.buffer.asUint8List();
  }

  /// PNG du symbole avec l'heure de pose peinte À L'INTÉRIEUR de l'image,
  /// dans la couleur du camp. Écrire l'heure dans l'image plutôt que via une
  /// couche de texte évite de dépendre d'un serveur de polices (`glyphs`) :
  /// le libellé reste lisible hors ligne (§2.3).
  ///
  /// Le symbole est centré dans la toile (marge gauche = largeur du texte),
  /// pour qu'il reste exactement sur le point malgré le texte à droite.
  static Future<Uint8List> stampedPng(
    Uint8List src,
    String time,
    Color color, {
    double fontSize = 96,
  }) async {
    final codec = await ui.instantiateImageCodec(src);
    final frame = await codec.getNextFrame();
    final image = frame.image;

    final painter = TextPainter(
      textDirection: TextDirection.ltr,
      text: TextSpan(
        text: time,
        style: TextStyle(
          fontSize: fontSize,
          fontWeight: FontWeight.w700,
          color: color,
          shadows: const [
            Shadow(color: Color(0xFF000000), blurRadius: 14),
            Shadow(color: Color(0xFF000000), blurRadius: 6),
          ],
        ),
      ),
    )..layout();

    const gap = 20.0;
    final textWidth = painter.width;
    final width = image.width + 2 * (gap + textWidth);
    final height =
        image.height > painter.height ? image.height.toDouble() : painter.height;

    final recorder = ui.PictureRecorder();
    final canvas = ui.Canvas(recorder);
    canvas.drawImage(
      image,
      ui.Offset(gap + textWidth, (height - image.height) / 2),
      ui.Paint(),
    );
    painter.paint(
      canvas,
      Offset(
        gap + textWidth + image.width + gap,
        (height - painter.height) / 2,
      ),
    );
    final rendered =
        await recorder.endRecording().toImage(width.round(), height.round());
    final data = await rendered.toByteData(format: ui.ImageByteFormat.png);
    image.dispose();
    rendered.dispose();
    return data!.buffer.asUint8List();
  }
}
