import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../app_config.dart';
import '../serveur_dialog.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _formKey = GlobalKey<FormState>();
  final _emailController = TextEditingController();
  final _passwordController = TextEditingController();
  bool _loading = false;

  @override
  void dispose() {
    _emailController.dispose();
    _passwordController.dispose();
    super.dispose();
  }

  Future<void> _submit({required bool signUp}) async {
    if (!_formKey.currentState!.validate()) return;
    setState(() => _loading = true);
    final auth = Supabase.instance.client.auth;
    final email = _emailController.text.trim();
    final password = _passwordController.text;
    try {
      if (signUp) {
        await auth.signUp(email: email, password: password);
        _showMessage(
          'Compte créé. Vérifiez votre boîte mail si une confirmation est demandée.',
        );
      } else {
        await auth.signInWithPassword(email: email, password: password);
      }
      // La navigation est gérée par AuthGate via onAuthStateChange.
    } on AuthException catch (e) {
      _showMessage(_frenchAuthError(e), isError: true);
    } catch (_) {
      _showMessage(
        'Connexion impossible. Vérifiez votre accès réseau.',
        isError: true,
      );
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  String _frenchAuthError(AuthException e) {
    final msg = e.message.toLowerCase();
    if (msg.contains('invalid login credentials')) {
      return 'Email ou mot de passe incorrect.';
    }
    if (msg.contains('already registered')) {
      return 'Un compte existe déjà avec cet email.';
    }
    if (msg.contains('email not confirmed')) {
      return 'Email non confirmé : ouvrez le lien reçu par mail.';
    }
    return 'Erreur d’authentification : ${e.message}';
  }

  void _showMessage(String text, {bool isError = false}) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(text),
        backgroundColor:
            isError ? Theme.of(context).colorScheme.error : null,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 400),
            child: Form(
              key: _formKey,
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const Icon(Icons.map_outlined, size: 64),
                  const SizedBox(height: 8),
                  Text(
                    'Carto Airsoft',
                    textAlign: TextAlign.center,
                    style: Theme.of(context).textTheme.headlineMedium,
                  ),
                  const SizedBox(height: 32),
                  TextFormField(
                    controller: _emailController,
                    decoration: const InputDecoration(
                      labelText: 'Email',
                      border: OutlineInputBorder(),
                    ),
                    keyboardType: TextInputType.emailAddress,
                    autofillHints: const [AutofillHints.email],
                    validator: (v) => (v == null || !v.contains('@'))
                        ? 'Email invalide'
                        : null,
                  ),
                  const SizedBox(height: 16),
                  TextFormField(
                    controller: _passwordController,
                    decoration: const InputDecoration(
                      labelText: 'Mot de passe',
                      border: OutlineInputBorder(),
                    ),
                    obscureText: true,
                    autofillHints: const [AutofillHints.password],
                    validator: (v) => (v == null || v.length < 6)
                        ? '6 caractères minimum'
                        : null,
                  ),
                  const SizedBox(height: 24),
                  FilledButton(
                    onPressed: _loading ? null : () => _submit(signUp: false),
                    child: _loading
                        ? const SizedBox(
                            height: 20,
                            width: 20,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                        : const Text('Se connecter'),
                  ),
                  const SizedBox(height: 8),
                  TextButton(
                    onPressed: _loading ? null : () => _submit(signUp: true),
                    child: const Text('Créer un compte'),
                  ),
                  const SizedBox(height: 24),
                  // Atteignable avant toute connexion : sans le bon
                  // serveur, se connecter ne mène nulle part.
                  TextButton.icon(
                    icon: const Icon(Icons.dns_outlined, size: 18),
                    label: const Text('Adresse du serveur'),
                    onPressed: _loading
                        ? null
                        : () async {
                            final change = await demanderUrlServeur(context);
                            if (change == null || !mounted) return;
                            _showMessage('Serveur : ${AppConfig.apiBaseUrl}');
                          },
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
