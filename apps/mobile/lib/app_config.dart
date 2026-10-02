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

  /// Vrai quand l'hôte est une adresse de réseau local (RFC 1918).
  ///
  /// Publique pour être testable : c'est elle qui décide si l'application
  /// devine le serveur toute seule.
  ///
  /// C'est la signature d'une page servie par le PC de la partie à des
  /// téléphones du même Wi-Fi — par opposition à un site public.
  static bool estHoteReseauLocal(String hote) {
    if (hote.startsWith('192.168.') || hote.startsWith('10.')) return true;
    final m = RegExp(r'^172\.(\d{1,2})\.').firstMatch(hote);
    if (m == null) return false;
    final second = int.parse(m.group(1)!);
    return second >= 16 && second <= 31;
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
    if (kIsWeb && estHoteReseauLocal(Uri.base.host)) {
      // La page vient du PC de la partie, par le Wi-Fi : le serveur est sur
      // ce même PC. Viser `localhost` désignerait le téléphone lui-même,
      // et obligeait chaque joueur à recopier l'adresse à la main. Un site
      // public, lui, n'a pas d'adresse privée : il n'est pas concerné.
      return 'http://${Uri.base.host}:3000/v1';
    }
    return 'http://localhost:3000/v1';
  }

  /// Vrai quand la page est servie en HTTPS mais que l'API visée est en
  /// HTTP clair.
  ///
  /// Le navigateur bloque alors TOUS les appels, et l'application ne peut
  /// pas distinguer ce blocage d'une panne réseau : elle dirait « hors
  /// ligne » sans que rien ne soit hors ligne. C'est le piège exact du
  /// site publié sur GitHub Pages pointant vers un serveur local.
  static bool get isMixedContent =>
      kIsWeb &&
      Uri.base.scheme == 'https' &&
      apiBaseUrl.startsWith('http://');

  /// Ce qu'il faut faire, quand c'est ce piège-là.
  static const mixedContentHint =
      'Cette page est servie en HTTPS et ne peut pas appeler un serveur en '
      'HTTP. Exposez l’API en HTTPS (cloudflared tunnel --url '
      'http://localhost:3000) puis collez l’adresse obtenue dans « Adresse '
      'du serveur ».';

  static bool get isAuthConfigured => supabaseAnonKey.isNotEmpty;

  /// Jeton forgé localement, pour une construction de développement.
  ///
  /// `flutter build web --dart-define=JETON_DEV=$(node scripts/jeton-dev.mjs)`
  /// — voir [Session]. Vide par défaut : une construction ordinaire passe
  /// par la connexion.
  static const jetonDev = String.fromEnvironment('JETON_DEV');

  /// Ouvre directement la carte libre, sans passer par la connexion.
  ///
  /// Réservé au développement : `flutter build web
  /// --dart-define=CARTE_LIBRE=true`. Éteint par défaut, et sans effet sur
  /// l'arbitrage — cette carte ne parle à aucune partie, et le serveur
  /// continue de refuser tout appel sans jeton (§2.1). Elle sert à regarder
  /// le rendu cartographique dans un navigateur sans compte.
  static const carteLibreDirecte =
      bool.fromEnvironment('CARTE_LIBRE', defaultValue: false);
}
