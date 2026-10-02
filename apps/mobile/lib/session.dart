import 'package:supabase_flutter/supabase_flutter.dart';

import 'app_config.dart';

/// D'où vient le jeton présenté à l'API arbitre.
///
/// En temps normal, de la session Supabase. En construction de
/// développement (`--dart-define=JETON_DEV=…`), d'un jeton forgé sur le PC
/// par `scripts/jeton-dev.mjs` : la pile entière tourne alors sans compte,
/// sans mot de passe et sans réseau, ce qui permet de regarder la carte
/// tourner avec une vraie partie.
///
/// Ce jeton n'ouvre rien de plus : l'API ne l'accepte que si elle a été
/// lancée avec le même `SUPABASE_JWT_SECRET`. Celle qui vérifie les
/// signatures de Supabase le refuse comme n'importe quel jeton inventé —
/// l'arbitrage reste entier (§2.1).
class Session {
  /// Le jeton à présenter, ou une chaîne vide s'il n'y en a pas.
  static String get jeton => AppConfig.jetonDev.isNotEmpty
      ? AppConfig.jetonDev
      : Supabase.instance.client.auth.currentSession?.accessToken ?? '';

  /// Vrai quand une session est ouverte, de l'une ou l'autre provenance.
  static bool get ouverte => jeton.isNotEmpty;
}
