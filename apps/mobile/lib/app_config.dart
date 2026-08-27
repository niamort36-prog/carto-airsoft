import 'dart:io' show Platform;

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

  /// URL effective. Les deux simulateurs joignent le PC de développement
  /// par des adresses différentes : l'émulateur Android passe par 10.0.2.2,
  /// le simulateur iOS partage le réseau du Mac et voit donc `localhost`.
  /// Sur téléphone réel, passer l'IP du poste :
  /// `--dart-define=API_BASE_URL=http://192.168.x.x:3000/v1`.
  static String get apiBaseUrl {
    if (_configuredApiBaseUrl.isNotEmpty) return _configuredApiBaseUrl;
    return Platform.isAndroid
        ? 'http://10.0.2.2:3000/v1'
        : 'http://localhost:3000/v1';
  }

  static bool get isAuthConfigured => supabaseAnonKey.isNotEmpty;
}
