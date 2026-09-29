import 'dart:async';
import 'dart:math' as math;
import 'dart:math' show Point;

import 'package:battery_plus/battery_plus.dart';
import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter/foundation.dart'
    show TargetPlatform, defaultTargetPlatform, kIsWeb;
import 'package:flutter/material.dart';
import 'package:flutter/services.dart' show rootBundle;
import 'package:flutter_compass/flutter_compass.dart';
import 'package:geolocator/geolocator.dart';
import 'package:maplibre_gl/maplibre_gl.dart';
import 'package:permission_handler/permission_handler.dart';
import 'package:uuid/uuid.dart';

import '../game/chat_screen.dart';
import '../game/chat_sync.dart';
import '../game/game_realtime.dart';
import '../game/games_api.dart';
import '../game/models.dart';
import '../game/object_sync.dart';
import '../game/perks_sheet.dart';
import '../game/tracking_mode.dart';
import '../offline/offline_sheet.dart';
import 'elevation.dart';
import 'command_tree.dart';
import 'command_tree_view.dart';
import 'grid_ref.dart';
import 'hud.dart';
import 'map_styles.dart';
import 'squad_grouping.dart';
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
  static const _markersSource = 'markers';
  static const _markersLayer = 'markers-icons';
  static const _drawingsSource = 'drawings';
  static const _draftSource = 'draft';
  static const _objectivesSource = 'objectives';
  static const _dronesSource = 'drones';

  /// Tailles d'icônes interpolées sur le zoom : toujours visibles de loin,
  /// confortables de près.
  static const _markerIconSize = [
    'interpolate', ['linear'], ['zoom'],
    8, 0.10, 12, 0.17, 16, 0.26,
  ];

  MapLibreMapController? _controller;
  MapBasemap _basemap = MapBasemap.osm;
  String? _styleJson;
  bool _styleReady = false;
  bool _locationGranted = false;

  GameRealtime? _realtime;
  ObjectSyncService? _syncService;
  bool _realtimeConnected = false;

  /// Mes permissions dans cette partie (§5) — chargées du serveur, jamais
  /// déduites du grade côté téléphone.
  List<String> _myPermissions = const [];
  bool _can(String permission) => _myPermissions.contains(permission);

  /// Noms des équipes et escouades, pour grouper et étiqueter les alliés.
  Map<String, String> _unitNames = const {};

  /// Étiquettes libres des escouades (fréquence radio du réseau), par
  /// identifiant d'escouade — peintes à côté du marqueur de groupe.
  Map<String, String> _squadNotes = const {};

  /// Escouades de la partie avec leurs rattachements — ce qui permet de
  /// dresser l'organigramme (§5).
  List<SquadSummary> _squads = const [];

  /// Drapeaux de la partie (§7.8) et scores.
  List<ObjectiveView> _objectives = const [];
  List<TeamScore> _scores = const [];

  /// Contacts révélés par un drone (§7.7) — effacés à la fin du survol :
  /// ils n'ont aucune persistance, c'est le principe même du perk.
  List<RevealedContact> _contacts = const [];
  Timer? _contactsExpiry;

  /// Heure du survol qui a révélé les contacts en cours.
  DateTime _contactsAt = DateTime.now();

  /// Drones en vol, le sien comme celui d'en face. On voit passer le drone
  /// adverse (et sa zone), mais jamais ce qu'il a vu.
  final List<DroneOverflight> _drones = [];

  /// Anime la rotation du drone autour de sa zone.
  Timer? _droneTicker;
  double _droneAngle = 0;
  final Map<String, MemberView> _members = {};
  final Map<String, MapObjectView> _objects = {};
  String? _myMembershipId;
  LifeStatus _myStatus = LifeStatus.alive;
  StreamSubscription<Position>? _positionSub;
  Timer? _heartbeat;
  Position? _lastPosition;
  TrackingMode _trackingMode = TrackingMode.balanced;

  // — Bandeau d'état et habillage (§ mise en page) —————————————————
  final Battery _battery = Battery();
  int? _batteryLevel;
  bool _batteryCharging = false;
  Timer? _clockTicker;
  String _clock = '--:--';
  StreamSubscription<CompassEvent>? _compassSub;
  double? _heading;
  StreamSubscription<List<ConnectivityResult>>? _connectivitySub;
  bool _networkOnline = true;

  /// Menu d'outils déplié, et point actuellement visé.
  bool _railExpanded = false;
  GuidanceTarget? _guidance;

  /// Altitude du terrain sous mes pieds, même référence que celle du point
  /// visé — c'est ce qui rend le dénivelé annoncé honnête.
  double? _myElevation;

  /// Mode dessin (§ Phase 2) : chaque tap ajoute un sommet.
  bool _drawing = false;
  final List<LatLng> _draftPoints = [];

  /// Motif habillant le prochain tracé (id d'icône de la famille « Dessin »),
  /// ou null pour un trait uni.
  String? _drawPattern;

  /// Zoom courant : décide du repli des escouades (voir [layoutAllies]).
  double _zoom = 15;

  /// Avertissement navigateur, refermable pour la session.
  bool _webNoticeDismissed = false;

  /// Images « symbole + heure » déjà enregistrées dans le style.
  final Set<String> _stampedIcons = {};

  /// Icônes du pack déjà enregistrées dans le style (variantes comprises).
  final Set<String> _registeredIcons = {};

  /// Icône d'amorçage des sources de symboles (voir [_seeded]).
  static const _seedIcon = 'infantry_hostile';

  /// MapLibre Native n'affiche jamais le contenu d'une source GeoJSON créée
  /// vide : la couche est bien là, mais elle reste muette même quand les
  /// données arrivent. On amorce donc chaque source avec une géométrie
  /// dégénérée de chaque type, au large du golfe de Guinée (0°, 0°) et en
  /// opacité nulle — invisible en jeu, remplacée dès la première donnée.
  static Map<String, dynamic> _seeded(Map<String, dynamic> collection) {
    if ((collection['features'] as List).isNotEmpty) return collection;
    const properties = {
      'icon': _seedIcon,
      'opacity': 0.0,
      'patternOpacity': 0.0,
      'fillOpacity': 0.0,
      'bearing': 0.0,
      'label': '',
      'pattern': '',
      'color': '#000000',
    };
    return {
      'type': 'FeatureCollection',
      'features': [
        {
          'type': 'Feature',
          'geometry': {
            'type': 'Point',
            'coordinates': [0.0, 0.0],
          },
          'properties': properties,
        },
        {
          'type': 'Feature',
          'geometry': {
            'type': 'LineString',
            'coordinates': [
              [0.0, 0.0],
              [0.0, 0.0],
            ],
          },
          'properties': properties,
        },
        {
          'type': 'Feature',
          'geometry': {
            'type': 'Polygon',
            'coordinates': [
              [
                [0.0, 0.0],
                [0.0, 0.0],
                [0.0, 0.0],
                [0.0, 0.0],
              ],
            ],
          },
          'properties': properties,
        },
      ],
    };
  }

  /// Marqueur en cours de repositionnement : le prochain tap le déplace.
  MapObjectView? _moving;

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
    _startStatusBar();
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
      )
        ..onPerkEvent = _onPerkEvent
        ..onMemberLeft = _onMemberLeft
        ..connect();
      _loadObjects();
      _loadPermissions();
    }
  }

  /// Alimente le bandeau : horloge, batterie, boussole, réseau. Tout est
  /// local — le bandeau reste exact même sans la moindre couverture.
  void _startStatusBar() {
    void tickClock() {
      final now = DateTime.now();
      final label = '${now.hour.toString().padLeft(2, '0')}:'
          '${now.minute.toString().padLeft(2, '0')}';
      if (label != _clock && mounted) setState(() => _clock = label);
    }

    tickClock();
    var ticks = 0;
    _clockTicker = Timer.periodic(const Duration(seconds: 5), (_) {
      tickClock();
      // La batterie ne bouge pas à la seconde : une lecture sur six suffit
      // et épargne autant d'allers-retours vers la plateforme.
      if (ticks++ % 6 == 0) _refreshBattery();
    });
    _refreshBattery();

    // Boussole : le cap du boîtier, pas la route suivie — c'est celui-là
    // qu'on lit en s'orientant, à l'arrêt comme en mouvement. Le greffon
    // n'a pas d'implémentation navigateur : sur le web le bandeau affiche
    // « --- », ce qui vaut mieux qu'un cap inventé.
    _compassSub = kIsWeb
        ? null
        : FlutterCompass.events?.listen((event) {
            final heading = event.heading;
            if (heading == null || !mounted) return;
            final normalized = (heading % 360 + 360) % 360;
            // Seuil : évite de reconstruire le bandeau à chaque
            // micro-oscillation.
            if (_heading != null && (normalized - _heading!).abs() < 2) {
              return;
            }
            setState(() => _heading = normalized);
          });

    _connectivitySub = Connectivity().onConnectivityChanged.listen((results) {
      final online =
          results.any((r) => r != ConnectivityResult.none);
      if (mounted && online != _networkOnline) {
        setState(() => _networkOnline = online);
      }
    });
    Connectivity().checkConnectivity().then((results) {
      final online = results.any((r) => r != ConnectivityResult.none);
      if (mounted) setState(() => _networkOnline = online);
    });
  }

  Future<void> _refreshBattery() async {
    try {
      final level = await _battery.batteryLevel;
      final state = await _battery.batteryState;
      if (!mounted) return;
      final charging = state == BatteryState.charging ||
          state == BatteryState.full;
      if (level != _batteryLevel || charging != _batteryCharging) {
        setState(() {
          _batteryLevel = level;
          _batteryCharging = charging;
        });
      }
    } catch (_) {
      // Certaines ROM refusent la lecture : le bandeau affiche « -- ».
    }
  }

  Future<void> _loadPermissions() async {
    try {
      final perms = await GamesApi.myPermissions(widget.gameId!);
      final org = await GamesApi.organisation(widget.gameId!);
      final flags = await GamesApi.objectives(widget.gameId!);
      final scores = await GamesApi.scores(widget.gameId!);
      if (mounted) {
        setState(() {
          _myPermissions = perms;
          _unitNames = org.names;
          _squadNotes = org.notes;
          _squads = org.squads;
          _objectives = flags;
          _scores = scores;
        });
        _refreshObjectives();
      }
    } catch (_) {
      // Hors réseau : aucune action de commandement n'est possible de toute
      // façon (elles exigent l'arbitre), on reste sur une liste vide.
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
    _contactsExpiry?.cancel();
    _droneTicker?.cancel();
    _clockTicker?.cancel();
    _positionSub?.cancel();
    _compassSub?.cancel();
    _connectivitySub?.cancel();
    _realtime?.dispose();
    super.dispose();
  }

  /// Ouvre les perks. La disponibilité réelle vient du serveur ; hors
  /// connexion le panneau l'annonce clairement (§7.7).
  Future<void> _openPerks() async {
    final pos = _lastPosition;
    final result = await showModalBottomSheet<PerkActivation>(
      context: context,
      showDragHandle: true,
      builder: (_) => PerksSheet(
        gameId: widget.gameId!,
        online: _realtimeConnected,
        target: pos == null
            ? null
            : (lat: pos.latitude, lng: pos.longitude),
      ),
    );
    if (result == null || !mounted) return;
    if (result.type == 'drone') {
      _showContacts(result.contacts, result.endsAt);
    }
    _showSnack(
      result.type == 'drone'
          ? '${result.contacts.length} contact(s) révélé(s)'
          : '${result.jammed} drone(s) adverse(s) coupé(s)',
    );
  }

  /// Affiche les contacts le temps du survol, puis les efface : rien de ce
  /// que le drone a vu ne subsiste sur le téléphone.
  void _showContacts(List<RevealedContact> contacts, DateTime endsAt) {
    _contactsExpiry?.cancel();
    // Heure du survol, figée : c'est l'instant de la détection qui compte.
    _contactsAt = DateTime.now();
    setState(() => _contacts = contacts);
    _refreshObjectives();
    final remaining = endsAt.difference(DateTime.now());
    _contactsExpiry = Timer(
      remaining.isNegative ? const Duration(seconds: 1) : remaining,
      () {
        if (!mounted) return;
        setState(() => _contacts = const []);
        _refreshObjectives();
      },
    );
  }

  /// Un drone décolle — le nôtre ou celui d'en face. On affiche sa zone et
  /// l'appareil qui la survole ; ce qu'il observe reste à son camp.
  void _onPerkEvent(Map<String, dynamic> event) {
    if (event['kind'] != 'perk:activated' || event['type'] != 'drone') return;
    final endsAt = DateTime.tryParse(event['endsAt'] as String? ?? '');
    final lat = (event['lat'] as num?)?.toDouble();
    final lng = (event['lng'] as num?)?.toDouble();
    if (endsAt == null || lat == null || lng == null) return;

    final me = _myMembershipId != null ? _members[_myMembershipId] : null;
    final drone = DroneOverflight(
      instanceId: event['instanceId'] as String? ?? '$lat/$lng',
      lat: lat,
      lng: lng,
      radiusMeters: (event['radiusMeters'] as num?)?.toInt() ?? 300,
      endsAt: endsAt,
      friendly: me?.teamId != null && event['teamId'] == me!.teamId,
    );
    setState(() {
      _drones
        ..removeWhere((d) => d.instanceId == drone.instanceId || d.expired)
        ..add(drone);
    });
    _startDroneTicker();
    if (!drone.friendly) {
      _showSnack('Drone ennemi en approche !');
    }
  }

  /// Fait tourner l'appareil autour de sa zone tant qu'un drone est en vol.
  void _startDroneTicker() {
    _droneTicker ??= Timer.periodic(const Duration(milliseconds: 250), (_) {
      if (!mounted) return;
      _drones.removeWhere((d) => d.expired);
      _droneAngle = (_droneAngle + 9) % 360;
      _refreshDrones();
      if (_drones.isEmpty) {
        _droneTicker?.cancel();
        _droneTicker = null;
      }
    });
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
    // Mémorisé pour l'usage hors réseau (messagerie, marqueurs).
    ChatSyncService.rememberMembership(widget.gameId!, myMembershipId);
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

  /// Un allié a quitté : il disparaît de la liste et de la carte sans
  /// attendre une reconnexion.
  void _onMemberLeft(String membershipId) {
    // Mon propre départ m'est aussi diffusé : inutile de me l'annoncer.
    if (!mounted ||
        membershipId == _myMembershipId ||
        !_members.containsKey(membershipId)) {
      return;
    }
    final gone = _members[membershipId]!;
    setState(() => _members.remove(membershipId));
    // La visée en cours vers lui n'a plus d'objet.
    if (_guidance?.label == gone.displayName) {
      setState(() => _guidance = null);
    }
    _refreshAllies();
    _showSnack('${gone.displayName} a quitté la partie');
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

    if (_inGame) {
      await _startTracking();
    }

    try {
      final pos = await Geolocator.getCurrentPosition();
      _lastPosition = pos;
      _realtime?.sendPosition(pos.latitude, pos.longitude);
      _refreshAllies();
      _refreshMyElevation(pos);
      await _controller?.animateCamera(
        CameraUpdate.newLatLngZoom(LatLng(pos.latitude, pos.longitude), 15),
      );
    } catch (_) {
      // Pas de fix GPS (intérieur…) : on reste sur la vue courante.
    }
  }

  /// Démarre (ou redémarre) le suivi de position (§9). Écran éteint, chaque
  /// système a son moyen : service de premier plan et notification sur
  /// Android, mode d'arrière-plan `location` sur iOS — voir
  /// [TrackingMode.toLocationSettings].
  Future<void> _startTracking() async {
    await _positionSub?.cancel();
    _heartbeat?.cancel();

    // Android 13+ : sans cette autorisation la notification du service est
    // masquée — or c'est elle qui rend le suivi visible et fiable (§9).
    // iOS n'a pas de service de premier plan : lui demander la permission
    // de notifier ne servirait qu'à afficher une invite sans objet.
    if (!kIsWeb &&
        defaultTargetPlatform == TargetPlatform.android &&
        await Permission.notification.isDenied) {
      await Permission.notification.request();
    }

    _positionSub = Geolocator.getPositionStream(
      locationSettings: _trackingMode.toLocationSettings(),
    ).listen(
      (pos) {
        _lastPosition = pos;
        _realtime?.sendPosition(pos.latitude, pos.longitude);
        _refreshAllies(); // met aussi à jour mon insigne sur la carte
        _refreshMyElevation(pos);
      },
      onError: (_) {},
    );
    // Réémission périodique : à l'arrêt le flux GPS ne produit rien, or les
    // alliés doivent voir une position fraîche (et non « il y a 12 min »).
    _heartbeat = Timer.periodic(
      Duration(seconds: _trackingMode.intervalSeconds),
      (_) {
        final p = _lastPosition;
        if (p != null) _realtime?.sendPosition(p.latitude, p.longitude);
      },
    );
  }

  /// Altitude du terrain sous ma position. Volontairement lue dans les
  /// mêmes tuiles que celle du point visé : le dénivelé annoncé compare
  /// alors deux mesures de même nature.
  Future<void> _refreshMyElevation(Position pos) async {
    final elevation =
        await ElevationService.instance.at(pos.latitude, pos.longitude);
    if (!mounted || elevation == null) return;
    setState(() => _myElevation = elevation);
  }

  /// Vise un point : la boîte translucide s'ouvre et se met à jour au fil
  /// de mes déplacements.
  Future<void> _guideTo(String label, double lat, double lng) async {
    setState(() {
      _guidance = GuidanceTarget(label: label, lat: lat, lng: lng);
    });
    final elevation = await ElevationService.instance.at(lat, lng);
    if (!mounted || elevation == null) return;
    final current = _guidance;
    if (current == null || current.lat != lat || current.lng != lng) return;
    setState(() {
      _guidance = GuidanceTarget(
        label: label,
        lat: lat,
        lng: lng,
        elevation: elevation,
      );
    });
  }

  /// Choix du compromis batterie/précision (§9), appliqué immédiatement.
  Future<void> _pickTrackingMode() async {
    final chosen = await showModalBottomSheet<TrackingMode>(
      context: context,
      showDragHandle: true,
      builder: (sheetContext) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 4),
              child: Text(
                'Suivi de position',
                style: Theme.of(context).textTheme.titleLarge,
              ),
            ),
            const Padding(
              padding: EdgeInsets.fromLTRB(16, 0, 16, 8),
              child: Text(
                'Le GPS continu est le premier poste de batterie. '
                'Le suivi reste actif écran éteint tant que la notification '
                'est présente.',
              ),
            ),
            for (final mode in TrackingMode.values)
              ListTile(
                leading: Icon(
                  mode == _trackingMode
                      ? Icons.radio_button_checked
                      : Icons.radio_button_unchecked,
                ),
                title: Text(mode.label),
                subtitle: Text(mode.hint),
                onTap: () => Navigator.pop(sheetContext, mode),
              ),
          ],
        ),
      ),
    );
    if (chosen == null || chosen == _trackingMode) return;
    setState(() => _trackingMode = chosen);
    await _startTracking();
    _showSnack('Suivi : ${chosen.label} (${chosen.hint})');
  }

  /// Vue retenue dans le panneau des alliés — elle survit à la fermeture du
  /// panneau : qui consulte l'organigramme y revient d'ordinaire.
  bool _vueOrganigramme = false;

  /// Panneau des alliés, sous deux angles : la LISTE dit qui est là et
  /// permet d'agir ; l'ORGANIGRAMME dit qui commande qui. La première
  /// répond à « qui joue ? », le second à « à qui je passe cet ordre ».
  void _showAllies() {
    showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      isScrollControlled: true,
      builder: (sheetContext) => StatefulBuilder(
        builder: (sheetContext, setSheetState) {
          final allies = _allies;
          final moi = _myMembershipId != null ? _members[_myMembershipId] : null;
          return SafeArea(
            child: ConstrainedBox(
              // L'arbre a besoin de hauteur pour se lire ; la liste s'y
              // adapte sans y être contrainte.
              constraints: BoxConstraints(
                maxHeight: MediaQuery.of(sheetContext).size.height * 0.8,
              ),
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Text('Alliés',
                        style: Theme.of(sheetContext).textTheme.titleLarge),
                    const SizedBox(height: 8),
                    SegmentedButton<bool>(
                      showSelectedIcon: false,
                      style: const ButtonStyle(
                        visualDensity: VisualDensity.compact,
                      ),
                      segments: const [
                        ButtonSegment(
                          value: false,
                          icon: Icon(Icons.list, size: 18),
                          label: Text('Liste'),
                        ),
                        ButtonSegment(
                          value: true,
                          icon: Icon(Icons.account_tree_outlined, size: 18),
                          label: Text('Organigramme'),
                        ),
                      ],
                      selected: {_vueOrganigramme},
                      onSelectionChanged: (choix) {
                        setState(() => _vueOrganigramme = choix.first);
                        setSheetState(() {});
                      },
                    ),
                    const SizedBox(height: 8),
                    if (_vueOrganigramme)
                      Flexible(
                        child: CommandTreeView(
                          tree: buildCommandTree(
                            members: _members.values,
                            squads: _squads,
                          ),
                          myMembershipId: _myMembershipId,
                          onTapMember: (m) {
                            if (m.lat == null) return;
                            Navigator.pop(sheetContext);
                            _controller?.animateCamera(
                              CameraUpdate.newLatLngZoom(
                                LatLng(m.lat!, m.lng!),
                                15,
                              ),
                            );
                          },
                        ),
                      )
                    else ...[
                      if (moi != null) _myTile(moi),
                      const Divider(height: 8),
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
                            children: _groupedAllies(allies),
                          ),
                        ),
                    ],
                  ],
                ),
              ),
            ),
          );
        },
      ),
    );
  }

  /// Alliés groupés par escouade (§4), l'ordre hiérarchique étant conservé
  /// à l'intérieur de chaque groupe. Les non-affectés ferment la liste.
  List<Widget> _groupedAllies(List<MemberView> allies) {
    final groups = <String?, List<MemberView>>{};
    for (final a in allies) {
      groups.putIfAbsent(a.squadId, () => []).add(a);
    }
    // Escouades nommées d'abord, « sans escouade » à la fin.
    final keys = groups.keys.toList()
      ..sort((a, b) {
        if (a == null) return 1;
        if (b == null) return -1;
        return (_unitNames[a] ?? '').compareTo(_unitNames[b] ?? '');
      });

    final widgets = <Widget>[];
    for (final key in keys) {
      // Pas d'en-tête si la partie n'a aucune escouade : inutile de titrer.
      if (keys.length > 1 || key != null) {
        widgets.add(
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
            child: Text(
              key == null
                  ? 'Sans escouade'
                  : (_unitNames[key] ?? 'Escouade').toUpperCase(),
              style: Theme.of(context).textTheme.labelSmall?.copyWith(
                    fontWeight: FontWeight.bold,
                    letterSpacing: 1.2,
                  ),
            ),
          ),
        );
      }
      widgets.addAll(groups[key]!.map(_allyTile));
    }
    return widgets;
  }

  /// Ma propre ligne : mon insigne, mon grade — et le bouton pour choisir
  /// mon insigne (autorisé pour tous sur soi-même, validé serveur).
  Widget _myTile(MemberView me) {
    return ListTile(
      dense: true,
      leading: Image.asset(
        UnitIcons.assetKey('${me.unitType}_allied'),
        width: 36,
        height: 36,
        fit: BoxFit.contain,
      ),
      title: Text('${me.displayName} (moi)'),
      subtitle: Text('${roleLabel(me.role)} · ${me.lifeStatus.label}'),
      // L'insigne se mérite : sans la permission, on le reçoit de sa hiérarchie.
      trailing: !_can(Perm.membersBadge)
          ? null
          : IconButton(
        tooltip: 'Choisir mon insigne',
        icon: const Icon(Icons.edit),
        onPressed: () async {
          Navigator.pop(context);
          final unitType = await _pickUnitType();
          if (unitType == null) return;
          try {
            await GamesApi.updateMember(
              widget.gameId!,
              me.membershipId,
              unitType: unitType.slug,
            );
            _showSnack('Mon insigne : ${unitType.label}');
          } catch (e) {
            _showSnack(e.toString(), isError: true);
          }
        },
      ),
    );
  }

  /// Ligne d'un allié : insigne, grade, statut — et pour les gradés, les
  /// actions de commandement (le serveur revalide tout, §2.1).
  Widget _allyTile(MemberView a) {
    final me = _myMembershipId != null ? _members[_myMembershipId] : null;
    final myRank = me != null ? roleRank(me.role) : 9;
    // Permission (capacité) ET hiérarchie (portée) : le serveur applique
    // exactement les deux, l'interface les reflète.
    final canBadge = _can(Perm.membersBadge) && myRank < roleRank(a.role);
    final canPromote =
        _can(Perm.membersPromote) && a.role != 'commandant';
    // Composer un groupe est borné comme le reste : la permission dit quoi,
    // le grade dit sur qui (§5).
    final canOrganise = _can(Perm.squadsManage) && myRank < roleRank(a.role);
    // L'étiquette (fréquence radio, indicatif) suit la portée de l'insigne,
    // avec une exception : la sienne, on l'écrit toujours soi-même.
    final canLabel = a.membershipId == _myMembershipId || canBadge;
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
              tooltip: 'Diriger vers',
              icon: const Icon(Icons.navigation_outlined),
              onPressed: () {
                Navigator.pop(context);
                _guideTo(a.displayName, a.lat!, a.lng!);
              },
            ),
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
          if (canBadge || canPromote || canOrganise || canLabel)
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
                if (canLabel)
                  PopupMenuItem(
                    value: 'note',
                    child: Text(
                      (a.note?.trim() ?? '').isEmpty
                          ? 'Ajouter une étiquette'
                          : 'Modifier l’étiquette',
                    ),
                  ),
                if (canOrganise) ...[
                  const PopupMenuItem(
                    value: 'squad',
                    child: Text('Affecter a une escouade'),
                  ),
                  if (a.squadId != null)
                    const PopupMenuItem(
                      value: 'squad:none',
                      child: Text('Retirer de son escouade'),
                    ),
                  if (a.reportsToMembershipId != _myMembershipId)
                    const PopupMenuItem(
                      value: 'reports:me',
                      child: Text('Prendre sous mes ordres'),
                    )
                  else
                    const PopupMenuItem(
                      value: 'reports:none',
                      child: Text('Ne plus l’avoir sous mes ordres'),
                    ),
                ],
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
      } else if (action == 'note') {
        final note = await _askNote(
          'Étiquette de ${target.displayName}',
          target.note,
        );
        if (note == null) return;
        await GamesApi.updateMember(
          widget.gameId!,
          target.membershipId,
          note: note.trim(),
        );
        _showSnack(
          note.trim().isEmpty
              ? 'Étiquette de ${target.displayName} effacée'
              : '${target.displayName} : ${note.trim()}',
        );
      } else if (action.startsWith('role:')) {
        final role = action.substring('role:'.length);
        await GamesApi.updateMember(
          widget.gameId!,
          target.membershipId,
          role: role,
        );
        _showSnack('${target.displayName} : ${roleLabel(role)}');
      } else if (action == 'squad') {
        await _assignToSquad(target);
      } else if (action == 'squad:none') {
        await GamesApi.assignMember(
          widget.gameId!,
          target.membershipId,
          squadId: null,
        );
        await _reloadOrganisation();
        _showSnack('${target.displayName} n’est plus en escouade');
      } else if (action == 'reports:me') {
        await GamesApi.assignMember(
          widget.gameId!,
          target.membershipId,
          reportsToMembershipId: _myMembershipId,
        );
        await _reloadOrganisation();
        _showSnack('${target.displayName} est sous vos ordres');
      } else if (action == 'reports:none') {
        await GamesApi.assignMember(
          widget.gameId!,
          target.membershipId,
          reportsToMembershipId: null,
        );
        await _reloadOrganisation();
        _showSnack('${target.displayName} n’est plus sous vos ordres');
      }
    } catch (e) {
      _showSnack(e.toString(), isError: true);
    }
  }

  /// Contenu d'une escouade repliée : qui la compose, et de quoi agir.
  void _showSquadSheet(SquadCluster cluster) {
    final hommes = [
      for (final id in cluster.members)
        if (_members[id] != null) _members[id]!,
    ]..sort((a, b) => roleRank(a.role) - roleRank(b.role));

    showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      builder: (sheetContext) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              leading: const Icon(Icons.groups, size: 32),
              title: Text(cluster.name),
              subtitle: Text(
                // L'échelon d'abord : c'est ce que dit la marque au-dessus
                // du cadre sur la carte.
                '${SymbolEchelon.forHeadcount(hommes.length)?.label ?? 'Groupe'}'
                ' · ${hommes.length} hommes · '
                '${hommes.where((m) => m.isConnected).length} en ligne'
                '${(cluster.note ?? '').isEmpty ? '' : ' · ${cluster.note}'}',
              ),
              trailing: IconButton(
                tooltip: 'Diriger vers le groupe',
                icon: const Icon(Icons.navigation_outlined),
                onPressed: () {
                  Navigator.pop(sheetContext);
                  _guideTo(cluster.name, cluster.lat, cluster.lng);
                },
              ),
            ),
            // Étiquette du réseau : elle appartient au groupe, pas à ses
            // hommes — le marqueur d'escouade la porte pour tous.
            if (_can(Perm.squadsManage))
              ListTile(
                dense: true,
                leading: const Icon(Icons.sell_outlined),
                title: Text(
                  (cluster.note ?? '').isEmpty
                      ? 'Ajouter une étiquette au groupe'
                      : 'Étiquette : ${cluster.note}',
                ),
                onTap: () {
                  Navigator.pop(sheetContext);
                  _changeSquadNote(cluster);
                },
              ),
            const Divider(height: 8),
            Flexible(
              child: ListView(
                shrinkWrap: true,
                children: [for (final m in hommes) _allyTile(m)],
              ),
            ),
          ],
        ),
      ),
    );
  }

  /// Pose ou efface l'étiquette d'une escouade (fréquence radio du réseau).
  Future<void> _changeSquadNote(SquadCluster cluster) async {
    final note = await _askNote('Étiquette de ${cluster.name}', cluster.note);
    if (note == null) return;
    try {
      await GamesApi.updateSquad(
        widget.gameId!,
        cluster.squadId,
        note: note.trim(),
      );
      await _reloadOrganisation();
      if (!mounted) return;
      _showSnack(
        note.trim().isEmpty
            ? 'Étiquette de ${cluster.name} effacée'
            : '${cluster.name} : ${note.trim()}',
      );
    } catch (e) {
      _showSnack(e.toString(), isError: true);
    }
  }

  /// Affecte un homme à une escouade de son camp, ou en forme une nouvelle
  /// dans la foulée — c'est le geste courant sur le terrain : on crée le
  /// groupe au moment où on y met quelqu'un.
  Future<void> _assignToSquad(MemberView target) async {
    final me = _myMembershipId != null ? _members[_myMembershipId] : null;
    // Le camp de la cible fait foi ; à défaut, le mien.
    final teamId = target.teamId ?? me?.teamId;
    if (teamId == null) {
      _showSnack('Affectez-le d’abord à un camp', isError: true);
      return;
    }

    final squads = await GamesApi.squadsOfTeam(widget.gameId!, teamId);
    if (!mounted) return;

    final choix = await showModalBottomSheet<String>(
      context: context,
      showDragHandle: true,
      builder: (sheetContext) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              title: Text('Escouade de ${target.displayName}'),
              subtitle: Text('Camp ${_unitNames[teamId] ?? ''}'),
            ),
            const Divider(height: 8),
            if (squads.isEmpty)
              const Padding(
                padding: EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                child: Text('Aucune escouade dans ce camp pour l’instant.'),
              ),
            for (final sq in squads)
              ListTile(
                dense: true,
                leading: Icon(
                  sq.id == target.squadId
                      ? Icons.radio_button_checked
                      : Icons.radio_button_unchecked,
                ),
                title: Text(sq.name),
                onTap: () => Navigator.pop(sheetContext, sq.id),
              ),
            const Divider(height: 8),
            ListTile(
              leading: const Icon(Icons.group_add),
              title: const Text('Former une nouvelle escouade'),
              onTap: () => Navigator.pop(sheetContext, 'new'),
            ),
          ],
        ),
      ),
    );
    if (choix == null || !mounted) return;

    var squadId = choix;
    if (choix == 'new') {
      final nom = await _askText('Nom de l’escouade', 'Alpha');
      if (nom == null || nom.trim().isEmpty) return;
      final squad =
          await GamesApi.createSquad(widget.gameId!, teamId, nom.trim());
      squadId = squad.id;
    }

    await GamesApi.assignMember(
      widget.gameId!,
      target.membershipId,
      squadId: squadId,
    );
    await _reloadOrganisation();
    if (!mounted) return;
    _showSnack('${target.displayName} → ${_unitNames[squadId] ?? 'escouade'}');
  }

  /// Recharge les noms d'équipes et d'escouades après une modification :
  /// c'est ce qui alimente les libellés et les marqueurs de groupe.
  Future<void> _reloadOrganisation() async {
    try {
      final org = await GamesApi.organisation(widget.gameId!);
      if (!mounted) return;
      setState(() {
        _unitNames = org.names;
        _squadNotes = org.notes;
        _squads = org.squads;
      });
      await _refreshMarkers();
    } catch (_) {
      // Hors ligne : les libellés déjà connus restent affichés.
    }
  }

  Future<String?> _askText(
    String title,
    String hint, {
    String? initial,
    String confirm = 'Créer',
    String? helper,
    int? maxLength,
  }) {
    final controller = TextEditingController(text: initial);
    return showDialog<String>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: Text(title),
        content: TextField(
          controller: controller,
          autofocus: true,
          maxLength: maxLength,
          decoration: InputDecoration(hintText: hint, helperText: helper),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext),
            child: const Text('Annuler'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(dialogContext, controller.text),
            child: Text(confirm),
          ),
        ],
      ),
    );
  }

  /// Saisie d'une étiquette : le texte peint à côté d'une icône. Volontairement
  /// court — au-delà d'une poignée de caractères il mange la carte au lieu de
  /// l'informer. Vider le champ efface l'étiquette.
  Future<String?> _askNote(String title, String? initial) => _askText(
        title,
        '446.00625',
        initial: initial,
        confirm: 'Appliquer',
        helper: 'Fréquence radio, indicatif… vide pour effacer',
        maxLength: 24,
      );

  /// Grille des insignes alliés, pour attribuer celui d'un joueur.
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
                          UnitIcons.iconId(
                            SymbolFamily.unit,
                            type.slug,
                            UnitAffiliation.allied,
                          ),
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
    // Changer de fond vide le style : les images sont à réenregistrer.
    _stampedIcons.clear();
    _registeredIcons.clear();
    try {
      // Seuls les motifs sont enregistrés d'emblée : les couches à
      // `line-pattern` les réclament dès leur création. Tout le reste est
      // enregistré à la demande (`_ensureIcons`) — inscrire le pack entier
      // gonflait l'atlas de sprites au point que certaines icônes ne se
      // dessinaient plus, et retardait l'affichage de plusieurs secondes.
      await _ensureIcons([...UnitIcons.patternIconIds, _seedIcon]);
      // Zones (remplissage translucide) et lignes — sous les marqueurs.
      await controller.addGeoJsonSource(
        _drawingsSource,
        _seeded(_drawingsGeoJson()),
      );
      await controller.addFillLayer(
        _drawingsSource,
        'drawings-fill',
        const FillLayerProperties(
          fillColor: ['get', 'color'],
          fillOpacity: ['get', 'fillOpacity'],
        ),
      );
      await controller.addLineLayer(
        _drawingsSource,
        'drawings-line',
        const LineLayerProperties(
          lineColor: ['get', 'color'],
          lineWidth: 3.0,
          lineOpacity: ['get', 'opacity'],
        ),
      );
      // Tracés à motif (barbelés, fortifié) : `line-pattern` n'accepte pas
      // d'expression sur toutes les plateformes, on déclare donc une couche
      // par motif, filtrée sur la propriété `pattern`.
      for (final id in UnitIcons.patternIconIds) {
        await controller.addLineLayer(
          _drawingsSource,
          'drawings-pattern-$id',
          LineLayerProperties(
            linePattern: id,
            lineWidth: 16.0,
            lineOpacity: const ['get', 'patternOpacity'],
          ),
          filter: ['==', ['get', 'pattern'], id],
        );
      }
      // Drapeaux (§7.8) : couleur du camp détenteur, gris si neutre.
      await controller.addGeoJsonSource(
        _objectivesSource,
        _seeded(_objectivesGeoJson()),
      );
      await controller.addCircleLayer(
        _objectivesSource,
        'objectives-circles',
        const CircleLayerProperties(
          circleRadius: 11,
          circleColor: ['get', 'color'],
          circleStrokeWidth: 3,
          circleStrokeColor: '#ffffff',
        ),
      );
      await controller.addSymbolLayer(
        _objectivesSource,
        'objectives-labels',
        const SymbolLayerProperties(
          textField: ['get', 'label'],
          textFont: ['Open Sans Semibold'],
          textSize: 11,
          textAnchor: 'top',
          textOffset: [0, 1.4],
          textColor: '#ffffff',
          textHaloColor: '#000000',
          textHaloWidth: 1.2,
          textAllowOverlap: true,
          textOptional: true,
        ),
      );
      // Zone survolée par un drone : cercle du rayon, couleur du camp.
      await controller.addGeoJsonSource(
        _dronesSource,
        _seeded(_dronesGeoJson()),
      );
      await controller.addFillLayer(
        _dronesSource,
        'drones-zone',
        const FillLayerProperties(
          fillColor: ['get', 'color'],
          fillOpacity: 0.10,
        ),
      );
      await controller.addLineLayer(
        _dronesSource,
        'drones-ring',
        const LineLayerProperties(
          lineColor: ['get', 'color'],
          lineWidth: 2,
          lineDasharray: [3, 2],
        ),
      );
      // Ajoutée en dernier des couches de données : les insignes se
      // lisent au-dessus des zones et des drapeaux, jamais dessous.
      await controller.addGeoJsonSource(
        _markersSource,
        _seeded(_markersGeoJson()),
      );
      // Symbole + heure de pose : l'heure fait partie de l'image (voir
      // `_ensureMarkerImages`), pas d'une couche de texte — aucun serveur de
      // polices n'est donc nécessaire, et le libellé survit au hors-ligne.
      await controller.addSymbolLayer(
        _markersSource,
        _markersLayer,
        const SymbolLayerProperties(
          iconImage: ['get', 'icon'],
          iconSize: _markerIconSize,
          iconAllowOverlap: true,
          iconOpacity: ['get', 'opacity'],
        ),
      );
      // Brouillon de dessin (pointillés blancs + sommets).
      await controller.addGeoJsonSource(_draftSource, _seeded(_draftGeoJson()));
      await controller.addLineLayer(
        _draftSource,
        'draft-line',
        const LineLayerProperties(
          lineColor: '#ffffff',
          lineWidth: 2.5,
          lineDasharray: [2, 1.5],
        ),
      );
      await controller.addCircleLayer(
        _draftSource,
        'draft-points',
        const CircleLayerProperties(
          circleRadius: 5,
          circleColor: '#ffffff',
          circleStrokeColor: '#000000',
          circleStrokeWidth: 1.5,
        ),
      );
      _styleReady = true;
      _refreshAllies();
      _refreshMarkers();
      _refreshObjectives();
      _refreshDrones();
    } catch (e) {
      debugPrint('couches carte indisponibles: $e');
    }
  }

  static String _timeLabel(DateTime t) {
    final local = t.toLocal();
    return '${local.hour.toString().padLeft(2, '0')}h'
        '${local.minute.toString().padLeft(2, '0')}';
  }

  /// Champs OTAN d'un marqueur posé : l'heure de pose en groupe date-heure
  /// (champ W, dans la couleur du camp), l'étiquette libre en information
  /// complémentaire (champ H), et « ENY » sur les symboles hostiles
  /// (champ N).
  SymbolFields _markerFields(MapObjectView o) {
    final icon = o.icon ?? 'infantry_unknown';
    final camp = UnitIcons.affiliationOf(icon);
    return SymbolFields(
      dtg: _timeLabel(o.createdAt),
      dtgColor: camp?.color ?? Colors.white,
      info: _markerNote(o),
      hostile: camp == UnitAffiliation.hostile,
    );
  }

  String _markerImageId(MapObjectView o) => UnitIcons.fieldedId(
        o.icon ?? 'infantry_unknown',
        _markerFields(o),
      );

  /// Étiquette libre posée sur un marqueur (fréquence radio, immatriculation
  /// d'un véhicule). Vide quand il n'y en a pas.
  static String _markerNote(MapObjectView o) =>
      ((o.properties['note'] as String?) ?? '').trim();

  /// Champs OTAN d'un allié : son étiquette en information complémentaire
  /// (champ H) et son escouade en formation supérieure (champ M).
  ///
  /// Les deux se complètent avec le repli des escouades : dézoomé, on voit
  /// le groupe ; zoomé, chaque homme dit de quel groupe il relève.
  SymbolFields _allyFields(MemberView m) => SymbolFields(
        info: m.note,
        higherFormation: m.squadId == null ? null : _unitNames[m.squadId],
      );

  /// Insigne d'un allié : sa variante à contour blanc, entourée de ses
  /// champs quand il en porte.
  String _allyIconId(MemberView m) => UnitIcons.fieldedId(
        '${m.unitType}_allied_outline',
        _allyFields(m),
      );

  /// Mon insigne, à contour blanc épais — remplace le point bleu en partie.
  String? get _selfIcon {
    final me = _myMembershipId != null ? _members[_myMembershipId] : null;
    if (!_inGame || me == null) return null;
    return UnitIcons.fieldedId('${me.unitType}_allied_self', _allyFields(me));
  }

  /// Champs OTAN d'un marqueur d'escouade : son nom en désignation propre
  /// (champ T, à gauche), son étiquette en information complémentaire
  /// (champ H, à droite) et son échelon au-dessus du cadre (champ B).
  SymbolFields _squadFields(SquadCluster g) => SymbolFields(
        designation: g.name,
        info: g.note,
        echelon: SymbolEchelon.forHeadcount(g.members.length),
      );

  /// Répartition des alliés au zoom courant : insignes individuels d'un
  /// côté, escouades repliées de l'autre. La règle est dans
  /// [layoutAllies], vérifiable sans carte.
  AlliesLayout get _alliesLayout => layoutAllies(
        members: _members.values,
        myMembershipId: _myMembershipId,
        zoom: _zoom,
        unitNames: _unitNames,
        squadNotes: _squadNotes,
      );

  /// Icône d'un contact révélé : son VRAI insigne, en rouge hostile.
  String _contactIcon(RevealedContact c) =>
      UnitIcons.isKnown('${c.unitType}_hostile')
          ? '${c.unitType}_hostile'
          : 'infantry_hostile';

  /// Un contact révélé est hostile par définition : heure du survol en
  /// champ W, « ENY » en champ N.
  SymbolFields _contactFields() => SymbolFields(
        dtg: _timeLabel(_contactsAt),
        dtgColor: UnitAffiliation.hostile.color,
        hostile: true,
      );

  String _contactImageId(RevealedContact c) =>
      UnitIcons.fieldedId(_contactIcon(c), _contactFields());

  /// Tous les symboles ponctuels de la carte partagent cette couche :
  /// marqueurs posés, alliés, mon propre insigne, contacts révélés par un
  /// drone et l'appareil lui-même. Les regrouper n'est pas un raccourci :
  /// le rendu natif laisse muette toute couche `symbol` dont la source a
  /// été créée vide, ce qui privait d'insignes les alliés et moi-même.
  Map<String, dynamic> _markersGeoJson() => {
        'type': 'FeatureCollection',
        'features': [
          // Marqueurs ponctuels — lignes/zones ont leur couche.
          for (final o in _objects.values.where((o) => o.kind == 'marker'))
            {
              'type': 'Feature',
              'id': o.id,
              'geometry': {
                'type': 'Point',
                'coordinates': [o.lng, o.lat],
              },
              'properties': {
                // Heure de POSE (horloge de l'auteur, §7.6) incluse dans
                // l'image — pas de réception.
                'icon': _markerImageId(o),
                // Translucide tant que le serveur n'a pas accepté l'objet.
                'opacity': o.pending ? 0.55 : 1.0,
              },
            },
          // Contacts révélés — éphémères, effacés à la fin du survol.
          for (final c in _contacts)
            {
              'type': 'Feature',
              'geometry': {
                'type': 'Point',
                'coordinates': [c.lng, c.lat],
              },
              'properties': {
                'icon': _contactImageId(c),
                'opacity': 1.0,
              },
            },
          // Alliés : insigne d'unité à contour blanc, estompé hors ligne
          // (§2.4 — on garde la dernière position connue). Trop dézoomé,
          // une escouade parle d'une seule voix.
          for (final m in _alliesLayout.individuals)
            {
              'type': 'Feature',
              'id': m.membershipId,
              'geometry': {
                'type': 'Point',
                'coordinates': [m.lng, m.lat],
              },
              'properties': {
                'icon': _allyIconId(m),
                'opacity': m.isConnected ? 1.0 : 0.35,
              },
            },
          for (final g in _alliesLayout.squads)
            {
              'type': 'Feature',
              'id': 'squad:${g.squadId}',
              'geometry': {
                'type': 'Point',
                'coordinates': [g.lng, g.lat],
              },
              'properties': {
                'icon': UnitIcons.squadId(
                  g.squadId,
                  g.members.length,
                  _squadFields(g),
                ),
                'opacity': g.anyConnected ? 1.0 : 0.35,
              },
            },
          // Moi : mon insigne, contour blanc épais.
          if (_selfIcon != null && _lastPosition != null)
            {
              'type': 'Feature',
              'geometry': {
                'type': 'Point',
                'coordinates': [
                  _lastPosition!.longitude,
                  _lastPosition!.latitude,
                ],
              },
              'properties': {'icon': _selfIcon!, 'opacity': 1.0},
            },
          // L'appareil en orbite sur le bord de sa zone.
          for (final d in _drones)
            () {
              final pos = _offset(d.lat, d.lng, d.radiusMeters * 0.75,
                  _droneAngle);
              return {
                'type': 'Feature',
                'geometry': {
                  'type': 'Point',
                  'coordinates': [pos.$2, pos.$1],
                },
                'properties': {
                  'icon': UnitIcons.rotatedId(
                    d.friendly ? UnitIcons.droneAllied : UnitIcons.droneHostile,
                    _droneAngle + 90,
                  ),
                  'opacity': 1.0,
                },
              };
            }(),
        ],
      };

  /// Enregistre à la demande les icônes du pack utilisées par une couche.
  /// Les suffixes `_outline` (contour blanc) et `_self` (contour épais) sont
  /// fabriqués à la volée à partir de l'icône de base.
  Future<void> _ensureIcons(Iterable<String> ids) async {
    final controller = _controller;
    if (controller == null) return;
    for (final id in ids) {
      if (id.isEmpty || !_registeredIcons.add(id)) continue;
      try {
        const outlineSuffix = '_outline';
        const selfSuffix = '_self';
        if (id.endsWith(outlineSuffix) || id.endsWith(selfSuffix)) {
          final outline = id.endsWith(outlineSuffix);
          final base = id.substring(
            0,
            id.length - (outline ? outlineSuffix.length : selfSuffix.length),
          );
          final png = (await rootBundle.load(UnitIcons.assetKey(base)))
              .buffer
              .asUint8List();
          await controller.addImage(
            id,
            await UnitIcons.outlinedPng(base, png, border: outline ? 8 : 22),
          );
        } else {
          final key = UnitIcons.perkIconIds.contains(id)
              ? UnitIcons.perkAssetKey(id)
              : UnitIcons.assetKey(id);
          final png = (await rootBundle.load(key)).buffer.asUint8List();
          await controller.addImage(id, await UnitIcons.normalizedPng(png));
        }
      } catch (e) {
        _registeredIcons.remove(id);
        debugPrint('icône indisponible : $id ($e)');
      }
    }
  }

  /// Fabrique et enregistre les images composées manquantes : « symbole +
  /// heure » pour les marqueurs et les contacts, symbole pivoté pour le
  /// drone. Une image par combinaison, gardée en cache pour la session.
  Future<void> _ensureMarkerImages() async {
    final controller = _controller;
    if (controller == null) return;
    // Instantané : les listes peuvent changer pendant les `await` ci-dessous.
    // Instantané : les listes peuvent changer pendant les `await` ci-dessous.
    final composes = <(String id, String icon, SymbolFields fields)>[
      for (final o in _objects.values)
        if (o.kind == 'marker')
          (_markerImageId(o), o.icon ?? 'infantry_unknown', _markerFields(o)),
      for (final c in _contacts)
        (_contactImageId(c), _contactIcon(c), _contactFields()),
    ];
    for (final (id, icon, fields) in composes) {
      if (!_stampedIcons.add(id)) continue;
      if (!UnitIcons.isKnown(icon)) {
        _stampedIcons.remove(id);
        continue;
      }
      final base = await rootBundle.load(UnitIcons.assetKey(icon));
      await controller.addImage(
        id,
        await UnitIcons.fieldedPng(base.buffer.asUint8List(), fields),
      );
    }

    // Marqueurs d'escouade : le cadre et son effectif, puis les champs
    // (nom, échelon, étiquette) autour. Une image par combinaison.
    for (final g in _alliesLayout.squads) {
      final id = UnitIcons.squadId(g.squadId, g.members.length, _squadFields(g));
      if (!_stampedIcons.add(id)) continue;
      await controller.addImage(
        id,
        await UnitIcons.fieldedPng(
          await UnitIcons.squadFramePng(g.members.length),
          _squadFields(g),
        ),
      );
    }

    // Insignes des alliés et le mien : variantes à contour blanc. Ceux qui
    // portent des champs sont composés juste après — `_ensureIcons` ne sait
    // fabriquer que les symboles nus.
    final me = _myMembershipId != null ? _members[_myMembershipId] : null;
    await _ensureIcons([
      for (final m in _members.values)
        if (m.membershipId != _myMembershipId && _allyFields(m).isEmpty)
          '${m.unitType}_allied_outline',
      if (me != null && _allyFields(me).isEmpty) ?_selfIcon,
    ]);

    // Alliés porteurs de champs : le contour blanc d'abord, les champs
    // autour ensuite. Une image par couple insigne + champs.
    final entoures = <(String id, String base, double border, SymbolFields f)>[
      for (final m in _members.values)
        if (!_allyFields(m).isEmpty)
          (
            m.membershipId == _myMembershipId
                ? UnitIcons.fieldedId(
                    '${m.unitType}_allied_self',
                    _allyFields(m),
                  )
                : _allyIconId(m),
            '${m.unitType}_allied',
            m.membershipId == _myMembershipId ? 22.0 : 8.0,
            _allyFields(m),
          ),
    ];
    for (final (id, base, border, fields) in entoures) {
      if (!_stampedIcons.add(id)) continue;
      try {
        final png =
            (await rootBundle.load(UnitIcons.assetKey(base))).buffer
                .asUint8List();
        await controller.addImage(
          id,
          await UnitIcons.fieldedPng(
            await UnitIcons.outlinedPng(base, png, border: border),
            fields,
          ),
        );
      } catch (e) {
        _stampedIcons.remove(id);
        debugPrint('champs indisponibles : $id ($e)');
      }
    }

    // Le drone : une image par pas de cap, fabriquée une seule fois.
    for (final d in [..._drones]) {
      final icon =
          d.friendly ? UnitIcons.droneAllied : UnitIcons.droneHostile;
      final id = UnitIcons.rotatedId(icon, _droneAngle + 90);
      if (!_stampedIcons.add(id)) continue;
      final base = await rootBundle.load(UnitIcons.perkAssetKey(icon));
      await controller.addImage(
        id,
        await UnitIcons.rotatedPng(
          base.buffer.asUint8List(),
          UnitIcons.quantizeBearing(_droneAngle + 90).toDouble(),
        ),
      );
    }
  }

  Future<void> _refreshMarkers() async {
    final controller = _controller;
    if (controller == null || !_styleReady) return;
    await _ensureMarkerImages();
    if (!mounted) return;
    controller.setGeoJsonSource(_markersSource, _markersGeoJson());
    controller.setGeoJsonSource(_drawingsSource, _drawingsGeoJson());
  }

  Map<String, dynamic> _objectivesGeoJson() => {
        'type': 'FeatureCollection',
        'features': [
          for (final o in _objectives)
            {
              'type': 'Feature',
              'id': o.id,
              'geometry': {
                'type': 'Point',
                'coordinates': [o.lng, o.lat],
              },
              'properties': {
                'label': o.captureOrder != null
                    ? '${o.captureOrder}. ${o.name}'
                    : o.name,
                // Couleur du camp détenteur ; gris tant que personne ne l'a.
                'color': o.holderTeamId == null
                    ? '#9E9E9E'
                    : (_scores
                            .where((t) => t.id == o.holderTeamId)
                            .firstOrNull
                            ?.color ??
                        '#9E9E9E'),
              },
            },
        ],
      };

  /// Zones survolées. Le cercle est approché par un polygone : MapLibre ne
  /// sait pas dessiner un disque en mètres réels sans calcul préalable.
  Map<String, dynamic> _dronesGeoJson() => {
        'type': 'FeatureCollection',
        'features': [
          for (final d in _drones)
            {
              'type': 'Feature',
              'geometry': {
                'type': 'Polygon',
                'coordinates': [_circle(d.lat, d.lng, d.radiusMeters)],
              },
              'properties': {
                'color': d.friendly
                    ? UnitAffiliation.allied.hex
                    : UnitAffiliation.hostile.hex,
              },
            },
        ],
      };

  Future<void> _refreshDrones() async {
    final controller = _controller;
    if (controller == null || !_styleReady) return;
    controller.setGeoJsonSource(_dronesSource, _dronesGeoJson());
    // L'appareil lui-même vit dans la couche des marqueurs.
    await _refreshMarkers();
  }

  /// Point à `meters` du centre, dans la direction `bearingDeg`.
  static (double, double) _offset(
    double lat,
    double lng,
    num meters,
    double bearingDeg,
  ) {
    const earth = 6378137.0;
    final rad = bearingDeg * math.pi / 180;
    final dLat = (meters * math.cos(rad)) / earth * 180 / math.pi;
    final dLng = (meters * math.sin(rad)) /
        (earth * math.cos(lat * math.pi / 180)) *
        180 /
        math.pi;
    return (lat + dLat, lng + dLng);
  }

  static List<List<double>> _circle(double lat, double lng, num radiusMeters) {
    return [
      for (var i = 0; i <= 48; i++)
        () {
          final p = _offset(lat, lng, radiusMeters, i * 360 / 48);
          return [p.$2, p.$1];
        }(),
    ];
  }

  Future<void> _refreshObjectives() async {
    final controller = _controller;
    if (controller == null || !_styleReady) return;
    controller.setGeoJsonSource(_objectivesSource, _objectivesGeoJson());
    // Les contacts vivent dans la couche des marqueurs.
    await _refreshMarkers();
  }

  Map<String, dynamic> _drawingsGeoJson() => {
        'type': 'FeatureCollection',
        'features': [
          for (final o in _objects.values)
            if (o.kind != 'marker' && o.geometry != null)
              () {
                final pattern = o.properties['pattern'] as String?;
                return {
                  'type': 'Feature',
                  'id': o.id,
                  'geometry': o.geometry,
                  'properties': {
                    'color': (o.properties['color'] as String?) ?? '#FF9800',
                    'pattern': pattern ?? '',
                    // Translucide tant que le serveur n'a pas accepté (§7.6).
                    // Le trait uni s'efface derrière le motif quand il y en a
                    // un, pour ne pas doubler le tracé.
                    'opacity': pattern != null ? 0.0 : (o.pending ? 0.45 : 0.9),
                    'patternOpacity': o.pending ? 0.5 : 1.0,
                    'fillOpacity':
                        o.kind == 'zone' ? (o.pending ? 0.10 : 0.22) : 0.0,
                  },
                };
              }(),
          // Le tracé en cours emprunte cette couche : la sienne refuse de
          // dessiner les lignes sur ce moteur de rendu, et un brouillon
          // invisible rend le dessin impraticable.
          if (_drawing && _draftPoints.length >= 2)
            {
              'type': 'Feature',
              'geometry': {
                'type': 'LineString',
                'coordinates': [
                  for (final p in _draftPoints) [p.longitude, p.latitude],
                ],
              },
              'properties': const {
                'color': '#FFFFFF',
                'pattern': '',
                'opacity': 0.9,
                'patternOpacity': 0.0,
                'fillOpacity': 0.0,
              },
            },
        ],
      };

  Map<String, dynamic> _draftGeoJson() => {
        'type': 'FeatureCollection',
        'features': [
          for (final p in _draftPoints)
            {
              'type': 'Feature',
              'geometry': {
                'type': 'Point',
                'coordinates': [p.longitude, p.latitude],
              },
              'properties': const <String, dynamic>{},
            },
          if (_draftPoints.length >= 2)
            {
              'type': 'Feature',
              'geometry': {
                'type': 'LineString',
                'coordinates': [
                  for (final p in _draftPoints) [p.longitude, p.latitude],
                ],
              },
              'properties': const <String, dynamic>{},
            },
        ],
      };

  void _refreshDraft() {
    final controller = _controller;
    if (controller == null || !_styleReady) return;
    // Les sommets d'un côté, le trait qui les relie de l'autre.
    controller.setGeoJsonSource(_draftSource, _draftGeoJson());
    controller.setGeoJsonSource(_drawingsSource, _drawingsGeoJson());
  }

  /// Franchir le seuil de regroupement est le seul changement de caméra qui
  /// nous intéresse.
  void _onCameraIdle() {
    final zoom = _controller?.cameraPosition?.zoom;
    if (zoom == null || !mounted) return;
    final avant = _zoom >= kSquadGroupingZoom;
    final apres = zoom >= kSquadGroupingZoom;
    _zoom = zoom;
    if (avant == apres) return;
    setState(() {});
    _refreshMarkers();
  }

  void _onMapClick(Point<double> point, LatLng latLng) {
    // Repositionnement en cours : ce tap désigne la nouvelle position.
    final moving = _moving;
    if (moving != null) {
      setState(() => _moving = null);
      _saveObject(
        _copyObject(moving, lat: latLng.latitude, lng: latLng.longitude),
      );
      _showSnack('Marqueur déplacé');
      return;
    }
    if (!_drawing) return;
    setState(() => _draftPoints.add(latLng));
    _refreshDraft();
  }

  /// Duplique un objet en changeant ce qui est demandé. L'id client est
  /// conservé : le serveur reconnaît une MODIFICATION, pas une création.
  MapObjectView _copyObject(
    MapObjectView o, {
    double? lat,
    double? lng,
    Map<String, dynamic>? properties,
    DateTime? deletedAt,
  }) =>
      MapObjectView(
        id: o.id,
        kind: o.kind,
        markerType: o.markerType,
        lat: lat ?? o.lat,
        lng: lng ?? o.lng,
        properties: properties ?? o.properties,
        geometry: o.geometry,
        authorMembershipId: o.authorMembershipId,
        createdAt: o.createdAt,
        deletedAt: deletedAt,
        pending: true,
      );

  /// Enregistre localement puis pousse : même chemin offline que la pose.
  Future<void> _saveObject(MapObjectView object) async {
    await _syncService!.saveLocal(object, pending: true);
    _applyObject(object);
    _kickSync();
  }

  /// Choix du motif de tracé, dans le même sélecteur que les symboles mais
  /// restreint à la famille « Dessin ».
  Future<void> _pickPattern() async {
    final choice = await showModalBottomSheet<SymbolChoice>(
      context: context,
      showDragHandle: true,
      builder: (_) => const UnitPickerSheet(families: [SymbolFamily.pattern]),
    );
    if (choice == null) return;
    setState(() => _drawPattern = choice.iconId);
  }

  /// Retire le dernier point posé — un pas de travers ne doit pas coûter
  /// tout le tracé.
  void _undoPoint() {
    if (_draftPoints.isEmpty) return;
    setState(() => _draftPoints.removeLast());
    _refreshDraft();
  }

  void _cancelDrawing() {
    setState(() {
      _drawing = false;
      _draftPoints.clear();
    });
    _refreshDraft();
  }

  /// Huit sommets réguliers autour d'un centre, rayon = distance au second
  /// point pointé. Sert à tracer un octogone d'un simple geste à deux taps.
  List<LatLng> _octagon(LatLng center, LatLng edge) {
    final radius = _distanceMeters(center, edge);
    return [
      for (var i = 0; i < 8; i++)
        () {
          final p =
              _offset(center.latitude, center.longitude, radius, i * 45.0);
          return LatLng(p.$1, p.$2);
        }(),
    ];
  }

  static double _distanceMeters(LatLng a, LatLng b) {
    const earth = 6378137.0;
    final dLat = (b.latitude - a.latitude) * math.pi / 180;
    final dLng = (b.longitude - a.longitude) * math.pi / 180;
    final meanLat = (a.latitude + b.latitude) / 2 * math.pi / 180;
    final x = dLng * math.cos(meanLat);
    return earth * math.sqrt(x * x + dLat * dLat);
  }

  /// Termine le dessin en ligne, en zone ou en octogone — même chemin
  /// offline-first que les marqueurs : base locale, affichage immédiat,
  /// file d'attente (§7.6).
  Future<void> _finishDrawing(String shape) async {
    final points = shape == 'octagon'
        ? _octagon(_draftPoints[0], _draftPoints[1])
        : _draftPoints;
    final coords = [
      for (final p in points) [p.longitude, p.latitude],
    ];
    final kind = shape == 'line' ? 'line' : 'zone';
    final geometry = kind == 'line'
        ? {'type': 'LineString', 'coordinates': coords}
        : {
            'type': 'Polygon',
            'coordinates': [
              [...coords, coords.first], // anneau fermé
            ],
          };
    // Un tracé à motif prend la couleur de son camp ; sinon, les couleurs
    // historiques (zone rouge, ligne bleue).
    final pattern = _drawPattern;
    final affiliation =
        pattern != null ? UnitIcons.affiliationOf(pattern) : null;
    final label = switch (shape) {
      'line' => 'Ligne',
      'octagon' => 'Octogone',
      _ => 'Zone',
    };
    final object = MapObjectView(
      id: const Uuid().v7(),
      kind: kind,
      markerType: 'poi',
      lat: points.first.latitude,
      lng: points.first.longitude,
      properties: {
        'color': affiliation?.hex ??
            (kind == 'zone' ? '#F44336' : '#2196F3'),
        'unitLabel': pattern == null
            ? label
            : '$label ${UnitIcons.labelOf(pattern).toLowerCase()}',
        'pattern': ?pattern,
      },
      geometry: geometry,
      authorMembershipId: _myMembershipId ?? '',
      createdAt: DateTime.now(),
      deletedAt: null,
      pending: true,
    );
    _cancelDrawing();
    await _syncService!.saveLocal(object, pending: true);
    _applyObject(object);
    _kickSync();
  }

  /// Les alliés vivent dans la couche des marqueurs : rafraîchir revient
  /// donc à la reconstruire.
  Future<void> _refreshAllies() => _refreshMarkers();

  /// Appui long : pose d'un marqueur d'unité à l'endroit visé (§ Phase 2).
  Future<void> _onMapLongClick(Point<double> point, LatLng latLng) async {
    if (!_inGame || _drawing || _moving != null) return;
    final choice = await showModalBottomSheet<SymbolChoice>(
      context: context,
      showDragHandle: true,
      // Les motifs servent aux tracés, pas aux marqueurs ponctuels.
      builder: (_) => const UnitPickerSheet(
        families: [
          SymbolFamily.unit,
          SymbolFamily.structure,
          SymbolFamily.point,
        ],
      ),
    );
    if (choice == null || !mounted) return;

    final affiliation = UnitIcons.affiliationOf(choice.iconId);
    final object = MapObjectView(
      // UUID v7 côté client (§7.6) : idempotent à la resynchronisation.
      id: const Uuid().v7(),
      kind: 'marker',
      markerType: switch (choice.family) {
        SymbolFamily.point => 'waypoint',
        _ => 'unit',
      },
      lat: latLng.latitude,
      lng: latLng.longitude,
      properties: {
        'icon': choice.iconId,
        'unitLabel': affiliation == null
            ? UnitIcons.labelOf(choice.iconId)
            : '${UnitIcons.labelOf(choice.iconId)} — ${affiliation.label}',
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
    // Un déplacement en cours : le tap sert à reposer, pas à ouvrir la fiche.
    if (_moving != null) return;
    if (layerId != _markersLayer && !layerId.startsWith('drawings-')) return;

    // Un groupe replié doit pouvoir se déplier : sans cela, dézoomer
    // ferait perdre l'accès à ses hommes.
    if (id.startsWith('squad:')) {
      final squadId = id.substring('squad:'.length);
      final cluster =
          _alliesLayout.squads.where((g) => g.squadId == squadId).firstOrNull;
      if (cluster != null) _showSquadSheet(cluster);
      return;
    }

    // La couche des marqueurs porte aussi les alliés : toucher un allié
    // ouvre la visée vers lui.
    final ally = _members[id];
    if (ally != null) {
      if (ally.lat != null) _guideTo(ally.displayName, ally.lat!, ally.lng!);
      return;
    }
    final object = _objects[id];
    if (object == null) return;
    _showObjectSheet(object);
  }

  /// Fiche d'un objet posé : consulter, changer de camp, changer de type,
  /// déplacer, supprimer. Toutes les modifications gardent l'id client et
  /// passent par la file offline — elles marchent donc sans réseau.
  void _showObjectSheet(MapObjectView object) {
    final canEdit = object.authorMembershipId == _myMembershipId ||
        _can(Perm.markersDeleteAny);
    final author = _members[object.authorMembershipId];
    final icon = object.icon;
    final affiliation = icon != null ? UnitIcons.affiliationOf(icon) : null;
    final note = _markerNote(object);

    showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      builder: (sheetContext) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              ListTile(
                contentPadding: EdgeInsets.zero,
                leading: switch (object.kind) {
                  'zone' => const Icon(Icons.pentagon_outlined, size: 32),
                  'line' => const Icon(Icons.timeline, size: 32),
                  _ => icon != null
                      ? Image.asset(
                          UnitIcons.assetKey(icon),
                          width: 40,
                          height: 40,
                          fit: BoxFit.contain,
                        )
                      : const Icon(Icons.place),
                },
                title: Text(
                  icon != null
                      ? UnitIcons.labelOf(icon)
                      : (object.properties['unitLabel'] as String?) ??
                          'Marqueur',
                ),
                subtitle: Text(
                  'posé par ${author?.displayName ?? 'un allié'} '
                  'à ${_timeLabel(object.createdAt)}'
                  '${note.isEmpty ? '' : ' · $note'}',
                ),
              ),

              // Se diriger : ouvert à tous, même sans droit de modification.
              OutlinedButton.icon(
                icon: const Icon(Icons.navigation_outlined),
                label: const Text('Diriger'),
                onPressed: () {
                  Navigator.pop(sheetContext);
                  _guideTo(
                    icon != null
                        ? UnitIcons.labelOf(icon)
                        : (object.properties['unitLabel'] as String?) ??
                            'Marqueur',
                    object.lat,
                    object.lng,
                  );
                },
              ),

              if (canEdit) ...[
                // Changer de camp : le symbole bascule dans l'autre couleur.
                if (affiliation != null) ...[
                  const Divider(),
                  Text(
                    'Camp',
                    style: Theme.of(context).textTheme.labelMedium,
                  ),
                  const SizedBox(height: 6),
                  SingleChildScrollView(
                    scrollDirection: Axis.horizontal,
                    child: SegmentedButton<UnitAffiliation>(
                      showSelectedIcon: false,
                      style: const ButtonStyle(
                        visualDensity: VisualDensity.compact,
                      ),
                      segments: [
                        for (final a in UnitAffiliation.values)
                          ButtonSegment(
                            value: a,
                            label: Text(a.label),
                            icon: Icon(Icons.circle, size: 12, color: a.color),
                          ),
                      ],
                      selected: {affiliation},
                      onSelectionChanged: (s) {
                        Navigator.pop(sheetContext);
                        _changeAffiliation(object, s.first);
                      },
                    ),
                  ),
                ],
                const Divider(),
                Row(
                  children: [
                    Expanded(
                      child: OutlinedButton.icon(
                        icon: const Icon(Icons.open_with),
                        label: const Text('Déplacer'),
                        onPressed: () {
                          Navigator.pop(sheetContext);
                          setState(() => _moving = object);
                          _showSnack(
                            'Touchez la carte pour reposer le marqueur',
                          );
                        },
                      ),
                    ),
                    const SizedBox(width: 8),
                    if (object.kind == 'marker')
                      Expanded(
                        child: OutlinedButton.icon(
                          icon: const Icon(Icons.category_outlined),
                          label: const Text('Type'),
                          onPressed: () {
                            Navigator.pop(sheetContext);
                            _changeSymbol(object);
                          },
                        ),
                      ),
                  ],
                ),
                const SizedBox(height: 8),
                // Étiquette libre peinte à côté du symbole : fréquence radio
                // d'un véhicule, immatriculation, consigne courte.
                OutlinedButton.icon(
                  icon: const Icon(Icons.sell_outlined),
                  label: Text(
                    note.isEmpty ? 'Ajouter une étiquette' : 'Étiquette : $note',
                  ),
                  onPressed: () {
                    Navigator.pop(sheetContext);
                    _changeNote(object);
                  },
                ),
                const SizedBox(height: 8),
                OutlinedButton.icon(
                  icon: const Icon(Icons.delete_outline),
                  label: const Text('Supprimer'),
                  style: OutlinedButton.styleFrom(
                    foregroundColor: Theme.of(context).colorScheme.error,
                  ),
                  onPressed: () {
                    Navigator.pop(sheetContext);
                    _saveObject(
                      _copyObject(object, deletedAt: DateTime.now()),
                    );
                  },
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }

  /// Bascule un symbole dans un autre camp, en gardant son type.
  void _changeAffiliation(MapObjectView object, UnitAffiliation affiliation) {
    final icon = object.icon;
    if (icon == null) return;
    final next = UnitIcons.withAffiliation(icon, affiliation);
    _saveObject(
      _copyObject(object, properties: {
        ...object.properties,
        'icon': next,
        'unitLabel': '${UnitIcons.labelOf(next)} — ${affiliation.label}',
      }),
    );
    _showSnack('Passé en ${affiliation.label.toLowerCase()}');
  }

  /// Pose ou efface l'étiquette d'un objet. Comme le reste de la fiche,
  /// elle passe par la file offline : elle marche sans réseau (§2.3).
  Future<void> _changeNote(MapObjectView object) async {
    final note = await _askNote('Étiquette du marqueur', _markerNote(object));
    if (note == null) return;
    final texte = note.trim();
    final proprietes = {...object.properties};
    // Vider le champ efface : sur le terrain on retire une fréquence en
    // effaçant le texte, pas en cherchant un bouton « supprimer ».
    if (texte.isEmpty) {
      proprietes.remove('note');
    } else {
      proprietes['note'] = texte;
    }
    _saveObject(_copyObject(object, properties: proprietes));
    _showSnack(texte.isEmpty ? 'Étiquette effacée' : 'Étiquette : $texte');
  }

  /// Remplace le symbole par un autre, choisi dans le sélecteur complet.
  Future<void> _changeSymbol(MapObjectView object) async {
    final choice = await showModalBottomSheet<SymbolChoice>(
      context: context,
      showDragHandle: true,
      builder: (_) => const UnitPickerSheet(),
    );
    if (choice == null) return;
    _saveObject(
      _copyObject(object, properties: {
        ...object.properties,
        'icon': choice.iconId,
        'unitLabel': UnitIcons.labelOf(choice.iconId),
      }),
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

  /// Entrées du menu d'outils, dans l'ordre d'usage sur le terrain.
  List<ToolAction> _tools() => [
        ToolAction(
          icon: Icons.my_location,
          label: 'Ma position',
          onPressed: _requestLocation,
        ),
        if (_inGame)
          ToolAction(
            icon: Icons.flight,
            label: 'Perks',
            onPressed: _openPerks,
          ),
        if (_inGame)
          ToolAction(
            icon: _drawing ? Icons.polyline : Icons.polyline_outlined,
            label: 'Tracé',
            selected: _drawing,
            onPressed: () {
              if (_drawing) {
                _cancelDrawing();
              } else {
                setState(() => _drawing = true);
              }
            },
          ),
        if (_inGame)
          ToolAction(
            icon: _realtimeConnected ? Icons.people : Icons.cloud_off,
            label: 'Alliés',
            badge: '${_allies.length}',
            onPressed: _showAllies,
          ),
        if (_inGame)
          ToolAction(
            icon: Icons.forum_outlined,
            label: 'Messages',
            onPressed: () => Navigator.of(context).push(
              MaterialPageRoute<void>(
                builder: (_) => ChatScreen(
                  gameId: widget.gameId!,
                  realtime: _realtime,
                  myMembershipId: _myMembershipId,
                ),
              ),
            ),
          ),
        ToolAction(
          icon: Icons.settings_outlined,
          label: 'Réglages',
          onPressed: _openSettings,
        ),
      ];

  /// Réglages : ce qui se règle une fois puis s'oublie. Sorti du bandeau
  /// pour ne laisser à l'écran que ce qu'on lit en jouant.
  Future<void> _openSettings() async {
    await showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      builder: (sheetContext) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (_inGame)
              ListTile(
                leading: Icon(switch (_trackingMode) {
                  TrackingMode.precise => Icons.battery_alert,
                  TrackingMode.balanced => Icons.battery_5_bar,
                  TrackingMode.eco => Icons.battery_saver,
                }),
                title: const Text('Suivi de position'),
                subtitle: Text(_trackingMode.label),
                onTap: () {
                  Navigator.pop(sheetContext);
                  _pickTrackingMode();
                },
              ),
            ListTile(
              leading: const Icon(Icons.download_for_offline_outlined),
              title: const Text('Cartes hors-ligne'),
              subtitle: const Text('Télécharger la zone de jeu'),
              onTap: () {
                Navigator.pop(sheetContext);
                _openOfflineSheet();
              },
            ),
            if (_inGame)
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Text(
                      'Mon statut',
                      style: Theme.of(context).textTheme.labelMedium,
                    ),
                    const SizedBox(height: 6),
                    SegmentedButton<LifeStatus>(
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
                        Navigator.pop(sheetContext);
                      },
                    ),
                  ],
                ),
              ),
            if (_inGame) ...[
              const Divider(height: 8),
              // Refermer la carte sans rien changer : depuis que le bandeau
              // a remplacé la barre d'application, c'est la sortie explicite.
              ListTile(
                leading: const Icon(Icons.map_outlined),
                title: const Text('Revenir aux parties'),
                subtitle: const Text('Vous restez membre de la partie'),
                onTap: () {
                  Navigator.pop(sheetContext);
                  Navigator.of(context).maybePop();
                },
              ),
              ListTile(
                leading: Icon(
                  Icons.logout,
                  color: Theme.of(context).colorScheme.error,
                ),
                title: Text(
                  'Quitter la partie',
                  style: TextStyle(color: Theme.of(context).colorScheme.error),
                ),
                subtitle: const Text('Il faudra un nouveau QR pour revenir'),
                onTap: () {
                  Navigator.pop(sheetContext);
                  _confirmLeaveGame();
                },
              ),
            ],
          ],
        ),
      ),
    );
  }

  /// Quitter pour de bon : on demande confirmation, le serveur tranche
  /// (le créateur d'une partie ne peut pas quitter la sienne).
  Future<void> _confirmLeaveGame() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Quitter la partie ?'),
        content: Text(
          'Vous ne verrez plus ${widget.gameName ?? 'cette partie'} ni vos '
          'alliés, et vous cesserez de partager votre position. '
          'Il faudra scanner un nouveau QR pour revenir.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, false),
            child: const Text('Annuler'),
          ),
          FilledButton(
            style: FilledButton.styleFrom(
              backgroundColor: Theme.of(context).colorScheme.error,
            ),
            onPressed: () => Navigator.pop(dialogContext, true),
            child: const Text('Quitter'),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;

    try {
      await GamesApi.leaveGame(widget.gameId!);
      if (!mounted) return;
      Navigator.of(context).maybePop();
    } catch (e) {
      if (!mounted) return;
      // Refus du serveur (créateur) ou réseau absent : on reste sur place.
      _showSnack(_errorMessage(e));
    }
  }

  /// Message serveur si on en a un, sinon un repli lisible.
  static String _errorMessage(Object error) =>
      error is GamesApiException ? error.message : 'Action impossible';

  /// Référence complète du point où je me trouve — celle qu'on donne à la
  /// radio quand le carroyage court ne suffit pas.
  void _showFullGrid() {
    final pos = _lastPosition;
    if (pos == null) {
      _showSnack('Position inconnue');
      return;
    }
    final ref = toMgrs(pos.latitude, pos.longitude);
    _showSnack(
      ref == null
          ? '${pos.latitude.toStringAsFixed(5)}, '
              '${pos.longitude.toStringAsFixed(5)}'
          : '${ref.full(precision: 5)}  ·  '
              '${pos.latitude.toStringAsFixed(5)}, '
              '${pos.longitude.toStringAsFixed(5)}',
    );
  }

  @override
  Widget build(BuildContext context) {
    final landscape =
        MediaQuery.orientationOf(context) == Orientation.landscape;

    return Scaffold(
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
              // En partie, ma position est rendue par MON insigne (couche
              // self) — le point bleu natif ne sert qu'en carte libre.
              myLocationEnabled: _locationGranted && !_inGame,
              onMapCreated: (c) {
                _controller = c;
                c.onFeatureTapped.add(_onFeatureTap);
              },
              onStyleLoadedCallback: _onStyleLoaded,
              onMapLongClick: _onMapLongClick,
              onMapClick: _onMapClick,
              // On ne reconstruit les marqueurs que lorsque la DÉCISION
              // change, pas à chaque mouvement de caméra.
              onCameraIdle: _onCameraIdle,
            ),
          // Bandeau d'état, collé en haut : batterie, cap, heure,
          // coordonnées, réseau.
          Positioned(
            top: 0,
            left: 0,
            right: 0,
            child: TacticalTopBar(
              batteryLevel: _batteryLevel,
              batteryCharging: _batteryCharging,
              heading: _heading,
              clock: _clock,
              grid: gridLabel(
                _lastPosition?.latitude,
                _lastPosition?.longitude,
              ),
              online: _networkOnline,
              linked: !_inGame || _realtimeConnected,
              onGridTap: _showFullGrid,
            ),
          ),
          // Dans un navigateur, l'app dit ce qu'elle ne sait pas faire.
          if (kIsWeb && _inGame && !_webNoticeDismissed)
            Positioned(
              top: MediaQuery.paddingOf(context).top + 34,
              left: 0,
              right: 0,
              child: WebLimitsBanner(
                onDismiss: () => setState(() => _webNoticeDismissed = true),
              ),
            ),
          if (_inGame && !_realtimeConnected)
            Positioned(
              top: MediaQuery.paddingOf(context).top +
                  (kIsWeb && !_webNoticeDismissed ? 82 : 34),
              left: 0,
              right: 0,
              child: Container(
                color: Colors.orange.shade900,
                padding:
                    const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
                child: const Text(
                  'Hors ligne — dernières positions connues',
                  textAlign: TextAlign.center,
                  style: TextStyle(fontWeight: FontWeight.bold, fontSize: 12),
                ),
              ),
            ),
          // Fond de carte : bouton d'angle, sous le bandeau.
          Positioned(
            top: MediaQuery.paddingOf(context).top + 40,
            left: 10,
            child: BasemapButton(
              current: _basemap,
              onSelected: (m) {
                setState(() => _basemap = m);
                _loadStyle();
              },
            ),
          ),
          // Menu d'outils : rail à droite en paysage, barre basse en
          // portrait. Jamais plus du quart de l'écran.
          if (landscape)
            Positioned(
              right: 8,
              top: MediaQuery.paddingOf(context).top + 40,
              child: ToolRail(
                actions: _tools(),
                expanded: _railExpanded,
                landscape: true,
                onToggle: () => setState(() => _railExpanded = !_railExpanded),
              ),
            )
          else
            Positioned(
              right: 8,
              bottom: 16,
              child: ToolRail(
                actions: _tools(),
                expanded: _railExpanded,
                landscape: false,
                onToggle: () => setState(() => _railExpanded = !_railExpanded),
              ),
            ),
          // Boîte de visée : coordonnées, distance, dénivelé, azimut.
          // En portrait elle se pose au-dessus du menu, qui occupe le bas.
          if (_guidance != null)
            Positioned(
              left: 10,
              bottom: landscape ? 16 : (_railExpanded ? 120 : 88),
              child: GuidanceBox(
                target: _guidance!,
                myLat: _lastPosition?.latitude,
                myLng: _lastPosition?.longitude,
                myElevation: _myElevation,
                onClose: () => setState(() => _guidance = null),
              ),
            ),
          // Panneau de tracé : posé au-dessus du menu, jamais dessous, et
          // centré pour rester atteignable au pouce.
          if (_drawing)
            Positioned(
              left: 0,
              right: 0,
              bottom: landscape ? 16 : (_railExpanded ? 120 : 88),
              child: Align(
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 12),
                  child: DrawingPanel(
                    pointCount: _draftPoints.length,
                    pattern: _drawPattern,
                    onPickPattern: _pickPattern,
                    onClearPattern: () => setState(() => _drawPattern = null),
                    onUndo: _undoPoint,
                    onCancel: _cancelDrawing,
                    onFinish: _finishDrawing,
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }

  static const _compact =
      ButtonStyle(visualDensity: VisualDensity.compact);

}
