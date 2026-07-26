import 'dart:convert';

import 'package:http/http.dart' as http;
import 'package:supabase_flutter/supabase_flutter.dart';

import '../app_config.dart';
import 'models.dart';

/// Client REST de l'API arbitre (principe API-first §2.2 :
/// l'app ne parle jamais directement à la base).
class GamesApi {
  static Map<String, String> _headers() => {
        'Authorization':
            'Bearer ${Supabase.instance.client.auth.currentSession?.accessToken ?? ''}',
        'Content-Type': 'application/json',
      };

  static Uri _uri(String path) => Uri.parse('${AppConfig.apiBaseUrl}$path');

  static Future<List<GameSummary>> myGames() async {
    final res = await http.get(_uri('/games'), headers: _headers());
    _ensureOk(res);
    final list = jsonDecode(res.body) as List<dynamic>;
    return [
      for (final item in list)
        GameSummary.fromJson(item as Map<String, dynamic>),
    ];
  }

  static Future<GameSummary> createGame(String name) async {
    final res = await http.post(
      _uri('/games'),
      headers: _headers(),
      body: jsonEncode({'name': name}),
    );
    _ensureOk(res);
    final game = jsonDecode(res.body) as Map<String, dynamic>;
    return GameSummary.fromJson({'game': game, 'role': 'orga'});
  }

  static Future<void> joinGame(String gameId) async {
    final res = await http.post(
      _uri('/games/$gameId/join'),
      headers: _headers(),
    );
    _ensureOk(res);
  }

  /// Nomination (commandant) ou changement d'insigne (gradés) — validé serveur.
  static Future<void> updateMember(
    String gameId,
    String membershipId, {
    String? role,
    String? unitType,
  }) async {
    final res = await http.patch(
      _uri('/games/$gameId/members/$membershipId'),
      headers: _headers(),
      body: jsonEncode({
        'role': ?role,
        'unitType': ?unitType,
      }),
    );
    _ensureOk(res);
  }

  /// Pousse un lot d'objets carte — idempotent sur l'id client (§7.6).
  static Future<List<MapObjectView>> pushObjects(
    String gameId,
    List<Map<String, dynamic>> objects,
  ) async {
    final res = await http.post(
      _uri('/games/$gameId/map-objects/batch'),
      headers: _headers(),
      body: jsonEncode({'objects': objects}),
    );
    _ensureOk(res);
    final list = jsonDecode(res.body) as List<dynamic>;
    return [
      for (final o in list)
        MapObjectView.fromJson(o as Map<String, dynamic>),
    ];
  }

  /// Delta de synchro : tout ce qui a changé depuis [since] (§7.6).
  static Future<({String serverTime, List<MapObjectView> objects})>
      syncObjects(String gameId, {String? since}) async {
    final query = since != null ? '?since=${Uri.encodeComponent(since)}' : '';
    final res =
        await http.get(_uri('/games/$gameId/sync$query'), headers: _headers());
    _ensureOk(res);
    final body = jsonDecode(res.body) as Map<String, dynamic>;
    return (
      serverTime: body['serverTime'] as String,
      objects: [
        for (final o in (body['objects'] as List<dynamic>))
          MapObjectView.fromJson(o as Map<String, dynamic>),
      ],
    );
  }

  static void _ensureOk(http.Response res) {
    if (res.statusCode < 200 || res.statusCode >= 300) {
      String message = 'Erreur ${res.statusCode}';
      try {
        final body = jsonDecode(res.body) as Map<String, dynamic>;
        if (body['message'] is String) message = body['message'] as String;
      } catch (_) {}
      throw GamesApiException(message, res.statusCode);
    }
  }
}

class GamesApiException implements Exception {
  const GamesApiException(this.message, this.statusCode);

  final String message;
  final int statusCode;

  @override
  String toString() => message;
}
