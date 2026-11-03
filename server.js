// 메타 달소아청소년과 - 정적 파일 + 멀티플레이(WebSocket) 서버
const http = require('http'), fs = require('fs'), path = require('path');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 3000;
// public 폴더가 있으면 거기서, 없으면(파일을 폴더 없이 올린 경우) 이 폴더에서 화면 파일을 서빙
const PUB = path.join(__dirname, 'public');
const ROOT = fs.existsSync(PUB) ? PUB : __dirname;
const DENY = new Set(['server.js', 'package.json', 'package-lock.json', 'readme.txt', 'readme.md']);
const MAX_PLAYERS = 50;
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.png': 'image/png', '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.ico': 'image/x-icon'
};

const server = http.createServer((req, res) => {
  let p = decodeURIComponent((req.url || '/').split('?')[0]);
  if (p === '/') p = '/index.html';
  const file = path.normalize(path.join(ROOT, p));
  if (!file.startsWith(ROOT + path.sep)) { res.writeHead(403); return res.end('forbidden'); }
  const rel = path.relative(ROOT, file).split(path.sep);
  if (rel.some(x => x.startsWith('.') || x === 'node_modules') || DENY.has(path.basename(file).toLowerCase())) { res.writeHead(404); return res.end('not found'); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('not found'); }
    let type = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
    if (/euckr/i.test(path.basename(file))) type = 'text/html; charset=euc-kr';
    res.writeHead(200, { 'Content-Type': type, 'Cache-Control': /\.html$|^sw\.js$/i.test(path.basename(file)) ? 'no-cache' : 'public, max-age=86400' });
    res.end(data);
  });
});

// ---------- 멀티플레이 ----------
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 2048 });
const players = new Map();            // id -> 상태
let nextId = 1;
const num = (v, lo, hi, d) => Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d;
const MODES = new Set(['idle', 'walk', 'sit', 'wave', 'steth', 'shot', 'eat', 'xr', 'read', 'lie', 'hug']);
const OPT = { g: ['f', 'm'], h: ['none', 'bunny', 'cat', 'crown', 'flower'], o: ['basic', 'spider', 'rain', 'acnl', 'boyStyle'] };
const pick = (list, v, d) => list.includes(v) ? v : d;

function clean(m) {
  const c = m.c || {};
  return {
    x: num(m.x, -20, 20, 0), z: num(m.z, -20, 20, 0), ry: num(m.ry, -10, 10, 0),
    m: MODES.has(m.m) ? m.m : 'idle', sy: num(m.sy, -1, 1, 0.07),
    c: { g: pick(OPT.g, c.g, 'f'), h: pick(OPT.h, c.h, 'none'), o: pick(OPT.o, c.o, 'basic') }
  };
}
function send(ws, obj) { if (ws.readyState === 1) ws.send(JSON.stringify(obj)); }
function broadcast(obj, except) {
  const s = JSON.stringify(obj);
  for (const c of wss.clients) if (c !== except && c.readyState === 1 && c.pid) c.send(s);
}

wss.on('connection', ws => {
  if (players.size >= MAX_PLAYERS) { ws.close(1013, 'full'); return; }
  const id = nextId++;
  ws.pid = id; ws.alive = true; ws.seen = false; ws.cnt = 0; ws.lastSay = 0;
  const me = { id, n: '친구' + id, x: 0.2, z: 4, ry: Math.PI, m: 'idle', sy: 0.07, c: { g: 'f', h: 'none', o: 'basic' } };
  players.set(id, me);
  send(ws, { t: 'hello', id, players: [...players.values()].filter(p => p.id !== id && p.seen) });

  ws.on('pong', () => { ws.alive = true; });
  ws.on('message', raw => {
    if (++ws.cnt > 40) return;                        // 초당 40개 초과 무시
    let m; try { m = JSON.parse(raw.toString()); } catch { return; }
    if (m.t === 'u') {
      Object.assign(me, clean(m)); me.seen = true;
      if (typeof m.n === 'string') { const nn = m.n.replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 24); if (nn) me.n = nn; }
      broadcast({ t: 'u', id, n: me.n, x: me.x, z: me.z, ry: me.ry, m: me.m, sy: me.sy, c: me.c }, ws);
    } else if (m.t === 's' && typeof m.s === 'string') {
      const now = Date.now(); if (now - ws.lastSay < 300) return; ws.lastSay = now;
      broadcast({ t: 's', id, s: m.s.slice(0, 60), ms: num(m.ms, 1500, 5000, 2600) }, ws);
    }
  });
  ws.on('close', () => { players.delete(id); if (me.seen) broadcast({ t: 'bye', id }, ws); });
  ws.on('error', () => {});
});
setInterval(() => { for (const c of wss.clients) c.cnt = 0; }, 1000);
setInterval(() => {                                      // 끊긴 연결 정리
  for (const c of wss.clients) { if (!c.alive) { c.terminate(); continue; } c.alive = false; try { c.ping(); } catch {} }
}, 30000);

server.listen(PORT, () => console.log('달소아청소년과 서버 실행: http://localhost:' + PORT));
