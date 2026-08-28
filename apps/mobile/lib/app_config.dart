import 'package:flutter/foundation.dart'
    show TargetPlatform, defaultTargetPlatform, kIsWeb;
import 'package:shared_preferences/shared_preferences.dart';

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

  static const _cleUrlServeur = 'api_base_url';

  /// Adresse saisie par le joueur, qui l'emporte sur celle compilée.
  ///
  /// Sans elle, un APK envoyé à des amis serait périmé au premier
  /// changement d'adresse du serveur — il faudrait recompiler et
  /// redistribuer à tout le monde. Là, chacun corrige dans l'app.
  static String? _urlSaisie;

  /// À appeler au démarrage, avant le premier appel réseau.
  static Future<void> chargerUrlServeur() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      _urlSaisie = normaliserUrlServeur(prefs.getString(_cleUrlServeur));
    } catch (_) {
      // Stockage indisponible : on retombe sur l'adresse compilée.
    }
  }

  /// Enregistre l'adresse du serveur. `null` ou vide rétablit celle
  /// compilée dans l'application.
  static Future<void> definirUrlServeur(String? url) async {
    _urlSaisie = normaliserUrlServeur(url);
    try {
      final prefs = await SharedPreferences.getInstance();
      if (_urlSaisie == null) {
        await prefs.remove(_cleUrlServeur);
      } else {
        await prefs.setString(_cleUrlServeur, _urlSaisie!);
      }
    } catch (_) {
      // Le réglage vaut au moins pour la session en cours.
    }
  }

  /// Vrai quand le joueur a saisi une adresse à la main.
  static bool get urlServeurPersonnalisee => _urlSaisie != null;

  /// Met une saisie humaine en forme d'URL d'API.
  ///
  /// On tape « 192.168.1.63:3000 » sur un terrain, pas
  /// « http://192.168.1.63:3000/v1 ». Le préfixe et le suffixe sont donc
  /// ajoutés d'office : une adresse refusée pour un « http:// » oublié
  /// serait un piège, pas une vérification.
  static String? normaliserUrlServeur(String? saisie) {
    var texte = saisie?.trim() ?? '';
    if (texte.isEmpty) return null;
    if (!texte.contains('://')) texte = 'http://$texte';
    while (texte.endsWith('/')) {
      texte = texte.substring(0, texte.length - 1);
    }
    if (!texte.endsWith('/v1')) texte = '$texte/v1';
    return texte;
  }

  /// URL effective. Chaque cible joint le PC de développement par une
  /// adresse différente : l'émulateur Android passe par 10.0.2.2, le
  /// simulateur iOS et le navigateur partagent le réseau de la machine et
  /// voient donc `localhost`. Sur appareil réel, l'adresse se saisit dans
  /// l'app, ou se fige au build :
  /// `--dart-define=API_BASE_URL=http://192.168.x.x:3000/v1`.
  static String get apiBaseUrl {
    if (_urlSaisie != null) return _urlSaisie!;
    if (_configuredApiBaseUrl.isNotEmpty) return _configuredApiBaseUrl;
    if (!kIsWeb && defaultTargetPlatform == TargetPlatform.android) {
      return 'http://10.0.2.2:3000/v1';
    }
    return 'http://localhost:3000/v1';
  }

  static bool get isAuthConfigured => supabaseAnonKey.isNotEmpty;
}
