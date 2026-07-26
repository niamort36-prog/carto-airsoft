// Registre du pack d'icônes d'unités fourni par le propriétaire du projet
// (symbolique OTAN/APP-6 : bleu allié, rouge hostile, vert neutre, jaune inconnu).
//
// Le rendu est piloté par les données : un marqueur référence `iconId`,
// résolu ici vers un asset. Ajouter une icône = déposer le PNG dans
// `assets/icons/units/` + une entrée ici. Rien n'est codé en dur ailleurs.

import 'dart:typed_data';
import 'dart:ui' as ui;

enum UnitAffiliation {
  allied('allied', 'Allié'),
  hostile('hostile', 'Ennemi'),
  neutral('neutral', 'Neutre'),
  unknown('unknown', 'Inconnu');

  const UnitAffiliation(this.wire, this.label);

  final String wire;
  final String label;
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
  transport('transport', 'Transport');

  const UnitType(this.slug, this.label);

  final String slug;
  final String label;
}

class UnitIcons {
  /// Combinaisons absentes du pack livré.
  static const _missing = {'sf_neutral'};

  /// Identifiant d'icône : nom de fichier sans extension, aussi utilisé comme
  /// id d'image MapLibre et comme valeur `properties.icon` d'un marqueur.
  static String iconId(UnitType type, UnitAffiliation affiliation) =>
      '${type.slug}_${affiliation.wire}';

  static bool exists(UnitType type, UnitAffiliation affiliation) =>
      !_missing.contains(iconId(type, affiliation));

  static String assetKey(String iconId) => 'assets/icons/units/$iconId.png';

  /// Tous les identifiants du pack (à charger dans le style MapLibre).
  static List<String> get allIconIds => [
        for (final t in UnitType.values)
          for (final a in UnitAffiliation.values)
            if (exists(t, a)) iconId(t, a),
      ];

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
}
