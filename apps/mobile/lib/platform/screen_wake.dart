// Empêcher l'écran de s'éteindre pendant une partie.
//
// Un onglet dont l'écran se verrouille est SUSPENDU par le navigateur : le
// code s'arrête, la position cesse d'être transmise, et le joueur disparaît
// de la carte de son équipe alors qu'il est bien là (§9). C'est la seule
// chose qu'une application native faisait et qu'un navigateur ne fait pas
// tout seul.
//
// Le verrou d'écran lève exactement cet obstacle. Il coûte de la batterie —
// c'est assumé : suivre une position en coûte de toute façon.
//
// L'implémentation réelle est dans screen_wake_web.dart ; ailleurs (tests
// sur la machine virtuelle Dart) le stub ne fait rien.
export 'screen_wake_stub.dart'
    if (dart.library.js_interop) 'screen_wake_web.dart';
