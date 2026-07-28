import 'package:flutter/material.dart';
import 'package:mobile_scanner/mobile_scanner.dart';

import 'games_api.dart';

/// Scan d'un QR d'invitation (§7.2). L'app ne fait que transmettre le jeton
/// lu : elle n'en connaît ni la partie ni le rôle, c'est le serveur qui
/// tranche. Un repli par saisie manuelle permet de rejoindre sans caméra.
class ScanScreen extends StatefulWidget {
  const ScanScreen({super.key});

  @override
  State<ScanScreen> createState() => _ScanScreenState();
}

class _ScanScreenState extends State<ScanScreen> {
  final MobileScannerController _controller = MobileScannerController(
    detectionSpeed: DetectionSpeed.noDuplicates,
    formats: const [BarcodeFormat.qrCode],
  );
  bool _handling = false;
  String? _error;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _submit(String token) async {
    if (_handling) return;
    setState(() {
      _handling = true;
      _error = null;
    });
    try {
      final outcome = await GamesApi.scan(token);
      if (!mounted) return;
      Navigator.pop(context, outcome);
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _handling = false;
        _error = _humanError(e);
      });
    }
  }

  /// Les refus du serveur doivent être compréhensibles sur le terrain.
  String _humanError(Object e) {
    if (e is GamesApiException) {
      return switch (e.statusCode) {
        404 => 'QR inconnu — vérifiez auprès de l’organisateur.',
        // 410 couvre aussi « objectif déjà tenu » et « bonus épuisé ».
        410 => e.message,
        _ => e.message,
      };
    }
    return 'Serveur injoignable — rejoindre exige du réseau.';
  }

  Future<void> _manualEntry() async {
    final controller = TextEditingController();
    final token = await showDialog<String>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Saisir le lien'),
        content: TextField(
          controller: controller,
          autofocus: true,
          decoration: const InputDecoration(
            labelText: 'Lien ou code d’invitation',
            hintText: 'https://…/j/…',
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext),
            child: const Text('Annuler'),
          ),
          FilledButton(
            onPressed: () =>
                Navigator.pop(dialogContext, controller.text.trim()),
            child: const Text('Rejoindre'),
          ),
        ],
      ),
    );
    if (token != null && token.isNotEmpty) await _submit(token);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Scanner un QR'),
        actions: [
          IconButton(
            tooltip: 'Torche',
            icon: const Icon(Icons.flashlight_on),
            onPressed: () => _controller.toggleTorch(),
          ),
          IconButton(
            tooltip: 'Saisir le lien',
            icon: const Icon(Icons.keyboard),
            onPressed: _manualEntry,
          ),
        ],
      ),
      body: Stack(
        alignment: Alignment.center,
        children: [
          MobileScanner(
            controller: _controller,
            onDetect: (capture) {
              final value = capture.barcodes.firstOrNull?.rawValue;
              if (value != null && value.isNotEmpty) _submit(value);
            },
            errorBuilder: (context, error) => _cameraUnavailable(error),
          ),
          // Viseur.
          IgnorePointer(
            child: Container(
              width: 240,
              height: 240,
              decoration: BoxDecoration(
                border: Border.all(color: Colors.white70, width: 3),
                borderRadius: BorderRadius.circular(16),
              ),
            ),
          ),
          if (_handling) const CircularProgressIndicator(),
          Positioned(
            left: 16,
            right: 16,
            bottom: 32,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                if (_error != null)
                  Container(
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: Theme.of(context).colorScheme.errorContainer,
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Text(
                      _error!,
                      textAlign: TextAlign.center,
                      style: TextStyle(
                        color: Theme.of(context).colorScheme.onErrorContainer,
                      ),
                    ),
                  ),
                const SizedBox(height: 12),
                Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 12,
                    vertical: 8,
                  ),
                  decoration: BoxDecoration(
                    color: Colors.black54,
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: const Text(
                    'Invitation, drapeau à capturer ou bonus :\n'
                    'le serveur reconnaît le QR et arbitre.',
                    textAlign: TextAlign.center,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  /// Caméra refusée ou indisponible : on reste utile via la saisie manuelle.
  Widget _cameraUnavailable(Object error) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.no_photography, size: 48),
            const SizedBox(height: 12),
            const Text(
              'Caméra indisponible.\n'
              'Vous pouvez coller le lien d’invitation à la place.',
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 16),
            FilledButton.icon(
              icon: const Icon(Icons.keyboard),
              label: const Text('Saisir le lien'),
              onPressed: _manualEntry,
            ),
          ],
        ),
      ),
    );
  }
}
