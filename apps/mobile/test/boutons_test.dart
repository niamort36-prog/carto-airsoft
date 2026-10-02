import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:carto_airsoft/app_config.dart';
import 'package:carto_airsoft/serveur_dialog.dart';

/// Les boutons qui ne devaient pas rester muets.
///
/// Un bouton peut « ne pas marcher » de deux façons qui se ressemblent à
/// l'écran : il refuse la saisie en silence, ou il agit sans le dire. Les
/// deux ont été signalées. Ces tests tiennent la correction : une fois
/// pressé, le bouton rapporte toujours quelque chose, et seule une
/// annulation ne renvoie rien.

/// Ce que le dialogue a renvoyé, recueilli après sa fermeture.
class _Resultat {
  bool? valeur;
  bool rendu = false;
}

/// Ouvre le dialogue et le laisse ouvert : c'est entre les deux que le test
/// agit. Attendre le futur de `showDialog` avant de pomper figerait tout.
Future<_Resultat> _ouvrir(WidgetTester tester) async {
  final r = _Resultat();
  await tester.pumpWidget(
    MaterialApp(
      home: Builder(
        builder: (context) => Scaffold(
          body: Center(
            child: ElevatedButton(
              onPressed: () async {
                r.valeur = await demanderUrlServeur(context);
                r.rendu = true;
              },
              child: const Text('ouvrir'),
            ),
          ),
        ),
      ),
    ),
  );
  await tester.tap(find.text('ouvrir'));
  await tester.pumpAndSettle();
  return r;
}

void main() {
  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    // L'adresse saisie est un état global : on repart de zéro à chaque test.
    await AppConfig.definirUrlServeur(null);
  });

  group('adresse du serveur', () {
    testWidgets('annuler ne renvoie rien du tout', (tester) async {
      final r = await _ouvrir(tester);
      await tester.tap(find.text('Annuler'));
      await tester.pumpAndSettle();

      // `null` et non `false` : l'appelant doit pouvoir se taire sur une
      // annulation, et parler dans tous les autres cas.
      expect(r.rendu, isTrue);
      expect(r.valeur, isNull);
    });

    testWidgets('réenregistrer la même adresse se signale quand même',
        (tester) async {
      // Le réflexe quand on retente après une panne. Avant, ce geste
      // refermait la fenêtre sans un mot : le bouton passait pour mort.
      await AppConfig.definirUrlServeur('192.168.1.63:3000');
      final r = await _ouvrir(tester);
      await tester.tap(find.text('Enregistrer'));
      await tester.pumpAndSettle();

      expect(r.valeur, isFalse, reason: 'inchangée, mais pas annulée');
      expect(AppConfig.apiBaseUrl, 'http://192.168.1.63:3000/v1');
    });

    testWidgets('une nouvelle adresse compte comme un changement',
        (tester) async {
      final r = await _ouvrir(tester);
      await tester.enterText(find.byType(TextField), '10.0.0.7:3000');
      await tester.tap(find.text('Enregistrer'));
      await tester.pumpAndSettle();

      expect(r.valeur, isTrue);
      expect(AppConfig.apiBaseUrl, 'http://10.0.0.7:3000/v1');
    });

    testWidgets('vider le champ rétablit l’adresse d’origine', (tester) async {
      await AppConfig.definirUrlServeur('10.0.0.7:3000');
      final r = await _ouvrir(tester);
      await tester.enterText(find.byType(TextField), '');
      await tester.tap(find.text('Enregistrer'));
      await tester.pumpAndSettle();

      expect(r.valeur, isTrue);
      expect(AppConfig.urlServeurPersonnalisee, isFalse);
    });
  });
}
