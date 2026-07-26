import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../map/map_screen.dart';
import 'games_api.dart';
import 'models.dart';

/// Accueil après connexion : mes parties, en créer une, en rejoindre une.
/// (Phase 3 : rejoindre passera par un scan de QR §7.2.)
class GamesScreen extends StatefulWidget {
  const GamesScreen({super.key});

  @override
  State<GamesScreen> createState() => _GamesScreenState();
}

class _GamesScreenState extends State<GamesScreen> {
  late Future<List<GameSummary>> _games;

  @override
  void initState() {
    super.initState();
    _games = GamesApi.myGames();
  }

  void _reload() {
    setState(() => _games = GamesApi.myGames());
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

  Future<void> _joinGame() async {
    final controller = TextEditingController();
    final id = await showDialog<String>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Rejoindre une partie'),
        content: TextField(
          controller: controller,
          autofocus: true,
          decoration: const InputDecoration(
            labelText: 'Identifiant de la partie',
            hintText: 'coller l’ID transmis par l’ORGA',
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Annuler'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, controller.text.trim()),
            child: const Text('Rejoindre'),
          ),
        ],
      ),
    );
    if (id == null || id.isEmpty) return;
    try {
      await GamesApi.joinGame(id);
      _reload();
    } catch (e) {
      _showError(e);
    }
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
              itemCount: games.length,
              itemBuilder: (context, i) {
                final g = games[i];
                return ListTile(
                  leading: Icon(
                    g.role == 'orga' ? Icons.star : Icons.person,
                  ),
                  title: Text(g.name),
                  subtitle: Text(
                      '${g.role == 'orga' ? 'ORGA' : 'Joueur'} · ${g.status}'),
                  trailing: const Icon(Icons.chevron_right),
                  onTap: () => _openMap(game: g),
                  onLongPress: () {
                    showDialog<void>(
                      context: context,
                      builder: (_) => AlertDialog(
                        title: Text(g.name),
                        content: SelectableText(
                            'ID à transmettre aux joueurs :\n${g.id}'),
                        actions: [
                          TextButton(
                            onPressed: () => Navigator.pop(context),
                            child: const Text('Fermer'),
                          ),
                        ],
                      ),
                    );
                  },
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
