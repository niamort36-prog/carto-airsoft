/// Hors navigateur, la question ne se pose pas : rien à verrouiller.
class ScreenWake {
  /// Demande à garder l'écran allumé. Renvoie `true` si c'est obtenu.
  static Future<bool> acquire() async => false;

  /// Relâche le verrou. Sans effet s'il n'y en avait pas.
  static Future<void> release() async {}

  /// Vrai si le verrou est tenu en ce moment.
  static bool get held => false;

  /// Vrai si la plateforme sait le faire — sert à ne pas promettre à
  /// l'utilisateur quelque chose qui n'arrivera pas.
  static bool get supported => false;
}
