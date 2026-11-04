// 메타 달소아청소년과 - 정적 파일 + 멀티플레이(WebSocket) 서버
const http = require('http'), fs = require('fs'), path = require('path');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 3000;
// public 폴더가 있으면 거기서, 없으면(파일을 폴더 없이 올린 경우) 이 폴더에서 화면 파일을 서빙
const PUB = path.join(__dirname, 'public');
const ROOT = fs.existsSync(PUB) ? PUB : __dirname;
const DENY = new Set(['staff.json', 'server.js', 'package.json', 'package-lock.json', 'readme.txt', 'readme.md']);
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

// ---------- 선생님 이름표 (모든 접속자에게 공유, staff.json 에 저장) ----------
const STAFF_FILE = path.join(__dirname, 'staff.json');
const STAFF_DEF = { doc: '의사선생님', man: '접수선생님', nu1: '주사선생님민트', nu2: '주사선생님핑크', rad: '방사선선생님' };
const STAFF_PIN = '090909';
const staff = {};
for (const k in STAFF_DEF) staff[k] = { on: false, name: STAFF_DEF[k] };
try {
  const saved = JSON.parse(fs.readFileSync(STAFF_FILE, 'utf8'));
  for (const k in STAFF_DEF) if (saved[k]) staff[k] = { on: !!saved[k].on, name: String(saved[k].name || STAFF_DEF[k]).slice(0, 24) };
} catch {}
let staffTimer = null;
function saveStaff() { clearTimeout(staffTimer); staffTimer = setTimeout(() => fs.writeFile(STAFF_FILE, JSON.stringify(staff), () => {}), 300); }

// ---------- 멀티플레이 ----------
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 2048 });
const players = new Map();            // id -> 상태
let nextId = 1;
const num = (v, lo, hi, d) => Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d;
const MODES = new Set(['idle', 'walk', 'sit', 'wave', 'steth', 'shot', 'eat', 'xr', 'read', 'lie', 'hug']);
const OPT = { g: ['f', 'm', 'bf', 'bm'], h: ['none', 'bunny', 'cat', 'crown', 'flower'], o: ['basic', 'spider', 'rain', 'acnl', 'boyStyle', 'mcraft', 'mc1', 'mc2', 'mc3'] };
const pick = (list, v, d) => list.includes(v) ? v : d;

function clean(m) {
  const c = m.c || {};
  return {
    x: num(m.x, -20, 20, 0), z: num(m.z, -20, 20, 0), ry: num(m.ry, -10, 10, 0),
    m: MODES.has(m.m) ? m.m : 'idle', sy: num(m.sy, -1, 1, 0.07),
    c: { g: pick(OPT.g, c.g, 'f'), h: pick(OPT.h, c.h, 'none'), o: pick(OPT.o, c.o, 'basic') },
    hd: pick(['', 'grass', 'acorn'], m.hd, '')
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
  const me = { id, n: '친구' + id, x: 0.2, z: 4, ry: Math.PI, m: 'idle', sy: 0.07, c: { g: 'f', h: 'none', o: 'basic' }, hd: '', hg: -1 };
  players.set(id, me);
  send(ws, { t: 'hello', id, players: [...players.values()].filter(p => p.id !== id && p.seen), staff });

  ws.on('pong', () => { ws.alive = true; });
  ws.on('message', raw => {
    if (++ws.cnt > 40) return;                        // 초당 40개 초과 무시
    let m; try { m = JSON.parse(raw.toString()); } catch { return; }
    if (m.t === 'u') {
      Object.assign(me, clean(m)); me.seen = true;
      if (typeof m.n === 'string') { const nn = m.n.replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 24); if (nn) me.n = nn; }
      broadcast({ t: 'u', id, n: me.n, x: me.x, z: me.z, ry: me.ry, m: me.m, sy: me.sy, c: me.c }, ws);
    } else if (m.t === 'staff') {
      if (m.pin !== STAFF_PIN || !(m.k in STAFF_DEF) || typeof m.on !== 'boolean') return;
      const nm = typeof m.name === 'string' ? m.name.replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 24) : '';
      staff[m.k] = { on: m.on, name: nm || STAFF_DEF[m.k] };
      saveStaff();
      broadcast({ t: 'staff', k: m.k, on: staff[m.k].on, name: staff[m.k].name });
    } else if (m.t === 'rel') {
      for (const a of ANIMALS) if (a.hug === id) releaseAnimal(a);
    } else if (m.t === 's' && typeof m.s === 'string') {
      const now = Date.now(); if (now - ws.lastSay < 300) return; ws.lastSay = now;
      broadcast({ t: 's', id, s: m.s.slice(0, 60), ms: num(m.ms, 1500, 5000, 2600) }, ws);
    }
  });
  ws.on('close', () => { for (const a of ANIMALS) if (a.hug === id) releaseAnimal(a); players.delete(id); if (me.seen) broadcast({ t: 'bye', id }, ws); });
  ws.on('error', () => {});
});
setInterval(() => { for (const c of wss.clients) c.cnt = 0; }, 1000);
setInterval(() => {                                      // 끊긴 연결 정리
  for (const c of wss.clients) { if (!c.alive) { c.terminate(); continue; } c.alive = false; try { c.ping(); } catch {} }
}, 30000);


// ---------- 동물 (서버가 계산해서 모든 접속자에게 똑같이 보여줌) ----------
// ※ 좌표/나무/건물 위치는 public/index.html 과 같은 값을 써야 합니다.
const K = 1 / 40, gx = px => px * K - 6.4, gz = py => py * K - 4.5;
const AR = { x1: gx(-280), x2: gx(780), z1: gz(-280), z2: gz(680) };
const TREES = [[-60, 520], [430, 590], [570, 500], [-150, 220], [640, 40]].map(([x, y]) => ({ x: gx(x), z: gz(y) }));
const inBldP = (x, y, p) => (x > -8 - p && x < 347 + p && y > -194 - p && y < 414 + p) || (x > 336 - p && x < 520 + p && y > -8 - p && y < 350 + p);
const free = (x, z) => {
  if (!(x > AR.x1 + .25 && x < AR.x2 - .25 && z > AR.z1 + .25 && z < AR.z2 - .25)) return false;
  if (TREES.some(t => Math.hypot(x - t.x, z - t.z) <= .4)) return false;
  return !inBldP((x + 6.4) / K, (z + 4.5) / K, 14);
};
const FLEE = 3.2;
const ANIMALS = [['rabbit', 150, 520], ['squirrel', 460, 540], ['chick', 300, 600], ['rabbit', 600, 200], ['squirrel', -150, 90], ['chick', 500, -150]]
  .map(([type, x, y], i) => ({ i, type, x: gx(x), z: gz(y), hopT: 0, hdx: 0, hdz: 0, alt: 0, fast: 1.5, wait: Math.random() * 3, calm: 0, eat: 0, corner: 0, hug: 0, hugT: 0, mv: 0 }));
const FOOD = { rabbit: 'grass', squirrel: 'acorn', chick: '-' };

function releaseAnimal(a) {
  const p = players.get(a.hug), pid = a.hug;
  a.hug = 0; a.hugT = 0; a.calm = 1.5; a.corner = 0;
  if (p) {
    p.hg = -1;
    let nx = p.x, nz = p.z;
    outer: for (const dd of [.8, 1.1, 1.5]) for (const off of [0, 1.57, -1.57, 3.14, .8, -.8]) {
      const x = p.x + Math.sin(p.ry + off) * dd, z = p.z + Math.cos(p.ry + off) * dd;
      if (free(x, z)) { nx = x; nz = z; break outer; }
    }
    a.x = nx; a.z = nz;
  }
  broadcast({ t: 'rel', a: a.i, p: pid, x: Math.round(a.x * 100) / 100, z: Math.round(a.z * 100) / 100 });
}

function animalsTick(dt) {
  const ps = [...players.values()].filter(p => p.seen);
  for (const a of ANIMALS) {
    a.mv = 0;
    if (a.hug) {
      const p = players.get(a.hug);
      if (!p || !p.seen) { releaseAnimal(a); continue; }
      a.x = p.x + Math.sin(p.ry) * .32; a.z = p.z + Math.cos(p.ry) * .32;
      a.hugT -= dt; if (a.hugT <= 0) releaseAnimal(a);
      continue;
    }
    a.calm = Math.max(0, a.calm - dt);
    let np = null, nd = 1e9, wp = null, wd = 1e9;
    for (const p of ps) {
      const d = Math.hypot(p.x - a.x, p.z - a.z) || .001;
      if (p.hg < 0 && d < nd) { np = p; nd = d; }
      if (p.hd === FOOD[a.type] && d < wd) { wp = p; wd = d; }
    }
    const want = wp && wd < 5.5;
    let vx = 0, vz = 0, sp = 0;
    if (a.eat > 0) { a.eat -= dt; a.corner = 0; }
    else if (want) {
      if (wd > .78) { vx = (wp.x - a.x) / wd; vz = (wp.z - a.z) / wd; sp = 2.4; }
      else { wp.hd = ''; a.eat = 2.2; broadcast({ t: 'eat', a: a.i, p: wp.id }); }
    } else if (np && nd < FLEE && a.calm <= 0) {
      if (a.hopT <= 0) {
        const bx = (a.x - np.x) * -1 / nd, bz = (a.z - np.z) * -1 / nd;   // 동물 -> 사람 방향
        const cand = a.alt % 2 === 0 ? [135, 225, 180, 90, 270, 55, 305] : [225, 135, 180, 270, 90, 305, 55];
        a.alt++; let ok2 = false;
        for (const dg of cand) {
          const ang = dg * Math.PI / 180, c = Math.cos(ang), sn = Math.sin(ang), hx = bx * c - bz * sn, hz = bx * sn + bz * c;
          if (free(a.x + hx * .5, a.z + hz * .5) && free(a.x + hx * 1.2, a.z + hz * 1.2)) { a.hdx = hx; a.hdz = hz; ok2 = true; break; }
        }
        if (!ok2) { a.hdx = 0; a.hdz = 0; }
        a.hopT = .4; a.fast = 4.1;
      }
      a.hopT -= dt; vx = a.hdx; vz = a.hdz; sp = a.fast; a.wait = .4;
    } else if (a.hopT > 0) { vx = a.hdx; vz = a.hdz; sp = a.fast || 1.5; a.hopT -= dt; }
    else {
      a.wait -= dt;
      if (a.wait <= 0) { a.wait = 2 + Math.random() * 3; const r = Math.random() * Math.PI * 2; a.hdx = Math.cos(r); a.hdz = Math.sin(r); a.hopT = .3; a.fast = 1.5; }
    }
    if (sp > 0 && (vx || vz)) {
      const nx = a.x + vx * sp * dt, nz = a.z + vz * sp * dt;
      if (free(nx, nz)) { a.x = nx; a.z = nz; a.mv = 1; }
      else if (free(nx, a.z) && Math.abs(vx) > .2) { a.x = nx; a.mv = 1; }
      else if (free(a.x, nz) && Math.abs(vz) > .2) { a.z = nz; a.mv = 1; }
      else a.hopT = 0;
    }
    if (np && nd < .58 && a.eat <= 0 && a.calm <= 0 && !want) {
      a.corner += dt;
      if (a.corner >= .35) { a.corner = 0; a.hug = np.id; a.hugT = 3.5; a.hopT = 0; np.hg = a.i; broadcast({ t: 'hug', a: a.i, p: np.id }); }
    } else if (nd >= .58) a.corner = 0;
  }
}
let anTick = 0;
setInterval(() => {
  if (wss.clients.size === 0) return;
  animalsTick(.05);
  if (++anTick % 2 === 0) {
    const r = v => Math.round(v * 100) / 100;
    broadcast({ t: 'an', a: ANIMALS.map(a => [r(a.x), r(a.z), a.mv | (a.eat > 0 ? 2 : 0), a.hug]) });
  }
}, 50);

server.listen(PORT, () => console.log('달소아청소년과 서버 실행: http://localhost:' + PORT));
