import 'package:drift/drift.dart' show Value;
import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../db/local_db.dart';
import '../map/map_screen.dart';
import 'games_api.dart';
import 'invites_screen.dart';
import 'models.dart';
import 'scan_screen.dart';

/// Accueil après connexion : mes parties, en créer une, en rejoindre une.
/// (Phase 3 : rejoindre passera par un scan de QR §7.2.)
class GamesScreen extends StatefulWidget {
  const GamesScreen({super.key});

  @override
  State<GamesScreen> createState() => _GamesScreenState();
}

class _GamesScreenState extends State<GamesScreen> {
  late Future<List<GameSummary>> _games;
  bool _fromCache = false;

  @override
  void initState() {
    super.initState();
    _games = _load();
  }

  /// Serveur d'abord (et mise en cache), cache local sinon : l'accueil
  /// doit fonctionner en pleine forêt (§2.3).
  Future<List<GameSummary>> _load() async {
    try {
      final games = await GamesApi.myGames();
      await LocalDb.instance.saveGames([
        for (final g in games)
          LocalGamesCompanion(
            id: Value(g.id),
            name: Value(g.name),
            status: Value(g.status),
            role: Value(g.role),
          ),
      ]);
      _fromCache = false;
      return games;
    } catch (_) {
      final cached = await LocalDb.instance.cachedGames();
      if (cached.isEmpty) rethrow;
      _fromCache = true;
      return [
        for (final g in cached)
          GameSummary(id: g.id, name: g.name, status: g.status, role: g.role),
      ];
    }
  }

  // Note : le cache local ne mémorise pas les permissions — hors réseau, les
  // actions de commandement sont de toute façon impossibles (elles exigent
  // l'arbitre). Les boutons réapparaissent au retour du réseau.

  void _reload() {
    setState(() => _games = _load());
  }

  Future<void> _createGame() async {
    final controller = TextEditingController();
    final name = await showDialog<String>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Nouvelle partie'),
        content: TextField(
          controller: controller,
          autofocus: true,
          decoration: const InputDecoration(
            labelText: 'Nom de la partie',
            hintText: 'Op Fontainebleau',
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Annuler'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, controller.text.trim()),
            child: const Text('Créer'),
          ),
        ],
      ),
    );
    if (name == null || name.length < 3) return;
    try {
      await GamesApi.createGame(name);
      _reload();
    } catch (e) {
      _showError(e);
    }
  }

  /// Rejoindre = scanner le QR de l'organisateur (§7.2). Le grade vient du
  /// jeton, résolu par le serveur — il n'est jamais choisi ici.
  Future<void> _joinGame() async {
    final joined = await Navigator.of(context).push<
        ({String gameId, String gameName, String role})>(
      MaterialPageRoute(builder: (_) => const ScanScreen()),
    );
    if (joined == null) return;
    _reload();
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(
          '« ${joined.gameName} » rejointe comme ${roleLabel(joined.role)}',
        ),
      ),
    );
  }

  void _showError(Object e) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(e.toString()),
        backgroundColor: Theme.of(context).colorScheme.error,
      ),
    );
  }

  void _openMap({GameSummary? game}) {
    Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => MapScreen(gameId: game?.id, gameName: game?.name),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Mes parties'),
        actions: [
          IconButton(
            tooltip: 'Carte libre (sans partie)',
            icon: const Icon(Icons.map_outlined),
            onPressed: () => _openMap(),
          ),
          IconButton(
            tooltip: 'Se déconnecter',
            icon: const Icon(Icons.logout),
            onPressed: () => Supabase.instance.client.auth.signOut(),
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () async => _reload(),
        child: FutureBuilder<List<GameSummary>>(
          future: _games,
          builder: (context, snap) {
            if (snap.hasError) {
              return ListView(
                children: [
                  Padding(
                    padding: const EdgeInsets.all(24),
                    child: Column(
                      children: [
                        const Icon(Icons.cloud_off, size: 48),
                        const SizedBox(height: 8),
                        const Text(
                          'Impossible de joindre le serveur.\n'
                          'Vos parties réapparaîtront au retour du réseau.',
                          textAlign: TextAlign.center,
                        ),
                        const SizedBox(height: 8),
                        TextButton(
                          onPressed: _reload,
                          child: const Text('Réessayer'),
                        ),
                      ],
                    ),
                  ),
                ],
              );
            }
            if (!snap.hasData) {
              return const Center(child: CircularProgressIndicator());
            }
            final games = snap.data!;
            if (games.isEmpty) {
              return ListView(
                children: const [
                  Padding(
                    padding: EdgeInsets.all(24),
                    child: Text(
                      'Aucune partie pour l’instant.\n'
                      'Créez-en une ou rejoignez celle d’un ORGA.',
                      textAlign: TextAlign.center,
                    ),
                  ),
                ],
              );
            }
            return ListView.builder(
              itemCount: games.length + (_fromCache ? 1 : 0),
              itemBuilder: (context, i) {
                if (_fromCache && i == 0) {
                  return Container(
                    color: Colors.orange.shade900,
                    padding: const EdgeInsets.symmetric(
                        horizontal: 12, vertical: 6),
                    child: const Text(
                      'Hors ligne — liste en cache',
                      textAlign: TextAlign.center,
                      style: TextStyle(fontWeight: FontWeight.bold),
                    ),
                  );
                }
                final g = games[i - (_fromCache ? 1 : 0)];
                return ListTile(
                  leading: Icon(
                    g.role == 'commandant' ? Icons.star : Icons.person,
                  ),
                  title: Text(g.name),
                  subtitle: Text('${roleLabel(g.role)} · ${g.status}'),
                  trailing: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      // Affiché selon la permission, pas selon le grade (§5).
                      if (g.can(Perm.invitesManage))
                        IconButton(
                          tooltip: 'Invitations QR',
                          icon: const Icon(Icons.qr_code_2),
                          onPressed: () => Navigator.of(context).push(
                            MaterialPageRoute<void>(
                              builder: (_) => InvitesScreen(
                                gameId: g.id,
                                gameName: g.name,
                              ),
                            ),
                          ),
                        ),
                      const Icon(Icons.chevron_right),
                    ],
                  ),
                  onTap: () => _openMap(game: g),
                );
              },
            );
          },
        ),
      ),
      floatingActionButton: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          FloatingActionButton.extended(
            heroTag: 'join',
            onPressed: _joinGame,
            icon: const Icon(Icons.group_add),
            label: const Text('Rejoindre'),
          ),
          const SizedBox(height: 12),
          FloatingActionButton.extended(
            heroTag: 'create',
            onPressed: _createGame,
            icon: const Icon(Icons.add),
            label: const Text('Créer'),
          ),
        ],
      ),
    );
  }
}
