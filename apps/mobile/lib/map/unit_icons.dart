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

/// Champs modificateurs de la norme OTAN (APP-6 / MIL-STD-2525) dessinés
/// autour d'un symbole, chacun à l'emplacement que la norme lui assigne.
///
/// La POSITION porte le sens : la même chaîne à gauche et à droite ne dit
/// pas la même chose à qui lit la carte. D'où des noms de champs plutôt
/// qu'un vague « texte du haut ».
class SymbolFields {
  const SymbolFields({
    this.dtg,
    this.dtgColor,
    this.designation,
    this.info,
    this.higherFormation,
    this.echelon,
    this.hostile = false,
  });

  /// Champ W — groupe date-heure. Colonne de gauche, en haut.
  final String? dtg;

  /// Couleur du groupe date-heure : celle du camp du symbole.
  final Color? dtgColor;

  /// Champ T — désignation propre : indicatif, nom du groupe. À gauche,
  /// sous le groupe date-heure.
  final String? designation;

  /// Champ H — information complémentaire. C'est l'emplacement normalisé
  /// du texte libre : fréquence radio, immatriculation, consigne courte.
  final String? info;

  /// Champ M — formation supérieure (l'escouade dont dépend l'homme). À
  /// droite, sous l'information complémentaire.
  final String? higherFormation;

  /// Champ B — échelon (taille de l'unité). Dessiné au-dessus du cadre.
  final SymbolEchelon? echelon;

  /// Champ N — la mention « ENY » que la norme impose aux symboles
  /// hostiles, en bas à droite. Redondante avec la couleur, et c'est le
  /// but : elle survit à une impression en noir et blanc.
  final bool hostile;

  static String? _net(String? value) {
    final texte = value?.trim() ?? '';
    return texte.isEmpty ? null : texte;
  }

  bool get isEmpty =>
      _net(dtg) == null &&
      _net(designation) == null &&
      _net(info) == null &&
      _net(higherFormation) == null &&
      echelon == null &&
      !hostile;

  /// Clé d'image. Le rendu natif garde la PREMIÈRE image enregistrée sous
  /// un identifiant : deux jeux de champs différents doivent donner deux
  /// clés, sinon la seconde n'apparaîtrait jamais.
  String get key => [
        _net(dtg) ?? '',
        _net(designation) ?? '',
        _net(info) ?? '',
        _net(higherFormation) ?? '',
        echelon?.name ?? '',
        if (hostile) 'ENY',
      ].join('|');
}

/// Forme d'une marque d'échelon, dans l'ordre où la norme les fait monter :
/// l'ovale de l'équipe, les points du groupe et de la section, les barres de
/// la compagnie au régiment, les croix de la brigade à l'armée.
enum EchelonMark { equipe, point, barre, croix }

/// Échelon OTAN (champ B) : la marque portée au-dessus du cadre, qui dit la
/// taille de l'unité.
///
/// Dessinée en formes pleines et non en caractères : un « ● » dépend d'une
/// police qui peut manquer sur l'appareil, un cercle tracé au pinceau ne
/// dépend de rien.
///
/// La norme prévoit deux marques que l'app ne pose jamais, faute de la
/// donnée qui les distingue : le double point (groupe AVEC mitrailleuses —
/// c'est un armement, pas un effectif) et le quadruple point (Staffel,
/// propre à l'armée allemande).
enum SymbolEchelon {
  /// Équipe ou binôme — 2 à 5 hommes.
  equipe(EchelonMark.equipe, 1, 'Équipe'),

  /// Groupe ou escouade — 8 à 12 hommes.
  groupe(EchelonMark.point, 1, 'Groupe'),

  /// Section — 25 à 40 hommes, deux escouades ou plus.
  section(EchelonMark.point, 3, 'Section'),

  /// Compagnie — 60 à 250 hommes, deux sections ou plus.
  compagnie(EchelonMark.barre, 1, 'Compagnie'),

  /// Bataillon — 300 à 1 000 hommes.
  bataillon(EchelonMark.barre, 2, 'Bataillon'),

  /// Régiment ou groupement — 2 000 à 3 000 hommes.
  regiment(EchelonMark.barre, 3, 'Régiment'),

  /// Brigade — 3 000 à 5 000 hommes.
  brigade(EchelonMark.croix, 1, 'Brigade'),

  /// Division — 10 000 à 20 000 hommes.
  division(EchelonMark.croix, 2, 'Division'),

  /// Corps d'armée — 30 000 à 50 000 hommes.
  corps(EchelonMark.croix, 3, 'Corps'),

  /// Armée — 50 000 hommes et plus.
  armee(EchelonMark.croix, 4, 'Armée');

  const SymbolEchelon(this.mark, this.count, this.label);

  /// Forme de la marque.
  final EchelonMark mark;

  /// Combien de fois elle se répète.
  final int count;

  /// Nom de l'échelon, pour l'interface.
  final String label;

  /// Échelon d'une unité d'après son effectif, suivant les fourchettes de
  /// la norme. En dessous de deux hommes il n'y a pas d'unité à qualifier.
  ///
  /// Les bornes comblent les trous du tableau officiel (il ne dit rien de
  /// 6 ou 7 hommes) en prolongeant l'échelon inférieur jusqu'au suivant.
  static SymbolEchelon? forHeadcount(int count) {
    if (count < 2) return null;
    if (count <= 5) return SymbolEchelon.equipe;
    if (count <= 12) return SymbolEchelon.groupe;
    if (count <= 40) return SymbolEchelon.section;
    if (count <= 250) return SymbolEchelon.compagnie;
    if (count <= 1000) return SymbolEchelon.bataillon;
    if (count <= 3000) return SymbolEchelon.regiment;
    if (count <= 5000) return SymbolEchelon.brigade;
    if (count <= 20000) return SymbolEchelon.division;
    if (count <= 50000) return SymbolEchelon.corps;
    return SymbolEchelon.armee;
  }
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

  /// Tous les identifiants du pack. Écrit en impératif à dessein : la même
  /// liste en compréhension rattachait son `else` au mauvais `if`, si bien
  /// que les points d'ordre — les seuls sans camp — n'y figuraient pas et
  /// n'étaient donc jamais dessinés.
  static List<String> get allIconIds {
    final ids = <String>[];
    for (final family in SymbolFamily.values) {
      for (final slug in slugsOf(family)) {
        if (!family.hasAffiliation) {
          ids.add(slug);
          continue;
        }
        for (final a in UnitAffiliation.values) {
          if (exists(family, slug, a)) ids.add(iconId(family, slug, a));
        }
      }
    }
    return ids;
  }

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

  /// Identifiant d'une image composée : le symbole et les champs OTAN
  /// dessinés autour. Deux jeux de champs distincts donnent deux images.
  static String fieldedId(String iconId, SymbolFields fields) =>
      fields.isEmpty ? iconId : '$iconId@${fields.key}';

  /// Identifiant d'image d'un marqueur d'escouade.
  static String squadId(String squadKey, int count, SymbolFields fields) =>
      fieldedId('squad@$squadKey@$count', fields);

  /// PNG du cadre d'une escouade : le rectangle ami de la norme OTAN —
  /// fond bleu clair, trait noir — portant son effectif.
  ///
  /// Mêmes proportions et mêmes couleurs que les insignes du pack, pour
  /// qu'un groupe et un homme se lisent comme deux objets de la même
  /// famille. Nom, échelon et étiquette viennent ensuite par [fieldedPng],
  /// aux emplacements que la norme leur donne.
  ///
  /// Ce cadre remplace les insignes individuels quand la carte est trop
  /// dézoomée pour les distinguer — mieux vaut un groupe lisible que six
  /// symboles empilés qui ne disent plus qui est où.
  static Future<Uint8List> squadFramePng(int count) async {
    // Le format des symboles du pack (316 × 216).
    const width = 316.0;
    const height = 216.0;
    const trait = 14.0;

    final effectif = TextPainter(
      textDirection: TextDirection.ltr,
      text: TextSpan(
        text: '$count',
        style: const TextStyle(
          fontSize: 128,
          fontWeight: FontWeight.w800,
          color: Color(0xFF000000),
        ),
      ),
    )..layout();

    final recorder = ui.PictureRecorder();
    final canvas = ui.Canvas(recorder);
    final rect = ui.Rect.fromLTWH(
      trait / 2,
      trait / 2,
      width - trait,
      height - trait,
    );
    canvas.drawRect(rect, ui.Paint()..color = const ui.Color(0xFF80E0FF));
    canvas.drawRect(
      rect,
      ui.Paint()
        ..color = const ui.Color(0xFF000000)
        ..style = ui.PaintingStyle.stroke
        ..strokeWidth = trait,
    );
    effectif.paint(
      canvas,
      Offset((width - effectif.width) / 2, (height - effectif.height) / 2),
    );

    final rendered = await recorder
        .endRecording()
        .toImage(width.round(), height.round());
    final data = await rendered.toByteData(format: ui.ImageByteFormat.png);
    rendered.dispose();
    return data!.buffer.asUint8List();
  }

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

  /// PNG du symbole entouré de ses champs OTAN, peints À L'INTÉRIEUR de
  /// l'image.
  ///
  /// Deux règles gouvernent ce rendu :
  ///
  /// 1. Les textes sont peints dans l'image, jamais posés par une couche de
  ///    texte : MapLibre irait alors chercher des polices sur un serveur
  ///    (`glyphs`) et les libellés disparaîtraient hors ligne (§2.3).
  /// 2. Chaque champ va où la norme APP-6 le met — groupe date-heure et
  ///    désignation à gauche, information complémentaire et formation
  ///    supérieure à droite, échelon au-dessus, « ENY » en bas à droite.
  ///    La position porte le sens autant que le texte.
  ///
  /// Le symbole reste au CENTRE de la toile : les marges compensent les
  /// colonnes de texte, sans quoi il glisserait à côté de sa position.
  static Future<Uint8List> fieldedPng(
    Uint8List src,
    SymbolFields fields, {
    double fontSize = 96,
  }) async {
    final codec = await ui.instantiateImageCodec(src);
    final frame = await codec.getNextFrame();
    final image = frame.image;

    // Le pack mélange des symboles de 150 px de haut (points, structures)
    // et de 304 px (unités). Rendus à la même échelle, les premiers sont
    // deux fois plus petits sur la carte — au point de passer inaperçus.
    // On les agrandit sans jamais réduire les autres.
    final scale = math.min(2.0, math.max(1.0, 300 / image.height));
    final symbolWidth = image.width * scale;
    final symbolHeight = image.height * scale;

    TextPainter? colonne(List<(String, TextStyle)> lignes, TextAlign align) {
      if (lignes.isEmpty) return null;
      return TextPainter(
        textDirection: TextDirection.ltr,
        textAlign: align,
        text: TextSpan(
          children: [
            for (final (i, (texte, style)) in lignes.indexed)
              TextSpan(text: i == 0 ? texte : '\n$texte', style: style),
          ],
        ),
      )..layout();
    }

    TextStyle style(double taille, Color couleur, FontWeight graisse) =>
        TextStyle(
          fontSize: taille,
          fontWeight: graisse,
          color: couleur,
          shadows: const [
            Shadow(color: Color(0xFF000000), blurRadius: 14),
            Shadow(color: Color(0xFF000000), blurRadius: 6),
          ],
        );

    // Colonne de gauche : W (groupe date-heure) puis T (désignation).
    final gauche = colonne([
      if (SymbolFields._net(fields.dtg) != null)
        (
          SymbolFields._net(fields.dtg)!,
          style(fontSize, fields.dtgColor ?? Colors.white, FontWeight.w700),
        ),
      if (SymbolFields._net(fields.designation) != null)
        (
          SymbolFields._net(fields.designation)!,
          style(fontSize * 0.95, Colors.white, FontWeight.w700),
        ),
    ], TextAlign.right);

    // Colonne de droite : H (information libre), M (formation supérieure),
    // N (« ENY »).
    final droite = colonne([
      if (SymbolFields._net(fields.info) != null)
        (
          SymbolFields._net(fields.info)!,
          style(fontSize * 0.9, const Color(0xFFFFE082), FontWeight.w600),
        ),
      if (SymbolFields._net(fields.higherFormation) != null)
        (
          SymbolFields._net(fields.higherFormation)!,
          style(fontSize * 0.8, const Color(0xFFE0E0E0), FontWeight.w500),
        ),
      if (fields.hostile)
        (
          'ENY',
          style(fontSize * 0.8, const Color(0xFFFF5252), FontWeight.w800),
        ),
    ], TextAlign.left);

    const gap = 24.0;
    // Champ B — l'échelon, en formes pleines : points pour les petites
    // unités, barre pour la compagnie. Noires cernées de blanc, elles se
    // lisent aussi bien sur une forêt claire que sur une route sombre.
    const marque = 30.0;
    const ecart = 18.0;
    final echelon = fields.echelon;
    final largeurMarque = switch (echelon?.mark) {
      EchelonMark.equipe => marque * 1.35,
      EchelonMark.point => marque,
      EchelonMark.barre => marque * 0.42,
      EchelonMark.croix => marque * 0.95,
      null => 0.0,
    };
    final largeurEchelon = echelon == null
        ? 0.0
        : echelon.count * largeurMarque + (echelon.count - 1) * ecart;
    final hauteurEchelon = echelon == null ? 0.0 : marque * 1.6;
    // Marge symétrique : la plus large des deux colonnes fixe les deux
    // côtés, pour que le symbole reste sur le point.
    final cote = math.max(gauche?.width ?? 0, droite?.width ?? 0);
    final marge = cote == 0 ? 0.0 : gap + cote;
    // Même raisonnement en hauteur pour l'échelon au-dessus.
    final coiffe = echelon == null ? 0.0 : hauteurEchelon + gap * 0.3;

    final width = symbolWidth + 2 * marge;
    final height = math.max(
          symbolHeight,
          math.max(gauche?.height ?? 0, droite?.height ?? 0),
        ) +
        2 * coiffe;

    final recorder = ui.PictureRecorder();
    final canvas = ui.Canvas(recorder);
    final symbolLeft = marge;
    final symbolTop = (height - symbolHeight) / 2;
    canvas.drawImageRect(
      image,
      ui.Rect.fromLTWH(0, 0, image.width.toDouble(), image.height.toDouble()),
      ui.Rect.fromLTWH(symbolLeft, symbolTop, symbolWidth, symbolHeight),
      ui.Paint()..filterQuality = ui.FilterQuality.medium,
    );
    gauche?.paint(
      canvas,
      Offset(symbolLeft - gap - gauche.width, (height - gauche.height) / 2),
    );
    droite?.paint(
      canvas,
      Offset(
        symbolLeft + symbolWidth + gap,
        (height - droite.height) / 2,
      ),
    );
    if (echelon != null) {
      // Noir cerné de blanc : la marque se lit aussi bien sur une forêt
      // claire que sur une route sombre.
      final plein = ui.Paint()..color = const ui.Color(0xFF000000);
      final trait = ui.Paint()
        ..color = const ui.Color(0xFF000000)
        ..style = ui.PaintingStyle.stroke
        ..strokeWidth = 7
        ..strokeCap = ui.StrokeCap.round;
      final cerne = ui.Paint()
        ..color = const ui.Color(0xFFFFFFFF)
        ..style = ui.PaintingStyle.stroke
        ..strokeWidth = 6;
      final cerneEpais = ui.Paint()
        ..color = const ui.Color(0xFFFFFFFF)
        ..style = ui.PaintingStyle.stroke
        ..strokeWidth = 15
        ..strokeCap = ui.StrokeCap.round;

      final haut = symbolTop - coiffe;
      final centreY = haut + hauteurEchelon / 2;
      var x = symbolLeft + (symbolWidth - largeurEchelon) / 2;
      for (var i = 0; i < echelon.count; i++) {
        final boite = ui.Rect.fromLTWH(
          x,
          centreY - hauteurEchelon / 2,
          largeurMarque,
          hauteurEchelon,
        );
        switch (echelon.mark) {
          case EchelonMark.equipe:
            // « Ø » : l'ovale de l'équipe, barré en diagonale.
            canvas.drawOval(boite, cerneEpais);
            canvas.drawOval(boite, trait);
            canvas.drawLine(boite.bottomLeft, boite.topRight, cerneEpais);
            canvas.drawLine(boite.bottomLeft, boite.topRight, trait);
          case EchelonMark.point:
            final centre = boite.center;
            canvas.drawCircle(centre, largeurMarque / 2, plein);
            canvas.drawCircle(centre, largeurMarque / 2, cerne);
          case EchelonMark.barre:
            canvas.drawRect(boite, plein);
            canvas.drawRect(boite, cerne);
          case EchelonMark.croix:
            canvas.drawLine(boite.topLeft, boite.bottomRight, cerneEpais);
            canvas.drawLine(boite.bottomLeft, boite.topRight, cerneEpais);
            canvas.drawLine(boite.topLeft, boite.bottomRight, trait);
            canvas.drawLine(boite.bottomLeft, boite.topRight, trait);
        }
        x += largeurMarque + ecart;
      }
    }

    final rendered =
        await recorder.endRecording().toImage(width.round(), height.round());
    final data = await rendered.toByteData(format: ui.ImageByteFormat.png);
    image.dispose();
    rendered.dispose();
    return data!.buffer.asUint8List();
  }
}
