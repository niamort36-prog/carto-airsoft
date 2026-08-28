import 'package:flutter/material.dart';

import 'app_config.dart';

/// Demande l'adresse du serveur arbitre et l'enregistre sur l'appareil.
///
/// Sans ce réglage, un APK envoyé à des amis serait périmé au premier
/// changement d'adresse : il faudrait recompiler et redistribuer à tout le
/// monde. Là, chacun corrige sur son téléphone.
///
/// Renvoie `true` si l'adresse a changé — l'appelant peut alors relancer ce
/// qu'il avait chargé.
Future<bool> demanderUrlServeur(BuildContext context) async {
  final avant = AppConfig.apiBaseUrl;
  final controller = TextEditingController(
    text: AppConfig.urlServeurPersonnalisee ? avant : '',
  );

  final saisie = await showDialog<String>(
    context: context,
    builder: (dialogContext) => AlertDialog(
      title: const Text('Adresse du serveur'),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'L’adresse du PC qui arbitre la partie. Sur le même réseau '
            'Wi-Fi, c’est son adresse locale et le port 3000.',
          ),
          const SizedBox(height: 12),
          TextField(
            controller: controller,
            autofocus: true,
            keyboardType: TextInputType.url,
            decoration: const InputDecoration(
              hintText: '192.168.1.63:3000',
              border: OutlineInputBorder(),
              helperText: 'Vide pour rétablir l’adresse d’origine',
            ),
          ),
          const SizedBox(height: 12),
          Text(
            'Actuellement : $avant',
            style: Theme.of(dialogContext).textTheme.bodySmall,
          ),
        ],
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(dialogContext),
          child: const Text('Annuler'),
        ),
        FilledButton(
          onPressed: () => Navigator.pop(dialogContext, controller.text),
          child: const Text('Enregistrer'),
        ),
      ],
    ),
  );

  if (saisie == null) return false;
  await AppConfig.definirUrlServeur(saisie);
  return AppConfig.apiBaseUrl != avant;
}
