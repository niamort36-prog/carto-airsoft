import 'package:carto_airsoft/app_config.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('adresse du serveur saisie à la main', () {
    String? n(String? saisie) => AppConfig.normaliserUrlServeur(saisie);

    test('une IP et un port suffisent', () {
      // Ce qu'on tape vraiment sur un terrain, au pouce.
      expect(n('192.168.1.63:3000'), 'http://192.168.1.63:3000/v1');
    });

    test('le schéma déjà écrit est respecté', () {
      expect(
        n('https://carto.exemple.fr'),
        'https://carto.exemple.fr/v1',
      );
    });

    test('l’adresse complète passe telle quelle', () {
      expect(n('http://192.168.1.63:3000/v1'), 'http://192.168.1.63:3000/v1');
    });

    test('les barres obliques en trop sont absorbées', () {
      expect(n('http://192.168.1.63:3000///'), 'http://192.168.1.63:3000/v1');
    });

    test('les espaces autour ne font pas échouer', () {
      expect(n('  192.168.1.63:3000  '), 'http://192.168.1.63:3000/v1');
    });

    test('vide ou absent : on rétablit l’adresse compilée', () {
      expect(n(null), isNull);
      expect(n(''), isNull);
      expect(n('   '), isNull);
    });

    test('un tunnel HTTPS n’est pas rétrogradé en clair', () {
      // Le cas du jour où le serveur est exposé par un tunnel : forcer
      // http:// casserait tout.
      expect(
        n('https://exemple.trycloudflare.com'),
        'https://exemple.trycloudflare.com/v1',
      );
    });
  });
}
