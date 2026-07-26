import 'package:flutter/material.dart';
import 'package:maplibre_gl/maplibre_gl.dart';

import '../map/map_styles.dart';
import 'offline_service.dart';

/// Panneau « Cartes hors-ligne » : télécharger la zone affichée,
/// consulter et supprimer les zones déjà téléchargées.
class OfflineSheet extends StatefulWidget {
  const OfflineSheet({
    super.key,
    required this.bounds,
    required this.basemap,
  });

  /// Zone actuellement visible à l'écran.
  final LatLngBounds bounds;
  final MapBasemap basemap;

  @override
  State<OfflineSheet> createState() => _OfflineSheetState();
}

class _OfflineSheetState extends State<OfflineSheet> {
  double? _progress;
  String? _error;
  late Future<List<OfflineRegion>> _regions;

  @override
  void initState() {
    super.initState();
    _regions = OfflineMapService.listRegions();
  }

  Future<void> _download() async {
    setState(() {
      _progress = 0;
      _error = null;
    });
    final now = DateTime.now();
    final label =
        '${widget.basemap.label} — ${now.day.toString().padLeft(2, '0')}/'
        '${now.month.toString().padLeft(2, '0')} '
        '${now.hour.toString().padLeft(2, '0')}h${now.minute.toString().padLeft(2, '0')}';
    try {
      await OfflineMapService.downloadRegion(
        basemap: widget.basemap,
        bounds: widget.bounds,
        label: label,
        onProgress: (p) {
          if (mounted) setState(() => _progress = p);
        },
      );
      if (mounted) {
        setState(() {
          _progress = null;
          _regions = OfflineMapService.listRegions();
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _progress = null;
          _error = 'Échec du téléchargement — vérifiez le réseau.';
        });
      }
    }
  }

  Future<void> _delete(int id) async {
    await OfflineMapService.deleteRegion(id);
    if (mounted) {
      setState(() => _regions = OfflineMapService.listRegions());
    }
  }

  @override
  Widget build(BuildContext context) {
    final downloading = _progress != null;
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              'Cartes hors-ligne',
              style: Theme.of(context).textTheme.titleLarge,
            ),
            const SizedBox(height: 4),
            Text(
              'Téléchargez la zone affichée pour l’utiliser en forêt sans réseau '
              '(zooms ${OfflineMapService.minZoom.toInt()} à ${OfflineMapService.maxZoom.toInt()}).',
              style: Theme.of(context).textTheme.bodySmall,
            ),
            const SizedBox(height: 12),
            if (downloading) ...[
              LinearProgressIndicator(value: (_progress ?? 0) / 100),
              const SizedBox(height: 4),
              Text('${(_progress ?? 0).toStringAsFixed(0)} %'),
            ] else
              FilledButton.icon(
                icon: const Icon(Icons.download),
                label: Text(
                    'Télécharger la zone affichée (${widget.basemap.label})'),
                onPressed: _download,
              ),
            if (_error != null)
              Padding(
                padding: const EdgeInsets.only(top: 8),
                child: Text(
                  _error!,
                  style: TextStyle(color: Theme.of(context).colorScheme.error),
                ),
              ),
            const Divider(height: 24),
            Flexible(
              child: FutureBuilder<List<OfflineRegion>>(
                future: _regions,
                builder: (context, snap) {
                  if (!snap.hasData) {
                    return const Padding(
                      padding: EdgeInsets.all(8),
                      child: Center(child: CircularProgressIndicator()),
                    );
                  }
                  final regions = snap.data!;
                  if (regions.isEmpty) {
                    return const Padding(
                      padding: EdgeInsets.all(8),
                      child: Text('Aucune zone téléchargée pour l’instant.'),
                    );
                  }
                  return ListView(
                    shrinkWrap: true,
                    children: [
                      for (final r in regions)
                        ListTile(
                          dense: true,
                          leading: const Icon(Icons.map),
                          title: Text(
                              (r.metadata['label'] as String?) ?? 'Zone ${r.id}'),
                          trailing: IconButton(
                            tooltip: 'Supprimer',
                            icon: const Icon(Icons.delete_outline),
                            onPressed:
                                downloading ? null : () => _delete(r.id),
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
