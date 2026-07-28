import 'package:flutter/material.dart';

import 'games_api.dart';
import 'models.dart';

/// Panneau des perks (§7.7). Deux règles d'interface imposées par le
/// cahier des charges : les perks dépendent des positions live, donc ils
/// sont GRISÉS hors connexion avec un message clair ; et tout ce qui
/// s'affiche (stock, recharge) vient du serveur, jamais d'un calcul local.
class PerksSheet extends StatefulWidget {
  const PerksSheet({
    super.key,
    required this.gameId,
    required this.online,
    required this.target,
  });

  final String gameId;
  final bool online;

  /// Zone visée : la position actuelle du joueur.
  final ({double lat, double lng})? target;

  @override
  State<PerksSheet> createState() => _PerksSheetState();
}

class _PerksSheetState extends State<PerksSheet> {
  late Future<List<PerkView>> _perks;
  String? _busy;
  String? _message;

  @override
  void initState() {
    super.initState();
    _perks = widget.online
        ? GamesApi.perks(widget.gameId)
        : Future.value(const []);
  }

  Future<void> _activate(PerkView perk) async {
    final target = widget.target;
    if (target == null) {
      setState(() => _message = 'Position inconnue : impossible de viser.');
      return;
    }
    setState(() {
      _busy = perk.id;
      _message = null;
    });
    try {
      final result = await GamesApi.activatePerk(
        widget.gameId,
        perk.id,
        lat: target.lat,
        lng: target.lng,
      );
      if (!mounted) return;
      setState(() {
        _busy = null;
        _message = result.type == 'drone'
            ? '${result.contacts.length} contact(s) révélé(s) — '
                'affichés sur la carte le temps du survol.'
            : '${result.jammed} drone(s) adverse(s) coupé(s).';
        _perks = GamesApi.perks(widget.gameId);
      });
      Navigator.pop(context, result);
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _busy = null;
        _message = e.toString();
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text('Perks', style: Theme.of(context).textTheme.titleLarge),
            const SizedBox(height: 4),
            if (!widget.online)
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: Theme.of(context).colorScheme.errorContainer,
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Text(
                  'Indisponible hors connexion : les perks dépendent des '
                  'positions en temps réel, arbitrées par le serveur.',
                  style: TextStyle(
                    color: Theme.of(context).colorScheme.onErrorContainer,
                  ),
                ),
              )
            else
              Text(
                'Le serveur calcule le résultat : ni le rayon ni les '
                'contacts ne sont décidés par le téléphone.',
                style: Theme.of(context).textTheme.bodySmall,
              ),
            if (_message != null)
              Padding(
                padding: const EdgeInsets.only(top: 8),
                child: Text(_message!),
              ),
            const SizedBox(height: 8),
            Flexible(
              child: FutureBuilder<List<PerkView>>(
                future: _perks,
                builder: (context, snap) {
                  if (!widget.online) return const SizedBox.shrink();
                  if (snap.hasError) {
                    return Text('${snap.error}');
                  }
                  if (!snap.hasData) {
                    return const Center(child: CircularProgressIndicator());
                  }
                  final perks = snap.data!;
                  if (perks.isEmpty) {
                    return const Padding(
                      padding: EdgeInsets.symmetric(vertical: 16),
                      child: Text('Aucun perk configuré pour cette partie.'),
                    );
                  }
                  return ListView(
                    shrinkWrap: true,
                    children: [
                      for (final perk in perks)
                        ListTile(
                          dense: true,
                          leading: Icon(
                            perk.type == 'drone'
                                ? Icons.flight
                                : Icons.wifi_tethering_off,
                          ),
                          title: Text(perk.label),
                          subtitle: Text(
                            '${perk.radiusMeters} m · ${perk.durationSeconds} s'
                            '${perk.remaining != null ? ' · ${perk.remaining} restant(s)' : ''}'
                            '${perk.availableAt != null ? ' · en recharge' : ''}',
                          ),
                          trailing: _busy == perk.id
                              ? const SizedBox(
                                  width: 20,
                                  height: 20,
                                  child: CircularProgressIndicator(
                                    strokeWidth: 2,
                                  ),
                                )
                              : FilledButton(
                                  onPressed: perk.ready
                                      ? () => _activate(perk)
                                      : null,
                                  child: const Text('Activer'),
                                ),
                        ),
                    ],
                  );
                },
              ),
            ),
          ],
        ),
      ),
    );
  }
}
