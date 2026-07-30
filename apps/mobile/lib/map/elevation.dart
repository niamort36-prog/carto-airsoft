// Altitude d'un point, lue dans les tuiles de terrain « terrarium ».
//
// Même jeu de tuiles que le fond de carte Relief : ce qui est affiché est
// donc ce qui est mesuré. Une tuile lue est gardée en mémoire, ce qui suffit
// à couvrir un terrain de jeu entier. Hors ligne, on rend null et l'écran
// affiche « — » plutôt qu'un chiffre inventé (§2.3 : jamais de plantage,
// jamais de fausse donnée).

import 'dart:math' as math;
import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:http/http.dart' as http;

class ElevationService {
  ElevationService._();
  static final instance = ElevationService._();

  /// Zoom du DEM : ~30 m de résolution, assez fin pour un terrain.
  static const _zoom = 12;
  static const _tileSize = 256;

  final Map<String, Uint8List?> _tiles = {};
  final Map<String, Future<Uint8List?>> _inFlight = {};

  /// Altitude en mètres, ou null si la tuile n'est pas (encore) disponible.
  Future<double?> at(double lat, double lng) async {
    final n = 1 << _zoom;
    final x = ((lng + 180) / 360 * n);
    final latRad = lat * math.pi / 180;
    final y = (1 -
            math.log(math.tan(latRad) + 1 / math.cos(latRad)) / math.pi) /
        2 *
        n;
    final tileX = x.floor();
    final tileY = y.floor();
    final pixels = await _tile(tileX, tileY);
    if (pixels == null) return null;

    final px = ((x - tileX) * _tileSize).floor().clamp(0, _tileSize - 1);
    final py = ((y - tileY) * _tileSize).floor().clamp(0, _tileSize - 1);
    final offset = (py * _tileSize + px) * 4;
    final r = pixels[offset];
    final g = pixels[offset + 1];
    final b = pixels[offset + 2];
    // Encodage terrarium : (R * 256 + G + B / 256) − 32768.
    return (r * 256 + g + b / 256) - 32768;
  }

  Future<Uint8List?> _tile(int x, int y) {
    final key = '$x/$y';
    if (_tiles.containsKey(key)) return Future.value(_tiles[key]);
    return _inFlight[key] ??= _fetch(key, x, y);
  }

  Future<Uint8List?> _fetch(String key, int x, int y) async {
    try {
      final response = await http
          .get(
            Uri.parse(
              'https://s3.amazonaws.com/elevation-tiles-prod/terrarium'
              '/$_zoom/$x/$y.png',
            ),
          )
          .timeout(const Duration(seconds: 8));
      if (response.statusCode != 200) return null;
      final codec = await ui.instantiateImageCodec(response.bodyBytes);
      final image = (await codec.getNextFrame()).image;
      final data =
          await image.toByteData(format: ui.ImageByteFormat.rawRgba);
      image.dispose();
      final pixels = data?.buffer.asUint8List();
      _tiles[key] = pixels;
      return pixels;
    } catch (_) {
      // Hors ligne : on ne mémorise pas l'échec, un retour du réseau
      // permettra de réessayer.
      return null;
    } finally {
      _inFlight.remove(key);
    }
  }
}
