// Gjestesiden: postkort fra reisen – ett bilde og én linje fra hver av de reisende, hver dag.
// Ingen navn, datoer eller nøkler ligger i denne fila: tilkoblingen kommer fra invitasjonslenken (#i=…, lagres på enheten),
// og alt innhold hentes fra databasen etter innlogging. Bare gjester på familiens gjesteliste får lese (se firestore.rules).
(() => {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const lagre = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch {} },
    del(k) { try { localStorage.removeItem(k); } catch {} },
  };
  const LS = { opp: "kg.oppsett", inn: "kg.inn", data: "kg.data", sett: "kg.sett" };
  const lesJson = (k, std) => { try { return JSON.parse(lagre.get(k) || "null") || std; } catch { return std; } };

  // ---------- tilkobling fra invitasjonslenken ----------
  // #i=<base64url(JSON {k: apiKey, p: prosjekt, t: tittel, e: e-post})>
  function lesInvitasjon() {
    const m = location.hash.match(/[#&]i=([\w-]+)/);
    if (!m) return;
    try {
      const j = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(m[1].replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0))));
      if (j && j.k && j.p) lagre.set(LS.opp, JSON.stringify({ k: j.k, p: j.p, t: j.t || "", e: j.e || "" }));
    } catch {}
    history.replaceState(null, "", location.pathname + "#/");
  }
  lesInvitasjon();
  let OPP = lesJson(LS.opp, null); // {k, p, t, e}
  let INN = lesJson(LS.inn, null); // {rt, e, uid, g, n}
  const tom = () => ({ opp: null, kort: {}, lik: {}, hilsen: {}, s: {} });
  let DATA = lesJson(LS.data, tom());
  const FORRIGE = Number(lagre.get(LS.sett) || 0); // forrige besøk: kort etter dette er «nye»
  const API = () => `https://firestore.googleapis.com/v1/projects/${OPP.p}/databases/(default)/documents`;
  const ROT = () => `projects/${OPP.p}/databases/(default)/documents`;

  // ---------- innlogging ----------
  let TOK = null, TOKUT = 0;
  const lagreInn = () => lagre.set(LS.inn, JSON.stringify(INN));
  async function idPost(sti, body) {
    const r = await fetch(`https://identitytoolkit.googleapis.com/v1/${sti}?key=${OPP.k}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { const e = new Error((j.error && j.error.message) || "feil " + r.status); e.kode = (j.error && j.error.message) || ""; throw e; }
    return j;
  }
  async function token() {
    if (TOK && Date.now() < TOKUT) return TOK;
    if (!INN || !INN.rt) throw new Error("ikke innlogget");
    const r = await fetch("https://securetoken.googleapis.com/v1/token?key=" + OPP.k, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: "grant_type=refresh_token&refresh_token=" + encodeURIComponent(INN.rt) });
    if (r.status === 400) { loggUt(true); throw new Error("utlogget"); }
    if (!r.ok) throw new Error("token " + r.status);
    const j = await r.json(); TOK = j.id_token; TOKUT = Date.now() + (Number(j.expires_in || 3600) - 120) * 1000;
    INN.rt = j.refresh_token; lagreInn(); return TOK;
  }
  async function fs(metode, sti, body) {
    const r = await fetch(API() + sti, { method: metode, headers: { Authorization: "Bearer " + await token(), "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    if (r.status === 404) return null;
    if (r.status === 401) TOK = null;
    if (!r.ok) { const e = new Error("firestore " + r.status); e.status = r.status; throw e; }
    return r.json();
  }
  // Firestore-verdier ⇄ JS
  function fra(v) {
    if (!v) return null;
    if ("stringValue" in v) return v.stringValue;
    if ("integerValue" in v) return Number(v.integerValue);
    if ("doubleValue" in v) return v.doubleValue;
    if ("booleanValue" in v) return v.booleanValue;
    if ("timestampValue" in v) return Date.parse(String(v.timestampValue).replace(/\.(\d{3})\d*Z$/, ".$1Z")) || 0;
    return null;
  }
  const felt = (doc) => { const o = {}; for (const [k, v] of Object.entries((doc && doc.fields) || {})) o[k] = fra(v); return o; };
  function til(x) {
    if (typeof x === "boolean") return { booleanValue: x };
    if (Number.isInteger(x)) return { integerValue: String(x) };
    if (typeof x === "number") return { doubleValue: x };
    if (x == null) return { nullValue: null };
    return { stringValue: String(x) };
  }
  const skriv = (sti, data, maske) => {
    const w = { update: { name: `${ROT()}/${sti}`, fields: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, til(v)])) }, updateTransforms: [{ fieldPath: "s", setToServerValue: "REQUEST_TIME" }] };
    if (maske) w.updateMask = { fieldPaths: maske };
    return fs("POST", ":commit", { writes: [w] });
  };

  async function loggInn(e, p) {
    const j = await idPost("accounts:signInWithPassword", { email: e, password: p, returnSecureToken: true });
    INN = { rt: j.refreshToken, e: String(j.email || e).toLowerCase(), uid: j.localId };
    TOK = j.idToken; TOKUT = Date.now() + (Number(j.expiresIn || 3600) - 120) * 1000;
    lagreInn();
    await finnInngang();
  }
  async function finnInngang() {
    let d = null;
    try { d = await fs("GET", "/inngang/" + encodeURIComponent(INN.e)); } catch (e) { if (e.status !== 403) throw e; }
    if (!d) { const e = new Error("ikke-paa-lista"); e.kode = "IKKE_PAA_LISTA"; throw e; }
    const f = felt(d); INN.g = f.g; INN.n = f.n; lagreInn();
  }
  function loggUt(stille) {
    INN = null; TOK = null; DATA = tom(); lagre.del(LS.inn); lagre.del(LS.data);
    try { caches.delete("kg-bilder"); } catch {}
    BILDER.clear(); if (!stille) toast("Du er logget ut");
    tegn();
  }

  // ---------- henting (inkrementelt: bare det som er endret siden sist, med litt overlapp) ----------
  let henter = null, sistOppsett = 0;
  async function sporring(samling) {
    const q = { from: [{ collectionId: samling }] }, s = DATA.s[samling] || 0;
    if (s) q.where = { fieldFilter: { field: { fieldPath: "s" }, op: "GREATER_THAN", value: { timestampValue: new Date(s - 120000).toISOString() } } };
    const svar = await fs("POST", `/gjest/${INN.g}:runQuery`, { structuredQuery: q });
    let endret = false, maks = s;
    for (const x of svar || []) {
      if (!x.document) continue;
      const id = decodeURIComponent(x.document.name.split("/").pop()), f = felt(x.document);
      maks = Math.max(maks, f.s || 0);
      const her = DATA[samling][id];
      if (!her || her.s !== f.s) { DATA[samling][id] = f; endret = true; }
    }
    DATA.s[samling] = maks; return endret;
  }
  async function hent() {
    if (!INN || !INN.g || !navigator.onLine) return;
    if (henter) return henter;
    henter = (async () => {
      try {
        let endret = false;
        if (!DATA.opp || Date.now() - sistOppsett > 10 * 60e3) {
          const d = await fs("GET", `/gjest/${INN.g}/oppsett/reise`);
          if (d) { const j = felt(d).j; if (JSON.stringify(DATA.opp) !== j) { DATA.opp = JSON.parse(j); endret = true; } }
          sistOppsett = Date.now();
        }
        const r = await Promise.all(["kort", "lik", "hilsen"].map(sporring));
        endret = endret || r.some(Boolean);
        lagre.set(LS.data, JSON.stringify(DATA));
        if (endret) tegnTrygt();
      } catch (e) {
        if (e.status === 403) { // fjernet fra gjestelista
          try { await finnInngang(); } catch (e2) { if (e2.kode === "IKKE_PAA_LISTA") { loggUt(true); visFeilInn("Du har ikke lenger tilgang. Spør familien om en ny invitasjon."); } }
        }
      } finally { henter = null; }
    })();
    return henter;
  }

  // ---------- bilder: hentes når de vises, lagres på enheten ----------
  const BILDER = new Map(); // b → objekt-URL
  const BLAST = new Map();
  async function bilde(b) {
    if (BILDER.has(b)) return BILDER.get(b);
    if (BLAST.has(b)) return BLAST.get(b);
    const p = (async () => {
      const nok = new URL("kg-bilde/" + b, location.href).href; let c = null, blob = null;
      try { c = await caches.open("kg-bilder"); const r = await c.match(nok); if (r) blob = await r.blob(); } catch {}
      if (!blob) {
        const d = await fs("GET", `/gjest/${INN.g}/bilder/${b}`);
        if (!d) throw new Error("mangler");
        const bin = atob(felt(d).c), u = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
        blob = new Blob([u], { type: "image/jpeg" });
        try { if (c) await c.put(nok, new Response(blob)); } catch {}
      }
      const url = URL.createObjectURL(blob); BILDER.set(b, url); return url;
    })();
    BLAST.set(b, p);
    try { return await p; } finally { BLAST.delete(b); }
  }
  async function fyll(el) {
    const b = el.dataset.b || el.dataset.fb; if (!b || el.dataset.ok) return; el.dataset.ok = "1";
    try {
      const url = await bilde(b);
      if (el.dataset.b) { el.onload = () => { el.classList.add("klar"); const l = el.parentElement && el.parentElement.querySelector(".laster"); if (l) l.remove(); }; el.src = url; }
      else el.style.backgroundImage = `url("${url}")`;
    } catch { delete el.dataset.ok; const l = el.parentElement && el.parentElement.querySelector(".laster"); if (l) l.textContent = "Fikk ikke hentet bildet"; }
  }
  const obs = "IntersectionObserver" in window ? new IntersectionObserver((xs) => xs.forEach((x) => { if (x.isIntersecting) { obs.unobserve(x.target); fyll(x.target); } }), { rootMargin: "600px 600px" }) : null;
  const fyllAlle = () => $$("[data-b],[data-fb]").forEach((el) => (obs ? obs.observe(el) : fyll(el)));

  // ---------- datoer og steder ----------
  const TZ = () => (DATA.opp && DATA.opp.tz) || "Asia/Ho_Chi_Minh";
  const idag = () => new Intl.DateTimeFormat("sv-SE", { timeZone: TZ(), year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const dt = (d) => new Date(d + "T12:00:00Z");
  const pluss = (d, n) => { const x = dt(d); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
  const mellom = (a, b) => Math.round((dt(b) - dt(a)) / 864e5);
  const pen = (d, uke = true) => new Intl.DateTimeFormat("nb-NO", { timeZone: "UTC", weekday: uke ? "long" : undefined, day: "numeric", month: "long" }).format(dt(d));
  const stor = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const kortDato = (d) => new Intl.DateTimeFormat("nb-NO", { timeZone: "UTC", day: "numeric", month: "short" }).format(dt(d)).replace(".", "");
  const steder = () => (DATA.opp && DATA.opp.steder) || [];
  const stedFor = (d) => steder().filter((s) => s.fra <= d && d <= s.til).sort((a, b) => (a.fra < b.fra ? 1 : -1))[0] || null;
  const personer = () => (DATA.opp && DATA.opp.personer) || [];
  const navnPaa = (id) => (personer().find((p) => p.id === id) || {}).navn || "";
  const etikett = (d) => (d === idag() ? "I dag" : d === pluss(idag(), -1) ? "I går" : stor(pen(d)));
  const datoTekst = (d) => new Intl.DateTimeFormat("nb-NO", { timeZone: "UTC", day: "2-digit", month: "2-digit", year: "2-digit" }).format(dt(d)).replace(/\//g, ".");
  const utenAksent = (s) => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D");

  // ---------- utvalg ----------
  const synlig = () => Object.entries(DATA.kort).filter(([, k]) => k && !k.x && k.b && k.d <= pluss(idag(), 1)).map(([id, k]) => ({ id, ...k })); // aldri kort fra fremtiden
  const rekkef = (a, b) => personer().findIndex((p) => p.id === a.hvem) - personer().findIndex((p) => p.id === b.hvem);
  const kortPaa = (d) => synlig().filter((k) => k.d === d).sort(rekkef);
  const dager = () => [...new Set(synlig().map((k) => k.d))].sort().reverse();
  const minId = () => (INN ? INN.e : "");
  const likFor = (id) => Object.values(DATA.lik).filter((l) => l.p === id && l.v === 1).sort((a, b) => (a.s || 0) - (b.s || 0));
  const hilsenFor = (id) => Object.entries(DATA.hilsen).filter(([, h]) => h.p === id && !h.x).map(([hid, h]) => ({ hid, ...h })).sort((a, b) => (a.s || 9e15) - (b.s || 9e15));
  const erNy = (k) => FORRIGE && k.s > FORRIGE;

  // ---------- grafikk ----------
  const IK = {
    hjerte: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.5s-7.3-4.5-9.4-9C1.2 8.3 3.1 5 6.5 5c2 0 3.6 1.2 4.5 2.6C11.9 6.2 13.5 5 15.5 5c3.4 0 5.3 3.3 3.9 6.5-2.1 4.5-7.4 9-7.4 9Z"/></svg>',
    brev: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg>',
    snu: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12a8 8 0 0 1 14-5.3M20 4v4h-4M20 12a8 8 0 0 1-14 5.3M4 20v-4h4"/></svg>',
    dag: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="5" width="16" height="14" rx="1.5"/><path d="M4 9h16M15 13l3 3"/></svg>',
    kart: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2Zm0 0v14m6-12v14"/></svg>',
    album: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 3v18"/></svg>',
  };
  const frim = (b, txt, v, stil = "") => `<div class="frim" style="${stil}" aria-hidden="true"><div class="i" ${b ? `data-fb="${esc(b)}"` : ""}><span>${esc(txt)}</span><em>${esc(v)}</em></div></div>`;
  let stN = 0;
  function stempel(sted, d, farge = "currentColor", stil = "") {
    const id = "st" + (++stN);
    return `<svg class="stempel" style="color:var(--blekk);${stil}" width="150" height="86" viewBox="0 0 150 86" aria-hidden="true"><defs><path id="${id}" d="M43 43m-30 0a30 30 0 1 1 60 0a30 30 0 1 1 -60 0"/></defs>
      <circle cx="43" cy="43" r="38" fill="none" stroke="${farge}" stroke-width="1.6"/><circle cx="43" cy="43" r="26" fill="none" stroke="${farge}" stroke-width="1"/>
      <text font-family="Be Vietnam Pro, sans-serif" font-size="8.5" font-weight="700" fill="${farge}" letter-spacing="1.5"><textPath href="#${id}">${esc(String(sted).toUpperCase())} · VIỆT NAM ·</textPath></text>
      <text x="43" y="47" text-anchor="middle" font-family="Be Vietnam Pro, sans-serif" font-size="11" font-weight="700" fill="${farge}">${esc(d)}</text>
      ${[0, 1, 2, 3].map((i) => `<path d="M84 ${26 + i * 10}q8 -5 16 0t16 0t16 0t16 0" fill="none" stroke="${farge}" stroke-width="1.4"/>`).join("")}</svg>`;
  }
  // Tegnede frimerker til innloggingen (ingen bilder fra reisen før man er logget inn)
  const MOTIV = {
    lykt: '<svg viewBox="0 0 100 120"><rect width="100" height="120" fill="#1d2b45"/><circle cx="20" cy="18" r="1" fill="#fff8"/><circle cx="80" cy="30" r="1.2" fill="#fff8"/><circle cx="62" cy="12" r=".8" fill="#fff8"/><path d="M50 8v14" stroke="#c3923a" stroke-width="1.5"/><ellipse cx="50" cy="56" rx="26" ry="31" fill="#e2553f"/><ellipse cx="50" cy="56" rx="17" ry="27" fill="#ff8a5c" opacity=".7"/><ellipse cx="50" cy="56" rx="7" ry="22" fill="#ffd27a" opacity=".8"/><rect x="38" y="20" width="24" height="7" rx="2" fill="#c3923a"/><rect x="38" y="85" width="24" height="7" rx="2" fill="#c3923a"/><path d="M44 92l-3 14M50 92v16M56 92l3 14" stroke="#c3923a" stroke-width="1.5"/></svg>',
    bukt: '<svg viewBox="0 0 120 100"><defs><linearGradient id="hv" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f6d9a8"/><stop offset="1" stop-color="#e9b78a"/></linearGradient></defs><rect width="120" height="100" fill="url(#hv)"/><circle cx="88" cy="28" r="10" fill="#fff3d6"/><path d="M0 70 C8 30 18 28 22 70 Z M18 70 C26 20 40 18 44 70 Z M60 70 C64 40 72 36 78 70 Z M86 70 C90 46 100 44 104 70Z" fill="#3f6b5f"/><path d="M30 70 C34 44 44 42 50 70 Z" fill="#2e5247"/><rect y="70" width="120" height="30" fill="#5d8c88"/><path d="M48 82h26l-4 6H52Z" fill="#7a3d22"/><path d="M60 82V64l10 16" fill="#f4ecdc"/><path d="M0 78h120M10 90h40M70 94h40" stroke="#ffffff55" stroke-width="1"/></svg>',
    hatt: '<svg viewBox="0 0 100 120"><rect width="100" height="120" fill="#2e6b5a"/><path d="M0 92 Q50 70 100 92 V120 H0Z" fill="#6aa86a"/><path d="M0 100 Q50 84 100 102 V120 H0Z" fill="#8cc07a"/><path d="M14 74 L50 34 L86 74 Z" fill="#e8cf96"/><path d="M14 74 Q50 82 86 74" fill="none" stroke="#b58f4c" stroke-width="2"/><path d="M50 34 L38 74M50 34 L62 74M50 34 L26 74M50 34 L74 74" stroke="#c7a568" stroke-width="1"/></svg>',
    flagg: '<svg viewBox="0 0 100 100"><rect width="100" height="100" fill="#f6d9a8"/><path d="M0 78 Q30 62 60 74 T100 70 V100 H0Z" fill="#6aa86a"/><path d="M0 88 Q40 76 100 86 V100 H0Z" fill="#4f8f5a"/><path d="M30 86 V18" stroke="#5b4630" stroke-width="2.5"/><path d="M31 20 C44 14 54 26 72 20 L72 50 C54 56 44 44 31 50Z" fill="#DA251D"/><polygon points="51.5,25 54.4,32.6 62.3,32.9 56.1,37.8 58.3,45.4 51.5,41 44.7,45.4 46.9,37.8 40.7,32.9 48.6,32.6" fill="#FFDD00"/></svg>',
    lotus: '<svg viewBox="0 0 100 100"><rect width="100" height="100" fill="#f3d6d0"/><path d="M50 74 C34 64 30 44 50 28 C70 44 66 64 50 74Z" fill="#e58aa0"/><path d="M50 74 C30 72 18 56 22 42 C38 46 48 58 50 74Z" fill="#d86c88"/><path d="M50 74 C70 72 82 56 78 42 C62 46 52 58 50 74Z" fill="#d86c88"/><path d="M14 80 Q50 66 86 80" fill="none" stroke="#3f7d5f" stroke-width="3"/><circle cx="50" cy="60" r="4" fill="#f2c45a"/></svg>',
  };
  // Vietnams flagg (rødt med gul stjerne) – med litt stoff-skygge
  const STJERNE = (cx, cy, r) => Array.from({ length: 10 }, (_, i) => { const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? r * 0.382 : r; return `${(cx + rr * Math.cos(a)).toFixed(2)},${(cy + rr * Math.sin(a)).toFixed(2)}`; }).join(" ");
  const flagg = (cls = "flagg") => `<svg class="${cls}" viewBox="0 0 30 20" role="img" aria-label="Vietnams flagg"><defs><linearGradient id="fl-sk" x1="0" x2="1"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".35" stop-color="#fff" stop-opacity=".18"/><stop offset=".55" stop-color="#000" stop-opacity=".08"/><stop offset=".8" stop-color="#fff" stop-opacity=".12"/><stop offset="1" stop-color="#000" stop-opacity=".1"/></linearGradient></defs><rect width="30" height="20" rx="1.2" fill="#DA251D"/><polygon points="${STJERNE(15, 10.4, 6)}" fill="#FFDD00"/><rect width="30" height="20" rx="1.2" fill="url(#fl-sk)"/></svg>`;
  const TR = {
    fly: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 15.5v-2L13.5 9V4a1.5 1.5 0 0 0-3 0v5L3 13.5v2l7.5-2.3V18l-2 1.5V21l3.5-1 3.5 1v-1.5l-2-1.5v-4.8z"/></svg>',
    bil: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 16V11l2-4.5h10L19 11v5M5 16h14M5 16v2.5M19 16v2.5M3.5 11h17"/><circle cx="8" cy="13.5" r=".9"/><circle cx="16" cy="13.5" r=".9"/></svg>',
    bat: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 16.5 5 20h14l2-3.5zM6 16.5V11h12v5.5M9 11V7h6v4M12 4v3"/></svg>',
  };
  const tegnetFrim = (motiv, txt, v, stil) => `<div class="frim" style="${stil}" aria-hidden="true"><div class="i">${MOTIV[motiv]}<span>${esc(txt)}</span><em>${esc(v)}</em></div></div>`;

  // ---------- visninger ----------
  const app = $("#app");
  const rute = () => { const [, side = "", a = "", b = ""] = (location.hash || "#/").split("/"); return { side, a: decodeURIComponent(a), b: decodeURIComponent(b) }; };
  const tittel = () => (DATA.opp && DATA.opp.tittel) || (OPP && OPP.t) || "Postkort fra reisen";
  function tittelHtml() {
    const t = tittel(), m = t.match(/^(#\S+)\s+(.*)$/);
    return m ? `<b>${esc(m[1])}</b> <i>${esc(m[2])}</i>` : esc(t);
  }

  function visInngang(feil = "") {
    document.title = tittel();
    const e = (INN && INN.e) || (OPP && OPP.e) || "";
    app.innerHTML = `<div class="inn"><div class="inn-kunst">
        ${tegnetFrim("lykt", "Việt Nam", "5000đ", "left:4%;top:34px;width:44%;height:52%;transform:rotate(-7deg)")}
        ${tegnetFrim("bukt", "Việt Nam", "3000đ", "left:50%;top:12px;width:46%;height:36%;transform:rotate(5deg)")}
        ${tegnetFrim("hatt", "Việt Nam", "4000đ", "left:44%;top:44%;width:34%;height:40%;transform:rotate(-2deg)")}
        ${tegnetFrim("flagg", "Việt Nam", "2000đ", "left:12%;top:63%;width:28%;height:29%;transform:rotate(4deg)")}
        ${stempel("Post fra reisen", "★", "var(--lakk)", "left:56%;top:76%;transform:rotate(-12deg);opacity:.8")}
      </div><form class="inn-skjema" id="innskjema" novalidate>
        <div class="sup">Post fra reisen</div><h1>${tittelHtml().replace(/<\/b> <i>/, "</b><br><i>")}${flagg("flagg inn-flagg")}</h1>
        ${OPP ? `<p class="ingress">Ett postkort fra hver av de reisende – hver dag. Logg inn med e-posten og passordet du fikk i invitasjonen.</p>
        <label class="felt"><span>E-post</span><input type="email" id="epost" autocomplete="username" inputmode="email" value="${esc(e)}" required></label>
        <label class="felt"><span>Passord</span><input type="password" id="passord" autocomplete="current-password" required></label>
        <button class="go" id="innknapp" type="submit">Åpne postkassen ${IK.brev}</button>
        <p class="feil" id="innfeil" role="alert">${esc(feil)}</p>
        <button type="button" class="lenkeknapp" id="glemt">Glemt passord?</button>`
        : `<p class="ingress">Åpne lenken du fikk i invitasjonen (på SMS eller e-post) – da kommer du rett inn hit.</p>`}
      </form></div>`;
    const f = $("#innskjema");
    if (!OPP) return;
    f.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const ep = $("#epost").value.trim(), pw = $("#passord").value, b = $("#innknapp"), fe = $("#innfeil");
      if (!ep || !pw) { fe.textContent = "Skriv inn e-post og passord."; return; }
      b.disabled = true; b.firstChild.textContent = "Åpner … "; fe.textContent = "";
      try { await loggInn(ep, pw); location.hash = "#/"; await hent(); tegn(); }
      catch (e) {
        b.disabled = false; b.firstChild.textContent = "Åpne postkassen ";
        const k = e.kode || "";
        fe.textContent = /INVALID|EMAIL_NOT_FOUND|PASSWORD/.test(k) ? "Feil e-post eller passord." : /TOO_MANY/.test(k) ? "For mange forsøk. Vent litt og prøv igjen."
          : k === "IKKE_PAA_LISTA" ? "Kontoen finnes, men står ikke på gjestelista (ennå). Spør familien." : /DISABLED/.test(k) ? "Kontoen er stengt." : navigator.onLine ? "Noe gikk galt. Prøv igjen om litt." : "Ingen nettforbindelse.";
        if (k === "IKKE_PAA_LISTA") { INN = null; lagre.del(LS.inn); }
      }
    });
    $("#glemt").addEventListener("click", async () => {
      const ep = $("#epost").value.trim(), fe = $("#innfeil");
      if (!ep) { fe.textContent = "Skriv e-posten din først, så sender vi en lenke for nytt passord."; $("#epost").focus(); return; }
      try { await idPost("accounts:sendOobCode", { requestType: "PASSWORD_RESET", email: ep }); fe.textContent = ""; toast("Sjekk e-posten – lenken for nytt passord er sendt.", 5000); }
      catch { fe.textContent = "Fikk ikke sendt. Sjekk e-posten og prøv igjen."; }
    });
  }
  let FEIL_INN = "";
  const visFeilInn = (t) => { FEIL_INN = t; tegn(); };

  const nav = (side) => `<nav class="nav" aria-label="Meny">
      <a href="#/" ${side === "" || side === "dag" ? 'aria-current="page"' : ""}>${IK.dag}<span>Dagens kort</span></a>
      <a href="#/rute" ${side === "rute" ? 'aria-current="page"' : ""}>${IK.kart}<span>Reiseruten</span></a>
      <a href="#/album" ${side === "album" ? 'aria-current="page"' : ""}>${IK.album}<span>Albumet</span></a></nav>`;
  const mast = (side) => `<header class="mast"><div class="t">${tittelHtml()}${flagg("flagg mast-flagg")}</div>${nav(side)}<button class="meg" data-meg title="${esc(INN.n || INN.e)}" aria-label="Innlogget som ${esc(INN.n || INN.e)}">${esc((INN.n || INN.e || "?").charAt(0).toUpperCase())}</button></header>`;

  function rutelinje(d) {
    const st = steder(); if (!st.length) return "";
    const n = st.length - 1, naa = stedFor(d);
    const i0 = naa ? st.indexOf(naa) : d < st[0].fra ? -1 : n;
    return `<div class="rute" aria-hidden="true"><div class="linje"></div><div class="fl" style="width:calc((100% - 48px) * ${Math.max(0, i0) / (n || 1)})"></div>
      ${st.map((s, i) => `<a class="st ${i < i0 ? "f" : i === i0 ? "n" : ""}" href="#/album/${esc(s.id)}" style="left:calc(24px + (100% - 48px) * ${i / (n || 1)})"><i></i>${esc(s.kort || s.navn)}</a>`).join("")}</div>`;
  }

  function kortHtml(k, nr) {
    const navn = k.n || navnPaa(k.hvem), lik = likFor(k.id), jeg = lik.some((l) => l.e === minId()), hs = hilsenFor(k.id);
    const r = [-0.8, 0.6, -0.4, 0.9][nr % 4], sted = k.sted || (stedFor(k.d) || {}).navn || "";
    const likTekst = !lik.length ? "" : lik.length === 1 && jeg ? "♥ Du liker dette" : `♥ ${lik.slice(-2).map((l) => esc(l.e === minId() ? "deg" : l.n)).join(lik.length > 2 ? ", " : " og ")}${lik.length > 2 ? ` og ${lik.length - 2} ${lik.length - 2 === 1 ? "annen" : "andre"}` : ""}`;
    const snudd = SNUDD.has(k.id);
    return `<div class="kortplass" id="k-${esc(k.id)}" data-hvem="${esc(k.hvem)}"><div class="pkort${snudd ? " snudd" : ""}" style="--r:${r}deg">
      <div class="side forside" ${snudd ? 'aria-hidden="true"' : ""}>
        ${erNy(k) ? `<span class="ny-merke">Ny</span>` : ""}
        <button class="foto" data-stor="${esc(k.id)}" style="--ar:${k.w && k.h ? `${k.w} / ${k.h}` : "4 / 3"}" aria-label="Vis bildet fra ${esc(navn)} stort"><img data-b="${esc(k.b)}" alt="Bildet fra ${esc(navn)}"><span class="laster">Henter bildet …</span>${stempel(sted, datoTekst(k.d), "#fffdf8", "right:2%;bottom:3%;opacity:.85")}</button>
        ${frim(k.b, utenAksent(sted), kortDato(k.d))}
        <p class="tekst"><b>${esc(navn)}:</b> ${k.tekst ? esc(k.tekst) : `<span class="stille">…</span>`}</p>
        <div class="handlinger">
          <button class="knapp lik${jeg ? " på" : ""}" data-lik="${esc(k.id)}" aria-pressed="${jeg}" aria-label="${jeg ? "Du liker dette – trykk for å angre" : "Lik"}">${IK.hjerte}<span>${lik.length || ""}</span></button>
          <button class="knapp" data-snu="${esc(k.id)}">${IK.brev}<span>${hs.length ? `${hs.length} ${hs.length === 1 ? "hilsen" : "hilsener"}` : "Skriv en hilsen"}</span></button>
          <button class="snu" data-snu="${esc(k.id)}">${IK.snu}Snu kortet</button>
        </div>
        ${likTekst ? `<p class="likte">${likTekst}</p>` : ""}
      </div>
      <div class="side bakside" ${snudd ? "" : 'aria-hidden="true"'}>
        <div class="bak-topp"><h4>Hilsener til ${esc(navn)}${hs.length ? ` · ${hs.length}` : ""}</h4><button class="snu" data-snu="${esc(k.id)}">${IK.snu}Snu</button></div>
        <div class="bak-innhold"><div class="hilsener">${hs.length ? hs.map((h) => `<div class="h${/^familie:/.test(h.e) ? " fam" : ""}"><b>${esc(h.n)}${h.s ? `<small>${esc(siden(h.s))}</small>` : ""}${h.e === minId() ? `<button class="slett" data-slett="${esc(h.hid)}">Slett</button>` : ""}</b>${esc(h.t)}</div>`).join("") : `<p class="ingen">Bli den første som skriver på kortet!</p>`}</div>
          <div class="adresse">${frim(k.b, utenAksent(sted), kortDato(k.d))}${stempel(sted, datoTekst(k.d), "currentColor", "transform:rotate(-10deg) scale(.8);transform-origin:0 0")}
            <div class="l">Til ${esc(navn)}</div><div class="l">${esc(utenAksent(sted))}</div><div class="l">Vietnam</div>${k.tekst ? `<p class="sitat">«${esc(k.tekst)}»</p>` : ""}</div></div>
        <div class="skriv"><textarea data-skriv="${esc(k.id)}" rows="1" maxlength="500" placeholder="Skriv på kortet …" aria-label="Skriv en hilsen til ${esc(navn)}">${esc(UTKAST.get(k.id) || "")}</textarea><button data-send="${esc(k.id)}" ${(UTKAST.get(k.id) || "").trim() ? "" : "disabled"}>Send</button></div>
      </div></div></div>`;
  }
  function siden(ms) {
    const s = Math.max(0, (Date.now() - ms) / 1000);
    if (s < 90) return "nå nettopp"; if (s < 3600) return `for ${Math.round(s / 60)} min siden`; if (s < 86400) return `for ${Math.round(s / 3600)} t siden`;
    return new Intl.DateTimeFormat("nb-NO", { day: "numeric", month: "short" }).format(new Date(ms));
  }

  function dagHtml(d, ekstra = "") {
    const K = kortPaa(d), st = stedFor(d), ps = personer();
    return `<div class="dagtopp"><h2>${esc(etikett(d))}</h2>${st ? `<span class="sted">${esc(st.navn)}</span>` : ""}${ekstra}</div>
      ${ps.length > 1 ? `<div class="velg" role="tablist">${ps.map((p) => { const k = K.find((x) => x.hvem === p.id); return `<button data-hopp="${esc(p.id)}" ${k ? "" : "disabled"} aria-label="${esc(p.navn)}${k ? "" : " – ikke valgt ennå"}">${esc(p.navn.charAt(0))}${k && erNy(k) ? '<span class="prikk"></span>' : ""}</button>`; }).join("")}</div>` : ""}
      <div class="karusell">${K.map((k, i) => kortHtml(k, i)).join("")}</div>`;
  }
  function tidligereHtml(utenom) {
    const L = dager().filter((d) => d !== utenom);
    if (!L.length) return "";
    return `<section class="tidl"><h3>Tidligere dager</h3><div class="liste">${L.map((d) => {
      const K = kortPaa(d), st = stedFor(d), ny = K.some(erNy);
      return `<a class="dagrad" href="#/dag/${d}"><div class="mini-rad">${K.slice(0, 4).map((k, i) => `<div class="mini" style="--r:${[-3, 2, -1.5, 3][i]}deg"><div data-fb="${esc(k.b)}"></div></div>`).join("")}</div>
        <div class="dt"><b>${esc(stor(pen(d)))}</b><span>${st ? esc(st.navn) + " · " : ""}${K.length} ${K.length === 1 ? "kort" : "kort"}</span></div>${ny ? '<span class="ny-merke">Ny</span>' : ""}<span class="pil">›</span></a>`;
    }).join("")}</div></section>`;
  }

  // Kartet over reiseruten: nummererte stopp fra nord til sør, piler i reiseretningen, fly som buer med fly-ikon,
  // inn- og utreise (fra og til Norge), og et lite flagg der vi er nå. kompakt = venstre spalte på PC.
  function kartHtml(h, venstre = 0, kompakt = false) {
    const K = window.KART, st = steder(); if (!K || !st.length) return "";
    const [la0, lo0, la1, lo1] = K.bb, k = K.H / (la1 - la0), c = K.W / ((lo1 - lo0) * k);
    const P = st.map((s) => ({ ...s, x: (s.lon - lo0) * k * c, y: (la1 - s.lat) * k })).filter((p) => isFinite(p.x));
    const d = idag(), naa = stedFor(d), o = DATA.opp || {}, iN = naa ? P.findIndex((p) => p.id === naa.id) : -1;
    const iF = d < (st[0] || {}).fra ? -1 : iN >= 0 ? iN : P.length - 1; // siste stopp vi har kommet til
    const f = (n) => n.toFixed(1);
    // Én etappe: kvadratisk kurve som buer ut mot havet (østover), pil eller fly midt på
    function etappe(A, B, modus, ferdig) {
      const dx = B.x - A.x, dy = B.y - A.y, L = Math.hypot(dx, dy) || 1, bue = modus === "fly" ? 0.28 : 0.16;
      const C = { x: (A.x + B.x) / 2 + (dy / L) * L * bue, y: (A.y + B.y) / 2 - (dx / L) * L * bue };
      const t = 0.55, px = (1 - t) ** 2 * A.x + 2 * (1 - t) * t * C.x + t * t * B.x, py = (1 - t) ** 2 * A.y + 2 * (1 - t) * t * C.y + t * t * B.y;
      const tx = 2 * (1 - t) * (C.x - A.x) + 2 * t * (B.x - C.x), ty = 2 * (1 - t) * (C.y - A.y) + 2 * t * (B.y - C.y), vin = (Math.atan2(ty, tx) * 180) / Math.PI;
      const kl = `etappe ${modus === "fly" ? "fly" : "land"}${ferdig ? " ferdig" : ""}`;
      const tegn = modus === "fly"
        ? `<g transform="translate(${f(px)} ${f(py)}) rotate(${f(vin + 90)}) scale(.42) translate(-12 -12)" class="e-ikon">${TR.fly.replace(/<\/?svg[^>]*>/g, "")}</g>`
        : `<path class="e-pil" transform="translate(${f(px)} ${f(py)}) rotate(${f(vin)})" d="M-2.6 -2.4 L2.4 0 L-2.6 2.4 Z"/>`;
      return `<path class="${kl}" d="M${f(A.x)} ${f(A.y)} Q${f(C.x)} ${f(C.y)} ${f(B.x)} ${f(B.y)}"/>${tegn.replace('class="e-', `class="${ferdig ? "ferdig " : ""}e-`)}`;
    }
    let lag = "";
    // inn fra Norge (fra nordvest) og hjem (mot sørøst)
    const inn = o.fra || ["fly", "Fly fra Norge"], hjem = o.hjem || ["fly", "Fly hjem"], A0 = P[0], Z = P[P.length - 1];
    lag += etappe({ x: 6, y: 6 }, A0, inn[0], iF >= 0);
    lag += etappe(Z, { x: K.W - 6, y: K.H - 4 }, hjem[0], d > (o.slutt || "9"));
    for (let i = 1; i < P.length; i++) lag += etappe(P[i - 1], P[i], ((P[i].inn || [])[0]) || "bil", i <= iF);
    // stopp med nummer og navn – etikettene spres så de ikke kolliderer (strek fra punktet hvis flyttet)
    const fs = kompakt ? 9.5 : 8.2, r = kompakt ? 6.4 : 5.6, hoyde = kompakt ? fs * 1.25 : fs * 2.05;
    const E = P.map((p, i) => { const side = p.x < 60 ? "under" : p.x < 100 ? "v" : "h"; return { p, i, side, y: side === "under" ? p.y + r + fs + 1 : p.y + fs * 0.32 }; });
    for (const side of ["v", "h"]) {
      const L = E.filter((e) => e.side === side).sort((a, b) => a.y - b.y);
      for (let j = 1; j < L.length; j++) if (L[j].y - L[j - 1].y < hoyde) { L[j - 1].y -= (hoyde - (L[j].y - L[j - 1].y)) / 2; L[j].y = L[j - 1].y + hoyde; }
    }
    const merk = E.map(({ p, i, side, y: ly }) => {
      const ferdig = i <= iF, her = i === iN, flyttet = side !== "under" && Math.abs(ly - (p.y + fs * 0.32)) > 1;
      const lx = side === "v" ? p.x - r - (flyttet ? 8 : 3) : side === "h" ? p.x + r + (flyttet ? 8 : 3) : p.x;
      const anker = side === "v" ? "end" : side === "h" ? "start" : "middle";
      return `<g class="stopp${ferdig ? " ferdig" : ""}${her ? " her" : ""}">
        ${flyttet ? `<path class="leder" d="M${f(p.x + (side === "v" ? -r : r))} ${f(p.y)} L${f(lx + (side === "v" ? 2 : -2))} ${f(ly - fs * 0.32)}"/>` : ""}
        ${her ? `<circle class="puls" cx="${f(p.x)}" cy="${f(p.y)}" r="${r + 4}"/>` : ""}
        <circle cx="${f(p.x)}" cy="${f(p.y)}" r="${r}"/><text class="nr" x="${f(p.x)}" y="${f(p.y + r * 0.42)}" text-anchor="middle" font-size="${f(r * 1.25)}">${i + 1}</text>
        <text class="knavn" x="${f(lx)}" y="${f(ly)}" text-anchor="${anker}" font-size="${fs}">${esc(p.kort || p.navn)}</text>
        ${kompakt ? "" : `<text class="kdato" x="${f(lx)}" y="${f(ly + fs * 0.95)}" text-anchor="${anker}" font-size="${f(fs * 0.68)}">${esc(periode(p))}</text>`}
      </g>`;
    }).join("");
    // flagget der vi er nå (tegnes til slutt, over alt annet)
    const H = iN >= 0 ? P[iN] : null;
    const flaggHer = H ? `<g transform="translate(${f(H.x)} ${f(H.y - r)})"><path class="stang" d="M0 0 V-11"/><g transform="translate(0.3 -11) scale(.3)">${flagg("kartflagg").replace(/<\/?svg[^>]*>/g, "")}</g></g>` : "";
    const w = (K.W * h) / K.H;
    return `<div class="rutekart${kompakt ? " kompakt" : ""}" style="height:${h}px"><svg width="${f(w)}" height="${h}" viewBox="0 0 ${K.W} ${K.H}" style="margin-left:${venstre}px" role="img" aria-label="Kart over reiseruten fra nord til sør: ${esc(P.map((p, i) => `${i + 1} ${p.navn}`).join(", "))}">
      <path class="vn" d="${K.vn}"/>${lag}${merk}${flaggHer}
      </svg></div>`;
  }
  // Tidslinja under kartet: stoppene i rekkefølge, med hvordan vi reiser mellom dem
  function tidslinjeHtml(kompakt = false) {
    const d = idag(), naa = stedFor(d), o = DATA.opp || {}, st = steder();
    const reise = (m) => m ? `<li class="tl-reise"><span class="tl-ikon">${TR[m[0]] || TR.bil}</span><span>${esc(m[1] || "")}</span></li>` : "";
    return `<ol class="tidslinje${kompakt ? " kompakt" : ""}">${kompakt ? "" : reise(o.fra)}${st.map((s, i) => {
      const K = synlig().filter((k) => (stedFor(k.d) || {}).id === s.id).sort((a, b) => (a.d < b.d ? 1 : -1)), fut = d < s.fra, her = naa && naa.id === s.id;
      return `${i ? reise(s.inn) : ""}<li class="tl-sted${fut ? " fut" : " ferdig"}${her ? " her" : ""}"><a href="#/album/${esc(s.id)}"><span class="nr">${i + 1}</span><span class="tl-tekst"><b>${esc(s.navn)}</b><small>${esc(periode(s))}${K.length ? ` · ${K.length} kort` : ""}</small>
        ${K.length && !kompakt ? `<span class="ims">${K.slice(0, 4).map((k) => `<span data-fb="${esc(k.b)}"></span>`).join("")}</span>` : ""}</span>${her ? `<span class="her-merke">${flagg("flagg")}Her er vi nå</span>` : ""}</a></li>`;
    }).join("")}${kompakt ? "" : reise(o.hjem)}</ol>`;
  }
  function stedlisteHtml() {
    const d = idag(), naa = stedFor(d);
    return `<div class="stedliste">${steder().map((s) => {
      const K = synlig().filter((k) => (stedFor(k.d) || {}).id === s.id).sort((a, b) => (a.d < b.d ? 1 : -1)), fut = d < s.fra;
      return `<a class="stedkort${fut ? " fut" : ""}${naa && naa.id === s.id ? " naa" : ""}" href="#/album/${esc(s.id)}"><div class="n">${esc(s.navn)}</div><div class="d">${esc(periode(s))}${K.length ? ` · ${K.length} kort` : naa && naa.id === s.id ? " · nå" : ""}</div>
        ${K.length ? `<div class="ims">${K.slice(0, 3).map((k) => `<div data-fb="${esc(k.b)}"></div>`).join("")}</div>` : ""}</a>`;
    }).join("")}</div>`;
  }
  const periode = (s) => { const a = dt(s.fra), b = dt(s.til); const m = (x) => new Intl.DateTimeFormat("nb-NO", { timeZone: "UTC", month: "short" }).format(x).replace(".", ""); return a.getUTCMonth() === b.getUTCMonth() ? `${a.getUTCDate()}.–${b.getUTCDate()}. ${m(b)}` : `${a.getUTCDate()}. ${m(a)} – ${b.getUTCDate()}. ${m(b)}`; };
  const venstreSpalte = () => `<aside class="side-v"><h2>Reiseruten</h2><p class="sub">Fra nord til sør · ${esc(dagNr())}</p>${kartHtml(440, 0, true)}${tidslinjeHtml(true)}</aside>`;
  function dagNr() {
    const o = DATA.opp; if (!o || !o.start) return "";
    const d = idag(), n = mellom(o.start, o.slutt) + 1, i = mellom(o.start, d) + 1;
    return d < o.start ? `Avreise om ${mellom(d, o.start)} ${mellom(d, o.start) === 1 ? "dag" : "dager"}` : d > o.slutt ? "Reisen er over – takk for at du fulgte med!" : `Dag ${i} av ${n}`;
  }

  function sideHjem() {
    const L = dager(), d0 = L[0], o = DATA.opp;
    const topp = `${mast("")}<div class="dato"><b>${esc(stor(pen(idag())))}</b>${dagNr() ? ` · ${esc(dagNr().toLowerCase())}` : ""}</div>${rutelinje(idag())}`;
    let midt = "";
    if (!o) midt = `<div class="tomt"><h2>Henter …</h2><p>Et øyeblikk.</p></div>`;
    else if (!d0) midt = `<div class="tomt"><h2>${idag() < o.start ? "Snart kommer det post!" : "Ingen kort ennå"}</h2><p>${idag() < o.start ? `Det første postkortet kommer ${esc(pen(o.start, false))}. Hver kveld velger hver av de reisende sitt beste bilde fra dagen.` : "De reisende har ikke valgt dagens bilder ennå – kom tilbake i kveld."}</p><p class="hand">Hilsen ${esc(personer().map((p) => p.navn).join(", ").replace(/, ([^,]*)$/, " og $1"))}</p></div>`;
    else midt = dagHtml(d0) + tidligereHtml(d0);
    return `<div class="ramme">${topp}<div class="flate">${venstreSpalte()}<main>${midt}${bunntekst()}</main></div></div>`;
  }
  function sideDag(d) {
    const ok = dager().includes(d);
    return `<div class="ramme">${mast("dag")}<div class="dato"><a href="#/">‹ Til dagens kort</a></div>${rutelinje(d)}<div class="flate">${venstreSpalte()}<main>${ok ? dagHtml(d) : `<div class="tomt"><h2>Ingen kort denne dagen</h2></div>`}${tidligereHtml(d)}${bunntekst()}</main></div></div>`;
  }
  function sideRute() {
    const n = steder().length;
    return `<div class="ramme">${mast("rute")}<main class="ruteside"><h1>Reiseruten</h1><p class="sub">Fra nord til sør · ${n} stopp · ${esc(dagNr())}</p>
      <div class="rute-flate"><section class="kartkort">${kartHtml(560)}<p class="tegnforklaring"><span><i class="tf-land"></i>Bil og båt</span><span><i class="tf-fly"></i>Fly</span><span><i class="tf-ferdig"></i>Reist</span></p></section>
      <section class="tl-kort">${tidslinjeHtml()}</section></div>${bunntekst()}</main></div>`;
  }
  function sideAlbum(sid) {
    const grupper = steder().map((s) => ({ s, K: synlig().filter((k) => (stedFor(k.d) || {}).id === s.id).sort((a, b) => (a.d === b.d ? rekkef(a, b) : a.d < b.d ? -1 : 1)) })).filter((g) => g.K.length);
    const n = synlig().length;
    return `<div class="ramme">${mast("album")}<div class="flate">${venstreSpalte()}<main class="albumside"><h1>Albumet</h1><p class="sub">${n} ${n === 1 ? "kort" : "kort"} fra reisen</p>
      ${grupper.length ? grupper.map((g) => `<section class="albumgruppe" id="a-${esc(g.s.id)}"><h2>${esc(g.s.navn)}</h2><p class="d">${esc(periode(g.s))}</p><div class="rutenett">${g.K.map((k) => `<a href="#/dag/${esc(k.d)}/${esc(k.hvem)}"><img data-b="${esc(k.b)}" alt="${esc(k.n)}, ${esc(pen(k.d, false))}"><span>${esc(k.n)}</span></a>`).join("")}</div></section>`).join("")
        : `<div class="tomt"><h2>Albumet er tomt ennå</h2><p>Bildene samles her etter hvert som postkortene kommer.</p></div>`}
      ${bunntekst()}</main></div></div>`;
  }
  const bunntekst = () => `<p class="bunntekst">Logget inn som ${esc(INN.n || INN.e)} · <button data-loggut>Logg ut</button></p>`;

  // ---------- tegning (bevarer snudde kort, utkast og rulleposisjon) ----------
  const SNUDD = new Set(), UTKAST = new Map();
  let ventTegn = false;
  function tegn() {
    if (!OPP || !INN || !INN.g) { visInngang(FEIL_INN); FEIL_INN = ""; return; }
    document.title = tittel();
    const r = rute(), y = window.scrollY, kar = $(".karusell"), kx = kar ? kar.scrollLeft : 0, sammeSide = tegn.sist === location.hash;
    app.innerHTML = r.side === "rute" ? sideRute() : r.side === "album" ? sideAlbum(r.a) : r.side === "dag" && r.a ? sideDag(r.a) : sideHjem();
    fyllAlle();
    if (sammeSide) { window.scrollTo(0, y); const k2 = $(".karusell"); if (k2) k2.scrollLeft = kx; }
    else {
      window.scrollTo(0, 0);
      if (r.side === "dag" && r.b) hoppTil(r.b);
      if (r.side === "album" && r.a) { const el = document.getElementById("a-" + r.a); if (el) el.scrollIntoView({ block: "start" }); }
    }
    tegn.sist = location.hash;
  }
  function tegnTrygt() {
    const a = document.activeElement;
    if (a && a.matches && a.matches("textarea, input")) { ventTegn = true; return; }
    if ($(".lys")) { ventTegn = true; return; }
    tegn();
  }
  function hoppTil(hvem) {
    const el = $(`.kortplass[data-hvem="${CSS.escape(hvem)}"]`); if (!el) return;
    const kar = el.parentElement;
    if (getComputedStyle(kar).display === "flex") kar.scrollTo({ left: el.offsetLeft - kar.offsetLeft - (kar.clientWidth - el.clientWidth) / 2, behavior: "smooth" });
    else el.scrollIntoView({ block: "center", behavior: "smooth" });
  }

  // ---------- handlinger ----------
  function toast(t, ms = 2600) {
    const el = $("#toast"); el.textContent = t; el.hidden = false;
    clearTimeout(toast.t); toast.t = setTimeout(() => { el.hidden = true; }, ms);
  }
  async function likToggle(id, knapp) {
    const e = minId(), lid = id + "~" + e, her = DATA.lik[lid], v = her && her.v === 1 ? 0 : 1;
    const ny = { p: id, e, n: INN.n || e, v };
    DATA.lik[lid] = { ...ny, s: Date.now() }; tegnKort(id);
    if (v) { const b = $(`[data-lik="${CSS.escape(id)}"]`); if (b) b.classList.add("puls"); }
    try { await skriv(`gjest/${INN.g}/lik/${lid}`, ny); hent(); }
    catch { if (her) DATA.lik[lid] = her; else delete DATA.lik[lid]; tegnKort(id); toast(navigator.onLine ? "Fikk ikke lagret – prøv igjen" : "Ingen nett – prøv igjen senere"); }
  }
  async function send(id) {
    const ta = $(`[data-skriv="${CSS.escape(id)}"]`), t = (ta ? ta.value : "").trim(); if (!t) return;
    const hid = Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => (b % 36).toString(36)).join("") + Date.now().toString(36);
    const ny = { p: id, e: minId(), n: INN.n || minId(), t: t.slice(0, 500), x: false };
    DATA.hilsen[hid] = { ...ny, s: 0 }; UTKAST.delete(id); if (ta) ta.blur(); tegnKort(id);
    try { await skriv(`gjest/${INN.g}/hilsen/${hid}`, ny); await hent(); tegnKort(id); toast("Hilsenen er sendt"); }
    catch { delete DATA.hilsen[hid]; UTKAST.set(id, t); tegnKort(id); toast(navigator.onLine ? "Fikk ikke sendt – prøv igjen" : "Ingen nett – hilsenen ligger klar"); }
  }
  async function slett(hid) {
    const h = DATA.hilsen[hid]; if (!h || !confirmSlett()) return;
    DATA.hilsen[hid] = { ...h, x: true }; tegnKort(h.p);
    try { await skriv(`gjest/${INN.g}/hilsen/${hid}`, { x: true }, ["x"]); hent(); }
    catch { DATA.hilsen[hid] = h; tegnKort(h.p); toast("Fikk ikke slettet – prøv igjen"); }
  }
  const confirmSlett = () => true; // ingen dialogboks – kan skrives på nytt
  // Tegn bare ett kort på nytt (uten å miste plassen i karusellen)
  function tegnKort(id) {
    const gml = document.getElementById("k-" + id); if (!gml) return tegnTrygt();
    const k = synlig().find((x) => x.id === id); if (!k) return tegnTrygt();
    const nr = Array.from(gml.parentElement.children).indexOf(gml), tmp = document.createElement("div");
    tmp.innerHTML = kortHtml(k, nr); gml.replaceWith(tmp.firstElementChild); fyllAlle();
  }
  function lysboks(id) {
    const k = synlig().find((x) => x.id === id); if (!k) return;
    const d = document.createElement("div"); d.className = "lys"; d.setAttribute("role", "dialog"); d.setAttribute("aria-label", "Bildet i stort format");
    d.innerHTML = `<button class="lukk" aria-label="Lukk">×</button><img data-b="${esc(k.b)}" alt="Bildet fra ${esc(k.n)}"><p class="cap"><b>${esc(k.n)}:</b> ${esc(k.tekst || "")}</p>`;
    document.body.appendChild(d); fyll($("img", d)); $(".lukk", d).focus();
    const lukk = () => { d.remove(); document.removeEventListener("keydown", tast); if (ventTegn) { ventTegn = false; tegn(); } };
    const tast = (e) => { if (e.key === "Escape") lukk(); };
    d.addEventListener("click", (e) => { if (e.target === d || e.target.closest(".lukk") || e.target.tagName === "IMG") lukk(); });
    document.addEventListener("keydown", tast);
  }
  document.addEventListener("click", (e) => {
    const t = e.target.closest && e.target.closest("[data-lik],[data-snu],[data-send],[data-slett],[data-stor],[data-hopp],[data-loggut],[data-meg]");
    if (!t) return;
    if (t.dataset.lik) likToggle(t.dataset.lik, t);
    else if (t.dataset.snu) {
      const id = t.dataset.snu, el = $(`#k-${CSS.escape(id)} .pkort`); if (!el) return;
      const på = !SNUDD.has(id); if (på) SNUDD.add(id); else SNUDD.delete(id);
      el.classList.toggle("snudd", på);
      $(".forside", el).setAttribute("aria-hidden", på); $(".bakside", el).setAttribute("aria-hidden", !på);
      if (på && !UTKAST.get(id)) setTimeout(() => { const h = $(".hilsener", el); if (h) h.scrollTop = h.scrollHeight; }, 50);
      if (på) hent(); // nye hilsener med en gang kortet snus
    }
    else if (t.dataset.send) send(t.dataset.send);
    else if (t.dataset.slett) slett(t.dataset.slett);
    else if (t.dataset.stor) lysboks(t.dataset.stor);
    else if (t.dataset.hopp) hoppTil(t.dataset.hopp);
    else if (t.hasAttribute("data-loggut")) loggUt();
    else if (t.hasAttribute("data-meg")) toast(`Logget inn som ${INN.n || ""} (${INN.e})`);
  });
  document.addEventListener("input", (e) => {
    const ta = e.target.closest && e.target.closest("[data-skriv]"); if (!ta) return;
    UTKAST.set(ta.dataset.skriv, ta.value);
    const b = ta.parentElement.querySelector("[data-send]"); if (b) b.disabled = !ta.value.trim();
    ta.style.height = "auto"; ta.style.height = Math.min(120, ta.scrollHeight) + "px";
  });
  document.addEventListener("keydown", (e) => {
    const ta = e.target.closest && e.target.closest("[data-skriv]");
    if (ta && e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); send(ta.dataset.skriv); }
  });
  document.addEventListener("focusout", () => setTimeout(() => { if (ventTegn && !(document.activeElement && document.activeElement.matches("textarea, input")) && !$(".lys")) { ventTegn = false; tegn(); } }, 200));
  window.addEventListener("hashchange", () => { if (/[#&]i=/.test(location.hash)) { lesInvitasjon(); OPP = lesJson(LS.opp, null); } tegn(); });
  // Merk som sett etter en stund på siden (da forsvinner «Ny» neste gang)
  setTimeout(() => { if (INN && INN.g) lagre.set(LS.sett, String(Date.now())); }, 8000);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") hent(); else if (INN && INN.g) lagre.set(LS.sett, String(Date.now())); });
  window.addEventListener("online", () => hent());
  setInterval(() => { if (document.visibilityState === "visible") hent(); }, 30e3);

  // ---------- start ----------
  tegn();
  if (OPP && INN && INN.rt && !INN.g) finnInngang().then(() => hent()).then(tegn).catch((e) => { if (e.kode === "IKKE_PAA_LISTA") { INN = null; lagre.del(LS.inn); visFeilInn("Kontoen står ikke på gjestelista (ennå). Spør familien."); } });
  else hent();
})();
