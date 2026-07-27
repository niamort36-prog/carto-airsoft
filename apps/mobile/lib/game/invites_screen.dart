import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:qr_flutter/qr_flutter.dart';
import 'package:share_plus/share_plus.dart';

import 'games_api.dart';
import 'models.dart';

/// Gestion des QR d'invitation (§7.2) — réservée au commandant.
///
/// Le QR encode un jeton opaque : le rôle n'y figure jamais, c'est le
/// serveur qui l'attribue au scan. Le jeton n'est connu qu'à la création,
/// d'où l'affichage immédiat du QR (et la possibilité de le régénérer).
class InvitesScreen extends StatefulWidget {
  const InvitesScreen({super.key, required this.gameId, required this.gameName});

  final String gameId;
  final String gameName;

  @override
  State<InvitesScreen> createState() => _InvitesScreenState();
}

class _InvitesScreenState extends State<InvitesScreen> {
  late Future<List<InviteView>> _invites;

  @override
  void initState() {
    super.initState();
    _invites = GamesApi.invites(widget.gameId);
  }

  void _reload() {
    setState(() => _invites = GamesApi.invites(widget.gameId));
  }

  Future<void> _create(String role) async {
    try {
      final invite = await GamesApi.createInvite(widget.gameId, role: role);
      _reload();
      if (!mounted) return;
      await _showQr(invite);
    } catch (e) {
      _showError(e);
    }
  }

  /// Affiche le QR à faire scanner. Une fois fermé, le jeton est perdu :
  /// le serveur n'en garde qu'une empreinte, il faudra en générer un autre.
  Future<void> _showQr(InviteView invite) async {
    final payload = invite.url ?? invite.token;
    if (payload == null) return;
    await showDialog<void>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: Text('QR ${roleLabel(invite.role)}'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            // Bloc imprimable : le grade est écrit en clair SOUS le QR pour
            // qu'on sache lequel distribuer. Le jeton encodé, lui, reste
            // opaque — sinon n'importe qui se fabriquerait un QR de gradé.
            Container(
              padding: const EdgeInsets.all(12),
              color: Colors.white,
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  QrImageView(
                    data: payload,
                    size: 240,
                    backgroundColor: Colors.white,
                  ),
                  const SizedBox(height: 8),
                  Text(
                    roleLabel(invite.role).toUpperCase(),
                    style: const TextStyle(
                      color: Colors.black,
                      fontWeight: FontWeight.bold,
                      fontSize: 18,
                      letterSpacing: 1.5,
                    ),
                  ),
                  Text(
                    widget.gameName,
                    style: const TextStyle(color: Colors.black54, fontSize: 12),
                    textAlign: TextAlign.center,
                  ),
                ],
              ),
            ),
            const SizedBox(height: 12),
            Text(
              invite.maxUses == null
                  ? 'Réutilisable : tous ceux qui le scannent deviennent '
                      '${roleLabel(invite.role).toLowerCase()}.'
                  : 'Limité à ${invite.maxUses} usage(s).',
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.bodySmall,
            ),
            const SizedBox(height: 8),
            Text(
              'Ce QR ne sera plus affichable ensuite — le serveur n’en '
              'garde qu’une empreinte.',
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.labelSmall,
            ),
          ],
        ),
        actions: [
          TextButton.icon(
            icon: const Icon(Icons.copy),
            label: const Text('Copier'),
            onPressed: () async {
              await Clipboard.setData(ClipboardData(text: payload));
              if (!dialogContext.mounted) return;
              ScaffoldMessenger.of(dialogContext).showSnackBar(
                const SnackBar(content: Text('Lien copié')),
              );
            },
          ),
          TextButton.icon(
            icon: const Icon(Icons.share),
            label: const Text('Partager'),
            onPressed: () => SharePlus.instance.share(
              ShareParams(
                text: 'Rejoins « ${widget.gameName} » comme '
                    '${roleLabel(invite.role).toLowerCase()} : $payload',
              ),
            ),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(dialogContext),
            child: const Text('Fermer'),
          ),
        ],
      ),
    );
  }

  Future<void> _revoke(InviteView invite) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Révoquer cette invitation ?'),
        content: Text(
          'Le QR ${roleLabel(invite.role)} deviendra inutilisable '
          'immédiatement. Les joueurs déjà entrés restent membres.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, false),
            child: const Text('Annuler'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(dialogContext, true),
            child: const Text('Révoquer'),
          ),
        ],
      ),
    );
    if (confirmed != true) return;
    try {
      await GamesApi.revokeInvite(widget.gameId, invite.id);
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

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Invitations')),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text(
                  'Générer un QR',
                  style: Theme.of(context).textTheme.titleMedium,
                ),
                const SizedBox(height: 4),
                Text(
                  'Le grade est écrit sous le QR pour l’impression, mais le '
                  'code lui-même reste opaque : c’est le serveur qui attribue '
                  'le grade au scan. Les QR sont réutilisables.',
                  style: Theme.of(context).textTheme.bodySmall,
                ),
                const SizedBox(height: 12),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    for (final role in const [
                      'capitaine',
                      'chef_escouade',
                      'joueur',
                    ])
                      FilledButton.tonalIcon(
                        icon: const Icon(Icons.qr_code_2),
                        label: Text(roleLabel(role)),
                        onPressed: () => _create(role),
                      ),
                  ],
                ),
              ],
            ),
          ),
          const Divider(height: 1),
          Expanded(
            child: FutureBuilder<List<InviteView>>(
              future: _invites,
              builder: (context, snap) {
                if (snap.hasError) {
                  return Center(
                    child: Padding(
                      padding: const EdgeInsets.all(24),
                      child: Text('${snap.error}', textAlign: TextAlign.center),
                    ),
                  );
                }
                if (!snap.hasData) {
                  return const Center(child: CircularProgressIndicator());
                }
                final invites = snap.data!;
                if (invites.isEmpty) {
                  return const Center(
                    child: Padding(
                      padding: EdgeInsets.all(24),
                      child: Text('Aucune invitation générée.'),
                    ),
                  );
                }
                return ListView.builder(
                  itemCount: invites.length,
                  itemBuilder: (context, i) {
                    final invite = invites[i];
                    return ListTile(
                      leading: Icon(
                        invite.active ? Icons.qr_code_2 : Icons.block,
                        color: invite.active
                            ? null
                            : Theme.of(context).disabledColor,
                      ),
                      title: Text(roleLabel(invite.role)),
                      subtitle: Text(
                        '${invite.stateLabel} · ${invite.usageLabel}',
                      ),
                      trailing: invite.active
                          ? IconButton(
                              tooltip: 'Révoquer',
                              icon: const Icon(Icons.delete_outline),
                              onPressed: () => _revoke(invite),
                            )
                          : null,
                    );
                  },
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}
