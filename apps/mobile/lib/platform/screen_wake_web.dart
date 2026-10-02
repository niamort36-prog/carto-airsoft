import 'dart:js_interop';

/// Le verrou d'écran du navigateur (`navigator.wakeLock`).
///
/// Déclaré à la main plutôt que tiré d'un paquet : l'interface tient en
/// quatre lignes, et une dépendance de plus serait à suivre à chaque montée
/// de version de Flutter.
@JS('navigator')
external _Navigator get _navigator;

extension type _Navigator._(JSObject _) implements JSObject {
  external _WakeLock? get wakeLock;
}

extension type _WakeLock._(JSObject _) implements JSObject {
  external JSPromise<_WakeLockSentinel> request(String type);
}

extension type _WakeLockSentinel._(JSObject _) implements JSObject {
  external JSPromise<JSAny?> release();
  external bool get released;
}

/// Garde l'écran allumé tant que la partie tourne.
///
/// Le navigateur relâche ce verrou de lui-même dès que l'onglet passe en
/// arrière-plan — il faut donc le redemander au retour, ce dont
/// [reacquireOnVisible] se charge auprès de l'appelant.
class ScreenWake {
  static _WakeLockSentinel? _verrou;

  static bool get supported => _navigator.wakeLock != null;

  static bool get held => _verrou != null && !_verrou!.released;

  static Future<bool> acquire() async {
    final api = _navigator.wakeLock;
    if (api == null) return false;
    if (held) return true;
    try {
      _verrou = await api.request('screen').toDart;
      return true;
    } catch (_) {
      // Refusé : onglet en arrière-plan, batterie faible, ou réglage du
      // navigateur. Ce n'est pas une panne — on réessaiera au retour.
      _verrou = null;
      return false;
    }
  }

  static Future<void> release() async {
    final verrou = _verrou;
    _verrou = null;
    if (verrou == null || verrou.released) return;
    try {
      await verrou.release().toDart;
    } catch (_) {
      // Déjà relâché par le navigateur.
    }
  }
}
