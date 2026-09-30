import 'package:carto_airsoft/app_config.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('page HTTPS visant une API en clair', () {
    test('hors navigateur, la question ne se pose pas', () {
      // `Uri.base` existe partout, mais seul un navigateur applique la
      // règle du contenu mixte. Sur mobile, un serveur en HTTP local est
      // parfaitement joignable.
      expect(AppConfig.isMixedContent, isFalse);
    });

    test('le message dit quoi faire, pas seulement ce qui ne va pas', () {
      // Une erreur qui décrit la panne sans donner la sortie laisse
      // chercher du côté du serveur, où rien n'est cassé.
      expect(AppConfig.mixedContentHint, contains('HTTPS'));
      expect(AppConfig.mixedContentHint, contains('cloudflared'));
      expect(AppConfig.mixedContentHint, contains('Adresse du serveur'));
    });
  });
}
