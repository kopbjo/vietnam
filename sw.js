// Offline-støtte og rask oppstart: lagret kopi vises med én gang, og ny versjon hentes i bakgrunnen.
// Er en fil endret, får appen beskjed (melding «ny»). Nettleserens HTTP-mellomlager omgås («no-cache»/«reload»),
// ellers kan en ny cache-versjon fylles med gamle filer.
const CACHE = "vn-reise-v70";
const BEKR = "vn-bekr", FOTO = "vn-foto"; // v60: bekreftelsene har eget lager som appen selv fyller – overlever nye versjoner
const FILER = ["./", "index.html", "stil.css", "app.js", "data.enc", "manifest.webmanifest", "ikon.svg", "ikon-180.png", "ikon-512.png"];
self.addEventListener("install", (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILER.map((f) => new Request(f, { cache: "reload" })))).then(() => self.skipWaiting())); });
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE && k !== BEKR && k !== FOTO).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
// Én oppføring per fil: ?v=… og lignende tas bort, så en gammel kopi aldri blir liggende ved siden av en ny.
const nokkel = (url) => { const u = new URL(url); u.search = ""; u.hash = ""; return u.href; };
async function ulike(a, b) {
  const [x, y] = await Promise.all([a.arrayBuffer(), b.arrayBuffer()]);
  if (x.byteLength !== y.byteLength) return true;
  const [hx, hy] = await Promise.all([crypto.subtle.digest("SHA-256", x), crypto.subtle.digest("SHA-256", y)]);
  const u = new Uint8Array(hx), v = new Uint8Array(hy);
  return u.some((b, i) => b !== v[i]);
}
async function meld(fil) {
  const ks = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  ks.forEach((k) => k.postMessage({ t: "ny", fil }));
}
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== location.origin) return;
  if (/\/[bf]\/[0-9a-f]+\.enc$/.test(new URL(req.url).pathname)) return; // bekreftelsene: appen henter og lagrer selv
  const k = nokkel(req.url);
  // «Hent nyeste versjon» i appen: rett fra nett, lagres før svaret gis. Feiler det, får appen vite det (og beholder alt).
  if (req.headers.get("x-vn-hent")) {
    e.respondWith(fetch(req, { cache: "reload" }).then(async (r) => {
      if (r.ok && !r.redirected) await (await caches.open(CACHE)).put(k, r.clone());
      return r;
    }));
    return;
  }
  const hent = (async () => {
    const cache = await caches.open(CACHE);
    const lagret = await cache.match(k), sammenlign = lagret && lagret.clone(); // kopi nå – lagret gis til siden og kan ikke leses to ganger
    const nett = fetch(req, { cache: "no-cache" }).then(async (r) => {
      // Bare ekte svar lagres (ikke omdirigeringer, f.eks. innloggingssider på hotell-wifi).
      if (r.ok && !r.redirected) {
        const endret = sammenlign ? await ulike(sammenlign, r.clone()) : false;
        await cache.put(k, r.clone());
        if (endret) await meld(new URL(k).pathname.split("/").pop() || "index.html");
      }
      return r;
    });
    return { lagret, nett };
  })();
  e.respondWith(hent.then(({ lagret, nett }) => lagret || nett.catch(() => caches.open(CACHE).then((c) => c.match(nokkel(new URL("index.html", location).href))))));
  e.waitUntil(hent.then(({ nett }) => nett.catch(() => {})));
});
