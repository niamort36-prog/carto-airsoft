import 'package:flutter/material.dart';
import 'package:uuid/uuid.dart';

import 'chat_sync.dart';
import 'game_realtime.dart';
import 'games_api.dart';
import 'models.dart';

/// Messagerie de partie (§7.4). Les canaux affichés sont ceux que le serveur
/// autorise pour mon grade — aucun filtrage n'est fait côté téléphone.
class ChatScreen extends StatefulWidget {
  const ChatScreen({
    super.key,
    required this.gameId,
    required this.realtime,
    required this.myMembershipId,
  });

  final String gameId;

  /// Liaison temps réel partagée avec la carte (mêmes sockets, même partie).
  final GameRealtime? realtime;
  final String? myMembershipId;

  @override
  State<ChatScreen> createState() => _ChatScreenState();
}

class _ChatScreenState extends State<ChatScreen>
    with SingleTickerProviderStateMixin {
  late final ChatSyncService _sync = ChatSyncService(widget.gameId);
  final _composer = TextEditingController();
  final _scroll = ScrollController();

  List<ChannelView> _channels = [];
  String? _me;
  TabController? _tabs;
  final Map<String, List<MessageView>> _messages = {};
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    widget.realtime?.onChatMessage = _onIncoming;
    // Retour du réseau → la file part toute seule, sans action du joueur.
    widget.realtime?.onReconnected = _flushQueue;
    _me = widget.myMembershipId;
    _load();
  }

  /// Vide la file d'attente et rafraîchit l'affichage.
  Future<void> _flushQueue() async {
    if (_channels.isEmpty) return;
    final ok = await _sync.trySync(_channels.map((c) => c.id).toList());
    if (!mounted) return;
    setState(() => _error = ok ? null : _error);
    if (ok) await _reloadAll();
  }

  @override
  void dispose() {
    widget.realtime?.onChatMessage = null;
    widget.realtime?.onReconnected = null;
    _composer.dispose();
    _scroll.dispose();
    _tabs?.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    // Sans socket (hors réseau), on retrouve son identité en base locale.
    _me ??= await _sync.myMembershipId();
    try {
      final channels = await GamesApi.channels(widget.gameId);
      await _sync.cacheChannels(channels);
      if (!mounted) return;
      _tabs?.dispose();
      _tabs = TabController(length: channels.length, vsync: this)
        ..addListener(() {
          if (mounted) setState(() {});
        });
      setState(() {
        _channels = channels;
        _loading = false;
        _error = null;
      });
      for (final c in channels) {
        _messages[c.id] = await _sync.loadLocal(c.id);
      }
      if (mounted) setState(() {});
      await _sync.trySync(channels.map((c) => c.id).toList());
      await _reloadAll();
    } catch (_) {
      // Hors ligne : on affiche ce que la base locale a déjà.
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = 'Hors ligne — messages en cache';
      });
      // Les canaux connus localement restent accessibles hors réseau.
      if (_channels.isEmpty) {
        final cached = await _sync.cachedChannels();
        if (!mounted || cached.isEmpty) return;
        _tabs?.dispose();
        _tabs = TabController(length: cached.length, vsync: this)
          ..addListener(() {
            if (mounted) setState(() {});
          });
        setState(() => _channels = cached);
        await _reloadAll();
      }
    }
  }

  Future<void> _reloadAll() async {
    for (final c in _channels) {
      _messages[c.id] = await _sync.loadLocal(c.id);
    }
    if (mounted) setState(() {});
    _scrollToEnd();
  }

  void _onIncoming(MessageView message) {
    _sync.saveLocal(message, pending: false);
    if (!mounted) return;
    setState(() {
      final list = _messages.putIfAbsent(message.channelId, () => []);
      final i = list.indexWhere((m) => m.id == message.id);
      if (i >= 0) {
        list[i] = message;
      } else {
        list.add(message);
      }
    });
    _scrollToEnd();
  }

  void _scrollToEnd() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scroll.hasClients) {
        _scroll.jumpTo(_scroll.position.maxScrollExtent);
      }
    });
  }

  Future<void> _send(String channelId) async {
    final body = _composer.text.trim();
    if (body.isEmpty) return;
    _composer.clear();

    final message = MessageView(
      id: const Uuid().v7(), // id client → idempotent à la resynchro (§7.6)
      channelId: channelId,
      body: body,
      authorMembershipId: _me ?? '',
      authorName: 'Moi',
      createdAt: DateTime.now(),
      pending: true,
    );
    // Enregistré et affiché immédiatement, même sans réseau.
    await _sync.saveLocal(message, pending: true);
    if (!mounted) return;
    setState(() => _messages.putIfAbsent(channelId, () => []).add(message));
    _scrollToEnd();

    final ok = await _sync.trySync(_channels.map((c) => c.id).toList());
    if (!mounted) return;
    if (ok) {
      setState(() => _error = null);
      await _reloadAll();
    } else {
      // Le message reste en file (il partira tout seul), mais on dit pourquoi.
      setState(() => _error = _sync.lastError);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }
    if (_channels.isEmpty) {
      return Scaffold(
        appBar: AppBar(title: const Text('Messagerie')),
        body: Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Text(
              _error ?? 'Aucun canal accessible.',
              textAlign: TextAlign.center,
            ),
          ),
        ),
      );
    }

    final channel = _channels[_tabs!.index];
    final messages = _messages[channel.id] ?? const <MessageView>[];

    return Scaffold(
      appBar: AppBar(
        title: const Text('Messagerie'),
        bottom: TabBar(
          controller: _tabs,
          tabs: [
            for (final c in _channels)
              Tab(
                icon: Icon(
                  c.scope == 'command' ? Icons.military_tech : Icons.forum,
                  size: 18,
                ),
                text: c.name,
              ),
          ],
        ),
      ),
      body: Column(
        children: [
          if (_error != null)
            Container(
              width: double.infinity,
              color: Colors.orange.shade900,
              padding: const EdgeInsets.symmetric(vertical: 6),
              child: Text(
                _error!,
                textAlign: TextAlign.center,
                style: const TextStyle(fontWeight: FontWeight.bold),
              ),
            ),
          Expanded(
            child: messages.isEmpty
                ? const Center(child: Text('Aucun message.'))
                : ListView.builder(
                    controller: _scroll,
                    padding: const EdgeInsets.all(12),
                    itemCount: messages.length,
                    itemBuilder: (context, i) =>
                        _bubble(messages[i], channel.scope),
                  ),
          ),
          SafeArea(
            top: false,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(12, 4, 12, 8),
              child: Row(
                children: [
                  Expanded(
                    child: TextField(
                      controller: _composer,
                      textInputAction: TextInputAction.send,
                      maxLength: 500,
                      decoration: InputDecoration(
                        hintText: 'Message · ${channel.name}',
                        border: const OutlineInputBorder(),
                        isDense: true,
                        counterText: '',
                      ),
                      onSubmitted: (_) => _send(channel.id),
                    ),
                  ),
                  const SizedBox(width: 8),
                  IconButton.filled(
                    tooltip: 'Envoyer',
                    icon: const Icon(Icons.send),
                    onPressed: () => _send(channel.id),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _bubble(MessageView m, String scope) {
    final mine = _me != null && m.authorMembershipId == _me;
    final time = '${m.createdAt.hour.toString().padLeft(2, '0')}h'
        '${m.createdAt.minute.toString().padLeft(2, '0')}';
    final scheme = Theme.of(context).colorScheme;
    return Align(
      alignment: mine ? Alignment.centerRight : Alignment.centerLeft,
      child: Container(
        constraints: const BoxConstraints(maxWidth: 300),
        margin: const EdgeInsets.symmetric(vertical: 3),
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        decoration: BoxDecoration(
          color: mine
              ? scheme.primaryContainer.withValues(alpha: m.pending ? 0.5 : 1)
              : scheme.surfaceContainerHighest,
          borderRadius: BorderRadius.circular(12),
          border: scope == 'command'
              ? Border.all(color: scheme.tertiary, width: 1)
              : null,
        ),
        child: Column(
          crossAxisAlignment:
              mine ? CrossAxisAlignment.end : CrossAxisAlignment.start,
          children: [
            if (!mine)
              Text(
                m.authorName,
                style: Theme.of(context)
                    .textTheme
                    .labelSmall
                    ?.copyWith(fontWeight: FontWeight.bold),
              ),
            Text(m.body),
            Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(time, style: Theme.of(context).textTheme.labelSmall),
                if (m.pending) ...[
                  const SizedBox(width: 4),
                  const Icon(Icons.schedule, size: 12),
                ],
              ],
            ),
          ],
        ),
      ),
    );
  }
}
