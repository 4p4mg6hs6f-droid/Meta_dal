const V='dalkids-v3';
const STATIC=['three.min.js','manifest.webmanifest','icon-192.png','icon-512.png','icon-maskable-512.png','apple-touch-icon.png'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(V).then(c=>c.addAll(STATIC)).then(()=>self.skipWaiting()))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==V).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',e=>{
 const r=e.request;if(r.method!=='GET')return;const u=new URL(r.url);if(u.origin!==location.origin)return;
 const isDoc=r.mode==='navigate'||/\.html$/.test(u.pathname)||u.pathname.endsWith('/');
 if(isDoc){ // 화면 파일: 항상 서버 최신본을 먼저, 오프라인일 때만 저장본
  e.respondWith(fetch(r,{cache:'no-store'}).then(x=>{const cp=x.clone();caches.open(V).then(c=>c.put(r,cp));return x}).catch(()=>caches.match(r).then(m=>m||caches.match('index.html'))))}
 else{ // 3D 라이브러리, 아이콘 등: 저장본 우선
  e.respondWith(caches.match(r).then(m=>m||fetch(r).then(x=>{const cp=x.clone();caches.open(V).then(c=>c.put(r,cp));return x})))}
});
