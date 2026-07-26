// Registre du pack d'icônes d'unités fourni par le propriétaire du projet
// (symbolique OTAN/APP-6 : bleu allié, rouge hostile, vert neutre, jaune inconnu).
//
// Le rendu est piloté par les données : un marqueur référence `iconId`,
// résolu ici vers un asset. Ajouter une icône = déposer le PNG dans
// `assets/icons/units/` + une entrée ici. Rien n'est codé en dur ailleurs.

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
}
