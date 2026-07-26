import 'dart:async';
import 'dart:math' show Point;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart' show rootBundle;
import 'package:geolocator/geolocator.dart';
import 'package:maplibre_gl/maplibre_gl.dart';
import 'package:uuid/uuid.dart';

import '../game/game_realtime.dart';
import '../game/games_api.dart';
import '../game/models.dart';
import '../game/object_sync.dart';
import '../offline/offline_sheet.dart';
import 'map_styles.dart';
import 'unit_icons.dart';
import 'unit_picker_sheet.dart';

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
  static const _markersSource = 'markers';
  static const _markersLayer = 'markers-icons';

  MapLibreMapController? _controller;
  MapBasemap _basemap = MapBasemap.osm;
  String? _styleJson;
  bool _styleReady = false;
  bool _locationGranted = false;

  GameRealtime? _realtime;
  ObjectSyncService? _syncService;
  bool _realtimeConnected = false;
  final Map<String, MemberView> _members = {};
  final Map<String, MapObjectView> _objects = {};
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
      _syncService = ObjectSyncService(widget.gameId!);
      _realtime = GameRealtime(
        gameId: widget.gameId!,
        onSnapshot: _onSnapshot,
        onMemberUpdate: _onMemberUpdate,
        onObjectUpsert: _onRemoteObjectUpsert,
        onConnectionChanged: (connected) {
          if (mounted) setState(() => _realtimeConnected = connected);
          // Retour du réseau → vidage de la file + delta (§7.6).
          if (connected) _kickSync();
        },
      )..connect();
      _loadObjects();
    }
  }

  /// Affichage depuis la base LOCALE d'abord (fonctionne en pleine forêt),
  /// puis tentative de synchro — jamais l'inverse (§2.3).
  Future<void> _loadObjects() async {
    final local = await _syncService!.loadLocal();
    if (!mounted) return;
    for (final o in local) {
      _applyObject(o, refresh: false);
    }
    _refreshMarkers();
    _kickSync();
  }

  /// Pousse la file d'attente puis tire le delta ; rafraîchit l'affichage
  /// (les marqueurs « en attente » redeviennent opaques une fois acceptés).
  Future<void> _kickSync() async {
    final sync = _syncService;
    if (sync == null) return;
    final ok = await sync.trySync();
    if (ok && mounted) {
      final local = await sync.loadLocal();
      if (!mounted) return;
      _objects.clear();
      for (final o in local) {
        _applyObject(o, refresh: false);
      }
      _refreshMarkers();
    }
  }

  /// Objet reçu du serveur (WebSocket) : persisté localement puis affiché.
  void _onRemoteObjectUpsert(MapObjectView object) {
    _syncService?.saveLocal(object, pending: false);
    _applyObject(object);
  }

  void _applyObject(MapObjectView object, {bool refresh = true}) {
    if (object.isDeleted) {
      _objects.remove(object.id);
    } else {
      _objects[object.id] = object;
    }
    if (refresh) _refreshMarkers();
  }

  @override
  void dispose() {
    _heartbeat?.cancel();
    _positionSub?.cancel();
    _realtime?.dispose();
    super.dispose();
  }

  /// Les alliés, hors soi-même, en ordre hiérarchique descendant (§5) :
  /// commandant, capitaines, chefs d'escouade, joueurs.
  List<MemberView> get _allies {
    final list = _members.values
        .where((m) => m.membershipId != _myMembershipId)
        .toList()
      ..sort((a, b) {
        final rank = roleRank(a.role) - roleRank(b.role);
        if (rank != 0) return rank;
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
                        for (final a in allies) _allyTile(a),
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

  /// Ligne d'un allié : insigne, grade, statut — et pour les gradés, les
  /// actions de commandement (le serveur revalide tout, §2.1).
  Widget _allyTile(MemberView a) {
    final me = _myMembershipId != null ? _members[_myMembershipId] : null;
    final myRank = me != null ? roleRank(me.role) : 9;
    final canBadge = myRank < roleRank(a.role);
    final canPromote = me?.role == 'commandant' && a.role != 'commandant';
    return ListTile(
      dense: true,
      leading: Image.asset(
        UnitIcons.assetKey('${a.unitType}_allied'),
        width: 36,
        height: 36,
        fit: BoxFit.contain,
        opacity: AlwaysStoppedAnimation(a.isConnected ? 1 : 0.4),
      ),
      title: Text(a.displayName),
      subtitle: Text(
        '${roleLabel(a.role)} · ${a.lifeStatus.label} · '
        '${a.isConnected ? 'en ligne' : 'hors ligne'}'
        '${a.lat == null ? ' · position inconnue' : ''}',
      ),
      trailing: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (a.lat != null)
            IconButton(
              tooltip: 'Centrer',
              icon: const Icon(Icons.center_focus_strong),
              onPressed: () {
                Navigator.pop(context);
                _controller?.animateCamera(
                  CameraUpdate.newLatLngZoom(LatLng(a.lat!, a.lng!), 15),
                );
              },
            ),
          if (canBadge || canPromote)
            PopupMenuButton<String>(
              tooltip: 'Commandement',
              icon: const Icon(Icons.military_tech),
              onSelected: (action) => _commandAction(a, action),
              itemBuilder: (_) => [
                if (canBadge)
                  const PopupMenuItem(
                    value: 'badge',
                    child: Text('Changer l’insigne'),
                  ),
                if (canPromote) ...[
                  if (a.role != 'capitaine')
                    const PopupMenuItem(
                      value: 'role:capitaine',
                      child: Text('Nommer capitaine'),
                    ),
                  if (a.role != 'chef_escouade')
                    const PopupMenuItem(
                      value: 'role:chef_escouade',
                      child: Text('Nommer chef d’escouade'),
                    ),
                  if (a.role != 'joueur')
                    const PopupMenuItem(
                      value: 'role:joueur',
                      child: Text('Rétrograder joueur'),
                    ),
                ],
              ],
            ),
        ],
      ),
    );
  }

  Future<void> _commandAction(MemberView target, String action) async {
    // Le panneau est fermé : il montre un instantané, la mise à jour
    // arrivera par le flux member:update.
    Navigator.pop(context);
    try {
      if (action == 'badge') {
        final unitType = await _pickUnitType();
        if (unitType == null) return;
        await GamesApi.updateMember(
          widget.gameId!,
          target.membershipId,
          unitType: unitType.slug,
        );
        _showSnack('Insigne de ${target.displayName} : ${unitType.label}');
      } else if (action.startsWith('role:')) {
        final role = action.substring('role:'.length);
        await GamesApi.updateMember(
          widget.gameId!,
          target.membershipId,
          role: role,
        );
        _showSnack('${target.displayName} : ${roleLabel(role)}');
      }
    } catch (e) {
      _showSnack(e.toString(), isError: true);
    }
  }

  /// Grille des 13 insignes alliés.
  Future<UnitType?> _pickUnitType() {
    return showDialog<UnitType>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Choisir l’insigne'),
        content: SizedBox(
          width: 320,
          child: GridView.builder(
            shrinkWrap: true,
            gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
              crossAxisCount: 4,
              mainAxisSpacing: 8,
              crossAxisSpacing: 8,
              childAspectRatio: 0.8,
            ),
            itemCount: UnitType.values.length,
            itemBuilder: (context, i) {
              final type = UnitType.values[i];
              return InkWell(
                borderRadius: BorderRadius.circular(8),
                onTap: () => Navigator.pop(dialogContext, type),
                child: Column(
                  children: [
                    Expanded(
                      child: Image.asset(
                        UnitIcons.assetKey(
                          UnitIcons.iconId(type, UnitAffiliation.allied),
                        ),
                        fit: BoxFit.contain,
                      ),
                    ),
                    Text(
                      type.label,
                      style: Theme.of(context).textTheme.labelSmall,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ],
                ),
              );
            },
          ),
        ),
      ),
    );
  }

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
      // Pack d'icônes d'unités : enregistré dans le style (assets embarqués,
      // donc disponible hors ligne, aucune police requise).
      for (final iconId in UnitIcons.allIconIds) {
        final bytes = await rootBundle.load(UnitIcons.assetKey(iconId));
        await controller.addImage(iconId, bytes.buffer.asUint8List());
      }
      await controller.addGeoJsonSource(_markersSource, _markersGeoJson());
      // Icône du marqueur + heure de pose en petit dessous (le style déclare
      // un endpoint `glyphs` pour le texte ; mis en cache comme les tuiles).
      await controller.addSymbolLayer(
        _markersSource,
        _markersLayer,
        const SymbolLayerProperties(
          iconImage: ['get', 'icon'],
          iconSize: 0.16,
          iconAllowOverlap: true,
          iconOpacity: ['get', 'opacity'],
          textField: ['get', 'time'],
          textFont: ['Open Sans Semibold'],
          textSize: 11,
          textAnchor: 'top',
          textOffset: [0, 1.9],
          textColor: '#ffffff',
          textHaloColor: '#000000',
          textHaloWidth: 1.2,
          textAllowOverlap: true,
          textOptional: true,
          textOpacity: ['get', 'opacity'],
        ),
      );
      // Alliés : insigne d'unité (bleu APP-6) + pastille de statut dessous.
      await controller.addGeoJsonSource(_alliesSource, _alliesGeoJson());
      await controller.addCircleLayer(
        _alliesSource,
        'allies-status',
        CircleLayerProperties(
          circleRadius: 5,
          circleColor: ['get', 'color'],
          circleOpacity: ['get', 'opacity'],
          circleStrokeWidth: 1.5,
          circleStrokeColor: '#ffffff',
          circleStrokeOpacity: ['get', 'opacity'],
          circleTranslate: [0, 22],
        ),
      );
      await controller.addSymbolLayer(
        _alliesSource,
        'allies-icons',
        const SymbolLayerProperties(
          iconImage: ['get', 'icon'],
          iconSize: 0.13,
          iconAllowOverlap: true,
          iconOpacity: ['get', 'opacity'],
        ),
      );
      _styleReady = true;
      _refreshAllies();
      _refreshMarkers();
    } catch (e) {
      debugPrint('couches carte indisponibles: $e');
    }
  }

  static String _timeLabel(DateTime t) {
    final local = t.toLocal();
    return '${local.hour.toString().padLeft(2, '0')}h'
        '${local.minute.toString().padLeft(2, '0')}';
  }

  Map<String, dynamic> _markersGeoJson() => {
        'type': 'FeatureCollection',
        'features': [
          for (final o in _objects.values)
            {
              'type': 'Feature',
              'id': o.id,
              'geometry': {
                'type': 'Point',
                'coordinates': [o.lng, o.lat],
              },
              'properties': {
                'icon': o.icon ?? 'infantry_unknown',
                // Heure de POSE (horloge de l'auteur, §7.6) — pas de réception.
                'time': _timeLabel(o.createdAt),
                // Translucide tant que le serveur n'a pas accepté l'objet.
                'opacity': o.pending ? 0.55 : 1.0,
              },
            },
        ],
      };

  void _refreshMarkers() {
    final controller = _controller;
    if (controller == null || !_styleReady) return;
    controller.setGeoJsonSource(_markersSource, _markersGeoJson());
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
          // Insigne d'unité (bleu allié) — défaut infanterie, command pour
          // le commandant, modifiable par les gradés (§5).
          'icon': '${m.unitType}_allied',
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

  /// Appui long : pose d'un marqueur d'unité à l'endroit visé (§ Phase 2).
  Future<void> _onMapLongClick(Point<double> point, LatLng latLng) async {
    if (!_inGame) return;
    final choice = await showModalBottomSheet<UnitChoice>(
      context: context,
      showDragHandle: true,
      builder: (_) => const UnitPickerSheet(),
    );
    if (choice == null || !mounted) return;

    final object = MapObjectView(
      // UUID v7 côté client (§7.6) : idempotent à la resynchronisation.
      id: const Uuid().v7(),
      kind: 'marker',
      markerType: 'unit',
      lat: latLng.latitude,
      lng: latLng.longitude,
      properties: {
        'icon': UnitIcons.iconId(choice.type, choice.affiliation),
        'unitLabel': '${choice.type.label} — ${choice.affiliation.label}',
      },
      authorMembershipId: _myMembershipId ?? '',
      createdAt: DateTime.now(),
      deletedAt: null,
      pending: true,
    );
    // Offline-first (§7.6) : enregistré localement et affiché IMMÉDIATEMENT
    // (translucide = en attente), puis la file part vers le serveur dès que
    // le réseau le permet. Jamais d'erreur, jamais de perte.
    await _syncService!.saveLocal(object, pending: true);
    _applyObject(object);
    _kickSync();
  }

  /// Tap sur un marqueur : détail + suppression (auteur ou ORGA).
  void _onFeatureTap(
    Point<double> point,
    LatLng coordinates,
    String id,
    String layerId,
    Annotation? annotation,
  ) {
    if (layerId != _markersLayer) return;
    final object = _objects[id];
    if (object == null) return;
    final me = _myMembershipId != null ? _members[_myMembershipId] : null;
    final canDelete = object.authorMembershipId == _myMembershipId ||
        me?.role == 'commandant';
    final author = _members[object.authorMembershipId];
    showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      builder: (sheetContext) => SafeArea(
        child: ListTile(
          leading: object.icon != null
              ? Image.asset(
                  UnitIcons.assetKey(object.icon!),
                  width: 40,
                  height: 40,
                  fit: BoxFit.contain,
                )
              : const Icon(Icons.place),
          title: Text(
            (object.properties['unitLabel'] as String?) ?? 'Marqueur',
          ),
          subtitle: Text(
            'posé par ${author?.displayName ?? 'un allié'}',
          ),
          trailing: canDelete
              ? IconButton(
                  tooltip: 'Supprimer',
                  icon: const Icon(Icons.delete_outline),
                  onPressed: () async {
                    Navigator.pop(sheetContext);
                    // Tombstone local en attente : part à la reconnexion.
                    final deleted = MapObjectView(
                      id: object.id,
                      kind: object.kind,
                      markerType: object.markerType,
                      lat: object.lat,
                      lng: object.lng,
                      properties: object.properties,
                      authorMembershipId: object.authorMembershipId,
                      createdAt: object.createdAt,
                      deletedAt: DateTime.now(),
                      pending: true,
                    );
                    await _syncService!.saveLocal(deleted, pending: true);
                    _applyObject(deleted);
                    _kickSync();
                  },
                )
              : null,
        ),
      ),
    );
  }

  void _showSnack(String text, {bool isError = false}) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(text),
        backgroundColor:
            isError ? Theme.of(context).colorScheme.error : null,
      ),
    );
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
              onMapCreated: (c) {
                _controller = c;
                c.onFeatureTapped.add(_onFeatureTap);
              },
              onStyleLoadedCallback: _onStyleLoaded,
              onMapLongClick: _onMapLongClick,
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
