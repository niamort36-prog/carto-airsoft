import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:carto_airsoft/auth/login_screen.dart';

void main() {
  testWidgets("l'écran de connexion affiche les champs attendus",
      (WidgetTester tester) async {
    await tester.pumpWidget(const MaterialApp(home: LoginScreen()));

    expect(find.text('Carto Airsoft'), findsOneWidget);
    expect(find.text('Email'), findsOneWidget);
    expect(find.text('Mot de passe'), findsOneWidget);
    expect(find.text('Se connecter'), findsOneWidget);
    expect(find.text('Créer un compte'), findsOneWidget);
  });

  testWidgets('la validation refuse un email invalide',
      (WidgetTester tester) async {
    await tester.pumpWidget(const MaterialApp(home: LoginScreen()));

    await tester.enterText(find.byType(TextFormField).first, 'pas-un-email');
    await tester.tap(find.text('Se connecter'));
    await tester.pump();

    expect(find.text('Email invalide'), findsOneWidget);
  });
}
