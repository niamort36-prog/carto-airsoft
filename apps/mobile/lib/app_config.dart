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

  /// URL de l'API arbitre.
  /// 10.0.2.2 = localhost du PC vu depuis l'émulateur Android ;
  /// sur téléphone réel, passer l'IP LAN du PC via --dart-define=API_BASE_URL=…
  static const apiBaseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'http://10.0.2.2:3000/v1',
  );

  static bool get isAuthConfigured => supabaseAnonKey.isNotEmpty;
}
