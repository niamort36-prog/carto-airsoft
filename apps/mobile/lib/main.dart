import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import 'app_config.dart';
import 'auth/login_screen.dart';
import 'game/games_screen.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  // L'adresse du serveur d'abord : tout le reste s'en sert, et elle peut
  // avoir été corrigée à la main sur cet appareil.
  await AppConfig.chargerUrlServeur();
  if (AppConfig.isAuthConfigured) {
    final key = AppConfig.supabaseAnonKey;
    if (key.startsWith('sb_')) {
      // Nouveau format de clé publique Supabase (sb_publishable_…).
      await Supabase.initialize(
        url: AppConfig.supabaseUrl,
        publishableKey: key,
      );
    } else {
      // Ancien format « anon » (JWT). Toujours supporté par Supabase.
      await Supabase.initialize(
        url: AppConfig.supabaseUrl,
        // ignore: deprecated_member_use
        anonKey: key,
      );
    }
  }
  runApp(const CartoAirsoftApp());
}

class CartoAirsoftApp extends StatelessWidget {
  const CartoAirsoftApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Carto Airsoft',
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(
          seedColor: const Color(0xFF3B5D3A),
          brightness: Brightness.dark,
        ),
        useMaterial3: true,
      ),
      home: AppConfig.isAuthConfigured
          ? const AuthGate()
          : const ConfigMissingScreen(),
    );
  }
}

/// Affiche la carte si une session existe, sinon l'écran de connexion.
/// La session Supabase est persistée localement : pas de reconnexion à chaque
/// lancement, et l'app démarre même hors ligne avec la dernière session.
class AuthGate extends StatelessWidget {
  const AuthGate({super.key});

  @override
  Widget build(BuildContext context) {
    return StreamBuilder<AuthState>(
      stream: Supabase.instance.client.auth.onAuthStateChange,
      builder: (context, snapshot) {
        final session = Supabase.instance.client.auth.currentSession;
        if (session != null) {
          return const GamesScreen();
        }
        return const LoginScreen();
      },
    );
  }
}

class ConfigMissingScreen extends StatelessWidget {
  const ConfigMissingScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return const Scaffold(
      body: Center(
        child: Padding(
          padding: EdgeInsets.all(24),
          child: Text(
            'Configuration manquante :\n'
            'compiler avec --dart-define=SUPABASE_ANON_KEY=…',
            textAlign: TextAlign.center,
          ),
        ),
      ),
    );
  }
}
