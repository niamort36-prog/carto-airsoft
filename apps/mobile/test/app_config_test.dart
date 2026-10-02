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
  group('serveur deviné depuis l’adresse de la page', () {
    // Servie par le PC de la partie sur le Wi-Fi, l'application vise ce PC.
    // Viser `localhost` désignerait le téléphone, et obligeait chaque joueur
    // à recopier l'adresse à la main avant de pouvoir se connecter.
    bool local(String h) => AppConfig.estHoteReseauLocal(h);

    test('les trois plages privées sont reconnues', () {
      expect(local('192.168.1.63'), isTrue);
      expect(local('10.0.0.7'), isTrue);
      expect(local('172.16.0.1'), isTrue);
      expect(local('172.31.255.254'), isTrue);
    });

    test('un site public n’est pas un réseau local', () {
      expect(local('cardiologue.github.io'), isFalse);
      expect(local('carto.exemple.fr'), isFalse);
      expect(local('localhost'), isFalse);
    });

    test('les voisines de 172 hors plage ne passent pas', () {
      // 172.15 et 172.32 sont publiques : les prendre pour du local ferait
      // viser un serveur qui n'existe pas.
      expect(local('172.15.0.1'), isFalse);
      expect(local('172.32.0.1'), isFalse);
    });
  });
}
