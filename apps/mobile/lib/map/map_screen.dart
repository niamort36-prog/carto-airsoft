import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart' show rootBundle;
import 'package:geolocator/geolocator.dart';
import 'package:maplibre_gl/maplibre_gl.dart';

import '../game/game_realtime.dart';
import '../game/models.dart';
import '../offline/offline_sheet.dart';
import 'map_styles.dart';

/// Écran carte. Sans [gameId] : carte libre (fonds + offline).
/// Avec [gameId] : partie en cours — alliés en temps réel, statut de vie,
/// envoi de sa position, indicateur hors-ligne (§2.3, §2.4, §7.3, §7.5).
class MapScreen extends StatefulWidget {
  const MapScreen({super.key, this.gameId, this.gameName});

  final String? gameId;
  final String? gameName;

  @override
  State<MapScreen> createState() => _MapScreenState();
}

class _MapScreenState extends State<MapScreen> {
  static const _alliesSource = 'allies';

  MapLibreMapController? _controller;
  MapBasemap _basemap = MapBasemap.osm;
  String? _styleJson;
  bool _styleReady = false;
  bool _locationGranted = false;

  GameRealtime? _realtime;
  bool _realtimeConnected = false;
  final Map<String, MemberView> _members = {};
  String? _myMembershipId;
  LifeStatus _myStatus = LifeStatus.alive;
  StreamSubscription<Position>? _positionSub;
  Timer? _heartbeat;
  Position? _lastPosition;

  bool get _inGame => widget.gameId != null;

  // Vue initiale : France entière, en attendant le premier fix GPS.
  static const _initialCamera = CameraPosition(
    target: LatLng(46.6, 2.4),
    zoom: 5.0,
  );

  @override
  void initState() {
    super.initState();
    _loadStyle();
    _requestLocation();
    if (_inGame) {
      _realtime = GameRealtime(
        gameId: widget.gameId!,
        onSnapshot: _onSnapshot,
        onMemberUpdate: _onMemberUpdate,
        onConnectionChanged: (connected) {
          if (mounted) setState(() => _realtimeConnected = connected);
        },
      )..connect();
    }
  }

  @override
  void dispose() {
    _heartbeat?.cancel();
    _positionSub?.cancel();
    _realtime?.dispose();
    super.dispose();
  }

  /// Les alliés, hors soi-même, triés : connectés d'abord.
  List<MemberView> get _allies {
    final list = _members.values
        .where((m) => m.membershipId != _myMembershipId)
        .toList()
      ..sort((a, b) {
        if (a.isConnected != b.isConnected) return a.isConnected ? -1 : 1;
        return a.displayName.compareTo(b.displayName);
      });
    return list;
  }

  /// Style depuis les assets embarqués : aucun réseau requis, la carte
  /// s'ouvre aussi en pleine forêt (tuiles via le cache hors-ligne).
  Future<void> _loadStyle() async {
    final json = await rootBundle.loadString(_basemap.assetKey);
    if (mounted) {
      setState(() {
        _styleJson = json;
        _styleReady = false;
      });
    }
  }

  void _onSnapshot(List<MemberView> members, String myMembershipId) {
    if (!mounted) return;
    setState(() {
      _members
        ..clear()
        ..addEntries(members.map((m) => MapEntry(m.membershipId, m)));
      _myMembershipId = myMembershipId;
      final me = _members[myMembershipId];
      if (me != null) _myStatus = me.lifeStatus;
    });
    _refreshAllies();
  }

  void _onMemberUpdate(MemberView member) {
    if (!mounted) return;
    setState(() {
      _members[member.membershipId] = member;
      if (member.membershipId == _myMembershipId) {
        _myStatus = member.lifeStatus;
      }
    });
    _refreshAllies();
  }

  Future<void> _requestLocation() async {
    // Géolocalisation refusée ou indisponible → la carte reste utilisable
    // (principe offline-first : jamais un blocage, une dégradation claire).
    if (!await Geolocator.isLocationServiceEnabled()) return;
    var permission = await Geolocator.checkPermission();
    if (permission == LocationPermission.denied) {
      permission = await Geolocator.requestPermission();
    }
    if (permission == LocationPermission.denied ||
        permission == LocationPermission.deniedForever) {
      return;
    }
    if (mounted) setState(() => _locationGranted = true);

    if (_inGame && _positionSub == null) {
      // Envoi de sa position tant que l'écran est ouvert. Le suivi écran
      // éteint (service de premier plan Android, §9) est un jalon dédié.
      _positionSub = Geolocator.getPositionStream(
        locationSettings: const LocationSettings(
          accuracy: LocationAccuracy.high,
          distanceFilter: 5,
        ),
      ).listen(
        (pos) {
          _lastPosition = pos;
          _realtime?.sendPosition(pos.latitude, pos.longitude);
        },
        onError: (_) {},
      );
      // Réémission périodique : à l'arrêt le flux GPS ne produit rien, or les
      // alliés doivent voir une position fraîche (et non « il y a 12 min »).
      // 10 s = compromis batterie/précision (§9), réglable par partie plus tard.
      _heartbeat ??= Timer.periodic(const Duration(seconds: 10), (_) {
        final p = _lastPosition;
        if (p != null) _realtime?.sendPosition(p.latitude, p.longitude);
      });
    }

    try {
      final pos = await Geolocator.getCurrentPosition();
      _lastPosition = pos;
      _realtime?.sendPosition(pos.latitude, pos.longitude);
      await _controller?.animateCamera(
        CameraUpdate.newLatLngZoom(LatLng(pos.latitude, pos.longitude), 15),
      );
    } catch (_) {
      // Pas de fix GPS (intérieur…) : on reste sur la vue courante.
    }
  }

  /// Liste des alliés : qui est là, dans quel état, à quand remonte sa position.
  void _showAllies() {
    showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      builder: (_) {
        final allies = _allies;
        return SafeArea(
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text('Alliés', style: Theme.of(context).textTheme.titleLarge),
                const SizedBox(height: 8),
                if (allies.isEmpty)
                  const Padding(
                    padding: EdgeInsets.symmetric(vertical: 16),
                    child: Text(
                      'Personne d’autre n’a encore rejoint cette partie.',
                    ),
                  )
                else
                  Flexible(
                    child: ListView(
                      shrinkWrap: true,
                      children: [
                        for (final a in allies)
                          ListTile(
                            dense: true,
                            leading: Icon(
                              Icons.circle,
                              size: 14,
                              color: _statusColor(a.lifeStatus)
                                  .withValues(alpha: a.isConnected ? 1 : 0.4),
                            ),
                            title: Text(a.displayName),
                            subtitle: Text(
                              '${a.lifeStatus.label} · '
                              '${a.isConnected ? 'en ligne' : 'hors ligne'}'
                              '${a.lat == null ? ' · position inconnue' : ''}',
                            ),
                            trailing: a.lat == null
                                ? null
                                : IconButton(
                                    tooltip: 'Centrer',
                                    icon: const Icon(Icons.center_focus_strong),
                                    onPressed: () {
                                      Navigator.pop(context);
                                      _controller?.animateCamera(
                                        CameraUpdate.newLatLngZoom(
                                          LatLng(a.lat!, a.lng!),
                                          15,
                                        ),
                                      );
                                    },
                                  ),
                          ),
                      ],
                    ),
                  ),
              ],
            ),
          ),
        );
      },
    );
  }

  static Color _statusColor(LifeStatus s) => switch (s) {
        LifeStatus.alive => const Color(0xFF4CAF50),
        LifeStatus.dead => const Color(0xFF9E9E9E),
        LifeStatus.medicNeeded => const Color(0xFFF44336),
        LifeStatus.support => const Color(0xFF2196F3),
      };

  /// (Re)crée la couche des alliés — appelé à chaque chargement de style,
  /// car un changement de fond repart d'un style vierge.
  ///
  /// Pas de libellé texte sur la carte : une couche `symbol` avec du texte
  /// exige une police (`glyphs`) téléchargée en ligne, incompatible avec
  /// l'usage hors-ligne. Les noms sont dans le panneau « Alliés » ; les
  /// icônes d'unité (pack fourni) viendront via `addImage`, sans police.
  Future<void> _onStyleLoaded() async {
    final controller = _controller;
    if (controller == null) return;
    try {
      await controller.addGeoJsonSource(_alliesSource, _alliesGeoJson());
      await controller.addCircleLayer(
        _alliesSource,
        'allies-circles',
        CircleLayerProperties(
          circleRadius: 10,
          circleColor: ['get', 'color'],
          circleOpacity: ['get', 'opacity'],
          circleStrokeWidth: 3,
          circleStrokeColor: '#ffffff',
          circleStrokeOpacity: ['get', 'opacity'],
        ),
      );
      _styleReady = true;
      _refreshAllies();
    } catch (e) {
      debugPrint('couche alliés indisponible: $e');
    }
  }

  Map<String, dynamic> _alliesGeoJson() {
    final features = <Map<String, dynamic>>[];
    for (final m in _members.values) {
      if (m.membershipId == _myMembershipId) continue; // moi = point bleu natif
      if (m.lat == null || m.lng == null) continue;
      features.add({
        'type': 'Feature',
        'geometry': {
          'type': 'Point',
          'coordinates': [m.lng, m.lat],
        },
        'properties': {
          'name': m.displayName,
          'color':
              '#${_statusColor(m.lifeStatus).toARGB32().toRadixString(16).substring(2)}',
          // Estompé quand hors ligne (§2.4) : visible, mais visiblement daté.
          'opacity': m.isConnected ? 1.0 : 0.35,
        },
      });
    }
    return {'type': 'FeatureCollection', 'features': features};
  }

  void _refreshAllies() {
    final controller = _controller;
    if (controller == null || !_styleReady) return;
    controller.setGeoJsonSource(_alliesSource, _alliesGeoJson());
  }

  Future<void> _openOfflineSheet() async {
    final controller = _controller;
    if (controller == null) return;
    final bounds = await controller.getVisibleRegion();
    if (!mounted) return;
    await showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      builder: (_) => OfflineSheet(bounds: bounds, basemap: _basemap),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(widget.gameName ?? 'Carte libre'),
        actions: [
          if (_inGame)
            Padding(
              padding: const EdgeInsets.only(right: 4),
              child: ActionChip(
                avatar: Icon(
                  _realtimeConnected ? Icons.people : Icons.cloud_off,
                  size: 18,
                ),
                label: Text('${_allies.length}'),
                tooltip: 'Alliés dans la partie',
                onPressed: _showAllies,
              ),
            ),
          IconButton(
            tooltip: 'Cartes hors-ligne',
            icon: const Icon(Icons.download_for_offline_outlined),
            onPressed: _openOfflineSheet,
          ),
        ],
      ),
      body: Stack(
        children: [
          // Pas de `key` dépendant du fond : le plugin change le style en
          // place (setStyle) et conserve la position de la caméra.
          if (_styleJson == null)
            const Center(child: CircularProgressIndicator())
          else
            MapLibreMap(
              styleString: _styleJson!,
              initialCameraPosition: _initialCamera,
              myLocationEnabled: _locationGranted,
              onMapCreated: (c) => _controller = c,
              onStyleLoadedCallback: _onStyleLoaded,
            ),
          if (_inGame && !_realtimeConnected)
            Positioned(
              top: 0,
              left: 0,
              right: 0,
              child: Container(
                color: Colors.orange.shade900,
                padding:
                    const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                child: const Text(
                  'Hors ligne — dernières positions connues',
                  textAlign: TextAlign.center,
                  style: TextStyle(fontWeight: FontWeight.bold),
                ),
              ),
            ),
          Positioned(
            left: 0,
            right: 0,
            bottom: 16,
            // Défilement horizontal : sur écran étroit les libellés restent
            // tous atteignables au lieu d'être rognés par le bouton flottant.
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                if (_inGame)
                  _bottomBar(
                    child: SegmentedButton<LifeStatus>(
                      showSelectedIcon: false,
                      style: _compact,
                      segments: [
                        for (final s in LifeStatus.values)
                          ButtonSegment(value: s, label: Text(s.label)),
                      ],
                      selected: {_myStatus},
                      onSelectionChanged: (sel) {
                        setState(() => _myStatus = sel.first);
                        _realtime?.sendStatus(sel.first);
                      },
                    ),
                  ),
                _bottomBar(
                  child: SegmentedButton<MapBasemap>(
                    showSelectedIcon: false,
                    style: _compact,
                    segments: [
                      for (final m in MapBasemap.values)
                        ButtonSegment(value: m, label: Text(m.label)),
                    ],
                    selected: {_basemap},
                    onSelectionChanged: (s) {
                      setState(() => _basemap = s.first);
                      _loadStyle();
                    },
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
      // Remonté au-dessus des sélecteurs du bas.
      floatingActionButton: Padding(
        padding: EdgeInsets.only(bottom: _inGame ? 104 : 56),
        child: FloatingActionButton(
          tooltip: 'Ma position',
          onPressed: _requestLocation,
          child: const Icon(Icons.my_location),
        ),
      ),
    );
  }

  static const _compact =
      ButtonStyle(visualDensity: VisualDensity.compact);

  Widget _bottomBar({required Widget child}) => Padding(
        padding: const EdgeInsets.only(bottom: 8),
        child: SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          padding: const EdgeInsets.symmetric(horizontal: 12),
          child: child,
        ),
      );
}
