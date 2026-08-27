import 'package:flutter/foundation.dart'
    show TargetPlatform, defaultTargetPlatform, kIsWeb;

/// Configuration de build, surchargée via `--dart-define` :
/// flutter run --dart-define=SUPABASE_ANON_KEY=sb_publishable_xxx
class AppConfig {
  /// URL du projet Supabase (auth uniquement — les données passent par notre API).
  static const supabaseUrl = String.fromEnvironment(
    'SUPABASE_URL',
    defaultValue: 'https://rcgrwhayagadsaqnjufj.supabase.co',
  );

  /// Clé publique (anon / publishable) du projet Supabase.
  /// Conçue pour être embarquée dans l'app ; ce n'est pas un secret.
  static const supabaseAnonKey = String.fromEnvironment(
    'SUPABASE_ANON_KEY',
    defaultValue: 'sb_publishable_1tA1CkejeoRzHqvXqnLgwA_nZ3eadsb',
  );

  /// URL de l'API arbitre, surchargeable au build.
  static const _configuredApiBaseUrl = String.fromEnvironment('API_BASE_URL');

  /// URL effective. Chaque cible joint le PC de développement par une
  /// adresse différente : l'émulateur Android passe par 10.0.2.2, le
  /// simulateur iOS et le navigateur partagent le réseau de la machine et
  /// voient donc `localhost`. Sur appareil réel, passer l'IP du poste :
  /// `--dart-define=API_BASE_URL=http://192.168.x.x:3000/v1`.
  static String get apiBaseUrl {
    if (_configuredApiBaseUrl.isNotEmpty) return _configuredApiBaseUrl;
    if (!kIsWeb && defaultTargetPlatform == TargetPlatform.android) {
      return 'http://10.0.2.2:3000/v1';
    }
    return 'http://localhost:3000/v1';
  }

  static bool get isAuthConfigured => supabaseAnonKey.isNotEmpty;
}
