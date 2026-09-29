import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:qr_flutter/qr_flutter.dart';
import 'package:share_plus/share_plus.dart';

import '../app_config.dart';
import 'games_api.dart';
import 'models.dart';

/// Gestion des invitations (§7.2).
///
/// Ouverte à qui détient la permission `invites:manage`, pas à un grade
/// donné : la matrice de permissions décide, et elle se règle par partie.
/// Un capitaine à qui on l'accorde peut donc recruter lui-même — mais
/// jamais au-dessus de son propre grade, le serveur le refuse et l'écran
/// ne le propose pas.
///
/// Le QR encode un jeton opaque : le rôle n'y figure jamais, c'est le
/// serveur qui l'attribue au scan. Le jeton n'est connu qu'à la création,
/// d'où l'affichage immédiat du QR (et la possibilité de le régénérer).
class InvitesScreen extends StatefulWidget {
  const InvitesScreen({
    super.key,
    required this.gameId,
    required this.gameName,
    required this.myRole,
    this.myTeamId,
    this.mySquadId,
    this.mySquadName,
  });

  final String gameId;
  final String gameName;

  /// Mon propre grade dans cette partie : il borne ce que je peux donner.
  final String myRole;

  /// Mon camp et mon escouade : ce qui permet d'inviter DANS son groupe et
  /// pas seulement dans la partie.
  final String? myTeamId;
  final String? mySquadId;
  final String? mySquadName;

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

  /// Grades qu'on peut donner : strictement le sien ou en dessous, et
  /// jamais commandant — ce grade-là ne se fabrique pas par un code, qui
  /// se photographie et se transfère.
  List<String> get _invitableRoles => [
        for (final role in const ['capitaine', 'chef_escouade', 'joueur'])
          if (roleRank(role) >= roleRank(widget.myRole)) role,
      ];

  Future<void> _create(
    String role, {
    String? teamId,
    String? squadId,
  }) async {
    try {
      final invite = await GamesApi.createInvite(
        widget.gameId,
        role: role,
        teamId: teamId,
        squadId: squadId,
      );
      _reload();
      if (!mounted) return;
      await _showQr(invite);
    } catch (e) {
      _showError(e);
    }
  }

  /// Montre le QR d'une invitation DÉJÀ créée, autant de fois qu'on veut.
  ///
  /// Il encode le code court et non le jeton : le jeton n'existe en base
  /// que sous forme d'empreinte (§7.2) et serait donc introuvable après
  /// coup. Le code, lui, se relit — c'est ce qui permet de ressortir son
  /// téléphone devant un joueur arrivé en retard.
  ///
  /// Plein écran et fond blanc : un QR se scanne d'autant mieux qu'il est
  /// grand et contrasté, et sur un parking en plein soleil ça compte plus
  /// que l'esthétique.
  Future<void> _showCodeQr(InviteView invite) async {
    if (invite.code.isEmpty) {
      _showError('Cette invitation n’a pas de code à montrer.');
      return;
    }
    final lien = '${AppConfig.apiBaseUrl.replaceFirst(RegExp(r'/v1/?$'), '')}'
        '/j/${invite.code}';

    await Navigator.of(context).push(
      MaterialPageRoute<void>(
        fullscreenDialog: true,
        builder: (pageContext) => Scaffold(
          backgroundColor: Colors.white,
          appBar: AppBar(
            backgroundColor: Colors.white,
            foregroundColor: Colors.black,
            title: Text(
              'À faire scanner — ${roleLabel(invite.role).toLowerCase()}',
              style: const TextStyle(fontSize: 16),
            ),
          ),
          body: SafeArea(
            child: Center(
              child: SingleChildScrollView(
                padding: const EdgeInsets.all(24),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    QrImageView(
                      data: lien,
                      size: 300,
                      backgroundColor: Colors.white,
                    ),
                    const SizedBox(height: 20),
                    // Le grade en clair : c'est ce qui dit lequel montrer
                    // à qui. Le code encodé, lui, reste opaque.
                    Text(
                      roleLabel(invite.role).toUpperCase(),
                      style: const TextStyle(
                        color: Colors.black,
                        fontSize: 22,
                        fontWeight: FontWeight.bold,
                        letterSpacing: 2,
                      ),
                    ),
                    const SizedBox(height: 16),
                    // Le même code écrit : qui n'arrive pas à scanner le
                    // tape. Les deux chemins mènent au même endroit.
                    const Text(
                      'ou saisir ce code :',
                      style: TextStyle(color: Colors.black54),
                    ),
                    const SizedBox(height: 4),
                    SelectableText(
                      invite.code,
                      style: const TextStyle(
                        color: Colors.black,
                        fontSize: 34,
                        fontWeight: FontWeight.w700,
                        letterSpacing: 4,
                        fontFamily: 'monospace',
                      ),
                    ),
                    const SizedBox(height: 24),
                    Text(
                      'Mettez la luminosité au maximum pour qu’il se scanne '
                      'au soleil.',
                      textAlign: TextAlign.center,
                      style: TextStyle(color: Colors.black.withValues(alpha: 0.5)),
                    ),
                    const SizedBox(height: 12),
                    TextButton.icon(
                      icon: const Icon(Icons.share, color: Colors.black),
                      label: const Text(
                        'Partager le code',
                        style: TextStyle(color: Colors.black),
                      ),
                      onPressed: () => SharePlus.instance.share(
                        ShareParams(
                          text: 'Rejoins « ${widget.gameName} » comme '
                              '${roleLabel(invite.role).toLowerCase()} — '
                              'code ${invite.code} ou $lien',
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
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
                    // On ne propose que ce qu'on peut réellement donner.
                    // Le serveur refuse d'inviter au-dessus de son propre
                    // grade ; afficher le bouton quand même ne servirait
                    // qu'à faire échouer le geste.
                    for (final role in _invitableRoles)
                      FilledButton.tonalIcon(
                        icon: const Icon(Icons.qr_code_2),
                        label: Text(roleLabel(role)),
                        onPressed: () => _create(role),
                      ),
                  ],
                ),
                if (_invitableRoles.isEmpty)
                  Text(
                    'Votre grade ne permet d’inviter personne.',
                    style: Theme.of(context).textTheme.bodySmall,
                  ),
                // Inviter DANS son groupe, et pas seulement dans la partie :
                // le scan place alors l'ami directement à côté de soi, sans
                // que personne ait à l'affecter ensuite.
                if (widget.mySquadId != null) ...[
                  const SizedBox(height: 16),
                  const Divider(height: 1),
                  const SizedBox(height: 12),
                  Text(
                    'Inviter dans mon unité',
                    style: Theme.of(context).textTheme.titleMedium,
                  ),
                  const SizedBox(height: 4),
                  Text(
                    'Le scan place directement dans '
                    '${widget.mySquadName ?? 'votre unité'} — rien à '
                    'affecter ensuite.',
                    style: Theme.of(context).textTheme.bodySmall,
                  ),
                  const SizedBox(height: 12),
                  FilledButton.icon(
                    icon: const Icon(Icons.group_add),
                    label: Text(
                      'QR pour ${widget.mySquadName ?? 'mon unité'}',
                    ),
                    onPressed: () => _create(
                      'joueur',
                      teamId: widget.myTeamId,
                      squadId: widget.mySquadId,
                    ),
                  ),
                ] else if (widget.myTeamId != null) ...[
                  const SizedBox(height: 16),
                  const Divider(height: 1),
                  const SizedBox(height: 12),
                  FilledButton.icon(
                    icon: const Icon(Icons.flag_outlined),
                    label: const Text('QR pour mon camp'),
                    onPressed: () =>
                        _create('joueur', teamId: widget.myTeamId),
                  ),
                ],
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
                        '${invite.code} · ${invite.stateLabel} · '
                        '${invite.usageLabel}',
                      ),
                      onTap: invite.active ? () => _showCodeQr(invite) : null,
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
