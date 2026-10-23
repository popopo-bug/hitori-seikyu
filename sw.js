const C='hs-bb1263b680';const PRE=['./','./estimate/','./delivery/','./receipt/','./tools/shohizei/','./tools/gensen/','./assets/style.css?v=bb1263b680','./assets/app.js?v=bb1263b680','./favicon.svg'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(C).then(c=>c.addAll(PRE)).catch(()=>{}));self.skipWaiting();});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==C).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',e=>{const r=e.request;if(r.method!=='GET')return;const u=new URL(r.url);if(u.origin!==location.origin)return;
e.respondWith(fetch(r).then(res=>{if(res.ok){const cp=res.clone();caches.open(C).then(c=>c.put(r,cp));}return res;}).catch(()=>caches.match(r,{ignoreSearch:false}).then(m=>m||caches.match(r,{ignoreSearch:true}))));});
