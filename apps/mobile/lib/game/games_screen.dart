import 'package:drift/drift.dart' show Value;
import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../app_config.dart';
import '../db/local_db.dart';
import '../map/map_screen.dart';
import '../serveur_dialog.dart';
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
    // Forme bloc obligatoire : une lambda fléchée renverrait le Future de
    // `_load()`, ce que `setState` rejette — l'affectation passait, mais la
    // reconstruction n'était jamais demandée et la liste restait figée.
    setState(() {
      _games = _load();
    });
  }

  Future<void> _createGame() async {
    // Une seule partie créée à la fois : la nouvelle efface la précédente
    // avec tout son contenu. On prévient avant, pas après.
    // Cette liste ne sert qu'à PRÉVENIR qu'une partie existante sera
    // remplacée. Quand elle est indisponible — API injoignable et cache
    // vide — ce n'est pas une raison de bloquer la création : le serveur
    // reste l'arbitre et tranchera.
    //
    // Sans ce filet, `await` relançait l'erreur du chargement AVANT
    // d'ouvrir la boîte de dialogue. L'exception remontait dans le vide
    // (le bouton appelle cette méthode sans l'attendre) et le geste
    // restait sans effet visible : ni fenêtre, ni message.
    GameSummary? existante;
    try {
      existante = (await _games)
          .where((g) => g.role == 'commandant')
          .firstOrNull;
    } catch (_) {
      existante = null;
    }

    final controller = TextEditingController();
    if (!mounted) return;
    final name = await showDialog<String>(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, setDialogState) => AlertDialog(
          title: const Text('Nouvelle partie'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              if (existante != null)
                Padding(
                  padding: const EdgeInsets.only(bottom: 12),
                  child: Text(
                    '« ${existante.name} » sera définitivement supprimée, '
                    'avec ses marqueurs, messages et invitations.',
                    style: TextStyle(
                      color: Theme.of(context).colorScheme.error,
                    ),
                  ),
                ),
              TextField(
                controller: controller,
                autofocus: true,
                // Le bouton s'active à la saisie : sans cela, valider un nom
                // trop court refermait la fenêtre sans rien faire ni rien
                // dire, et le geste semblait ignoré.
                onChanged: (_) => setDialogState(() {}),
                decoration: const InputDecoration(
                  labelText: 'Nom de la partie',
                  hintText: 'Op Fontainebleau',
                  helperText: 'Trois caractères au minimum',
                ),
              ),
            ],
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('Annuler'),
            ),
            FilledButton(
              onPressed: controller.text.trim().length < 3
                  ? null
                  : () => Navigator.pop(context, controller.text.trim()),
              child: Text(existante != null ? 'Remplacer' : 'Créer'),
            ),
          ],
        ),
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

  /// Rejoindre : par QR, ou en tapant le code annoncé par l'organisateur.
  ///
  /// Les deux existent parce que les deux situations existent : sur un
  /// parking on scanne une feuille imprimée, au téléphone on se fait dicter
  /// huit caractères.
  Future<void> _joinGame() async {
    final parCode = await showModalBottomSheet<bool>(
      context: context,
      showDragHandle: true,
      builder: (sheetContext) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              leading: const Icon(Icons.qr_code_scanner, size: 32),
              title: const Text('Scanner un QR'),
              subtitle: const Text('Invitation, drapeau à capturer ou bonus'),
              onTap: () => Navigator.pop(sheetContext, false),
            ),
            ListTile(
              leading: const Icon(Icons.keyboard, size: 32),
              title: const Text('Saisir un code'),
              subtitle: const Text('Les huit caractères donnés par l’orga'),
              onTap: () => Navigator.pop(sheetContext, true),
            ),
          ],
        ),
      ),
    );
    if (parCode == null || !mounted) return;

    if (parCode) {
      await _joinByCode();
    } else {
      await _joinByScan();
    }
  }

  /// Scanner un QR : rejoindre, capturer un drapeau ou récupérer un bonus.
  /// C'est le serveur qui reconnaît la nature du code et arbitre (§7.2,
  /// §7.8, §7.9) — l'app se contente d'annoncer le résultat.
  Future<void> _joinByScan() async {
    final outcome = await Navigator.of(
      context,
    ).push<ScanOutcome>(MaterialPageRoute(builder: (_) => const ScanScreen()));
    if (outcome == null) return;
    _announce(outcome);
  }

  /// Saisie du code court, puis confirmation de ce à quoi il engage.
  Future<void> _joinByCode() async {
    final controller = TextEditingController();
    final code = await showDialog<String>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Code de la partie'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'Les huit caractères annoncés par l’organisateur. Ni O ni I '
              'ne s’y trouvent : ce sont des zéros et des uns.',
            ),
            const SizedBox(height: 12),
            TextField(
              controller: controller,
              autofocus: true,
              textCapitalization: TextCapitalization.characters,
              decoration: const InputDecoration(
                hintText: 'ABCD-EFGH',
                border: OutlineInputBorder(),
              ),
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
            child: const Text('Continuer'),
          ),
        ],
      ),
    );
    if (code == null || code.trim().isEmpty || !mounted) return;

    // On montre ce à quoi le code engage AVANT d'inscrire : se tromper de
    // caractère et se retrouver chez l'adversaire serait pénible à défaire.
    final ({String gameName, String role, String? teamName, String? squadName})
    apercu;
    try {
      apercu = await GamesApi.previewInvite(code.trim());
    } catch (e) {
      _showError(e);
      return;
    }
    if (!mounted) return;

    final confirme = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: Text(apercu.gameName),
        content: Text(
          [
            'Vous rejoindrez comme ${roleLabel(apercu.role)}.',
            if (apercu.teamName != null) 'Camp : ${apercu.teamName}.',
            if (apercu.squadName != null) 'Escouade : ${apercu.squadName}.',
          ].join('\n'),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, false),
            child: const Text('Annuler'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(dialogContext, true),
            child: const Text('Rejoindre'),
          ),
        ],
      ),
    );
    if (confirme != true || !mounted) return;

    try {
      _announce(await GamesApi.scan(code.trim()));
    } catch (e) {
      _showError(e);
    }
  }

  /// Annonce le résultat d'un scan ou d'un code, et rafraîchit la liste.
  void _announce(ScanOutcome outcome) {
    _reload();
    if (!mounted) return;
    final message = switch (outcome) {
      GameJoined(:final gameName, :final role) =>
        '« $gameName » rejointe comme ${roleLabel(role)}',
      ObjectiveCaptured(:final name, :final pointsAwarded, :final teamScore) =>
        '$name capturé ! +$pointsAwarded pts — total $teamScore',
      BonusRedeemed(:final name, :final pointsAwarded) =>
        '$name récupéré ! +$pointsAwarded pts',
    };
    ScaffoldMessenger.of(
      context,
    ).showSnackBar(SnackBar(content: Text(message)));
  }

  void _showError(Object e) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        // Sur une page HTTPS visant une API en clair, l'erreur brute ne dit
        // rien d'utile : le navigateur a refusé l'appel avant qu'il parte.
        content: Text(
          AppConfig.isMixedContent ? AppConfig.mixedContentHint : e.toString(),
        ),
        duration: AppConfig.isMixedContent
            ? const Duration(seconds: 12)
            : const Duration(seconds: 4),
        backgroundColor: Theme.of(context).colorScheme.error,
      ),
    );
  }

  Future<void> _openMap({GameSummary? game}) async {
    await Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => MapScreen(gameId: game?.id, gameName: game?.name),
      ),
    );
    // Au retour, la liste peut avoir changé — une partie quittée depuis la
    // carte doit en disparaître tout de suite.
    if (mounted) {
      setState(() {
        _games = _load();
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Mes parties'),
        actions: [
          IconButton(
            tooltip: 'Adresse du serveur',
            icon: const Icon(Icons.dns_outlined),
            onPressed: () async {
              if (await demanderUrlServeur(context) && mounted) {
                setState(() {
                  _games = _load();
                });
              }
            },
          ),
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
                        Text(
                          // Le blocage « contenu mixte » ressemble à une
                          // panne réseau alors que rien n'est en panne.
                          // Le dire évite de chercher du côté du serveur.
                          AppConfig.isMixedContent
                              ? AppConfig.mixedContentHint
                              : 'Impossible de joindre le serveur.\n'
                                    'Vos parties réapparaîtront au retour du '
                                    'réseau.',
                          textAlign: TextAlign.center,
                        ),
                        const SizedBox(height: 8),
                        Wrap(
                          alignment: WrapAlignment.center,
                          children: [
                            TextButton(
                              onPressed: _reload,
                              child: const Text('Réessayer'),
                            ),
                            TextButton(
                              onPressed: () async {
                                if (await demanderUrlServeur(context)) {
                                  _reload();
                                }
                              },
                              child: const Text('Adresse du serveur'),
                            ),
                          ],
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
                      horizontal: 12,
                      vertical: 6,
                    ),
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
                                myRole: g.role,
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
