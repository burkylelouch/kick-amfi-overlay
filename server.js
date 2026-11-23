const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const HOST = 'localhost';
const PORT = Number(process.env.PORT) || 3000;
const ROOT_DIR = __dirname;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
};

const KICK_HEADERS = {
  'Content-Type': 'application/json',
  Accept: 'application/json',
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
};

async function fetchKickRealtimeCredentials(existingClientId) {
  const clientId = existingClientId || crypto.randomUUID();
  const [connRes, authRes] = await Promise.all([
    fetch('https://web.kick.com/api/v1/realtime/connection', {
      method: 'POST',
      headers: KICK_HEADERS,
      body: JSON.stringify({
        client: { id: clientId, type: 'web' },
        capabilities: { accepted_providers: [{ provider: 'centrifugo' }] },
      }),
    }),
    fetch('https://web.kick.com/api/v1/realtime/auth/connection', {
      method: 'POST',
      headers: KICK_HEADERS,
      body: JSON.stringify({ client_id: clientId }),
    }),
  ]);

  if (!connRes.ok || !authRes.ok) {
    throw new Error(`Kick realtime API hatası (conn: ${connRes.status}, auth: ${authRes.status})`);
  }

  const connJson = await connRes.json();
  const authJson = await authRes.json();
  const wsUrl = connJson?.data?.connections?.[0]?.credentials?.url;
  const token = authJson?.data?.token;

  if (!wsUrl || !token) {
    throw new Error('Kick WebSocket URL veya token alınamadı');
  }

  return { wsUrl, token, clientId };
}

// =========================================================================
// KICK CENTRIFUGO -> SSE KÖPRÜSÜ (Tarayıcı Origin 403 engelini aşar)
// =========================================================================
const roomBridges = new Map();

class KickRoomBridge {
  constructor(chatroomId) {
    this.chatroomId = String(chatroomId);
    this.clients = new Set();
    this.ws = null;
    this.clientId = null;
    this.cmdId = 0;
    this.reconnectAttempts = 0;
    this.reconnectTimer = null;
    this.refreshTimer = null;
    this.lastStatus = {
      state: 'connecting',
      text: `Bağlanıyor (Oda: ${this.chatroomId})...`,
    };
    this.destroyed = false;
  }

  nextCmdId() {
    this.cmdId += 1;
    return this.cmdId;
  }

  addClient(res) {
    this.clients.add(res);
    this.sendToClient(res, 'status', this.lastStatus);

    if (this.clients.size === 1 && !this.ws) {
      this.connect();
    }
  }

  removeClient(res) {
    this.clients.delete(res);
    if (this.clients.size === 0) {
      this.destroy();
      roomBridges.delete(this.chatroomId);
    }
  }

  sendToClient(res, event, data) {
    try {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    } catch {
      this.clients.delete(res);
    }
  }

  broadcast(event, data) {
    if (event === 'status') {
      this.lastStatus = data;
    }
    for (const res of Array.from(this.clients)) {
      this.sendToClient(res, event, data);
    }
  }

  async connect() {
    if (this.destroyed || this.clients.size === 0) return;

    this.cleanupSocket();
    this.broadcast('status', {
      state: 'connecting',
      text: `Bağlanıyor (Oda: ${this.chatroomId})...`,
    });

    let wsUrl;
    let token;
    try {
      const creds = await fetchKickRealtimeCredentials(this.clientId);
      wsUrl = creds.wsUrl;
      token = creds.token;
      this.clientId = creds.clientId;
    } catch (err) {
      this.broadcast('status', { state: 'error', text: 'Kick oturum bilgisi alınamadı' });
      this.broadcast('log', { text: `Kick realtime hatası: ${err.message}` });
      this.scheduleReconnect();
      return;
    }

    if (this.destroyed || this.clients.size === 0) return;

    try {
      this.cmdId = 0;
      this.ws = new WebSocket(wsUrl);
    } catch (err) {
      this.broadcast('status', { state: 'error', text: 'WebSocket başlatılamadı' });
      this.broadcast('log', { text: `WebSocket hatası: ${err.message}` });
      this.scheduleReconnect();
      return;
    }

    this.ws.addEventListener('open', () => {
      this.reconnectAttempts = 0;
      this.broadcast('log', { text: 'Kick Centrifugo WebSocket açıldı.' });
      this.ws.send(
        JSON.stringify({
          connect: { token, name: 'js' },
          id: this.nextCmdId(),
        })
      );
    });

    this.ws.addEventListener('message', (event) => {
      this.handleRawFrame(String(event.data || ''));
    });

    this.ws.addEventListener('close', (event) => {
      if (this.destroyed || this.clients.size === 0) return;
      this.broadcast('status', {
        state: 'error',
        text: 'Bağlantı koptu, yeniden bağlanılıyor...',
      });
      this.broadcast('log', {
        text: `Kick bağlantısı kapandı (kod: ${event.code || '?'}).`,
      });
      this.scheduleReconnect();
    });

    this.ws.addEventListener('error', () => {
      this.broadcast('log', { text: 'Kick WebSocket bağlantı hatası oluştu.' });
    });
  }

  scheduleTokenRefresh(ttlSeconds) {
    clearTimeout(this.refreshTimer);
    const refreshInMs = Math.max(30, ttlSeconds - 120) * 1000;
    this.refreshTimer = setTimeout(async () => {
      if (this.destroyed || !this.ws || this.ws.readyState !== WebSocket.OPEN) return;
      try {
        const creds = await fetchKickRealtimeCredentials(this.clientId);
        if (creds.token && this.ws && this.ws.readyState === WebSocket.OPEN) {
          this.ws.send(
            JSON.stringify({
              refresh: { token: creds.token },
              id: this.nextCmdId(),
            })
          );
          this.broadcast('log', { text: 'Kick oturum token yenilendi.' });
        }
      } catch (err) {
        this.broadcast('log', { text: `Token yenileme hatası: ${err.message}` });
      }
    }, refreshInMs);
  }

  handleRawFrame(rawData) {
    const lines = rawData.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      let msg;
      try {
        msg = JSON.parse(trimmed);
      } catch {
        continue;
      }

      // Centrifugo sunucu ping ({}) -> {} pong
      if (msg && typeof msg === 'object' && Object.keys(msg).length === 0) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          this.ws.send('{}');
        }
        continue;
      }

      if (msg.error) {
        this.broadcast('status', {
          state: 'error',
          text: `Bağlantı hatası (${msg.error.code || '?'})`,
        });
        this.broadcast('log', { text: `Centrifugo hatası: ${JSON.stringify(msg.error)}` });
        continue;
      }

      if (msg.connect) {
        const channel = `chatrooms.${this.chatroomId}.v2`;
        this.ws.send(
          JSON.stringify({
            subscribe: { channel },
            id: this.nextCmdId(),
          })
        );
        this.broadcast('log', { text: `Kanala abone olunuyor: ${channel}` });

        if (msg.connect.expires && msg.connect.ttl) {
          this.scheduleTokenRefresh(msg.connect.ttl);
        }
        continue;
      }

      if (msg.refresh) {
        if (msg.refresh.expires && msg.refresh.ttl) {
          this.scheduleTokenRefresh(msg.refresh.ttl);
        }
        continue;
      }

      if (msg.subscribe) {
        this.broadcast('status', {
          state: 'connected',
          text: `Bağlı (Oda: ${this.chatroomId})`,
        });
        this.broadcast('log', { text: 'Kick chat bağlantısı hazır!' });
        continue;
      }

      const pubData = msg.push?.pub?.data;
      if (pubData && pubData.event === 'App\\Events\\ChatMessageEvent') {
        let payload;
        try {
          payload = typeof pubData.data === 'string' ? JSON.parse(pubData.data) : pubData.data;
        } catch {
          continue;
        }

        const username = payload?.sender?.username;
        const color = payload?.sender?.identity?.color || '';
        const content = payload?.content || '';

        if (username && typeof content === 'string') {
          this.broadcast('message', { username, color, content });
        }
      }
    }
  }

  scheduleReconnect() {
    this.cleanupSocket();
    if (this.destroyed || this.clients.size === 0) return;

    this.reconnectAttempts += 1;
    const delay = Math.min(30000, 2000 * Math.pow(2, this.reconnectAttempts - 1));
    this.broadcast('log', { text: `${Math.round(delay / 1000)} sn sonra yeniden bağlanılacak...` });
    this.reconnectTimer = setTimeout(() => this.connect(), delay);
  }

  cleanupSocket() {
    clearTimeout(this.refreshTimer);
    clearTimeout(this.reconnectTimer);
    if (this.ws) {
      try {
        this.ws.close();
      } catch {
        // yoksay
      }
      this.ws = null;
    }
  }

  destroy() {
    this.destroyed = true;
    this.cleanupSocket();
    this.clients.clear();
  }
}

// =========================================================================
// HTTP SUNUCUSU
// =========================================================================
const server = http.createServer(async (req, res) => {
  const reqUrl = new URL(req.url || '/', `http://${HOST}:${PORT}`);
  let pathname = decodeURIComponent(reqUrl.pathname);

  // Canlı Kick sohbet akışı (SSE)
  if (pathname === '/api/chat-stream') {
    const chatroomId = (reqUrl.searchParams.get('chatroomId') || '').trim();
    if (!chatroomId || !/^\d+$/.test(chatroomId)) {
      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: 'Geçerli bir chatroomId gerekli' }));
      return;
    }

    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    });
    res.write(': connected\n\n');

    let bridge = roomBridges.get(chatroomId);
    if (!bridge) {
      bridge = new KickRoomBridge(chatroomId);
      roomBridges.set(chatroomId, bridge);
    }
    bridge.addClient(res);

    const keepalive = setInterval(() => {
      try {
        res.write(': keepalive\n\n');
      } catch {
        clearInterval(keepalive);
      }
    }, 20000);

    req.on('close', () => {
      clearInterval(keepalive);
      bridge.removeClient(res);
    });
    return;
  }

  // Kick kanal bilgisini CORS engeline takılmadan çekmek için yerel proxy
  if (pathname.startsWith('/api/channel/')) {
    const channelName = pathname.slice('/api/channel/'.length).trim();
    if (!channelName || /[^a-zA-Z0-9_-]/.test(channelName)) {
      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: 'Geçersiz kanal adı' }));
      return;
    }

    try {
      const upstream = await fetch(
        `https://kick.com/api/v2/channels/${encodeURIComponent(channelName)}`,
        { headers: KICK_HEADERS }
      );
      const body = await upstream.text();
      res.writeHead(upstream.status, {
        'Content-Type': upstream.headers.get('content-type') || 'application/json; charset=utf-8',
        'Cache-Control': 'no-cache',
      });
      res.end(body);
    } catch (err) {
      res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  if (pathname === '/') {
    pathname = '/index.html';
  }

  const filePath = path.resolve(ROOT_DIR, `.${pathname}`);

  // Proje klasörü dışına erişimi engelle
  if (!filePath.startsWith(ROOT_DIR + path.sep) && filePath !== ROOT_DIR) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('403 Forbidden');
    return;
  }

  fs.stat(filePath, (statErr, stats) => {
    if (statErr || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 Not Found');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    res.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': 'no-cache',
    });

    const stream = fs.createReadStream(filePath);
    stream.on('error', () => {
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      }
      res.end('500 Internal Server Error');
    });
    stream.pipe(res);
  });
});

server.listen(PORT, () => {
  const baseUrl = `http://${HOST}:${PORT}`;
  console.log('');
  console.log('Sanal Sınıf / Amfi yerel sunucusu çalışıyor!');
  console.log(`  Normal mod : ${baseUrl}/`);
  console.log(`  Test modu  : ${baseUrl}/?debug=true`);
  console.log(`  OBS şeffaf : ${baseUrl}/?chatroomId=CHATROOM_ID&bg=transparent`);
  console.log('');
  console.log('Durdurmak için Ctrl+C tuşlarına basın.');
});
