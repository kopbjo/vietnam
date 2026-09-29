/* Vietnam reisefølge – all reiseinfo ligger kryptert i data.enc (AES-256-GCM, PBKDF2-SHA256).
   Denne fila inneholder ingen personopplysninger. */
(() => {
  "use strict";
  if (window.top !== window.self) { document.documentElement.innerHTML = ""; return; } // skal ikke kunne vises inni en annen side
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const LS = { nokkel: "vn.nokkel", kurs: "vn.kurs", kursAuto: "vn.kursAuto", meg: "vn.meg", matSted: "vn.matSted", sistDag: "vn.sistDag", kortVariant: "vn.kortVariant", pakk: "vn.pakk", tp: "vn.tp", pakkEgne: "vn.pakkEgne", synk: "vn.synk", synkInn: "vn.synkInn", synkMigrert: "vn.synkMigrert", sjoforSiste: "vn.sjoforSiste", enhet: "vn.enhet", bruk: "vn.bruk" };
  const TZ = "Asia/Ho_Chi_Minh";
  const APP = { versjon: 34, tid: "2026-09-29 kl. 20:13" }; // oppdateres ved hver kodeendring
  let D = null;

  // ---------- nøytrale tekster: ⟦nøkkel⟧ byttes med D.ui (fra data.enc) når HTML settes inn ----------
  const ui = (s) => (typeof s === "string" && s.indexOf("⟦") >= 0 ? s.replace(/⟦(\w+)⟧/g, (m, k) => (D && D.ui && D.ui[k] != null ? D.ui[k] : "")) : s);
  for (const egenskap of ["innerHTML", "outerHTML"]) {
    const d = Object.getOwnPropertyDescriptor(Element.prototype, egenskap);
    if (d && d.set) Object.defineProperty(Element.prototype, egenskap, { configurable: true, enumerable: d.enumerable, get() { return d.get.call(this); }, set(v) { d.set.call(this, ui(v)); } });
  }
  const FA = () => ui("⟦fa⟧"), FU = () => ui("⟦fu⟧"); // feltnavn i oppdateringskodene (uendret format)
  const vTall = (v) => (v == null || v === "" || !isFinite(Number(v)) ? null : Number(v)); // tall fra eksterne tjenester

  // ---------- lagring (tåler privat modus) ----------
  const lagre = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch {} },
    del(k) { try { localStorage.removeItem(k); } catch {} },
  };

  // ---------- krypto ----------
  const fraB64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  const tilB64 = (u8) => { let s = ""; new Uint8Array(u8).forEach((b) => (s += String.fromCharCode(b))); return btoa(s); };
  async function hentPakke() {
    const r = await fetch("data.enc", { cache: "no-cache" });
    if (!r.ok) throw new Error("Fant ikke reisedata (" + r.status + ")");
    return r.json();
  }
  async function nokkelFraPassord(pass, p) {
    const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(pass), "PBKDF2", false, ["deriveKey"]);
    return crypto.subtle.deriveKey({ name: "PBKDF2", hash: "SHA-256", salt: fraB64(p.salt), iterations: p.iter }, base, { name: "AES-GCM", length: 256 }, true, ["decrypt"]);
  }
  async function dekrypter(n, p) {
    const klar = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fraB64(p.iv) }, n, fraB64(p.ct));
    return JSON.parse(new TextDecoder().decode(klar));
  }
  async function lagretNokkel(p) {
    const s = lagre.get(LS.nokkel);
    if (!s) return null;
    try { const o = JSON.parse(s); if (o.salt !== p.salt) return null; return await crypto.subtle.importKey("raw", fraB64(o.raw), "AES-GCM", true, ["decrypt"]); }
    catch { return null; }
  }
  async function huskNokkel(n, p) { lagre.set(LS.nokkel, JSON.stringify({ salt: p.salt, raw: tilB64(await crypto.subtle.exportKey("raw", n)) })); }

  // ---------- tekst ----------
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  function md(s) {
    let h = esc(s);
    h = h.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    h = h.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, t, u) => {
      const url = u.replace(/&amp;/g, "&");
      if (!/^(https:|tel:|mailto:)/i.test(url)) return t;
      const ext = url.startsWith("https:") ? ' target="_blank" rel="noopener noreferrer"' : "";
      return `<a href="${esc(url)}"${ext}>${t}</a>`;
    });
    return h;
  }
  const kartUrl = (q) => "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(q);
  const telUrl = (n) => "tel:" + String(n).replace(/[^0-9+]/g, "");
  const waUrl = (n) => "https://wa.me/" + String(n).replace(/\D/g, "");
  const refDel = (ref) => (String(ref).match(/[A-Z0-9][A-Z0-9.]{4,}/) || [ref])[0];

  // ---------- datoer ----------
  const DAGER = ["søndag", "mandag", "tirsdag", "onsdag", "torsdag", "fredag", "lørdag"];
  const MND = ["jan", "feb", "mar", "apr", "mai", "jun", "jul", "aug", "sep", "okt", "nov", "des"];
  // «I dag» og «nå» følger telefonens egen tidssone – den skifter automatisk når vi lander (Norge/Danmark/Singapore/Vietnam).
  const idagISO = () => new Intl.DateTimeFormat("sv-SE").format(new Date());
  const naaMin = () => { const n = new Date(); return n.getHours() * 60 + n.getMinutes(); };
  const tilDato = (iso) => { const [y, m, d] = iso.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d)); };
  const pluss = (iso, n) => { const d = tilDato(iso); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  const mellom = (a, b) => Math.round((tilDato(b) - tilDato(a)) / 864e5);
  const ukedag = (iso) => tilDato(iso).getUTCDay();
  const pen = (iso, lang = true) => { const d = tilDato(iso); return `${lang ? DAGER[d.getUTCDay()] + " " : ""}${d.getUTCDate()}. ${MND[d.getUTCMonth()]}`; };
  const kort = (iso) => { const d = tilDato(iso); return `${DAGER[d.getUTCDay()].slice(0, 3)} ${d.getUTCDate()}.${d.getUTCMonth() + 1}`; };
  const minutter = (t) => { if (!t) return -1; if (t === "kveld") return 20 * 60; const [a, b] = t.split(":").map(Number); return a * 60 + (b || 0); };

  // ---------- ikoner ----------
  const P = {
    hotell: '<path d="M3 19V8m0 7h18v4M21 15v-3a3 3 0 0 0-3-3h-7v6"/><circle cx="7" cy="11.5" r="1.8"/>',
    ankomst: '<path d="M12 4v12m0 0-5-5m5 5 5-5M5 20h14"/>',
    avreise: '<path d="M12 20V8m0 0-5 5m5-5 5 5M5 4h14"/>',
    reise: '<path d="M10.5 13.5 3 11l1.5-1.5 8 1 4-4.5c1-1 2.6-1.3 3.2-.7s.3 2.2-.7 3.2l-4.5 4 1 8L14 22l-2.5-7.5-3 3V20l-1.5 1-1-3.5L2.5 16 4 14.5h2.5z"/>',
    bestilt: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
    info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5M12 8v.01"/>',
    advarsel: '<path d="M12 3.5 21 19.5H3z"/><path d="M12 10v4.5M12 17v.01"/>',
    kalender: '<rect x="3.5" y="5" width="17" height="15" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
    ideer: '<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9V16h7v-2.1A6 6 0 0 0 12 3z"/>',
    sykehus: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M12 8v8M8 12h8"/>',
    kontakt: '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a1 1 0 0 1-1 1A16 16 0 0 1 4 5a1 1 0 0 1 1-1z"/>',
    mat: '<path d="M7 3v8M4.5 3v5a2.5 2.5 0 0 0 5 0V3M7 11v10M17 3c-2 0-3.5 2.5-3.5 6s1.5 4 3.5 4v8"/>',
    kart: '<path d="M12 21s-6.5-6.2-6.5-11a6.5 6.5 0 0 1 13 0c0 4.8-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.3"/>',
    penger: '<rect x="2.5" y="6" width="19" height="12" rx="2"/><circle cx="12" cy="12" r="2.8"/>',
    last: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
    oppdater: '<path d="M20 11a8 8 0 1 0-2.3 5.7M20 5v6h-6"/>',
    mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
    web: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
    slett: '<path d="M4 7h16M9 7V4.5h6V7M6.5 7l1 13h9l1-13M10 11v5.5M14 11v5.5"/>',
    opp: '<path d="M6 15l6-6 6 6"/>', ned: '<path d="M6 9l6 6 6-6"/>', pluss: '<path d="M12 5v14M5 12h14"/>',
    del: '<path d="M12 3v12M7.5 7.5 12 3l4.5 4.5M5 12v7a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-7"/>',
    kartark: '<path d="M9 4 3 6.5V20l6-2.5 6 2.5 6-2.5V4l-6 2.5L9 4zM9 4v13.5M15 6.5V20"/>',
    rute: '<circle cx="6" cy="18" r="2.5"/><circle cx="18" cy="6" r="2.5"/><path d="M8.5 18H15a3 3 0 0 0 0-6H9a3 3 0 0 1 0-6h6.5"/>',
    gange: '<circle cx="13" cy="4.5" r="2"/><path d="m9 21 2-6 3 3v3M7 12l3-4 4 2 3 3M10 8l1 7"/>',
    sorter: '<path d="M7 4v16M3.5 16.5 7 20l3.5-3.5M17 20V4M13.5 7.5 17 4l3.5 3.5"/>',
    stjerne: '<path d="M12 3.5l1.9 5.2 5.3 1.8-5.3 1.8L12 17.5l-1.9-5.2-5.3-1.8 5.3-1.8z"/><path d="M18.5 16v4M16.5 18h4"/>',
    venstre: '<path d="M15 5l-7 7 7 7"/>', hoyre: '<path d="M9 5l7 7-7 7"/>', chev: '<path d="M9 6l6 6-6 6"/>',
  };
  const ikon = (t, cls = "ikon") => `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true">${P[t] || P.info}</svg>`;
  const WA_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8s-.4-.1-.6.1-.6.8-.8 1-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.3-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c1.7.7 2.3.8 3.2.6a2.7 2.7 0 0 0 1.8-1.2 2.2 2.2 0 0 0 .1-1.2c0-.1-.2-.2-.4-.3z"/></svg>';

  // ---------- oppslag ----------
  const kontaktEtterId = (id) => D.kontakter.find((k) => k.id === id);
  const flyEtterId = (id) => D.fly.find((f) => f.id === id);
  const stedEtterId = (id) => D.steder.find((s) => s.id === id);
  const meg = () => lagre.get(LS.meg) || "";
  const megNavn = () => { const p = D.personer.find((x) => x.id === meg()); return p ? p.navn : null; };
  const start = () => D.steder[0].fra, slutt = () => D.steder[D.steder.length - 1].til;
  const stedForDato = (d) => D.steder.filter((s) => s.fra <= d && d <= s.til).sort((a, b) => (a.fra < b.fra ? 1 : -1))[0];
  const overnatting = (d) => D.steder.find((s) => s.fra <= d && d < s.til && s.hotell);
  const sistDag = () => { try { const o = JSON.parse(lagre.get(LS.sistDag) || "null"); return o && o.sett === idagISO() ? o.dag : null; } catch { return null; } };
  // Stedet brukeren «er på»: siste dag sett i I dag (samme kalenderdag), ellers dagens dato
  const valgtSted = () => { const d = sistDag(); return (d && stedForDato(d)) || aktueltSted(); };
  const aktueltSted = () => { const i = idagISO(); if (i < start()) return D.steder[1]; return stedForDato(i) || D.steder[D.steder.length - 1]; };
  const ringeKnapper = (k, n = 2) => {
    if (!k) return "";
    const rang = { wa: 0, tel: 1, mail: 2, web: 3 };
    return [...k.knapper].sort((a, b) => rang[a[0]] - rang[b[0]]).slice(0, n).map(([t, v, e]) => knapp(t, v, e)).join("");
  };

  // ---------- byggesteiner ----------
  function knapp(type, verdi, etikett) {
    if (type === "wa") return `<a class="kb wa" href="${waUrl(verdi)}" target="_blank" rel="noopener noreferrer">${WA_SVG}${esc(etikett || "WhatsApp")}</a>`;
    if (type === "tel") return `<a class="kb tel" href="${telUrl(verdi)}">${ikon("kontakt", "")}${esc(etikett || verdi)}</a>`;
    if (type === "mail") return `<a class="kb" href="mailto:${esc(verdi)}">${ikon("mail", "")}${esc(etikett || "E-post")}</a>`;
    if (type === "web") return `<a class="kb" href="${esc(verdi)}" target="_blank" rel="noopener noreferrer">${ikon("web", "")}${esc(etikett || "Nettside")}</a>`;
    if (type === "kart") return `<a class="kb" href="${kartUrl(verdi)}" target="_blank" rel="noopener noreferrer">${ikon("kart", "")}${esc(etikett || "Kart")}</a>`;
    return "";
  }
  function kontaktHtml(k) {
    if (!k) return "";
    const nummer = [...new Set(k.knapper.filter(([t]) => t === "tel" || t === "wa").map(([, v]) => v))];
    return `<div class="kontakt">
      <div class="knavn">${esc(k.navn)}</div>
      ${k.rolle ? `<div class="krolle">${esc(k.rolle)}</div>` : ""}
      ${k.bruk ? `<div class="kbruk">${md(k.bruk)}</div>` : ""}
      ${k.merk ? `<div class="kmerk">${md(k.merk)}</div>` : ""}
      <div class="knapper">${k.knapper.map(([t, v, e]) => knapp(t, v, e)).join("")}</div>
      ${nummer.length ? `<div class="krolle" style="margin-top:6px">${nummer.map(esc).join(" · ")}</div>` : ""}
    </div>`;
  }
  const kontakterHtml = (ids) => (ids || []).map((id) => kontaktHtml(kontaktEtterId(id))).join("");

  function flyKort(f) {
    if (!f) return "";
    const m = meg(), mitt = f.seter && m ? f.seter[m] : null;
    const rader = D.personer.map((p) => {
      const sete = f.seter ? f.seter[p.id] : "";
      const billett = f.billett ? f.billett[p.id] : "";
      if (!sete && !billett) return "";
      return `<tr class="${p.id === m ? "meg" : ""}"><td>${esc(p.navn)}</td><td>${esc(sete || "")}</td><td>${esc(billett || "")}</td></tr>`;
    }).join("");
    return `<div class="fly">
      <div class="ftopp"><span class="fnr">${esc(f.id)}</span><span class="fdato">${esc(pen(f.d))}<br>${esc(f.sel)}</span></div>
      <div class="rute">
        <div><div class="tid">${esc(f.dep)}</div><div class="sted"><b>${esc(f.fra)}</b>${f.fraT ? " · " + esc(f.fraT) : ""}</div></div>
        <div class="pil">→</div>
        <div class="h"><div class="tid">${esc(f.arr)}${f.arrPluss ? "<sup>+1</sup>" : ""}</div><div class="sted"><b>${esc(f.til)}</b>${f.tilT ? " · " + esc(f.tilT) : ""}</div></div>
      </div>
      <div class="fmeta"><span>Ref. <button class="ref" data-kopier="${esc(f.ref)}">${esc(f.ref)}</button></span>
        ${mitt ? `<span class="dittsete">Ditt sete ${esc(mitt)}</span>` : `<span><b>Seter</b> ${esc(f.seterTekst || (f.seter ? Object.values(f.seter).sort().join(", ") : ""))}</span>`}</div>
      ${f.info ? `<div class="finfo">${md(f.info)}</div>` : ""}
      <div class="knapper flyknapper">${f.innsjekk && f.d >= idagISO() ? knapp("web", f.innsjekk.url, "Sjekk inn") : ""}${knapp("web", "https://www.flightradar24.com/data/flights/" + encodeURIComponent(f.id.toLowerCase()), "Flystatus")}</div>
      ${f.innsjekk && f.d >= idagISO() ? `<div class="finnsj">Innsjekk på nett: ${md(f.innsjekk.tekst)}</div>` : ""}
      ${rader ? `<details class="flydet"><summary>Seter og billettnumre</summary><table>${rader}</table></details>` : ""}
    </div>`;
  }

  // Tlf.-nummer til hotellet (for sjåførkortet)
  const hotellNummer = (k) => { if (!k) return ""; const x = k.knapper.find(([t]) => t === "tel") || k.knapper.find(([t]) => t === "wa"); return x ? x[1] : ""; };
  const harDato = (v) => /^\d{1,2}\.\d{1,2}/.test(String(v || ""));
  // kompakt = Hotell-siden (bortsett fra kortet som gjelder nå): navn, tider og ref. synlig, resten bak «Detaljer»
  function hotellInnhold(s, medDato, kompakt = false) {
    const h = s.hotell, k = kontaktEtterId(h.kontakt);
    const inn = medDato && !harDato(h.inn) ? `${kort(s.fra)} · ${h.inn}` : h.inn;
    const ut = medDato && !harDato(h.ut) ? `${kort(s.til)} · ${h.ut}` : h.ut;
    const ref = `<dt>Ref.</dt><dd><button class="ref" data-kopier="${esc(refDel(h.ref))}">${esc(h.ref)}</button></dd>`;
    const resten = `<dt>Rom</dt><dd>${md(h.rom)}</dd><dt>Betaling</dt><dd>${md(h.betaling)}</dd>`;
    const knapper = `<div class="knapper">${h.sjofor !== false ? `<button class="kb" data-sjofor="${esc(s.id)}">${ikon("kart", "")}Vis til sjåføren</button>` : ""}${knapp("kart", h.kartq, "Vis i kart")}${ringeKnapper(k)}</div>`;
    const nett = h.nett ? `<a class="hnett" href="${esc(h.nett)}" target="_blank" rel="noopener noreferrer">${esc(h.nettTekst || "Hotellets nettside")} ↗</a>` : "";
    const topp = `<div class="hnavn">${esc(h.navn)}</div>${kompakt ? "" : `<div class="hadr">${esc(h.adr)}</div>`}
      <div class="tider"><span>Inn <b>${esc(inn)}</b></span><span>Ut <b>${esc(ut)}</b></span></div>`;
    if (kompakt) return `${topp}<dl class="rader">${ref}</dl>
      <details class="hdet"><summary>Adresse, rom, betaling og kontakt</summary><div class="hadr">${esc(h.adr)}</div><dl class="rader">${resten}</dl>${knapper}${nett}</details>`;
    return `${topp}<dl class="rader">${ref}${resten}</dl>${knapper}${nett}`;
  }
  function hotellKort(s) {
    if (!s.hotell) return "";
    return `<section class="kort hotell">
      <h2>${ikon("hotell")}Overnatting</h2>
      ${hotellInnhold(s, false)}
      ${notatHtml(s)}
    </section>`;
  }
  function hotellListeKort(s, merke, kompakt) {
    return `<section class="kort hotell hliste${merke ? " naa" : ""}">
      <div class="htopp"><span class="hsted">${esc(s.navn)}</span><span class="hdato">${esc(s.dato)} · ${s.netter} ${s.netter === 1 ? "natt" : "netter"}</span></div>
      ${merke ? `<div class="hmerke">${esc(merke)}</div>` : ""}
      ${hotellInnhold(s, true, kompakt)}
      <a class="hmer" href="#/sted/${esc(s.id)}">Alt om ${esc(s.navn)}${ikon("chev", "")}</a>
    </section>`;
  }

  function seksjon(s) {
    let h = `<section class="kort ${esc(s.type || "")}"><h2>${ikon(s.type)}${esc(s.tittel)}</h2>`;
    if (s.steg) h += `<ol class="steg">${s.steg.map((x) => `<li>${md(x)}</li>`).join("")}</ol>`;
    if (s.rader && s.rader.length) h += `<dl class="rader">${s.rader.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${md(v)}</dd>`).join("")}</dl>`;
    if (s.tekst) h += s.tekst.map((t) => `<p>${md(t)}</p>`).join("");
    if (s.bilder) h += `<div class="bilder">${s.bilder.map((b, i) => D.bilder[b] ? `<figure><img src="${D.bilder[b]}" alt="${esc((s.bildetekst || [])[i] || "")}" data-stort="${esc(b)}"><figcaption>${esc((s.bildetekst || [])[i] || "")}</figcaption></figure>` : "").join("")}</div>`;
    if (s.kontakter) h += `<div class="kontaktblokk">${kontakterHtml(s.kontakter)}</div>`;
    if (s.fly) h += `<div style="margin-top:12px">${s.fly.map((id) => flyKort(flyEtterId(id))).join("")}</div>`;
    return h + "</section>";
  }

  function sykehusHtml(liste) {
    return (liste || []).map((x) => `<div class="sykehus">
      <div class="snavn">${esc(x.navn)}</div>
      <div class="smerk">${esc(x.adr)} · ${esc(x.avst)}</div>
      ${x.merk ? `<div class="smerk">${esc(x.merk)}</div>` : ""}
      <div class="knapper">${x.tel.map(([n, e]) => knapp("tel", n, `${e}: ${n}`)).join("")}${knapp("kart", x.navn + " " + x.adr, "Kart")}</div>
    </div>`).join("");
  }
  const ideerHtml = (liste) => (liste || []).map((i) => `<div class="ide"><b>${i.kart ? `<span class="knr kn-ide ide-nr" title="På kartet">${esc(i.kart)}</span>` : ""}${esc(i.navn)}</b>${esc(i.tekst)}${i.praktisk ? `<div class="praktisk">${md(i.praktisk)}</div>` : ""}</div>`).join("");
  const oppdatertTekst = () => {
    try { const t = new Date(D.meta.bygget); const f = (o) => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Oslo", ...o }).format(t);
      return `${f({ year: "numeric", month: "2-digit", day: "2-digit" })} kl. ${f({ hour: "2-digit", minute: "2-digit", hourCycle: "h23" })} (norsk tid)`; }
    catch { return D.meta.oppdatert; }
  };
  const bunn = () => `<div class="bunn">Reiseinfo oppdatert ${esc(oppdatertTekst())} · appversjon ${APP.versjon}${D && D.oppdAntall ? ` · <a href="#/claude">${D.oppdAntall} ${D.oppdAntall === 1 ? "endring" : "endringer"} fra Claude</a>` : ""}</div>`;
  const tittel = (t, under = "", ingress = "") => `<div class="stor-tittel"><h1>${esc(t)}</h1>${under ? `<div class="under">${under}</div>` : ""}${ingress ? `<p class="ingress">${md(ingress)}</p>` : ""}</div>`;

  // ---------- klokke ----------
  const SONER = [["Norge", "Europe/Oslo"], ["Vietnam", TZ]];
  function klokkeData(tz) {
    const n = new Date();
    const tid = new Intl.DateTimeFormat("nb-NO", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(n);
    const dag = new Intl.DateTimeFormat("nb-NO", { timeZone: tz, weekday: "long", day: "numeric", month: "short" }).format(n);
    const t = Number(new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", hourCycle: "h23" }).format(n));
    return { tid, dag, natt: t < 6 || t >= 22 };
  }
  function klokkeHtml() {
    const off = (() => { const n = new Date(); const t = (tz) => new Date(n.toLocaleString("en-US", { timeZone: tz })); return Math.round((t(TZ) - t("Europe/Oslo")) / 36e5); })();
    return `<section class="klokker" aria-label="Klokke i Norge og Vietnam">${SONER.map(([navn, tz]) => { const k = klokkeData(tz);
      return `<div class="klokke${k.natt ? " natt" : ""}" data-sone="${tz}"><span class="ksted">${navn}</span><span class="ktid">${esc(k.tid)}</span><span class="kdag">${esc(k.dag)}</span></div>`; }).join("")}
      <div class="kdiff">Vietnam er ${off} timer foran Norge</div></section>`;
  }
  setInterval(() => { $$(".klokke").forEach((el) => { const k = klokkeData(el.dataset.sone); el.querySelector(".ktid").textContent = k.tid; el.querySelector(".kdag").textContent = k.dag; el.classList.toggle("natt", k.natt); }); $$(".km").forEach((el) => { const k = klokkeData(el.dataset.sone); el.querySelector(".ktid").textContent = k.tid; el.classList.toggle("natt", k.natt); }); }, 15000);

  // Én linje med begge klokkene (brukes i reiseperioden)
  function klokkeMini() {
    const v = klokkeData(TZ), n = klokkeData("Europe/Oslo");
    return `<div class="klokkemini" aria-label="Klokke"><span data-sone="${TZ}" class="km${v.natt ? " natt" : ""}"><b class="ktid">${esc(v.tid)}</b> Vietnam</span><span class="km-skille">·</span><span data-sone="Europe/Oslo" class="km${n.natt ? " natt" : ""}"><b class="ktid">${esc(n.tid)}</b> Norge${n.natt ? " (natt)" : ""}</span></div>`;
  }
  // Været som én linje; trykk for hele værkortet
  function vaerKompakt(d) {
    const v = vaerSted(d); if (!v) return "";
    const c = vaerLes(v), x = c && c.dager[d], n = D.vaerNormal && D.vaerNormal[d];
    let linje;
    if (x) linje = `${vaerIkon(x.kode)}<span><b>${rund(x.maks)}° / ${rund(x.min)}°</b> ${esc(vaerTekst(x.kode))}${x.pst != null ? ` <i>· regn ${x.pst} %</i>` : ""}</span>`;
    else if (n) linje = `${vaerIkon(2)}<span><b>${n.maks}° / ${n.min}°</b> <i>vanlig på denne tiden</i></span>`;
    else return vaerHtml(d);
    return `<details class="fold vaerfold"><summary>${linje}</summary><div class="innhold">${vaerHtml(d)}</div></details>`;
  }
  // Oppfordring om å legge appen på hjemskjermen (bare på iPhone/iPad når appen er åpnet i nettleseren)
  const HJEM_SKJUL = "vn.hjemSkjul";
  function hjemskjermHtml() {
    const ua = navigator.userAgent || "";
    if (!/iPhone|iPad|iPod/.test(ua)) return "";
    if (navigator.standalone === true || (window.matchMedia && matchMedia("(display-mode: standalone)").matches)) return "";
    const skjult = Number(lagre.get(HJEM_SKJUL) || 0);
    if (skjult && Date.now() - skjult < 3 * 864e5) return "";
    const safari = !/CriOS|FxiOS|EdgiOS|GSA|FBAN|FBAV|Instagram|Line\//.test(ua);
    const DEL = `<svg class="delikon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12M8 7l4-4 4 4"/><path d="M7 11H5.5v9.5h13V11H17"/></svg>`;
    const steg = safari
      ? [`Trykk på Del-knappen ${DEL} nederst i Safari`, "Velg <b>Legg til på Hjem-skjerm</b>", "Åpne <b>Vietnam</b> fra hjemskjermen – skriv passordet én gang til"]
      : ["Trykk <b>Kopier lenken</b> og åpne den i <b>Safari</b>", `Del-knappen ${DEL} → <b>Legg til på Hjem-skjerm</b>`, "Åpne <b>Vietnam</b> fra hjemskjermen – skriv passordet én gang til"];
    return `<section class="kort hjemskjerm"><div class="hs-topp"><img src="ikon-180.png" alt="" width="40" height="40"><div><h2>Legg appen på hjemskjermen</h2><p>${safari ? "Da virker den uten nett og åpnes i fullskjerm." : "Denne nettleseren kan ikke lagre appen for bruk uten nett."}</p></div></div>
      <ol class="hs-steg">${steg.map((t) => `<li><span>${t}</span></li>`).join("")}</ol>
      <div class="hs-knapper">${safari ? "" : `<button class="knapp" data-kopier="${esc(location.origin + location.pathname)}">Kopier lenken</button>`}<button class="knapp knapp-lys" data-hjemskjul>Senere</button></div></section>`;
  }
  document.addEventListener("click", (e) => { if (e.target.closest("[data-hjemskjul]")) { lagre.set(HJEM_SKJUL, String(Date.now())); vis(); } });

  // ---------- Husk-oppgaver (kryss deles med familien via synk: {k:"x", r:"husk", l:"felles", n, v, hvem}) ----------
  const oppgNokkel = (e) => `${e.d} ${e.tittel}`;
  function huskLes() {
    const o = {};
    for (const p of Object.values(synkLes().p)) if (p.k === "x" && p.r === "husk" && p.v) o[p.n] = p;
    return o;
  }
  const huskTid = (e) => (e.t && e.t !== "kveld" ? "kl. " + e.t : e.t === "kveld" ? "kveld" : "");
  function huskRad(e, tag = "div", medDato = false) {
    const n = oppgNokkel(e), g = huskLes()[n];
    const hvem = g ? (D.personer.find((p) => p.id === g.hvem) || {}).navn : "";
    const naar = g ? new Date(g.t).toLocaleString("nb-NO", { day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" }) : "";
    const tid = [medDato ? kort(e.d) : "", huskTid(e)].filter(Boolean).join(" ");
    const inn = `<label class="huskrad${g ? " gjort" : ""}"><input type="checkbox" data-husk="${esc(n)}" ${g ? "checked" : ""}><span><span class="htittel">${md(e.tittel)}</span>
      ${e.merk ? `<span class="merk">${md(e.merk)}</span>` : ""}${g ? `<span class="huskav">Gjort${hvem ? " av " + esc(hvem) : ""} · ${esc(naar)}</span>` : ""}</span></label>`;
    const f = e.fly ? flyEtterId(e.fly) : null;
    const kn = f && f.innsjekk && !g ? `<div class="knapper husk-kn">${knapp("web", f.innsjekk.url, "Sjekk inn nå")}<button class="ref" data-kopier="${esc(f.ref)}">Ref. ${esc(f.ref)}</button></div>` : "";
    return tag === "li" ? `<li class="oppg${g ? " gjort" : ""}"><span class="kl">${esc(e.t || "–")}</span><div>${inn}${kn}</div></li>` : `<div class="husk-l${g ? " gjort" : ""}">${tid ? `<span class="husk-tid">${esc(tid)}</span>` : ""}${inn}${kn}</div>`;
  }

  // ---------- egne avtaler og notater (deles med familien via synk, post {k:"a", …}) ----------
  const avtLes = () => Object.values(synkLes().p).filter((p) => p.k === "a" && !p.slettet);
  const avtDag = (d) => avtLes().filter((a) => a.type !== "opph" && a.d === d);
  const avtOpph = (id) => avtLes().filter((a) => a.type === "opph" && a.opph === id).sort((a, b) => (a.c || 0) - (b.c || 0));
  const avtSomHend = (a) => ({ d: a.d, t: a.tid || "", tittel: a.tekst, merk: [a.rest ? (a.bord ? "Bord reservert" : "Bord ikke reservert") : "", a.adr ? a.adr.replace(/\s*\n\s*/g, ", ") : ""].filter(Boolean).join(" · "), egen: a });
  // Restauranter fra restaurantlista for en dag: stedet dere er på, og stedet dere reiser fra på flyttedager
  const restSteder = (d) => D.steder.filter((s) => s.fra <= d && d <= s.til && D.restauranter.liste.some((r) => r.sted === s.id)).sort((a, b) => (a.fra < b.fra ? 1 : -1));
  const restForDag = (d) => { const ids = restSteder(d).map((s) => s.id); return D.restauranter.liste.filter((r) => ids.includes(r.sted)).sort((a, b) => ids.indexOf(a.sted) - ids.indexOf(b.sted) || a.prio - b.prio); };
  const restEtter = (a) => (a && a.rnavn ? D.restauranter.liste.find((r) => r.navn === a.rnavn && (!a.rsted || r.sted === a.rsted)) : null);
  // Vietnamesiske nummer lagres med landskode, så de kan ringes fra norsk SIM og brukes i WhatsApp
  const tlfNorm = (n) => { let x = String(n || "").replace(/[^\d+]/g, ""); if (!x) return ""; if (x.startsWith("00")) return "+" + x.slice(2); if (x.startsWith("0")) return "+84" + x.slice(1); return x.startsWith("+") ? x : "+" + x; };
  function avtKnapper(a, medEndre = true) {
    const r = a.rest ? restEtter(a) : null;
    const bord = a.rest && !a.bord ? `<button class="kb bordkn" data-avtbord="${esc(a.id)}">${ikon("bestilt", "")}Marker som reservert</button>` : "";
    if (r) return bord + (r.adresse && sjoforHer(r.sted) ? `<button class="kb" data-sjofor="r:${D.restauranter.liste.indexOf(r)}">${ikon("kart", "")}Vis til sjåføren</button>` : "") +
      (r.tlf ? knapp("tel", r.tlf, "Ring") : "") + (medEndre ? `<button class="kb" data-avt="${esc(a.id)}">Endre</button>` : "");
    return bord + (a.adr ? `<button class="kb" data-sjofor="a:${esc(a.id)}">${ikon("kart", "")}Vis til sjåføren</button>` : "") +
      (a.tlf ? knapp("tel", a.tlf, "Ring") + knapp("wa", a.tlf, "WhatsApp") : "") +
      (medEndre ? `<button class="kb" data-avt="${esc(a.id)}">Endre</button>` : "");
  }
  function avtRad(a, iNeste) {
    const mote = a.type === "mote", hvem = personNavn(a.hvem);
    const bord = a.rest ? `<span class="bord ${a.bord ? "ja" : "nei"}">${a.bord ? "Bord reservert" : "Ikke reservert"}</span>` : "";
    return `<li class="egen${mote ? " mote" : ""}${a.rest ? " rest" : ""}"><span class="kl">${esc(a.tid || "–")}</span><div>${mote ? "<b>Møtested:</b> " : ""}${esc(a.tekst)}${bord}
      ${a.notat ? `<div class="merk">${esc(a.notat)}</div>` : ""}${a.adr ? `<div class="merk">${esc(a.adr.replace(/\s*\n\s*/g, ", "))}</div>` : ""}
      <div class="egenav">${mote ? "Hvis vi blir borte fra hverandre · " : a.rest ? "Restaurant · " : ""}Lagt til${hvem ? " av " + esc(hvem) : ""}${iNeste ? " · se Neste over" : ""}</div>
      <div class="knapper">${iNeste ? (a.rest && !a.bord ? `<button class="kb bordkn" data-avtbord="${esc(a.id)}">${ikon("bestilt", "")}Marker som reservert</button>` : "") + `<button class="kb" data-avt="${esc(a.id)}">Endre</button>` : avtKnapper(a)}</div></div></li>`;
  }
  // Notater som gjelder hele oppholdet (romnumre, Wi-Fi …) – vises i «I natt» og på stedssiden
  function notatHtml(s) {
    const n = avtOpph(s.id);
    return `<div class="notater">${n.map((a) => `<button class="notat" data-avt="${esc(a.id)}">${esc(a.tekst)}</button>`).join("")}<button class="notatny" data-avtny="opph" data-avtsted="${esc(s.id)}">${ikon("pluss", "")}${n.length ? "Nytt notat" : "Romnumre, Wi-Fi …"}</button></div>`;
  }
  function romSjekkHtml(aapen) {
    const liste = D.pakking.forlateRommet, lagret = ((pakkLes().vietnam || {}).rommet) || {};
    const igjen = liste.filter((t) => !lagret[t.navn]).length;
    return `<details class="fold romsjekk"><summary>${ikon("bestilt")}Før vi forlater rommet <span class="antall">${igjen ? `${igjen} igjen` : "alt sjekket"}</span></summary><div class="innhold">
      ${liste.map((t) => `<label class="pakkrad ${lagret[t.navn] ? "ok" : ""}"><input type="checkbox" data-pakk="${esc(t.navn)}" data-pakkrunde-id="vietnam" data-pakkliste-id="rommet" ${lagret[t.navn] ? "checked" : ""}><span><span class="pnavn">${esc(t.navn)}</span></span></label>`).join("")}
      <p class="krolle romhjelp">Kryssene vises på alle telefonene og nullstilles av seg selv etter et døgn.</p></div></details>`;
  }
  let AV = null; // skjemaet som er åpent
  function visAvtSkjema(init) {
    AV = { tid: "", tekst: "", adr: "", tlf: "", notat: "", ...init };
    const a = AV, ny = !a.id, o = $("#overlay");
    // Restaurantavtaler lagres som type «dag» med rest:1 (så eldre appversjoner viser dem som vanlige avtaler)
    if (a.type === "dag" && a.rest) a.type = "rest";
    const rListe = a.d ? restForDag(a.d) : [];
    if (a.type === "rest" && a.fri === undefined) a.fri = a.rnavn ? !restEtter(a) : !!a.id || !rListe.length;
    const stay = a.opph ? stedEtterId(a.opph) : overnatting(a.d);
    if (a.type === "opph" && !stay) a.type = "dag";
    if (a.type === "opph") a.opph = stay.id;
    const typer = [["dag", "Denne dagen"], ["rest", "Restaurant"], ...(stay ? [["opph", "Hele oppholdet"]] : []), ["mote", "Møtested"]];
    const hvor = a.type === "opph" ? `Vises alle dager på ${stay.hotell.navn} (${stay.dato})` : a.type === "mote" ? `${pen(a.d)} · hvis vi blir borte fra hverandre` : pen(a.d);
    const felt = (lbl, inp) => `<label class="af"><span>${lbl}</span>${inp}</label>`;
    let f;
    if (a.type === "dag") f = felt("Klokkeslett (valgfritt)", `<input type="time" id="avtTid" value="${esc(a.tid)}">`) +
      felt("Hva", `<input id="avtTekst" value="${esc(a.tekst)}" placeholder="F.eks. Skredder – prøving" autocomplete="off" enterkeyhint="done">`) +
      felt("Adresse (valgfritt – gir «Vis til sjåføren»)", `<textarea id="avtAdr" rows="2" placeholder="Lim inn fra Google Maps" autocomplete="off" autocapitalize="off" spellcheck="false">${esc(a.adr)}</textarea>`) +
      felt("Telefon (valgfritt – gir Ring og WhatsApp)", `<input type="tel" id="avtTlf" value="${esc(a.tlf)}" placeholder="0905 123 456 eller +84 …" autocomplete="off">`);
    else if (a.type === "rest") {
      const r = a.fri ? null : restEtter(a), steder = restSteder(a.d);
      const grupper = [...new Set(rListe.map((x) => x.omrade))];
      const opt = (x) => `<option value="${D.restauranter.liste.indexOf(x)}"${r === x ? " selected" : ""}>${esc(x.navn)}</option>`;
      const valg = rListe.length ? felt(`Restaurant (fra lista for ${esc(steder.map((x) => x.navn).join(" og "))})`, `<select id="avtRest">
          ${!r && !a.fri ? `<option value="" selected disabled>Velg restaurant …</option>` : ""}
          ${grupper.length > 1 ? grupper.map((g) => `<optgroup label="${esc(g)}">${rListe.filter((x) => x.omrade === g).map(opt).join("")}</optgroup>`).join("") : rListe.map(opt).join("")}
          <option value="fri"${a.fri ? " selected" : ""}>Annen restaurant – skriv selv</option></select>`) : `<p class="krolle restingen">Ingen restauranter i lista for denne dagen – skriv inn selv.</p>`;
      const info = r ? `<div class="restinfo"><div>${esc(r.kjokken)}</div><div>${esc(r.adresse)}</div>${r.apent ? `<div>Åpent: ${esc(r.apent)}</div>` : ""}${r.tlf ? `<div>Tlf: ${esc(r.tlf)}</div>` : ""}</div>` : "";
      const fri = a.fri ? felt("Navn på restauranten", `<input id="avtTekst" value="${esc(a.tekst)}" placeholder="Navnet på stedet" autocomplete="off" enterkeyhint="done">`) +
        felt("Adresse (valgfritt – gir «Vis til sjåføren»)", `<textarea id="avtAdr" rows="2" placeholder="Lim inn fra Google Maps" autocomplete="off" autocapitalize="off" spellcheck="false">${esc(a.adr)}</textarea>`) +
        felt("Telefon (valgfritt – gir Ring og WhatsApp)", `<input type="tel" id="avtTlf" value="${esc(a.tlf)}" placeholder="0905 123 456 eller +84 …" autocomplete="off">`) : "";
      f = valg + info + fri + felt("Klokkeslett (valgfritt)", `<input type="time" id="avtTid" value="${esc(a.tid)}">`) +
        `<div class="af"><span>Bord</span><div class="bordvalg"><button type="button" data-avtbordvalg="0" class="${a.bord ? "" : "valgt"}">Ikke reservert</button><button type="button" data-avtbordvalg="1" class="${a.bord ? "valgt" : ""}">${ikon("bestilt", "")}Bord reservert</button></div></div>` +
        felt("Notat (valgfritt)", `<input id="avtNotat" value="${esc(a.notat)}" placeholder="F.eks. Bestilt på etternavnet, 4 pers., bord ute" autocomplete="off" enterkeyhint="done">`);
    }
    else if (a.type === "opph") f = felt("Notat", `<textarea id="avtTekst" rows="3" placeholder="F.eks. Rom 305 (jentene) og 307 · Wi-Fi: BelMarina / passord">${esc(a.tekst)}</textarea>`);
    else f = felt("Hvor møtes vi?", `<input id="avtTekst" value="${esc(a.tekst)}" placeholder="F.eks. Ved inngangen til nattmarkedet" autocomplete="off" enterkeyhint="done">`) +
      felt("Fra klokken (valgfritt)", `<input type="time" id="avtTid" value="${esc(a.tid)}">`);
    o.className = "overlay skjema";
    o.innerHTML = `<button class="lukk">Lukk</button><div class="avtskjema">
      <h2>${ny ? "Legg til" : a.type === "opph" ? "Endre notat" : a.type === "mote" ? "Endre møtested" : a.type === "rest" ? "Endre restaurant" : "Endre avtale"}</h2>
      ${ny ? `<div class="avttyper${typer.length > 3 ? " fire" : ""}">${typer.map(([k, t]) => `<button data-avttype="${k}" class="${k === a.type ? "valgt" : ""}">${t}</button>`).join("")}</div>` : ""}
      <p class="avthvor">${esc(hvor)}</p>${f}
      <button class="knapp knapp-full avtlagre" data-avtlagre>Lagre</button>
      ${ny ? "" : `<button class="knapp knapp-full knapp-lys avtslett" data-avtslett>Slett</button>`}
      <p class="sno">Vises på alle telefonene. Lagres her først og deles når dere har nett.</p></div>`;
    o.hidden = false; o.scrollTop = 0;
  }
  function avtFelt() { for (const [k, id] of [["tid", "avtTid"], ["tekst", "avtTekst"], ["adr", "avtAdr"], ["tlf", "avtTlf"], ["notat", "avtNotat"]]) { const el = document.getElementById(id); if (el) AV[k] = el.value; } }
  function avtEtterTegning(fn) { const y = window.scrollY; vis(); window.scrollTo(0, y); if (fn) fn(); }
  function avtLagre() {
    avtFelt(); const a = AV, rv = a.type === "rest" && !a.fri ? restEtter(a) : null;
    if (a.type === "rest" && !a.fri && !rv) { toast("Velg en restaurant – eller «Annen restaurant»", 2400, "info"); return; }
    const tekst = rv ? rv.navn : String(a.tekst || "").trim();
    if (!tekst) { toast(a.type === "mote" ? "Skriv hvor dere møtes" : a.type === "opph" ? "Skriv notatet" : a.type === "rest" ? "Skriv navnet på restauranten" : "Skriv hva det gjelder", 2200, "info"); return; }
    const p = { k: "a", id: a.id || tilfeldigHex(6), type: a.type === "rest" ? "dag" : a.type, tekst, hvem: a.id ? a.hvem || "" : meg() || "", c: a.c || Date.now() };
    if (a.type === "opph") p.opph = a.opph;
    else { p.d = a.d; p.tid = /^\d{1,2}:\d{2}$/.test(a.tid || "") ? a.tid.padStart(5, "0") : ""; }
    if (a.type === "dag") { p.adr = String(a.adr || "").trim(); p.tlf = tlfNorm(a.tlf); }
    if (a.type === "rest") {
      Object.assign(p, { rest: 1, bord: a.bord ? 1 : 0, notat: String(a.notat || "").trim() });
      if (rv) Object.assign(p, { rnavn: rv.navn, rsted: rv.sted, adr: rv.sjofor ? rv.sjofor.adr : rv.adresse, tlf: "" });
      else Object.assign(p, { adr: String(a.adr || "").trim(), tlf: tlfNorm(a.tlf) });
    }
    synkSett(p); lukkOverlay(); AV = null;
    avtEtterTegning(() => toast(a.id ? "Endret – vises på alle telefonene" : "Lagt til – vises på alle telefonene", 2400));
  }
  function avtSlett() {
    const gammel = avtLes().find((x) => x.id === AV.id); if (!gammel) { lukkOverlay(); return; }
    synkSett({ ...gammel, slettet: 1 }); lukkOverlay(); AV = null;
    avtEtterTegning(() => toastAngre("Slettet", () => synkSett({ ...gammel, slettet: 0 })));
  }
  function avtKlikk(t) {
    if (t.dataset.avtny) {
      const d = rute().side === "idag" ? valgtDag || idagISO() : idagISO();
      const opph = t.dataset.avtsted || ((overnatting(d) || {}).id);
      return visAvtSkjema({ type: t.dataset.avtny, d: t.dataset.avtsted ? (stedEtterId(t.dataset.avtsted) || {}).fra || d : d, opph: t.dataset.avtny === "opph" ? opph : undefined });
    }
    if (t.dataset.avt) { const a = avtLes().find((x) => x.id === t.dataset.avt); if (a) visAvtSkjema({ ...a }); return; }
    if (t.dataset.avttype) { avtFelt(); AV.type = t.dataset.avttype; if (AV.type !== "opph") delete AV.opph; return visAvtSkjema(AV); }
    if (t.dataset.avtbordvalg) { AV.bord = Number(t.dataset.avtbordvalg); t.parentNode.querySelectorAll("button").forEach((b) => b.classList.toggle("valgt", b === t)); return; }
    if (t.dataset.avtbord) {
      const a = avtLes().find((x) => x.id === t.dataset.avtbord); if (!a) return;
      synkSett({ ...a, bord: 1 });
      return avtEtterTegning(() => toastAngre("Bord reservert – vises på alle telefonene", () => { synkSett({ ...a, bord: 0 }); avtEtterTegning(); }));
    }
    if (t.hasAttribute("data-avtlagre")) return avtLagre();
    if (t.hasAttribute("data-avtslett")) return avtSlett();
  }

  // ---------- SIDE: I dag ----------
  let valgtDag = null;
  function sideIdag() {
    const idag = idagISO(), s0 = start(), s1 = slutt();
    if (!valgtDag) { const sd = sistDag(); valgtDag = sd || (idag < s0 ? s0 : idag > s1 ? s1 : idag); }
    const d = valgtDag, erIdag = d === idag;
    lagre.set(LS.sistDag, JSON.stringify({ dag: d, sett: idag }));
    const navn = megNavn(), reise = idag >= s0 && idag <= s1;
    let h = hjemskjermHtml();
    if (!reise) h += `<p class="hei">${navn ? `Hei, ${esc(navn)}!` : "Hei!"}</p>` + klokkeHtml();
    if (idag < s0) {
      const n = mellom(idag, s0);
      h += `<section class="kort nedtelling"><h2>${n} ${n === 1 ? "dag" : "dager"} til avreise</h2></section>`;
      // Oppgaver før første reisedag (f.eks. innsjekk på nett) vises de siste to ukene før avreise
      const forAvreise = D.hendelser.filter((e) => e.oppgave && e.d >= idag && e.d < s0 && mellom(idag, e.d) <= 14).sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : minutter(a.t) - minutter(b.t)));
      if (forAvreise.length) h += `<section class="kort advarsel huskkort"><h2>${ikon("advarsel")}Husk før avreise</h2>${forAvreise.map((e) => huskRad(e, "div", true)).join("")}</section>`;
    }
    h += `<div class="dagnav">
      <button class="pilknapp" data-dag="-1" aria-label="Forrige dag" ${d <= s0 ? "disabled" : ""}>${ikon("venstre", "")}</button>
      <div class="dagtittel"><b>${esc(pen(d))}</b><span>${erIdag ? "I dag" : `Dag ${mellom(s0, d) + 1} av ${mellom(s0, s1) + 1}`}</span>
        ${!erIdag && idag >= s0 && idag <= s1 ? `<br><button class="idagknapp" data-dag="0">Gå til i dag</button>` : ""}</div>
      <button class="pilknapp" data-dag="1" aria-label="Neste dag" ${d >= s1 ? "disabled" : ""}>${ikon("hoyre", "")}</button></div>`;

    const sted = stedForDato(d);
    if (reise) h += klokkeMini();
    else {
      if (sted) h += `<a class="kort hero" href="#/sted/${esc(sted.id)}" style="display:block;text-decoration:none"><h2>${esc(sted.navn)}</h2><p>${esc(sted.dato)} · Alt om ${esc(sted.navn)} ›</p></a>`;
      h += vaerHtml(d);
    }

    // Programmet = bestilt (reiseinfoen) + det familien har lagt til selv (synk)
    const hend = D.hendelser.filter((e) => e.d === d), egne = avtDag(d);
    const rader = [...hend, ...egne.map(avtSomHend)].sort((a, b) => minutter(a.t) - minutter(b.t));
    let neste = null;
    const erNeste = (e) => !!neste && (neste === e || (!!neste.egen && !!e.egen && neste.egen.id === e.egen.id));
    if (erIdag) {
      const nm = naaMin();
      const kand = (dag) => [...D.hendelser.filter((e) => e.d === dag), ...avtDag(dag).map(avtSomHend)]
        .filter((e) => e.t && e.t !== "kveld" && !e.oppgave && !(e.egen && e.egen.type === "mote")).sort((a, b) => minutter(a.t) - minutter(b.t));
      // Bare i dag og i morgen – ellers blir det samme kortet stående i flere dager
      neste = kand(d).find((e) => minutter(e.t) >= nm - 15) || kand(pluss(d, 1))[0] || null;
      if (neste) {
        const k = neste.kontakt ? kontaktEtterId(neste.kontakt) : null;
        const naar = neste.d === d ? (() => { const diff = minutter(neste.t) - nm; return diff <= 0 ? "nå" : diff < 60 ? `om ${diff} min` : `om ${Math.floor(diff / 60)} t ${diff % 60} min`; })() : "i morgen";
        const kn = neste.egen ? avtKnapper(neste.egen, false) : k ? ringeKnapper(k, 3) : "";
        h += `<section class="kort neste"><div class="nesteetikett">Neste</div><div class="nestetittel">${esc(neste.tittel)}</div>
          <div class="nestetid">kl. ${esc(neste.t)} · ${esc(naar)}</div>${neste.merk ? `<div class="nestetid">${neste.egen ? esc(neste.merk) : md(neste.merk)}</div>` : ""}
          ${k ? `<div class="hvem">${esc(k.navn)} · ${esc(k.rolle)}</div>` : neste.egen ? `<div class="hvem">Lagt til${personNavn(neste.egen.hvem) ? " av " + esc(personNavn(neste.egen.hvem)) : ""}</div>` : ""}${kn ? `<div class="knapper">${kn}</div>` : ""}</section>`;
      }
    }
    // Flyttedag: sjekklista for rommet om morgenen (åpen) og kvelden før (lukket)
    const flytt = D.steder.some((s) => s.hotell && s.til === d);
    const kveldFor = erIdag && naaMin() >= 17 * 60 && D.steder.some((s) => s.hotell && s.til === pluss(d, 1));
    if ((flytt || kveldFor) && D.pakking && (D.pakking.forlateRommet || []).length) h += romSjekkHtml(flytt);

    const natt = overnatting(d);
    if (reise) {
      if (sted) {
        const nt = natt, nk = nt ? kontaktEtterId(nt.hotell.kontakt) : null;
        h += `<section class="stedkort2"><a class="stedrad" href="#/sted/${esc(sted.id)}"><span class="stedrad-ikon">${ikon("kart", "")}</span><span><b>${esc(sted.navn)}</b><small>${esc(sted.dato)}${sted.netter ? " · " + sted.netter + (sted.netter === 1 ? " natt" : " netter") : ""}</small></span><span class="stedrad-mer" aria-hidden="true"></span></a>
          ${nt ? `<div class="inatt"><div class="inatt-etikett">${nt.til === pluss(d, 1) && nt.fra !== d ? "Siste natt på" : nt.fra === d ? "I natt – nytt hotell" : "I natt"}</div><div class="inatt-navn">${esc(nt.hotell.navn)}</div>
            ${notatHtml(nt)}
            <div class="knapper">${nt.hotell.sjofor !== false ? `<button class="kb" data-sjofor="${esc(nt.id)}">${ikon("kart", "")}Vis til sjåføren</button>` : ""}${ringeKnapper(nk, 1)}</div></div>` : ""}</section>`;
      }
      h += vaerKompakt(d);
    }

    // Fri dag: snarveier til ideer, mat og resortprogrammet (forslag – ikke bestilt)
    const resort = natt && natt.resortProgram && D.resortProgram;
    const sId = sted && sted.id, antIde = sId && D.ideer[sId] ? D.ideer[sId].length : 0, antMat = sId ? D.restauranter.liste.filter((r) => r.sted === sId).length : 0;
    const fri = !!sted && !hend.some((e) => !e.oppgave) && !egne.some((a) => a.type !== "mote") && (antIde || antMat || resort);
    if (fri) h += `<section class="kort fridag"><h2>${ikon("ideer")}Fri dag i ${esc(sted.navn)}</h2><p class="krolle">Ingenting er bestilt. Forslag – ikke bestilt:</p><div class="fri-knapper">
      ${antIde ? `<a class="kb" href="#/sted/${esc(sId)}/ideerher">${ikon("ideer", "")}Ideer (${antIde})</a>` : ""}
      ${antMat ? `<a class="kb" href="#/mat/${esc(sId)}">${ikon("mat", "")}Mat (${antMat})</a>` : ""}
      ${resort ? `<button class="kb" data-rull="resortprog">${ikon("kalender", "")}På resortet i dag</button>` : ""}
      <button class="kb" data-avtny="dag">${ikon("pluss", "")}Legg til plan</button></div></section>`;

    h += `<section class="kort"><h2>${ikon("kalender")}Programmet</h2>`;
    h += rader.length ? `<ul class="tidslinje">${rader.map((e) => {
      if (e.egen) return avtRad(e.egen, erNeste(e));
      const k = e.kontakt ? kontaktEtterId(e.kontakt) : null;
      if (e.oppgave) return huskRad(e, "li");
      // Kontaktknappene står allerede i Neste-kortet – her bare navnet
      const iNeste = erNeste(e);
      return `<li><span class="kl">${esc(e.t || "–")}</span><div>${md(e.tittel)}
        ${e.merk ? `<div class="merk">${md(e.merk)}</div>` : ""}
        ${k ? `<div class="hvem">${esc(k.navn)} · ${esc(k.rolle)}${iNeste ? " · se Neste over" : ""}</div>${iNeste ? "" : `<div class="knapper">${ringeKnapper(k)}</div>`}` : ""}</div></li>`;
    }).join("")}</ul>` : `<p class="tom">Ingenting bestilt denne dagen.</p>`;
    h += `<button class="pny avtny" data-avtny="dag">${ikon("pluss", "")}Legg til avtale eller møtested</button></section>`;

    const flyIdag = D.fly.filter((f) => f.d === d);
    if (flyIdag.length) h += `<section class="kort"><h2>${ikon("reise")}Fly</h2>${flyIdag.map(flyKort).join("")}</section>`;

    if (resort) {
      const prog = D.resortProgram[String(ukedag(d))] || [];
      h += `<details class="fold" id="resortprog"${fri ? " open" : ""}><summary>${ikon("kalender")}På resortet <span class="antall">(${esc(DAGER[ukedag(d)])})</span></summary><div class="innhold"><ul class="program">${prog.map((p) => `<li>${esc(p)}</li>`).join("")}</ul><p class="krolle" style="margin-top:8px">Fra resortets aktivitetskalender – kan endres etter vær.</p></div></details>`;
    }
    if (natt && !reise) {
      const hk = kontaktEtterId(natt.hotell.kontakt);
      h += `<section class="kort"><h2>${ikon("hotell")}Vi sover på</h2><div class="hnavn" style="font-weight:700">${esc(natt.hotell.navn)}</div>
        <div class="krolle">${esc(natt.hotell.adr)}</div>
        <div class="knapper">${knapp("kart", natt.hotell.kartq, "Kart")}${ringeKnapper(hk)}</div></section>`;
    }
    return h + bunn();
  }

  // ---------- kart (grunnkartene ligger ferdig tegnet i reiseinfoen – virker uten nett; nåler og rader åpner Google Maps) ----------
  const kartVisning = {}; // valgt visning per sted (bare i minnet)
  const kf = (v) => v.toFixed(1);
  const kProj = (b) => { const [s, w, n, e] = b.bb; const k = Math.cos(((b.lat0 != null ? b.lat0 : (s + n) / 2) * Math.PI) / 180); const sx = b.W / ((e - w) * k); return (la, lo) => [(lo - w) * k * sx, (n - la) * sx]; };
  const kGrunn = (b) => `<rect width="${b.W}" height="${b.H}" class="kbg-${esc(b.bg || "land")}"/>` + b.lag.map(([k, d]) => `<path d="${d}" class="kl-${esc(k)}"/>`).join("");
  const kAttr = (b, vb = { x: 0, y: 0, w: b.W, h: b.H, s: 1 }) => `<g transform="translate(${kf(vb.x + vb.w - 5 * vb.s)} ${kf(vb.y + vb.h - 5 * vb.s)}) scale(${vb.s})"><text class="kattr" text-anchor="end">${b.kilde === "ne" ? "Natural Earth" : "© OpenStreetMap"}</text></g>`;
  // Utsnitt av et grunnkart (zoom): [sør, vest, nord, øst]. s = skala for nåler og tekst, så de blir like store på skjermen.
  const kVb = (v, b) => { if (!v.utsnitt) return { x: 0, y: 0, w: b.W, h: b.H, s: 1 }; const pr = kProj(b), [s, w, n, e] = v.utsnitt, [x1, y1] = pr(n, w), [x2, y2] = pr(s, e); return { x: x1, y: y1, w: x2 - x1, h: y2 - y1, s: (x2 - x1) / b.W }; };
  const kUrl = (p) => p.url || kartUrl(p.q || `${p.lat},${p.lon}`);
  const K_HUS = '<path class="kglyf" d="M-4.2 2.8V-1.1L0 -4.6L4.2 -1.1V2.8ZM-1.3 2.8V0.2H1.3V2.8"/>';
  const K_FLY = `<g class="kglyf" transform="translate(-5.2 -5.2) scale(.43)">${P.reise}</g>`;
  const kMerkeHtml = (p) => p.t === "hotell" ? `<svg viewBox="-6 -6 12 12" aria-hidden="true">${K_HUS}</svg>` : p.t === "fly" ? ikon("reise", "") : esc(p.nr || "");
  function kRute(r, pr) {
    const q = r.pts.map(([a, b]) => pr(a, b));
    let d;
    if (r.bue != null && q.length === 2) {
      const [[x1, y1], [x2, y2]] = q, cx = (x1 + x2) / 2 - (y2 - y1) * r.bue, cy = (y1 + y2) / 2 + (x2 - x1) * r.bue;
      d = `M${kf(x1)} ${kf(y1)}Q${kf(cx)} ${kf(cy)} ${kf(x2)} ${kf(y2)}`;
    } else if (r.glatt && q.length > 2) {
      d = `M${kf(q[0][0])} ${kf(q[0][1])}`;
      for (let i = 0; i < q.length - 1; i++) {
        const p0 = q[i - 1] || q[i], p1 = q[i], p2 = q[i + 1], p3 = q[i + 2] || p2;
        d += `C${kf(p1[0] + (p2[0] - p0[0]) / 6)} ${kf(p1[1] + (p2[1] - p0[1]) / 6)} ${kf(p2[0] - (p3[0] - p1[0]) / 6)} ${kf(p2[1] - (p3[1] - p1[1]) / 6)} ${kf(p2[0])} ${kf(p2[1])}`;
      }
    } else d = "M" + q.map(([x, y]) => `${kf(x)} ${kf(y)}`).join("L");
    const halo = r.t === "tur" || r.t === "gange" || r.t === "bat" ? `<path d="${d}" class="kr-halo"/>` : "";
    return `${halo}<path d="${d}" class="kr kr-${esc(r.t)}${r.svak ? " svak" : ""}"/>`;
  }
  function kNal(p, pr, sk = 1, r = 11) {
    let [x, y] = pr(p.lat, p.lon); x += (p.dx || 0) * sk; y += (p.dy || 0) * sk;
    const tf = `translate(${kf(x)} ${kf(y)})${sk !== 1 ? ` scale(${sk.toFixed(3)})` : ""}`;
    if (p.t === "forbi") return `<g class="kforbi" transform="${tf}"><circle r="3"/><text x="${p.v ? -6 : 6}" y="3.5"${p.v ? ' text-anchor="end"' : ""}>${esc(p.navn)}</text></g>`;
    const inn = p.t === "hotell" ? K_HUS : p.t === "fly" ? K_FLY : `<text class="knum" y="4">${esc(p.nr || "")}</text>`;
    return `<a href="${esc(kUrl(p))}" target="_blank" rel="noopener noreferrer" aria-label="${esc(p.navn || "Hotellet")} i Google Maps"><g class="kn kn-${esc(p.t)}" transform="${tf}"><circle class="ktreff" r="${r + 9}"/><circle class="kprikk" r="${r}"/>${inn}</g></a>`;
  }
  const K_REKKE = { forbi: 0, ide: 1, bestilt: 2, fly: 3, hotell: 4 };
  function kartSvg(v) {
    const b = D.kart.baser[v.base], pr = kProj(b), vb = kVb(v, b);
    const pk = [...v.punkter].sort((a, c) => K_REKKE[a.t] - K_REKKE[c.t]);
    return `<svg class="kartsvg${vb.s !== 1 ? " utsnitt" : ""}" viewBox="${kf(vb.x)} ${kf(vb.y)} ${kf(vb.w)} ${kf(vb.h)}" role="img" aria-label="Kart: ${esc(v.navn)}">${kGrunn(b)}${(v.ruter || []).map((r) => kRute(r, pr)).join("")}${pk.map((p) => kNal(p, pr, vb.s * (v.nal || 1))).join("")}${kAttr(b, vb)}</svg>`;
  }
  const K_LISTE = { hotell: 0, fly: 1, bestilt: 2, ide: 3 };
  function kListe(v, s, smal) {
    const pk = v.punkter.filter((p) => p.t !== "forbi");
    if (!v.ordnet) pk.sort((a, c) => K_LISTE[a.t] - K_LISTE[c.t]);
    return `<div class="kliste">${pk.map((p) => {
      const navn = p.navn || (s.hotell ? s.hotell.navn : "Hotellet"), merk = smal && p.t === "ide" ? "" : p.merk;
      return `<a class="kpunkt" href="${esc(kUrl(p))}" target="_blank" rel="noopener noreferrer"><span class="knr kn-${esc(p.t)}">${kMerkeHtml(p)}</span><span class="kptekst"><b>${esc(navn)}</b>${merk ? `<small>${esc(merk)}</small>` : ""}</span>${ikon("kart", "kpil")}</a>`;
    }).join("")}</div>`;
  }
  function kartKort(s) {
    const vis = D.kart && D.kart.steder[s.id];
    if (!vis || !vis.length) return "";
    const i = Math.min(kartVisning[s.id] || 0, vis.length - 1), v = vis[i], b = D.kart.baser[v.base], vb = kVb(v, b), hoy = vb.h / vb.w > 1.25;
    const seg = vis.length > 1 ? `<div class="ksegment">${vis.map((x, j) => `<button class="${j === i ? "valgt" : ""}" aria-pressed="${j === i}" data-kvis="${esc(s.id)}:${j}">${esc(x.navn)}</button>`).join("")}</div>` : "";
    const typer = new Set(v.punkter.map((p) => p.t));
    const forkl = [typer.has("bestilt") ? `<span><i class="knr kn-bestilt">1</i>Bestilt</span>` : "", typer.has("ide") ? `<span><i class="knr kn-ide">a</i>Idé – ikke bestilt</span>` : "", "<span>Trykk for Google Maps</span>"].join("");
    const lenker = (v.lenker || []).map((l) => `<a class="kb" href="${esc(l.url)}" target="_blank" rel="noopener noreferrer">${ikon(l.t === "gange" ? "gange" : "rute", "")}${esc(l.etikett)}</a>`).join("");
    return `<section class="kort kartkort" id="kartkort"><h2>${ikon("kartark")}Kart</h2>${seg}
      <div class="kinnhold${hoy ? " hoy" : ""}"><div class="kbilde">${kartSvg(v)}</div>${kListe(v, s, hoy)}</div>
      ${v.merk ? `<p class="kmerk">${esc(v.merk)}</p>` : ""}<div class="kforkl">${forkl}</div>
      ${lenker ? `<div class="knapper">${lenker}</div>` : ""}</section>`;
  }
  // Oversiktskartet i Reisen-fanen: Vietnam med alle stedene, innfelt kart med hjemreisen og (valgfritt) en stripe lenger sør med flybyttet
  function oversiktKart() {
    const o = D.kart && D.kart.oversikt;
    if (!o) return "";
    const b = D.kart.baser[o.base], pr = kProj(b), naa = stedForDato(idagISO());
    const nr = (id) => String(D.steder.findIndex((s) => s.id === id) + 1);
    const etikett = (s, tx, dy, a, navn, dato) => `<text class="klab" x="${tx}" y="${dy}" text-anchor="${a}">${esc(navn || s.navn)}</text>${dato !== "" ? `<text class="klab2" x="${tx}" y="${dy + 12}" text-anchor="${a}">${esc(dato || s.dato)}</text>` : ""}`;
    const stopp = (x, prj, r, lab) => {
      const s = stedEtterId(x.sted); if (!s) return "";
      const [px, py] = prj(x.lat, x.lon), her = naa && naa.id === s.id;
      const inn = x.hjem ? K_HUS : `<text class="knum" y="4">${nr(s.id)}</text>`;
      return `<a href="#/sted/${esc(s.id)}" aria-label="${esc(x.navn || s.navn)}"><g class="kn ${x.hjem ? "kn-hotell" : "kn-bestilt"} kstopp${her ? " naa" : ""}" transform="translate(${kf(px)} ${kf(py)})"><circle class="ktreff" r="${r + 10}"/>${her ? `<circle class="kring" r="${r + 5}"/>` : ""}<circle class="kprikk" r="${r}"/>${inn}${lab}</g></a>`;
    };
    const hoved = o.stopp.map((x) => { const h = x.side !== "v", tx = h ? 14 : -14; return stopp(x, pr, 10, etikett(stedEtterId(x.sted) || {}, tx, x.dy, h ? "start" : "end")); }).join("");
    const ib = D.kart.baser[o.innfelt.base], ip = kProj(ib), ix = b.W - ib.W - 6, iy = b.H - ib.H - 34;
    const innfelt = o.innfeltStopp.map((x) => x.hjem ? stopp(x, ip, 7, etikett({}, -11, 0, "end", x.navn, x.dato)) : stopp(x, ip, 8, etikett(stedEtterId(x.sted) || {}, 0, -14, "middle", "", ""))).join("");
    // Stripe under kartet (kartbrudd): samme målestokk og lengdegrader, så flybyttet står rett under der det hører hjemme
    const st = o.stripe, sb = st && D.kart.baser[st.base], gap = 14, oy = b.H + gap, H = sb ? oy + sb.H : b.H;
    let stripe = "", sRuter = "", sBue = "", sStopp = "", attr = kAttr(b);
    if (sb) {
      const sp0 = kProj(sb), sp = (la, lo) => { const [x, y] = sp0(la, lo); return [x, y + oy]; }, nord = sb.bb[2];
      // Ruter som krysser bruddet tegnes sammenhengende: punkter sør for stripas nordkant plasseres i stripa, resten på hovedkartet
      const kombi = (la, lo) => (la <= nord ? sp(la, lo) : pr(la, lo));
      sRuter = (st.ruter || []).map((r) => kRute(r, kombi)).join("");
      const bolge = (y) => { let d = `M0 ${y}`; for (let x = 0; x <= b.W; x += 12) d += `Q${x + 3} ${y - 3} ${x + 6} ${y}T${x + 12} ${y}`; return d; };
      stripe = `<clipPath id="kstripeklipp"><rect y="${oy}" width="${sb.W}" height="${sb.H}"/></clipPath><g clip-path="url(#kstripeklipp)"><g transform="translate(0 ${oy})">${kGrunn(sb)}</g></g>
        <rect x="0" y="${b.H}" width="${b.W}" height="${gap}" class="kbrudd"/><path d="${bolge(b.H + 2)}" class="kbrudd-l"/><path d="${bolge(oy - 2)}" class="kbrudd-l"/>${st.tekst ? `<text class="kbrudd-t" x="8" y="${b.H + 10}">${esc(st.tekst)}</text>` : ""}`;
      if (st.bue) { // bue fra et punkt i det innfelte kartet ned til stripa
        const [a1, b1] = ip(...st.bue.fra), x1 = a1 + ix, y1 = b1 + iy, [x2, y2] = sp(...st.bue.til), k = st.bue.k || 0;
        sBue = `<path d="M${kf(x1)} ${kf(y1)}Q${kf((x1 + x2) / 2 - (y2 - y1) * k)} ${kf((y1 + y2) / 2 + (x2 - x1) * k)} ${kf(x2)} ${kf(y2)}" class="kr kr-fly"/>`;
      }
      if (st.stopp) { // flybytte: ikke et eget sted – trykk åpner Fly-siden
        const x = st.stopp, [px, py] = sp(x.lat, x.lon), h = x.side !== "v", tx = h ? 13 : -13;
        sStopp = `<a href="#/fly" aria-label="${esc(x.navn)} – se flyene"><g class="kn kn-fly kstopp" transform="translate(${kf(px)} ${kf(py)})"><circle class="ktreff" r="19"/><circle class="kprikk" r="9"/><g transform="scale(.9)">${K_FLY}</g>${etikett({}, tx, x.dy || 0, h ? "start" : "end", x.navn, x.dato || "")}</g></a>`;
      }
      attr = kAttr(sb, { x: 0, y: oy, w: sb.W, h: sb.H, s: 1 });
    }
    return `<section class="kort kartkort oversikt"><svg class="kartsvg" viewBox="0 0 ${b.W} ${H}" role="img" aria-label="Kart over reiseruta">${kGrunn(b)}${stripe}${o.ruter.map((r) => kRute(r, pr)).join("")}${sRuter}${hoved}
      <g transform="translate(${ix} ${iy})"><clipPath id="kinnklipp"><rect width="${ib.W}" height="${ib.H}" rx="8"/></clipPath><g clip-path="url(#kinnklipp)">${kGrunn(ib)}</g><rect width="${ib.W}" height="${ib.H}" rx="8" class="kinnramme"/>${kRute(o.innfeltRute, ip)}</g>${sBue}<g transform="translate(${ix} ${iy})">${innfelt}</g>${sStopp}${attr}</svg>
      <div class="kforkl"><span><i class="f-fly"></i>Fly</span><span><i class="f-bil"></i>Bil og båt</span><span>Trykk på et sted for å åpne det</span></div></section>`;
  }
  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-kvis]");
    if (!b) return;
    const [sid, j] = b.dataset.kvis.split(":"), el = document.getElementById("kartkort"), s = stedEtterId(sid);
    kartVisning[sid] = Number(j);
    if (el && s) el.outerHTML = kartKort(s);
  });
  document.addEventListener("toggle", (e) => { if (e.target && e.target.id === "reiseliste") lagre.set("vn.reiseListe", e.target.open ? "1" : "0"); }, true);

  // ---------- SIDE: Reisen ----------
  function sideReisen() {
    const naa = stedForDato(idagISO());
    let h = tittel("Reisen", `${esc(pen(start(), false))} – ${esc(pen(slutt(), false))} · ${esc(D.meta.reisende)}`);
    const liste = `<div class="stedliste">${D.steder.map((s, i) => `<a class="kort stedkort mednr ${naa && naa.id === s.id ? "naa" : ""}" href="#/sted/${esc(s.id)}">
      <span class="snr${s.netter ? "" : " hjem"}">${s.netter ? i + 1 : `<svg viewBox="-6 -6 12 12" aria-hidden="true">${K_HUS}</svg>`}</span><b>${esc(s.navn)}</b><span class="netter">${s.netter ? s.netter + (s.netter === 1 ? " natt" : " netter") : ""}${ikon("chev", "")}</span>
      <span class="dato">${esc(s.dato)}${naa && naa.id === s.id ? ' · <span class="naa-merke">Her er vi nå</span>' : ""}</span></a>`).join("")}</div>`;
    const kart = oversiktKart();
    if (kart) h += kart + `<details class="fold reiseliste" id="reiseliste"${lagre.get("vn.reiseListe") === "1" ? " open" : ""}><summary>${ikon("kalender")}Vis som liste</summary><div class="innhold">${liste}</div></details>`;
    else h += liste;
    h += `<div class="seksjonstittel">Oversikt</div><div class="liste">
      <a href="#/fly"><span class="lik">${ikon("reise", "")}</span><span class="ltekst">Alle fly<small>${D.fly.length} flyvninger med seter og referanser</small></span><span class="pil"></span></a>
      <a href="#/hotell"><span class="lik">${ikon("hotell", "")}</span><span class="ltekst">Alle hotell<small>${D.steder.filter((s) => s.hotell).length} overnattinger med referanser og innsjekk</small></span><span class="pil"></span></a></div>`;
    return h + bunn();
  }

  // ---------- SIDE: Sted ----------
  function sideSted(id) {
    const i = D.steder.findIndex((s) => s.id === id);
    if (i < 0) return sideReisen();
    const s = D.steder[i], forr = D.steder[i - 1], neste = D.steder[i + 1];
        const antRest = D.restauranter.liste.filter((r) => r.sted === s.id).length;
    let h = tittel(s.navn, `${esc(s.dato)}${s.netter ? " · " + s.netter + (s.netter === 1 ? " natt" : " netter") : ""}`, s.ingress);
    const sn = [];
    const harKart = !!(D.kart && D.kart.steder[s.id]);
    if (harKart) sn.push(`<button class="kb" data-rull="kartkort">${ikon("kartark", "")}Kart</button>`);
    const antK = D.kontakter.filter((k) => k.sted === s.id).length;
    if (antRest) sn.push(`<a class="kb" href="#/mat/${esc(s.id)}">${ikon("mat", "")}Mat (${antRest})</a>`);
    if (antK) sn.push(`<button class="kb" data-rull="kontakterher">${ikon("kontakt", "")}Kontakter (${antK})</button>`);
    if (D.ideer[s.id]) sn.push(`<button class="kb" data-rull="ideerher">${ikon("ideer", "")}Ideer</button>`);
    if (D.sykehus[s.id]) sn.push(`<button class="kb" data-rull="sykehus">${ikon("sykehus", "")}Sykehus</button>`);
    if (sn.length) h += `<div class="snarveier">${sn.join("")}</div>`;

    const oppg = D.hendelser.filter((e) => e.oppgave && e.sted === s.id).sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : minutter(a.t) - minutter(b.t)));
    if (oppg.length) {
      const gjort = huskLes(), igjen = oppg.filter((e) => !gjort[oppgNokkel(e)]).length;
      h += `<section class="kort advarsel huskkort" id="huskher"><h2>${ikon("advarsel")}Husk underveis <span class="antall">${igjen ? `${igjen} igjen` : "alt gjort"}</span></h2>${oppg.map((e) => huskRad(e, "div", true)).join("")}<p class="krolle huskhjelp">Kryss av når det er gjort – det vises på alle telefonene.</p></section>`;
    }
    h += hotellKort(s);
    h += kartKort(s);
    const idag = idagISO();
    // Ankomst er ferdig dagen etter at vi kom, avreise dagen etter at vi dro – da legges de sammen
    const ferdig = (x) => (x.type === "ankomst" && idag > s.fra) || (x.type === "avreise" && idag > s.til);
    h += s.seksjoner.map((x) => ferdig(x) ? `<details class="fold ferdig"><summary>${ikon("bestilt")}${esc(x.tittel)} <span class="antall">ferdig</span></summary><div class="innhold">${seksjon(x)}</div></details>` : seksjon(x)).join("");

    const alle = D.kontakter.filter((k) => k.sted === s.id);
    if (alle.length) h += `<details class="fold" id="kontakterher"><summary>${ikon("kontakt")}Alle kontakter her <span class="antall">(${alle.length})</span></summary><div class="innhold">${alle.map(kontaktHtml).join("")}</div></details>`;
    if (D.ideer[s.id]) h += `<details class="fold" id="ideerher"><summary>${ikon("ideer")}Ideer – ikke bestilt <span class="antall">(${D.ideer[s.id].length})</span></summary><div class="innhold">${ideerHtml(D.ideer[s.id])}</div></details>`;
    if (D.sykehus[s.id]) h += `<details class="fold" id="sykehus"><summary>${ikon("sykehus")}Nærmeste sykehus</summary><div class="innhold">${sykehusHtml(D.sykehus[s.id])}</div></details>`;

    h += `<div class="navnedre">${forr ? `<a href="#/sted/${esc(forr.id)}">‹ Forrige<b>${esc(forr.navn)}</b></a>` : ""}${neste ? `<a class="neste-sted" href="#/sted/${esc(neste.id)}">Neste ›<b>${esc(neste.navn)}</b></a>` : ""}</div>`;
    return h + bunn();
  }

  // ---------- SIDE: Mat ----------
  let matMaal = "alle", matSort = "prio";
  const scoreKl = (v) => (v >= 8 ? "g" : v >= 6 ? "y" : "r");
  // Poengene fra fil 9 vist som ord: risiko (s1, 8 = lavest funnet), prisnivå per person, kvalitet som stjerner
  const risikoTekst = (v) => (v >= 8 ? "lav" : v >= 6 ? "middels" : "høy");
  const prisTekst = (v) => (v >= 9 ? "Billig" : v >= 7 ? "Rimelig" : v >= 5 ? "Middels pris" : "Dyrt");
  // Pris følger prisbåndene (Billig/Rimelig grønn, Middels gul, Dyrt rød); kvalitet bruker samme skala som risikoen (s1)
  const prisKl = (v) => (v >= 7 ? "g" : v >= 5 ? "y" : "r");
  const scoreChips = (r) => `<span class="score ${scoreKl(r.s1)}" title="⟦r1⟧ ${esc(r.s1)} av 10">⟦r2⟧: ${risikoTekst(r.s1)}</span><span class="score ${prisKl(r.pris)}" title="Prispoeng ${esc(r.pris)} av 10">${prisTekst(r.pris)}</span><span class="score ${scoreKl(r.kvalitet)}" title="Kvalitet ${esc(r.kvalitet)} av 10">★ ${esc(r.kvalitet)}</span>`;
  const liste0Tekst = (sted) => { const n = D.restauranter.liste.filter((r) => r.sted === sted && (matMaal === "alle" || r[matMaal])).length; return `${n} ${n === 1 ? "sted" : "steder"}`; };
  function sideMat(stedId) {
    const steder = D.steder.filter((s) => D.restauranter.liste.some((r) => r.sted === s.id));
    if (!steder.length) return tittel("Mat") + `<p class="tom">Ingen restauranter lagt inn.</p>`;
    const fallback = (steder.find((s) => s.id === valgtSted().id) || steder[0]).id;
    // Et manuelt valgt sted huskes bare resten av dagen – neste dag (eller på et nytt sted) viser Mat der dere er
    let husket = null; try { const x = JSON.parse(lagre.get(LS.matSted) || "null"); if (x && x.dag === idagISO()) husket = x.sted; } catch {}
    const valgt = steder.some((s) => s.id === stedId) ? stedId : steder.some((s) => s.id === husket) ? husket : fallback;
    if (valgt !== fallback || husket) lagre.set(LS.matSted, JSON.stringify({ sted: valgt, dag: idagISO() }));
    let h = tittel("Mat", "Anbefalinger, ikke bestillinger. Vis alltid ⟦k1⟧.");
    h += `<button class="knapp knapp-rod knapp-full" data-hk style="margin-bottom:14px">Vis ⟦k1⟧</button>`;
    h += `<div class="velger" role="tablist">${steder.map((x) => `<button role="tab" data-matsted="${esc(x.id)}" class="${x.id === valgt ? "valgt" : ""}">${esc(x.navn)}</button>`).join("")}</div>`;
    h += `<div class="segment">${[["alle", "Alle"], ["F", "Frokost"], ["L", "Lunsj"], ["M", "Middag"]].map(([k, t]) => `<button data-maal="${k}" class="${matMaal === k ? "valgt" : ""}">${t}</button>`).join("")}</div>`;
    h += `<div class="sortlinje"><span>${liste0Tekst(valgt)}</span><button class="sortknapp" data-sort="${matSort === "s1" ? "prio" : "s1"}" aria-pressed="${matSort === "s1"}">${ikon("sorter", "")}Sortert: ${matSort === "s1" ? "⟦r3⟧" : "vår rekkefølge"}</button></div>`;
    const liste = D.restauranter.liste.filter((r) => r.sted === valgt && (matMaal === "alle" || r[matMaal]))
      .sort((a, b) => matSort === "s1" ? (b.s1 - a.s1) || (a.prio - b.prio) : (a.prio - b.prio));
    const omrader = [...new Set(liste.map((r) => r.omrade))];
    const renderRest = (r) => {
      const maal = [r.F && "Frokost", r.L && "Lunsj", r.M && "Middag"].filter(Boolean).join(" · ");
      return `<details class="rest"><summary>
        <div class="rtopp"><div><div class="rnavn">${esc(r.navn)}</div><div class="rkj">${esc(r.kjokken)}</div></div></div>
        <div class="scorer">${scoreChips(r)}<span class="maaltid">${esc(maal)}</span></div>
        <div class="rkj">${esc(r.avstand)}</div></summary>
        <div class="rinnhold">
          ${r.fraClaude ? `<p class="fraclaude">Lagt inn fra Claude – ikke sjekket som resten av lista. Vis alltid ⟦k1⟧.</p>` : ""}
          <p><strong>⟦k4⟧:</strong> ${esc(r.begrunnelse)}</p>
          <p><strong>⟦k5⟧:</strong> ${esc(r.s2)}</p>
          ${r.tips ? `<p><strong>Tips:</strong> ${esc(r.tips)}</p>` : ""}
          <dl class="rader"><dt>Adresse</dt><dd>${esc(r.adresse)}</dd><dt>Åpent</dt><dd>${esc(r.apent)}</dd><dt>Pris</dt><dd>${esc(r.prisPP)}</dd><dt>Omtaler</dt><dd>${esc(r.rating)}</dd></dl>
          <div class="knapper">${r.adresse && sjoforHer(r.sted) ? `<button class="kb" data-sjofor="r:${D.restauranter.liste.indexOf(r)}">${ikon("kart", "")}Vis til sjåføren</button>` : ""}${knapp("kart", r.navn + " " + r.adresse, "Kart")}${r.tlf ? knapp("tel", r.tlf, "Ring") : ""}${r.web ? knapp("web", r.web, "Nettside") : ""}</div>
        </div></details>`;
    };
    if (!liste.length) h += `<p class="tom">Ingen steder med dette måltidet her.</p>`;
    else if (omrader.length > 1) omrader.forEach((o) => { h += `<div class="seksjonstittel">${esc(o)}</div>` + liste.filter((r) => r.omrade === o).map(renderRest).join(""); });
    else h += liste.map(renderRest).join("");
    const fr = D.restauranter.fraraad[valgt], vi = D.restauranter.vite[valgt];
    if (fr) h += seksjon({ tittel: "Frarådes", type: "advarsel", tekst: fr });
    if (vi) h += seksjon({ tittel: "Verdt å vite", type: "info", tekst: vi });
    h += familieRetterHtml();
    if (D.restauranter.generelt.length) h += `<details class="fold"><summary>${ikon("info")}${esc(D.restauranter.generelltTittel || "Generelle råd")}</summary><div class="innhold">${D.restauranter.generelt.map((t) => `<p>${md(t)}</p>`).join("")}</div></details>`;
    return h + bunn();
  }

  // ---------- SIDE: Kontakter ----------
  let sokTekst = "";
  function sideKontakter() {
    return tittel("Kontakter", "Trykk for å ringe, sende WhatsApp eller e-post") +
      `<div class="sok"><input id="sok" type="search" placeholder="Søk: sjåfør, hotell, by …" value="${esc(sokTekst)}" autocomplete="off" enterkeyhint="search"></div><div id="kliste">${kontaktListe()}</div>` + bunn();
  }
  function kontaktListe() {
    const q = sokTekst.trim().toLowerCase();
    const treff = (k) => !q || [k.navn, k.rolle, k.merk, k.gruppe, (stedEtterId(k.sted) || {}).navn].join(" ").toLowerCase().includes(q);
    const naa = valgtSted();
    let h = "";
    const gruppe = (t, liste, aapen) => {
      liste = liste.filter(treff); if (!liste.length) return;
      if (aapen || q) h += `<div class="seksjonstittel">${esc(t)}</div><section class="kort">${liste.map(kontaktHtml).join("")}</section>`;
      else h += `<details class="fold"><summary>${esc(t)} <span class="antall">(${liste.length})</span></summary><div class="innhold">${liste.map(kontaktHtml).join("")}</div></details>`;
    };
    gruppe(idagISO() < start() ? `${naa.navn} – første stopp` : `${naa.navn} – her er vi nå`, D.kontakter.filter((k) => k.sted === naa.id), true);
    gruppe("Familien", D.kontakter.filter((k) => k.gruppe === "Familien"), true);
    if (!q) h += `<div class="seksjonstittel">Andre steder og tjenester</div>`;
    D.steder.filter((s) => s.id !== naa.id).forEach((s) => gruppe(s.navn, D.kontakter.filter((k) => k.sted === s.id)));
    ["Fly", "Bookingtjenester", "Nød og helse"].forEach((g) => gruppe(g, D.kontakter.filter((k) => k.sted === "alle" && k.gruppe === g)));
    gruppe("Andre", D.kontakter.filter((k) => k.sted === "alle" && !["Familien", "Fly", "Bookingtjenester", "Nød og helse"].includes(k.gruppe)));
    return h || `<p class="tom">Ingen treff.</p>`;
  }

  // ---------- SIDE: Fly ----------
  function sideFly() {
    let h = tittel("Fly", esc(D.meta.bagasje));
    const idag = idagISO(), fløyet = (f) => f.d < idag, kommende = D.fly.filter((f) => !fløyet(f)), nesteF = kommende[0];
    const nesteTekst = (f) => { const n = mellom(idag, f.d); return n === 0 ? "i dag" : n === 1 ? "i morgen" : `om ${n} dager`; };
    const kortet = (f) => f === nesteF ? `<div class="flyneste"><div class="flyneste-etikett">Neste fly · ${esc(nesteTekst(f))}</div>${flyKort(f)}</div>` : flyKort(f);
    const grupper = [...new Set(kommende.map((f) => f.gruppe || ""))];
    grupper.forEach((g) => { h += `${g ? `<div class="seksjonstittel">${esc(g)}</div>` : ""}<div class="flyliste">${kommende.filter((f) => (f.gruppe || "") === g).map(kortet).join("")}</div>`; });
    const bak = D.fly.filter(fløyet);
    if (bak.length) h += `<details class="fold"><summary>${ikon("bestilt")}Fløyet <span class="antall">(${bak.length})</span></summary><div class="innhold"><div class="flyliste">${bak.map(flyKort).join("")}</div></div></details>`;
    h += `<section class="kort"><h2>${ikon("info")}Bonusprogram</h2><dl class="rader">${D.meta.bonus.map(([k, v]) => `<dt>${esc(k)}</dt><dd><button class="ref" data-kopier="${esc(v)}">${esc(v)}</button></dd>`).join("")}</dl></section>`;
    h += `<div class="seksjonstittel">Flyselskapene</div><section class="kort">${kontakterHtml(D.kontakter.filter((k) => k.gruppe === "Fly").map((k) => k.id))}</section>`;
    return h + bunn();
  }

  // ---------- SIDE: Hotell ----------
  function sideHotell() {
    const alle = D.steder.filter((s) => s.hotell), i = idagISO();
    const netter = alle.reduce((n, s) => n + (s.netter || 0), 0);
    let h = tittel("Hotell", `${alle.length} overnattinger · ${netter} netter`);
    const kommende = alle.filter((s) => s.til >= i), tidligere = alle.filter((s) => s.til < i);
    const aktiv = kommende.some((x) => x.fra <= i && i < x.til);
    const nesteId = (kommende.find((x) => x.fra > i) || {}).id;
    const merke = (s, n) => {
      if (i < start()) return n === 0 ? "Første hotell" : "";
      if (s.til === i) return "Utsjekk i dag";
      if (s.fra <= i) return "I natt";
      return !aktiv && s.id === nesteId ? "Neste hotell" : "";
    };
    // Første kort (og kveldens hotell på utsjekkdagen) vises helt; resten kompakt
    const full = (n) => n === 0 || (n === 1 && kommende[0].til === i);
    h += kommende.map((s, n) => hotellListeKort(s, merke(s, n), !full(n))).join("");
    if (tidligere.length) h += `<details class="fold"><summary>${ikon("hotell")}Tidligere <span class="antall">(${tidligere.length})</span></summary><div class="innhold">${tidligere.map((s) => hotellListeKort(s, "", true)).join("")}</div></details>`;
    h += `<p class="pl-lenke"><button data-sjofor="fri">Vis en annen adresse til sjåføren</button></p>`;
    return h + bunn();
  }

  // ---------- SIDE: Penger ----------
  function kursInfo() {
    let manuell = null, auto = null;
    try { manuell = JSON.parse(lagre.get(LS.kurs) || "null"); } catch {}
    try { auto = JSON.parse(lagre.get(LS.kursAuto) || "null"); } catch {}
    if (manuell && manuell.dato === idagISO() && manuell.kurs) return { kurs: manuell.kurs, tekst: "Egen kurs i dag – slett feltet for å bruke dagens kurs" };
    if (auto && auto.kurs) return { kurs: auto.kurs, tekst: `Dagens kurs ${pen(auto.dato, false)} (${auto.kilde})${auto.dato !== idagISO() ? " – oppdateres når dere har nett" : ""}` };
    return { kurs: D.penger.kurs, tekst: "Fast reservekurs – oppdateres når dere har nett" };
  }
  async function hentKurs(tving = false) {
    let auto = null; try { auto = JSON.parse(lagre.get(LS.kursAuto) || "null"); } catch {}
    if (!tving && auto && auto.dato === idagISO() && auto.andre) return false;
    if (!navigator.onLine) return false;
    const kilder = [
      ["https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/nok.json", (j) => j.nok && { VND: j.nok.vnd, USD: j.nok.usd, EUR: j.nok.eur, DKK: j.nok.dkk, SGD: j.nok.sgd }, "currency-api"],
      ["https://latest.currency-api.pages.dev/v1/currencies/nok.json", (j) => j.nok && { VND: j.nok.vnd, USD: j.nok.usd, EUR: j.nok.eur, DKK: j.nok.dkk, SGD: j.nok.sgd }, "currency-api"],
      ["https://open.er-api.com/v6/latest/NOK", (j) => j.rates && { VND: j.rates.VND, USD: j.rates.USD, EUR: j.rates.EUR, DKK: j.rates.DKK, SGD: j.rates.SGD }, "ExchangeRate-API"],
    ];
    for (const [url, les, kilde] of kilder) {
      try {
        const r = await fetch(url, { cache: "no-store", referrerPolicy: "no-referrer" });
        if (!r.ok) continue;
        const x = les(await r.json()) || {}, v = Number(x.VND);
        if (v > 1000 && v < 10000) {
          const andre = {}; for (const k of ["USD", "EUR", "DKK", "SGD"]) { const n = Number(x[k]); if (n > 0) andre[k] = n; }
          lagre.set(LS.kursAuto, JSON.stringify({ kurs: Math.round(v), dato: idagISO(), kilde, andre })); return true;
        }
      } catch {}
    }
    return false;
  }
  function sidePenger() {
    const ki = kursInfo(), kurs = ki.kurs;
    let h = tittel("Penger");
    h += `<section class="kort"><h2>${ikon("penger")}Omregner</h2><div class="omregner">
      <label>Dong (₫)<input id="vnd" inputmode="numeric" placeholder="100 000"></label>
      <label>Kroner<input id="nok" inputmode="decimal" placeholder="36"></label>
      <div class="kurs">1 kr = <input id="kurs" inputmode="numeric" value="${kurs}"> ₫</div><div class="kursinfo" id="kursinfo">${esc(ki.tekst)}</div></div>
      <div class="snarvei">${[20000, 50000, 100000, 200000, 500000, 1000000].map((v) => `<button data-vnd="${v}">${v.toLocaleString("nb-NO")} ₫</button>`).join("")}</div></section>`;
    h += D.penger.seksjoner.map(seksjon).join("");
    return h + bunn();
  }

  // ---------- SIDE: Nød ----------
  let nodSted = null;
  function sideNod() {
    const medSykehus = D.steder.filter((s) => D.sykehus[s.id]);
    const standard = valgtSted();
    const naa = medSykehus.find((s) => s.id === nodSted) || medSykehus.find((s) => s.id === standard.id) || medSykehus[0];
    let h = tittel("Nød og helse");
    // Akutt først: kort og nødnumre, så nærmeste sykehus; resten ligger sammenfoldet nederst
    h += `<div class="knapp-par"><button class="knapp knapp-rod" data-hk="nod">⟦k6⟧</button><button class="knapp knapp-lys" data-hk>⟦k2⟧</button></div>`;
    h += `<div class="nodgrid">${D.nod.nodnumre.map(([n, t]) => `<a href="tel:${esc(t)}"><b>${esc(t)}</b><span>${esc(n)}</span></a>`).join("")}</div>`;
    h += `<p class="nodmerk">${esc(D.nod.nodmerk)}</p>`;
    const sh = D.sykehus[naa.id] || [];
    h += `<section class="kort advarsel"><h2>${ikon("sykehus")}Nærmeste sykehus – ${esc(naa.navn)}</h2>
      <div class="velger">${medSykehus.map((s) => `<button data-nodsted="${esc(s.id)}" class="${s.id === naa.id ? "valgt" : ""}">${esc(s.navn)}</button>`).join("")}</div>
      ${sykehusHtml(sh.slice(0, 1))}
      ${sh.length > 1 ? `<details class="fold innfelt"><summary>Flere sykehus her <span class="antall">(${sh.length - 1})</span></summary><div class="innhold">${sykehusHtml(sh.slice(1))}</div></details>` : ""}</section>`;
    h += seksjon({ tittel: D.nod.hnT || "⟦k4⟧", type: "advarsel", tekst: D.nod.hn });
    h += `<div class="seksjonstittel">Ikke akutt</div>`;
    h += `<details class="fold"><summary>${ikon("kontakt")}Forsikring <span class="antall">(${(D.nod.forsikring || []).length})</span></summary><div class="innhold">${kontakterHtml(D.nod.forsikring)}</div></details>`;
    h += `<details class="fold"><summary>${ikon("info")}Helseråd</summary><div class="innhold">${(D.nod.helse || []).map((t) => `<p>${md(t)}</p>`).join("")}</div></details>`;
    h += `<details class="fold"><summary>${ikon("info")}Ambassade og UD</summary><div class="innhold">${kontakterHtml(D.nod.myndigheter)}</div></details>`;
    if (D.nod.hjemme) h += `<details class="fold"><summary>${ikon("kontakt")}Lege hjemme i Norge</summary><div class="innhold">${kontakterHtml(D.nod.hjemme)}</div></details>`;
    return h + bunn();
  }


  // ---------- SIDE: Pakkeliste ----------
  let pakkRunde = null, pakkListe = null;
  function pakkRunder() {
    return [{ id: "hjemme", navn: "Før avreise", dato: start() }, { id: "vietnam", navn: "I Vietnam", dato: slutt() }];
  }
  // Kryss og egne endringer ligger i synk-lageret (vn.synk) og deles med familien via Firebase.
  // Kryss følger tingens navn, og flyttes med når noe får nytt navn.
  let pakkRediger = false, pakkNy = null;
  const kopi = (x) => JSON.parse(JSON.stringify(x));
  const pakkHash = (x) => { let h = 5381; const s = JSON.stringify(x || null); for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0; return h.toString(36); };
  function pakkOriginal(nokkel) {
    const P = D.pakking || { lister: {} };
    if (nokkel === "hjemme") return [{ tittel: "Siste sjekk hjemme", ting: P.hjemme || [] }];
    if (nokkel === "rommet") return [{ tittel: "Før vi forlater rommet", ting: P.forlateRommet || [] }];
    return P.lister[nokkel] || [];
  }
  function pakkAktiv() {
    const P = D.pakking || { lister: {} }, m = meg();
    const runder = pakkRunder(), idag = idagISO();
    const runde = runder.find((x) => x.id === pakkRunde) || runder.find((x) => x.dato >= idag) || runder[runder.length - 1];
    const lister = [];
    if (m && P.lister[m]) lister.push(["meg", "Mine ting", pakkOriginal(m)]);
    if (P.lister.felles) lister.push(["felles", "Felles", pakkOriginal("felles")]);
    if (runde.id === "hjemme" && P.hjemme && P.hjemme.length) lister.push(["hjemme", "Før vi går", pakkOriginal("hjemme")]);
    if (runde.id !== "hjemme" && P.forlateRommet) lister.push(["rommet", "Rommet", pakkOriginal("rommet")]);
    const aktiv = lister.find((l) => l[0] === pakkListe) || lister[0];
    if (!aktiv) return { runder, runde, lister, m };
    const nokkel = aktiv[0] === "meg" ? m : aktiv[0];
    const egen = egneKart()[nokkel];
    return { runder, runde, lister, aktiv, nokkel, m, grupper: egen ? egen.g : aktiv[2], endret: !!egen, utdatert: !!(egen && egen.b && egen.b !== pakkHash(aktiv[2])) };
  }
  function pakkLagreGrupper(nokkel, grupper) { synkSett({ k: "l", l: nokkel, g: grupper || null, b: pakkHash(pakkOriginal(nokkel)) }); }
  function pakkEndre(fn) {
    const a = pakkAktiv(); if (!a.aktiv) return;
    const g = kopi(a.grupper); const svar = fn(g, a); pakkLagreGrupper(a.nokkel, g); return svar;
  }
  function pakkFlyttKryss(nokkel, fra, til) {
    const o = pakkLes();
    for (const r of Object.keys(o)) if (o[r][nokkel] && o[r][nokkel][fra]) { synkSett({ k: "x", r, l: nokkel, n: fra, v: 0 }); if (til) synkSett({ k: "x", r, l: nokkel, n: til, v: 1 }); }
  }

  // ---------- synk: pakkelister og kryss deles med familien (Firebase, kryptert på telefonen) ----------
  // Alt som sendes er AES-GCM-kryptert med en nøkkel som bare finnes i data.enc; dokument-ID-ene er HMAC-er.
  // Lokalt: vn.synk = { p: {nøkkel: post}, u: {nøkkel: 1} (ikke sendt ennå), s: sist sett servertid (ms), ok: sist vellykket (ms) }.
  // Post: {k:"x", r, l, n, v, t} kryss · {k:"n", r, l, t} nullstilt · {k:"l", l, g, b, t} egen liste (g = null: originalen)
  //       · {k:"e", id, a, …} tidspunkt-logg (se seksjonen «tp»)
  //       · {k:"a", id, type:"dag"|"opph"|"mote", d, tid, tekst, adr, tlf, opph, slettet, hvem, c} egne avtaler og notater.
  // Nyeste t vinner per post. Nullstilling gjelder kryss som er eldre enn den.
  const S = { tilst: null, aes: null, hmac: null, tok: null, tokUt: 0, status: "", gaar: null, igjen: false, timer: null };
  function synkLes() {
    if (S.tilst) return S.tilst;
    try { S.tilst = JSON.parse(lagre.get(LS.synk) || "null"); } catch {}
    if (!S.tilst || !S.tilst.p) S.tilst = { p: {}, u: {}, s: 0, ok: 0 };
    return S.tilst;
  }
  const synkLagre = () => lagre.set(LS.synk, JSON.stringify(synkLes()));
  const postNokkel = (p) => JSON.stringify(p.k === "x" ? ["x", p.r, p.l, p.n] : p.k === "n" ? ["n", p.r, p.l] : p.k === "e" ? ["e", p.id] : p.k === "a" ? ["a", p.id] : p.k === "u" ? ["u", p.id] : ["l", p.l]);
  function synkSett(p) {
    const s = synkLes(), k = postNokkel(p);
    p.t = Math.max(Date.now(), ((s.p[k] || {}).t || 0) + 1);
    s.p[k] = p; s.u[k] = 1; synkLagre(); synkSnart();
  }
  const ROM_MAKS = 30 * 3600e3; // kryss i «Rommet» gjelder bare denne flyttingen
  function pakkLes() { // { runde: { liste: { navn: 1 } } }
    const s = synkLes(), nul = {}, o = {};
    for (const p of Object.values(s.p)) if (p.k === "n") nul[p.r + "\n" + p.l] = p.t;
    for (const p of Object.values(s.p)) {
      if (p.k !== "x" || !p.v || p.t <= (nul[p.r + "\n" + p.l] || 0) || (p.l === "rommet" && Date.now() - p.t > ROM_MAKS)) continue;
      const r = (o[p.r] = o[p.r] || {}); (r[p.l] = r[p.l] || {})[p.n] = 1;
    }
    return o;
  }
  function egneKart() { const o = {}; for (const p of Object.values(synkLes().p)) if (p.k === "l" && p.g) o[p.l] = p; return o; }
  const egneLes = () => { const o = {}, e = egneKart(); for (const l in e) o[l] = e[l].g; return o; };
  // Én gang: flytt kryss og egne lister fra v14 (vn.pakk / vn.pakkEgne) inn i synk-lageret. De gamle nøklene beholdes urørt.
  function synkMigrer() {
    if (lagre.get(LS.synkMigrert)) return;
    const s = synkLes(), na = Date.now();
    const legg = (p) => { const k = postNokkel(p); if (!s.p[k]) { p.t = na; s.p[k] = p; s.u[k] = 1; } };
    try { const o = JSON.parse(lagre.get(LS.pakk) || "{}"); for (const r in o) for (const l in o[r] || {}) for (const n in o[r][l] || {}) if (o[r][l][n]) legg({ k: "x", r, l, n, v: 1 }); } catch {}
    try { const o = JSON.parse(lagre.get(LS.pakkEgne) || "{}"); for (const l in o) if (o[l]) legg({ k: "l", l, g: o[l], b: pakkHash(pakkOriginal(l)) }); } catch {}
    synkLagre(); lagre.set(LS.synkMigrert, "1");
  }
  async function synkNokler() {
    if (S.aes) return;
    const base = await crypto.subtle.importKey("raw", fraB64(D.synk.nokkel), "HKDF", false, ["deriveKey"]);
    const inf = (t) => ({ name: "HKDF", hash: "SHA-256", salt: new Uint8Array(32), info: new TextEncoder().encode(t) });
    S.hmac = await crypto.subtle.deriveKey(inf("vn-synk-id"), base, { name: "HMAC", hash: "SHA-256", length: 256 }, false, ["sign"]);
    S.aes = await crypto.subtle.deriveKey(inf("vn-synk-aes"), base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  }
  async function synkId(k) {
    const sig = new Uint8Array(await crypto.subtle.sign("HMAC", S.hmac, new TextEncoder().encode(k)));
    return Array.from(sig.slice(0, 20), (b) => b.toString(16).padStart(2, "0")).join("");
  }
  async function synkKrypter(p) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, S.aes, new TextEncoder().encode(JSON.stringify(p))));
    const u = new Uint8Array(12 + ct.length); u.set(iv); u.set(ct, 12); return tilB64(u);
  }
  async function synkDekrypter(c) {
    const u = fraB64(c);
    return JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv: u.slice(0, 12) }, S.aes, u.slice(12))));
  }
  async function synkToken() {
    if (S.tok && Date.now() < S.tokUt) return S.tok;
    const key = D.synk.apiKey; let inn = null;
    try { inn = JSON.parse(lagre.get(LS.synkInn) || "null"); } catch {}
    if (inn && inn.rt) {
      const r = await fetch("https://securetoken.googleapis.com/v1/token?key=" + key, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: "grant_type=refresh_token&refresh_token=" + encodeURIComponent(inn.rt) });
      if (r.ok) { const j = await r.json(); S.tok = j.id_token; S.tokUt = Date.now() + (Number(j.expires_in || 3600) - 120) * 1000; lagre.set(LS.synkInn, JSON.stringify({ rt: j.refresh_token })); return S.tok; }
      if (r.status >= 500 || r.status === 429) throw new Error("token " + r.status);
    }
    const r = await fetch("https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=" + key, { method: "POST", headers: { "Content-Type": "application/json" }, body: '{"returnSecureToken":true}' });
    if (!r.ok) throw new Error("innlogging " + r.status);
    const j = await r.json(); S.tok = j.idToken; S.tokUt = Date.now() + (Number(j.expiresIn || 3600) - 120) * 1000;
    lagre.set(LS.synkInn, JSON.stringify({ rt: j.refreshToken })); return S.tok;
  }
  const fsRot = () => `projects/${D.synk.prosjekt}/databases/(default)/documents`;
  async function fsKall(sti, body) {
    const r = await fetch(`https://firestore.googleapis.com/v1/${fsRot()}${sti}`, { method: "POST", headers: { Authorization: "Bearer " + await synkToken(), "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (r.status === 401 || r.status === 403) S.tok = null;
    if (!r.ok) throw new Error("firestore " + r.status);
    return r.json();
  }
  const tsMs = (ts) => Date.parse(String(ts).replace(/\.(\d{3})\d*Z$/, ".$1Z")) || 0;
  async function synkHent() {
    const s = synkLes(), q = { from: [{ collectionId: "poster" }] };
    // Litt overlapp bakover i tid, så ingen skrivinger går tapt i grenseland. Å lese en post på nytt er ufarlig.
    if (s.s) q.where = { fieldFilter: { field: { fieldPath: "s" }, op: "GREATER_THAN", value: { timestampValue: new Date(s.s - 120000).toISOString() } } };
    const svar = await fsKall(`/reise/${D.synk.familie}:runQuery`, { structuredQuery: q });
    let endret = false, maks = s.s || 0;
    for (const x of svar) {
      const d = x.document; if (!d || !d.fields) continue;
      const ts = d.fields.s && d.fields.s.timestampValue; if (ts) maks = Math.max(maks, tsMs(ts));
      let p; try { p = await synkDekrypter(d.fields.c.stringValue); } catch { continue; }
      if (p && p.k === "t") { brukMottak(p); continue; } // bruksstatistikk ligger i eget lager (vn.bruk)
      const k = postNokkel(p), her = s.p[k];
      if (!her || p.t > her.t) { s.p[k] = p; delete s.u[k]; endret = true; }
    }
    s.s = maks; synkLagre(); return endret;
  }
  async function synkSend() {
    const s = synkLes(), alle = Object.keys(s.u).filter((k) => s.p[k]);
    for (let i = 0; i < alle.length; i += 200) {
      const del = alle.slice(i, i + 200), sendt = {}, writes = [];
      for (const k of del) {
        sendt[k] = s.p[k].t;
        writes.push({ update: { name: `${fsRot()}/reise/${D.synk.familie}/poster/${await synkId(k)}`, fields: { c: { stringValue: await synkKrypter(s.p[k]) } } },
          updateTransforms: [{ fieldPath: "s", setToServerValue: "REQUEST_TIME" }] });
      }
      await fsKall(":commit", { writes });
      for (const k of del) if (s.p[k] && s.p[k].t === sendt[k]) delete s.u[k];
      synkLagre();
    }
  }
  async function synk() {
    if (!D || !D.synk) return;
    if (S.gaar) { S.igjen = true; return; }
    S.gaar = (async () => {
      if (!navigator.onLine) { synkStatus("vent"); return; }
      synkStatus("gaar");
      try {
        await synkNokler();
        // Mens noen redigerer en liste, hentes ingenting nytt (da flytter ikke radene seg under fingeren). Egne endringer sendes likevel.
        const endret = pakkRediger ? false : await synkHent();
        await synkSend();
        await brukSend();
        synkLes().ok = Date.now(); synkLagre(); synkStatus("ok");
        if (endret) synkOppdaterVisning();
        if (B.endret) { B.endret = false; brukLagre(true); if (rute().side === "stat" && trygtAaTegne()) { const y = window.scrollY; vis(); window.scrollTo(0, y); } }
      } catch (e) { synkStatus(navigator.onLine ? "feil" : "vent"); if (navigator.onLine) synkSnart(8000); } // nytt forsøk om litt
    })();
    try { await S.gaar; } finally { S.gaar = null; if (S.igjen) { S.igjen = false; synkSnart(); } }
  }
  function synkSnart(ms = 600) { clearTimeout(S.timer); S.timer = setTimeout(synk, ms); }
  function synkOppdaterVisning() {
    tpOppdater();
    const nyOppd = oppdFornyVedEndring();
    if ((!nyOppd && !["pakk", "idag", "sted", "claude"].includes(rute().side)) || pakkRediger || pakkNy !== null || !$("#overlay").hidden) return;
    const f = document.activeElement; if (f && f.matches && f.matches("input,textarea")) return;
    const y = window.scrollY; vis(); window.scrollTo(0, y);
  }
  function synkTekst() {
    if (!D || !D.synk) return { k: "", t: "lagres på denne telefonen" };
    const s = synkLes(), usendt = Object.keys(s.u).length;
    const kl = (ms) => { const d = new Date(ms), t = d.toLocaleTimeString("nb-NO", { hour: "2-digit", minute: "2-digit" });
      return d.toDateString() === new Date().toDateString() ? "kl. " + t : d.toLocaleDateString("nb-NO", { day: "numeric", month: "numeric" }) + " kl. " + t; };
    if (S.status === "feil") return { k: "feil", t: "Lagret på telefonen · deles senere" };
    if (!navigator.onLine || S.status === "vent") return { k: "vent", t: usendt ? "Venter på nett · lagret på telefonen" : s.ok ? "Uten nett · sist synkronisert " + kl(s.ok) : "Venter på nett" };
    if (S.status === "gaar" && !s.ok) return { k: "vent", t: "Synkroniserer …" };
    return s.ok ? { k: "ok", t: "Synkronisert " + kl(s.ok) } : { k: "vent", t: "Synkroniserer …" };
  }
  const synkHtml = (id = "synkStatus") => { const x = synkTekst(); return `<span${id ? ` id="${id}"` : ""} data-synkstatus class="synk ${x.k ? "synk-" + x.k : ""}">${esc(x.t)}</span>`; };
  function synkStatus(st) { S.status = st; $$("[data-synkstatus]").forEach((el) => { el.outerHTML = synkHtml(el.id); }); }
  const pakkSkjul = () => lagre.get("vn.pakkSkjul") === "1";
  function sidePakk() {
    const a = pakkAktiv(), m = a.m, runde = a.runde;
    let h = tittel("Pakkeliste", (m ? `${esc(megNavn())} · ` : "") + synkHtml());
    if (!m) h += `<section class="kort advarsel"><h2>${ikon("info")}Hvem bruker telefonen?</h2><p>Velg deg selv for å se din egen liste.</p><div class="personer">${D.personer.map((p) => `<button data-meg="${p.id}">${esc(p.navn)}</button>`).join("")}</div></section>`;
    h += `<div class="segment segment-stor">${a.runder.map((x) => `<button data-pakkrunde="${esc(x.id)}" class="${x.id === runde.id ? "valgt" : ""}">${esc(x.navn)}</button>`).join("")}</div>`;
    if (runde.id === "vietnam" && !pakkRediger) h += `<p class="krolle" style="margin:-4px 4px 12px">Kryssene i «Rommet» forsvinner av seg selv etter et døgn – klare til neste flytting.</p>`;
    if (!a.aktiv) return h + `<p class="tom">Ingen pakkeliste lagt inn.</p>` + bunn();
    h += `<div class="segment">${a.lister.map(([k, t]) => `<button data-pakkliste="${k}" class="${k === a.aktiv[0] ? "valgt" : ""}">${esc(t)}</button>`).join("")}</div>`;
    const lagret = ((pakkLes()[runde.id] || {})[a.nokkel]) || {};
    const alle = a.grupper.flatMap((g) => g.ting.filter((t) => t.navn));
    const ferdig = alle.filter((t) => lagret[t.navn]).length;
    h += `<div class="pakkverktoy">
      <div class="fremdrift"><div class="fbar"><span style="width:${alle.length ? Math.round(100 * ferdig / alle.length) : 0}%"></span></div><span id="pakkTeller">${ferdig} av ${alle.length} pakket</span></div>
      ${pakkRediger ? "" : `<button class="pakkskjul" data-pakkskjul aria-pressed="${pakkSkjul()}">${pakkSkjul() ? "Vis alle" : "Skjul pakket"}</button>`}
      <button class="pakkrediger ${pakkRediger ? "aktiv" : ""}" data-pakkrediger>${pakkRediger ? "Ferdig" : "Rediger"}</button></div>`;
    if (!pakkRediger && pakkSkjul() && ferdig === alle.length && alle.length) h += `<p class="tom">Alt i denne lista er pakket.</p>`;
    if (pakkRediger) h += `<p class="pakkhjelp">Trykk på en tekst for å endre den. <b>−</b> fjerner, pilene flytter. ${!D.synk ? "Endringene gjelder bare denne telefonen." : a.aktiv[0] === "meg" ? "Endringene følger deg på alle telefoner der du har valgt deg selv." : "Endringene deles med hele familien."}</p>`;
    if (pakkRediger && a.utdatert) h += `<p class="pakkhjelp pakkutdatert">Originallista er oppdatert siden denne ble endret. «Tilbake til original» henter den nye – da forsvinner endringene som er gjort her.</p>`;
    h += a.grupper.map((g, gi) => {
      if (pakkRediger) {
        return `<section class="kort pakk rediger"><div class="pgruppe"><input class="pgtittel" value="${esc(g.tittel)}" data-pgtittel="${gi}" aria-label="Navn på gruppen" enterkeyhint="done">
          <button class="pikon" data-pgslett="${gi}" aria-label="Slett gruppen">${ikon("slett", "")}</button></div>
          ${g.ting.map((t, ti) => `<div class="predrad ${t.under ? "under" : ""}">
            <button class="pminus" data-pslett="${gi}:${ti}" aria-label="Fjern">−</button>
            <div class="pfelt"><input value="${esc(t.under || t.navn || "")}" data-pnavn="${gi}:${ti}" aria-label="Hva" enterkeyhint="done">
            ${t.under ? "" : `<input class="pmerkfelt" value="${esc(t.merk || "")}" placeholder="+ merknad" data-pmerk="${gi}:${ti}" aria-label="Merknad" enterkeyhint="done">`}</div>
            <div class="ppiler"><button data-pflytt="${gi}:${ti}:-1" aria-label="Flytt opp" ${ti === 0 && gi === 0 ? "disabled" : ""}>${ikon("opp", "")}</button><button data-pflytt="${gi}:${ti}:1" aria-label="Flytt ned" ${ti === g.ting.length - 1 && gi === a.grupper.length - 1 ? "disabled" : ""}>${ikon("ned", "")}</button></div>
          </div>`).join("")}
          ${nyRad(gi)}</section>`;
      }
      return `<section class="kort pakk${pakkSkjul() ? " skjul" : ""}"><h2>${esc(g.tittel)}</h2>${g.ting.map((t) => t.under ? `<div class="pakkunder">${esc(t.under)}</div>` :
        `<label class="pakkrad ${lagret[t.navn] ? "ok" : ""}"><input type="checkbox" data-pakk="${esc(t.navn)}" data-pakkrunde-id="${esc(runde.id)}" data-pakkliste-id="${esc(a.nokkel)}" ${lagret[t.navn] ? "checked" : ""}><span><span class="pnavn">${esc(t.navn)}</span>${t.merk ? `<span class="pmerk">${esc(t.merk)}</span>` : ""}</span></label>`).join("")}
        ${nyRad(gi)}</section>`;
    }).join("");
    if (pakkRediger) {
      h += pakkNy === "gruppe"
        ? `<section class="kort pakk rediger"><div class="pnyfelt"><input id="pakkNyInput" data-pnygruppe placeholder="Navn på ny gruppe, f.eks. Strand" enterkeyhint="done"><button class="knapp" data-pnyok="gruppe">Legg til</button></div></section>`
        : `<button class="pnygruppe" data-pny="gruppe">${ikon("pluss", "")}Ny gruppe</button>`;
      h += `<div class="pakkknapper"><button class="knapp knapp-sek" data-pdel>${ikon("del", "")}Del lista</button>${a.endret ? `<button class="knapp knapp-sek" data-pnullstillegne>Tilbake til original</button>` : ""}</div>`;
    } else {
      h += `<button class="knapp knapp-full knapp-sek" data-pakknull="${esc(runde.id)}">${runde.id === "vietnam" ? "Nullstill kryssene (før neste flytting)" : "Fjern alle kryss"}</button>`;
    }
    return h + bunn();
  }
  function nyRad(gi) {
    if (pakkNy === gi) return `<div class="pnyfelt"><input id="pakkNyInput" data-pnyting="${gi}" placeholder="Hva skal med?" enterkeyhint="done" autocomplete="off"><button class="knapp" data-pnyok="${gi}">Legg til</button></div>`;
    return `<button class="pny" data-pny="${gi}">${ikon("pluss", "")}Legg til</button>`;
  }
  function pakkLeggTil(gi, tekst) {
    tekst = (tekst || "").trim(); if (!tekst) return false;
    pakkEndre((g) => { g[gi].ting.push({ navn: tekst }); });
    return true;
  }
  function pakkDel() {
    const a = pakkAktiv(); if (!a.aktiv) return;
    const lagret = ((pakkLes()[a.runde.id] || {})[a.nokkel]) || {};
    const tekst = `Pakkeliste – ${a.aktiv[0] === "meg" ? megNavn() : a.aktiv[1]}\n` + a.grupper.map((g) => `\n${g.tittel}\n` + g.ting.map((t) => t.under ? `  ${t.under}` : `${lagret[t.navn] ? "[x]" : "[ ]"} ${t.navn}${t.merk ? ` (${t.merk})` : ""}`).join("\n")).join("\n");
    if (navigator.share) navigator.share({ title: "Pakkeliste", text: tekst }).catch(() => {});
    else navigator.clipboard.writeText(ui(tekst)).then(() => toast("Lista er kopiert"), () => toast("Kunne ikke kopiere", 2600, "feil"));
  }
  function fokusNy() { const el = $("#pakkNyInput"); if (el) { el.focus(); el.scrollIntoView({ block: "center" }); } }

  // ---------- bruk: enkel bruksstatistikk – tellere per telefon, bruker og dag (ingen innhold, ingen posisjon, ingen logg) ----------
  // Lokalt: vn.bruk = { p: {nøkkel: post}, u: {nøkkel: 1} (ikke sendt ennå), sendt: ms }. Holdes utenfor vn.synk, men sendes kryptert
  // i samme samling. Post {k:"t", enh, d, hvem, v, pf, sk, o:[4], sek:[4], uten, s:{skjerm:[4]}, h:{handling:[4]}, t}.
  // Tidsbolker (telefonens klokke): 0 morgen 05–11 · 1 dag 11–17 · 2 kveld 17–23 · 3 natt 23–05.
  // Sendes høyst hvert 5. min – og når appen legges bort. Vises på en skjult side (#/stat: trykk fem ganger på linja nederst).
  const BOLKER = ["Morgen", "Dag", "Kveld", "Natt"], BOLK_TID = ["05–11", "11–17", "17–23", "23–05"];
  const BRUK_SEND = 5 * 60e3, BRUK_MAKS_TID = 10 * 60e3;
  const B = { tilst: null, lagreT: null, vis: false, synlig: 0, skjult: 0, endret: false, tving: false, trykk: 0, trykkT: 0 };
  const bolk = (d = new Date()) => { const h = d.getHours(); return h >= 5 && h < 11 ? 0 : h >= 11 && h < 17 ? 1 : h >= 17 && h < 23 ? 2 : 3; };
  const sum4 = (a) => (Array.isArray(a) ? a.reduce((x, y) => x + (Number(y) || 0), 0) : 0);
  function brukLes() {
    if (B.tilst) return B.tilst;
    try { B.tilst = JSON.parse(lagre.get(LS.bruk) || "null"); } catch {}
    if (!B.tilst || !B.tilst.p) B.tilst = { p: {}, u: {}, sendt: 0 };
    return B.tilst;
  }
  function brukLagre(naa) { clearTimeout(B.lagreT); if (naa) lagre.set(LS.bruk, JSON.stringify(brukLes())); else B.lagreT = setTimeout(() => brukLagre(true), 2000); }
  const brukNokkel = (p) => JSON.stringify(["t", p.enh, p.d, p.hvem || ""]);
  function plattform() {
    const ua = navigator.userAgent || "", mt = navigator.maxTouchPoints > 1;
    const ipad = /iPad/.test(ua) || (/Macintosh/.test(ua) && mt), iphone = /iPhone|iPod/.test(ua);
    const type = ipad ? "iPad" : iphone ? "iPhone" : /Android/.test(ua) ? "Android" : /Macintosh|Mac OS X/.test(ua) ? "Mac" : /Windows/.test(ua) ? "PC" : "Annen";
    let os = "";
    const ios = ua.match(/OS (\d+)[_.](\d+)/), and = ua.match(/Android (\d+(?:\.\d+)?)/);
    if ((iphone || ipad) && ios) os = `iOS ${ios[1]}.${ios[2]}`;
    else if (and) os = "Android " + and[1];
    let hs = false; try { hs = window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true; } catch {}
    const nl = /CriOS|Chrome\//.test(ua) && !/Edg/.test(ua) ? "Chrome" : /FxiOS|Firefox/.test(ua) ? "Firefox" : /Safari/.test(ua) ? "Safari" : "nettleser";
    return { pf: [type, os, hs ? "hjemskjerm" : nl].filter(Boolean).join(" · "), sk: `${screen.width}×${screen.height}` };
  }
  function brukPost() {
    const s = brukLes(), p0 = { k: "t", enh: enhet(), d: idagISO(), hvem: meg() || "" }, k = brukNokkel(p0);
    let p = s.p[k];
    if (!p) p = s.p[k] = { ...p0, o: [0, 0, 0, 0], sek: [0, 0, 0, 0], uten: 0, s: {}, h: {}, t: 0 };
    const pf = plattform(); p.v = APP.versjon; p.pf = pf.pf; p.sk = pf.sk;
    return [k, p];
  }
  function brukTell(felt, navn, n = 1) {
    if (!D) return;
    try {
      const [k, p] = brukPost(), b = bolk();
      if (felt === "o") { p.o[b] += n; if (!navigator.onLine) p.uten = (p.uten || 0) + n; }
      else if (felt === "sek") p.sek[b] += n;
      else { const o = (p[felt] = p[felt] || {}); (o[navn] = o[navn] || [0, 0, 0, 0])[b] += n; }
      p.t = Date.now(); brukLes().u[k] = 1; brukLagre();
    } catch {}
  }
  // Tid i appen: bare mens den er synlig, maks 10 min om gangen (i tilfelle telefonen sovnet uten å si fra)
  function brukTid() {
    const naa = Date.now();
    if (B.vis && B.synlig) { const dt = Math.min(naa - B.synlig, BRUK_MAKS_TID); if (dt >= 1000) brukTell("sek", null, Math.round(dt / 1000)); }
    B.synlig = naa;
  }
  function brukSkjerm() { const { side, arg } = rute(); if (side !== "stat") brukTell("s", side === "sted" && arg ? "sted:" + arg : side); }
  function brukStart() { B.vis = document.visibilityState === "visible"; B.synlig = Date.now(); brukTell("o"); brukSkjerm(); }
  document.addEventListener("visibilitychange", () => {
    if (!D) return;
    if (document.visibilityState === "hidden") { brukTid(); B.vis = false; B.skjult = Date.now(); brukLagre(true); if (D.synk) { B.tving = true; synk(); } }
    else { B.vis = true; B.synlig = Date.now(); if (B.skjult && Date.now() - B.skjult > 60e3) { brukTell("o"); brukSkjerm(); } }
  });
  window.addEventListener("pagehide", () => { if (D) { brukTid(); brukLagre(true); } });
  setInterval(() => { if (D && B.vis) brukTid(); }, 30e3);
  window.addEventListener("hashchange", () => { if (D) brukSkjerm(); });
  // Handlinger som telles (første treff vinner)
  const BRUK_KLIKK = [["a[href^='tel:']", "ring"], ["a[href*='wa.me']", "whatsapp"], ["a[href*='google.com/maps']", "kart"], ["#sos", "sos"], ["#sokknapp", "sok"],
    ["[data-kortskjerm='nod']", "hknod"], ["[data-hk]", "hk"], ["[data-tpnaa]", "tp"], [".valuta", "valuta"], ["[data-uttale]", "uttale"], ["[data-frase]", "frase"],
    ["[data-sjofor],[data-sjoforvis]", "sjofor"], ["details.vaerfold > summary", "vaer"], ["[data-oppdater]", "hent"], ["[data-oppdlegg]", "claude"],
    ["[data-avtlagre]", "avtale"], ["[data-kopier]", "kopier"], ["[data-stort]", "bilde"], ["[data-dag]", "dag"], ["a[target='_blank']", "lenke"]];
  const HANDLINGER = { ring: "Ringte", whatsapp: "Åpnet WhatsApp", kart: "Åpnet kart", sos: "Trykket SOS", sok: "Åpnet søk", hk: "Åpnet ⟦k1⟧", hknod: "Nødskjermen på ⟦k1⟧",
    tp: "Registrerte klokkeslett", valuta: "Regnet om beløp", uttale: "Hørte uttale", frase: "Viste frase i stort", sjofor: "Viste til sjåføren", vaer: "Åpnet været",
    hent: "Hent nyeste versjon", claude: "La inn endring fra Claude", avtale: "Lagret egen avtale", kopier: "Kopierte", bilde: "Viste bilde", dag: "Byttet dag",
    lenke: "Åpnet lenke", pakk: "Krysset av i pakkelista", husk: "Krysset av oppgave" };
  document.addEventListener("click", (e) => {
    if (!D || !e.target.closest) return;
    const bn = e.target.closest(".bunn");
    if (bn && !e.target.closest("a")) { // skjult vei inn: fem raske trykk på linja nederst
      const naa = Date.now(); B.trykk = (naa - B.trykkT < 1500 ? B.trykk : 0) + 1; B.trykkT = naa;
      if (B.trykk >= 5) { B.trykk = 0; location.hash = "#/stat"; }
      return;
    }
    for (const [sel, navn] of BRUK_KLIKK) if (e.target.closest(sel)) { brukTell("h", navn); break; }
  }, true);
  document.addEventListener("change", (e) => {
    if (!D || !e.target.matches) return;
    if (e.target.matches("[data-pakk]") && e.target.checked) brukTell("h", "pakk");
    else if (e.target.matches("[data-husk]") && e.target.checked) brukTell("h", "husk");
  }, true);
  // Kalles fra synkHent for poster med k:"t"
  function brukMottak(p) {
    if (!p || !p.enh || !p.d) return;
    const s = brukLes(), k = brukNokkel(p), her = s.p[k];
    if (!her || (p.t || 0) > (her.t || 0)) { s.p[k] = p; delete s.u[k]; B.endret = true; }
  }
  async function brukSend() {
    brukTid();
    const s = brukLes(), alle = Object.keys(s.u).filter((k) => s.p[k]);
    if (!alle.length || (!B.tving && Date.now() - (s.sendt || 0) < BRUK_SEND)) return;
    B.tving = false;
    for (let i = 0; i < alle.length; i += 200) {
      const del = alle.slice(i, i + 200), sendt = {}, writes = [];
      for (const k of del) {
        sendt[k] = s.p[k].t;
        writes.push({ update: { name: `${fsRot()}/reise/${D.synk.familie}/poster/${await synkId(k)}`, fields: { c: { stringValue: await synkKrypter(s.p[k]) } } },
          updateTransforms: [{ fieldPath: "s", setToServerValue: "REQUEST_TIME" }] });
      }
      await fsKall(":commit", { writes });
      for (const k of del) if (s.p[k] && s.p[k].t === sendt[k]) delete s.u[k];
    }
    s.sendt = Date.now(); brukLagre(true);
  }

  // ---------- SIDE: Statistikk (skjult) ----------
  let statPer = "7", statHvem = "alle", statDag = null;
  const statPerioder = () => [["1", "I dag"], ["7", "7 dager"], ["30", "30 dager"], ["reise", "Reisen"], ["alt", "Alt"]];
  function statFraTil() {
    const i = idagISO();
    if (statPer === "1") return [i, i];
    if (statPer === "7") return [pluss(i, -6), i];
    if (statPer === "30") return [pluss(i, -29), i];
    if (statPer === "reise") return [start(), slutt()];
    return ["0000-00-00", "9999-99-99"];
  }
  const statAlle = () => Object.values(brukLes().p).filter((p) => p && p.k === "t" && p.enh && p.d);
  const statNavn = (id) => { if (!id) return "Ikke valgt"; const p = D.personer.find((x) => x.id === id); return p ? p.navn : id; };
  function varighet(sek) {
    const m = Math.round((sek || 0) / 60);
    if (!sek) return "0 min"; if (m < 1) return "under 1 min"; if (m < 60) return m + " min";
    return `${Math.floor(m / 60)} t${m % 60 ? " " + (m % 60) + " min" : ""}`;
  }
  function naarTekst(ms) {
    if (!ms) return "–";
    const d = new Date(ms), t = d.toLocaleTimeString("nb-NO", { hour: "2-digit", minute: "2-digit" });
    if (d.toDateString() === new Date().toDateString()) return "i dag kl. " + t;
    if (d.toDateString() === new Date(Date.now() - 864e5).toDateString()) return "i går kl. " + t;
    return d.toLocaleDateString("nb-NO", { day: "numeric", month: "numeric" }) + " kl. " + t;
  }
  function skjermNavn(k) {
    if (k.startsWith("sted:")) { const s = stedEtterId(k.slice(5)); return "Reisen · " + (s ? s.navn : k.slice(5)); }
    return TITLER[k] || k;
  }
  const flertall = (n, en, fl) => `${n.toLocaleString("nb-NO")} ${n === 1 ? en : fl}`;
  function statStolper(rader, tom) { // [[tekst, tall, undertekst]] – én farge, lengde = tall
    if (!rader.length) return `<p class="tom">${tom}</p>`;
    const maks = Math.max(1, ...rader.map((r) => r[1]));
    return `<div class="sstolper">${rader.map(([t, n, u]) => `<div class="sstolpe"><div class="sst-topp"><span>${t}</span><b>${n.toLocaleString("nb-NO")}</b></div>
      <div class="sst-spor" aria-hidden="true"><span style="width:${n ? Math.max(2, Math.round(100 * n / maks)) : 0}%"></span></div>${u ? `<small>${u}</small>` : ""}</div>`).join("")}</div>`;
  }
  function sideStat() {
    const [fra, til] = statFraTil(), alle = statAlle(), per = alle.filter((p) => p.d >= fra && p.d <= til);
    const utvalg = per.filter((p) => statHvem === "alle" || (p.hvem || "") === statHvem);
    const hvemFins = [...new Set(alle.map((p) => p.hvem || ""))];
    let h = tittel("Bruksstatistikk", synkHtml("statSynk"));
    h += `<div class="velger">${statPerioder().map(([k, t]) => `<button data-statper="${k}" class="${k === statPer ? "valgt" : ""}">${t}</button>`).join("")}</div>`;
    const folk = D.personer.map((p) => [p.id, p.navn]).concat(hvemFins.includes("") ? [["", "Ikke valgt"]] : []);
    h += `<div class="velger"><button data-stathvem="alle" class="${statHvem === "alle" ? "valgt" : ""}">Alle</button>${folk.map(([id, n]) => `<button data-stathvem="${esc(id)}" class="${statHvem === id ? "valgt" : ""}">${esc(n)}</button>`).join("")}</div>`;
    const apn = utvalg.reduce((x, p) => x + sum4(p.o), 0), sek = utvalg.reduce((x, p) => x + sum4(p.sek), 0);
    const dager = new Set(utvalg.map((p) => p.d)).size, enh = new Set(utvalg.map((p) => p.enh)).size;
    h += `<div class="sfliser">
      <div class="sflis"><small>Åpninger</small><b>${apn.toLocaleString("nb-NO")}</b></div>
      <div class="sflis"><small>Tid i appen</small><b>${varighet(sek)}</b></div>
      <div class="sflis"><small>Dager i bruk</small><b>${dager}</b></div>
      <div class="sflis"><small>Telefoner</small><b>${enh}</b></div></div>`;
    if (!utvalg.length) h += `<p class="tom" style="margin:4px 4px 0">Ingen bruk registrert i perioden.</p>`;

    // Personer og telefoner: tellere for perioden, versjon og «sist sett» fra nyeste post
    const nyesteV = Math.max(APP.versjon, ...alle.map((p) => p.v || 0));
    const perHvem = {};
    for (const p of utvalg) { const x = (perHvem[p.hvem || ""] = perHvem[p.hvem || ""] || { o: 0, sek: 0, enh: {} }); x.o += sum4(p.o); x.sek += sum4(p.sek); (x.enh[p.enh] = x.enh[p.enh] || { o: 0, sek: 0 }); x.enh[p.enh].o += sum4(p.o); x.enh[p.enh].sek += sum4(p.sek); }
    const sist = (enh, hvem) => alle.filter((p) => p.enh === enh && (hvem === undefined || (p.hvem || "") === hvem)).sort((a, b) => (b.t || 0) - (a.t || 0))[0] || {};
    const meEnh = enhet();
    const hvemListe = Object.keys(perHvem).sort((a, b) => perHvem[b].o - perHvem[a].o || perHvem[b].sek - perHvem[a].sek);
    if (hvemListe.length) {
      h += `<div class="seksjonstittel">Personer og telefoner</div><section class="kort spersoner">${hvemListe.map((hv) => {
        const x = perHvem[hv], sisteT = Math.max(...Object.keys(x.enh).map((e) => sist(e, hv).t || 0));
        return `<div class="sperson"><div class="sp-topp"><b>${esc(statNavn(hv))}</b><span>${flertall(x.o, "åpning", "åpninger")} · ${varighet(x.sek)}</span></div>
          <div class="sp-sist">Sist brukt ${naarTekst(sisteT)}</div>
          ${Object.keys(x.enh).sort((a, b) => x.enh[b].o - x.enh[a].o).map((e) => { const n = sist(e); const gml = n.v && n.v < nyesteV;
            return `<div class="senhet"><div><span class="se-navn">${esc(n.pf || "Ukjent")}${e === meEnh ? ` <i>(denne)</i>` : ""}</span>
              <small>Appversjon ${esc(n.v || "?")}${gml ? ` <span class="se-gml">eldre versjon</span>` : ""} · sist ${naarTekst(n.t)} · id ${esc(e)}</small></div>
              <span class="se-tall">${x.enh[e].o}</span></div>`; }).join("")}</div>`;
      }).join("")}</section>`;
    }

    // Skjermer og handlinger
    const samle = (felt) => { const o = {}; for (const p of utvalg) for (const [k, v] of Object.entries(p[felt] || {})) o[k] = (o[k] || 0) + sum4(v); return Object.entries(o).sort((a, b) => b[1] - a[1]); };
    const skjermer = samle("s"), handl = samle("h");
    if (utvalg.length) {
      h += `<div class="seksjonstittel">Mest brukte sider</div><section class="kort">${statStolper(skjermer.slice(0, 15).map(([k, n]) => [esc(skjermNavn(k)), n]), "Ingen sider vist.")}
        ${skjermer.length > 15 ? `<p class="krolle" style="margin-top:8px">+ ${skjermer.length - 15} andre</p>` : ""}</section>`;
      h += `<div class="seksjonstittel">Handlinger</div><section class="kort">${statStolper(handl.map(([k, n]) => [esc(HANDLINGER[k] || k), n]), "Ingen handlinger registrert.")}</section>`;
      // Når på døgnet
      const bo = [0, 1, 2, 3].map((i) => [utvalg.reduce((x, p) => x + ((p.o || [])[i] || 0), 0), utvalg.reduce((x, p) => x + ((p.sek || [])[i] || 0), 0)]);
      h += `<div class="seksjonstittel">Når på døgnet</div><section class="kort">${statStolper(bo.map(([o, s], i) => [`${BOLKER[i]} <i class="sst-kl">${BOLK_TID[i]}</i>`, o, varighet(s)]), "")}
        <p class="krolle" style="margin-top:8px">Åpninger per tidsbolk (telefonens klokke) · tid i appen under</p></section>`;
      // Per dag (maks 31 siste dager i perioden)
      const f0 = [...utvalg.map((p) => p.d)].sort()[0], sisteD = til > idagISO() ? idagISO() : til;
      let dg = []; for (let d = f0 < fra ? fra : f0; d <= sisteD && dg.length < 400; d = pluss(d, 1)) dg.push(d);
      dg = dg.slice(-31);
      if (dg.length > 1) {
        const pd = Object.fromEntries(dg.map((d) => [d, { o: 0, sek: 0 }]));
        for (const p of utvalg) if (pd[p.d]) { pd[p.d].o += sum4(p.o); pd[p.d].sek += sum4(p.sek); }
        const mx = Math.max(1, ...dg.map((d) => pd[d].o)), valgt = statDag && pd[statDag] ? statDag : dg[dg.length - 1];
        h += `<div class="seksjonstittel">Per dag</div><section class="kort"><div class="sdager" style="--n:${dg.length}">${dg.map((d) => `<button data-statdag="${d}" class="${d === valgt ? "valgt" : ""}" aria-label="${esc(kort(d))}: ${pd[d].o} åpninger"><span style="height:${pd[d].o ? Math.max(4, Math.round(100 * pd[d].o / mx)) : 0}%"></span></button>`).join("")}</div>
          <div class="sdag-akse"><span>${esc(kort(dg[0]))}</span><span>${esc(kort(dg[dg.length - 1]))}</span></div>
          <p class="sdag-info"><b>${esc(pen(valgt))}</b> · ${flertall(pd[valgt].o, "åpning", "åpninger")} · ${varighet(pd[valgt].sek)}</p></section>`;
      }
    }
    const pf = plattform();
    h += `<div class="seksjonstittel">Denne telefonen</div><section class="kort"><p>${esc(pf.pf)} · ${esc(pf.sk)}</p>
      <p class="krolle">Id ${esc(meEnh)} · bruker: ${esc(statNavn(meg()))} · ${Object.keys(brukLes().u).length ? "noe venter på å bli sendt" : "alt er sendt"}</p>
      <button class="knapp knapp-sek knapp-full" data-statkopier style="margin-top:10px">Kopier tallene (til Claude)</button></section>`;
    h += `<p class="krolle" style="margin:14px 4px 0">Bare tellere per telefon, bruker og dag – ingen tekst du skriver, ingen posisjon. Deles kryptert med familiens telefoner.</p>`;
    return h + bunn();
  }
  function statKopier() {
    const [fra, til] = statFraTil();
    const poster = statAlle().filter((p) => p.d >= fra && p.d <= til).map(({ k, ...r }) => r).sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : 0));
    const tekst = JSON.stringify({ bruksstatistikk: 1, laget: new Date().toISOString(), app: APP.versjon, periode: [fra, til], bolker: BOLKER, personer: Object.fromEntries(D.personer.map((p) => [p.id, p.navn])), poster });
    navigator.clipboard.writeText(tekst).then(() => toast("Kopiert – lim inn hos Claude"), () => toast("Kunne ikke kopiere", 2600, "feil"));
  }
  document.addEventListener("click", (e) => {
    const t = e.target.closest && e.target.closest("[data-statper],[data-stathvem],[data-statdag],[data-statkopier]");
    if (!t || !D) return;
    e.preventDefault();
    if (t.dataset.statper) { statPer = t.dataset.statper; statDag = null; }
    else if (t.dataset.stathvem !== undefined) statHvem = t.dataset.stathvem;
    else if (t.dataset.statdag) statDag = t.dataset.statdag;
    else if (t.hasAttribute("data-statkopier")) { statKopier(); return; }
    const y = window.scrollY; vis(); window.scrollTo(0, y);
  });

  // ---------- SIDE: Fraser, tips og priser ----------
  function sideParlor() {
    const P = D.parlor;
    if (!P) return tittel("Fraser") + `<p class="tom">Ikke lagt inn.</p>` + bunn();
    let h = tittel("Fraser, tips og priser", UTTALE ? "Trykk på en frase for å vise den stort – eller på høyttaleren for å høre den" : "Trykk på en frase for å vise den stort");
    h += `<section class="kort"><h2>${ikon("kontakt")}Fraser</h2><div class="fraser">${P.fraser.map((x, i) => `<div class="frase-rad"><button class="frase" data-frase="${i}"><span class="fno">${esc(x.no)}</span><span class="fvi" lang="vi">${esc(x.vi)}</span>${x.merk ? `<span class="fmerk">${esc(x.merk)}</span>` : ""}${x.fraClaude ? `<span class="fmerk fraclaude">Fra Claude – ikke kontrollert</span>` : ""}</button>${UTTALE ? `<button class="uttale" data-uttale="${i}" aria-label="Hør uttalen: ${esc(x.vi)}">${HOYTTALER}</button>` : ""}</div>`).join("")}</div>
      ${P.merk ? `<p class="krolle" style="margin-top:10px">${md(P.merk)}</p>` : ""}</section>`;
    h += seksjon({ tittel: "Drikkepenger (tips)", type: "info", rader: P.tips, tekst: ["Alltid frivillig – og aldri forventet på gatekjøkken."] });
    h += seksjon({ tittel: "Vanlige priser", type: "info", rader: P.priser, tekst: P.prisregler });
    return h + bunn();
  }
  function visFrase(i) {
    const F = D.parlor.fraser, x = F[i]; if (!x) return;
    const o = $("#overlay");
    o.className = "overlay sjofor";
    o.innerHTML = `<button class="lukk">Lukk</button><div class="sjofor-stor frase-stor">
      <div class="snavn" lang="vi">${esc(x.vi)}</div>
      <p class="fstor-no">${esc(x.no)}</p>${x.merk ? `<p class="sno">${esc(x.merk)}</p>` : ""}
      ${UTTALE ? `<div class="uttale-stor"><button class="uttale-hor" data-uttale="${i}">${HOYTTALER}<span>Hør uttalen</span></button><button class="uttale-sakte" data-uttale="${i}" data-sakte="1" aria-label="Hør uttalen sakte">Sakte</button></div>` : ""}
      <p class="sno">Snu telefonen mot den du snakker med.</p>
      <div class="knapper">${i > 0 ? `<button class="kb" data-frase="${i - 1}">‹ Forrige</button>` : ""}${i < F.length - 1 ? `<button class="kb" data-frase="${i + 1}">Neste ›</button>` : ""}</div></div>`;
    o.hidden = false; o.scrollTop = 0;
  }

  // ---------- uttale (telefonens innebygde talesyntese) ----------
  const UTTALE = "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;
  const HOYTTALER = '<svg class="hikon" viewBox="0 0 24 24" aria-hidden="true"><path class="hk" d="M3.5 9.6c0-.6.4-1 1-1h2.6l4-3.4c.6-.5 1.5-.1 1.5.7v12.2c0 .8-.9 1.2-1.5.7l-4-3.4H4.5c-.6 0-1-.4-1-1z"/><path class="hb hb1" d="M15.6 9.3a3.9 3.9 0 0 1 0 5.4"/><path class="hb hb2" d="M18.4 6.6a7.7 7.7 0 0 1 0 10.8"/></svg>';
  let uttaleStemme = null, uttaleKnapp = null, uttaleVarslet = false;
  function finnStemme() {
    const v = UTTALE ? speechSynthesis.getVoices().filter((x) => /^vi\b|^vi[-_]/i.test(x.lang)) : [];
    const poeng = (x) => (/premium|enhanced|forbedret/i.test(x.name + x.voiceURI) ? 2 : 0) + (x.localService ? 1 : 0);
    uttaleStemme = v.sort((a, b) => poeng(b) - poeng(a))[0] || null;
    return uttaleStemme;
  }
  if (UTTALE) { finnStemme(); speechSynthesis.addEventListener?.("voiceschanged", finnStemme); }
  function uttaleStopp() {
    if (!UTTALE) return;
    try { speechSynthesis.cancel(); } catch {}
    $$(".spiller").forEach((b) => b.classList.remove("spiller"));
    uttaleKnapp = null;
  }
  function uttale(b) {
    const x = D.parlor.fraser[Number(b.dataset.uttale)]; if (!x) return;
    const igjen = uttaleKnapp === b && b.classList.contains("spiller");
    uttaleStopp();
    if (igjen) return; // nytt trykk stopper
    if (!finnStemme() && speechSynthesis.getVoices().length && !uttaleVarslet) {
      uttaleVarslet = true;
      toast("Telefonen mangler vietnamesisk stemme. Last den ned: Innstillinger → Tilgjengelighet → Opplest innhold → Stemmer → Vietnamesisk.", 9000, "info");
      return;
    }
    const u = new SpeechSynthesisUtterance(x.vi.replace(/\s*\([^)]*\)/g, ""));
    u.lang = (uttaleStemme && uttaleStemme.lang) || "vi-VN";
    if (uttaleStemme) u.voice = uttaleStemme;
    u.rate = b.dataset.sakte ? 0.55 : 0.9;
    const ferdig = () => { if (uttaleKnapp === b) { b.classList.remove("spiller"); uttaleKnapp = null; } };
    u.onend = ferdig; u.onerror = ferdig;
    uttaleKnapp = b; b.classList.add("spiller");
    speechSynthesis.speak(u);
  }
  window.addEventListener("hashchange", uttaleStopp);

  // ---------- oppdateringer fra Claude: en tekstkode limes inn under Mer og deles via synk ----------
  // Post {k:"u", id, tittel, ops, linjer, hash, pa (på/av), hvem, c}. Grunnlaget D0 er reiseinfoen fra data.enc;
  // D = D0 + alle påslåtte oppdateringer i rekkefølge. Operasjonene tåler å brukes to ganger (f.eks. etter at de er bygget inn i reiseinfoen).
  let D0 = null, oppdSig = "", oppdUtkast = null;
  const oppdLes = () => Object.values(synkLes().p).filter((p) => p.k === "u" && Array.isArray(p.ops)).sort((a, b) => (a.c || 0) - (b.c || 0));
  const oppdInnbakt = (u) => ((D0 && D0.meta && D0.meta.innbakt) || []).includes(u.id);
  const oppdSignatur = () => oppdLes().map((u) => `${u.id}:${u.pa}:${u.t}`).join("|");
  const oppdKlon = (base) => ({ ...base, hendelser: kopi(base.hendelser), kontakter: kopi(base.kontakter), fly: kopi(base.fly), steder: kopi(base.steder),
    parlor: base.parlor ? kopi(base.parlor) : { fraser: [], tips: [], priser: [], prisregler: [] }, restauranter: kopi(base.restauranter || { liste: [] }) });
  function oppdBruk(base) {
    oppdSig = oppdSignatur();
    const ups = oppdLes().filter((u) => u.pa && !oppdInnbakt(u));
    if (!ups.length) return base;
    const d = oppdKlon(base);
    for (const u of ups) for (const op of u.ops) { try { oppdOp(d, op); } catch {} }
    d.oppdAntall = ups.length;
    return d;
  }
  function oppdFornyVedEndring() { if (!D0 || oppdSig === oppdSignatur()) return false; D = oppdBruk(D0); return true; }

  // --- kontroll av hvert felt (feilmeldingene vises i forhåndsvisningen og kan kopieres tilbake til Claude)
  const OPPD_STIL = ["bestilt", "info", "advarsel", "ankomst", "avreise", "reise"];
  const oFeil = (t) => { throw new Error(t); };
  const oTekst = (v, navn, maks = 600, paakrevd = false) => {
    if (v === undefined || v === null || v === "") return paakrevd ? oFeil(`mangler «${navn}»`) : undefined;
    if (typeof v !== "string") oFeil(`«${navn}» må være tekst`);
    v = v.trim(); if (!v && paakrevd) oFeil(`mangler «${navn}»`); if (v.length > maks) oFeil(`«${navn}» er for lang (maks ${maks} tegn)`);
    return v;
  };
  const oDato = (v, navn = "dato") => {
    v = oTekst(v, navn, 10, true);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || isNaN(tilDato(v)) || tilDato(v).toISOString().slice(0, 10) !== v) oFeil(`ugyldig ${navn} «${v}» (bruk ÅÅÅÅ-MM-DD)`);
    if (v < pluss(start(), -14) || v > pluss(slutt(), 3)) oFeil(`${navn} ${v} er utenfor reisen`);
    return v;
  };
  const oTid = (v, navn = "tid", tom = true) => {
    if ((v === undefined || v === null || v === "") && tom) return "";
    if (v === "kveld" && tom) return v;
    if (typeof v !== "string" || !/^\d{1,2}:\d{2}$/.test(v.trim())) oFeil(`ugyldig ${navn} «${v}» (bruk TT:MM)`);
    return v.trim().padStart(5, "0");
  };
  const oSted = (d, v, alle = false) => { v = oTekst(v, "sted", 40, true); if (alle && v === "alle") return v; if (!d.steder.some((s) => s.id === v)) oFeil(`ukjent sted «${v}»`); return v; };
  const oKontakt = (d, v) => { if (v === undefined || v === null || v === "") return null; if (!d.kontakter.some((k) => k.id === v)) oFeil(`ukjent kontakt «${v}»`); return v; };
  function oFinnH(d, dato, tittel) {
    let i = d.hendelser.findIndex((e) => e.d === dato && e.tittel === tittel);
    if (i < 0) { const t = tittel.toLowerCase(); i = d.hendelser.findIndex((e) => e.d === dato && e.tittel.toLowerCase().trim() === t); }
    if (i < 0) oFeil(`fant ingen hendelse «${tittel}» ${dato}`);
    return i;
  }
  function oKnapper(v) {
    if (!Array.isArray(v) || v.length > 6) oFeil("«knapper» må være en liste med høyst 6 knapper");
    return v.map((k) => {
      if (!Array.isArray(k) || k.length < 2) oFeil("hver knapp skrives [type, verdi, knappetekst]");
      const [t, val, e] = k.map((x) => String(x ?? "").trim());
      if (!["wa", "tel", "mail", "web"].includes(t)) oFeil(`ukjent knappetype «${t}» (wa, tel, mail eller web)`);
      if (t === "web" && !/^https:\/\/[^\s]+$/.test(val)) oFeil("lenker må starte med https://");
      if ((t === "wa" || t === "tel") && !/\d{3}/.test(val)) oFeil(`ugyldig nummer «${val}»`);
      if (t === "mail" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) oFeil(`ugyldig e-post «${val}»`);
      return [t, t === "wa" || t === "tel" ? tlfNorm(val) : val, e.slice(0, 60)];
    });
  }
  function oRader(v) {
    if (v === undefined) return undefined;
    if (!Array.isArray(v) || v.length > 20) oFeil("«rader» må være en liste med høyst 20 rader");
    return v.map((r) => { if (!Array.isArray(r) || r.length !== 2) oFeil("hver rad skrives [overskrift, tekst]"); return [oTekst(r[0], "rad", 40) || "", oTekst(r[1], "rad", 600, true)]; });
  }
  // --- selve endringene. Returnerer en norsk linje som beskriver hva som skjer.
  function oppdOp(d, op) {
    if (!op || typeof op !== "object") oFeil("ugyldig endring");
    const tidTekst = (e) => `${kort(e.d)}${e.t && e.t !== "kveld" ? " kl. " + e.t : e.t === "kveld" ? " kveld" : ""}`;
    switch (op.type) {
      case "ny_hendelse": {
        const e = { d: oDato(op.dato), t: oTid(op.tid), sted: oSted(d, op.sted), tittel: oTekst(op.tittel, "tittel", 140, true), merk: oTekst(op.merk, "merk") || "", oppgave: !!op.oppgave, kontakt: oKontakt(d, op.kontakt) };
        const i = d.hendelser.findIndex((x) => x.d === e.d && x.tittel === e.tittel);
        if (i >= 0) d.hendelser[i] = { ...d.hendelser[i], ...e }; else d.hendelser.push(e);
        return `${e.oppgave ? "Ny oppgave" : "Ny hendelse"}: ${tidTekst(e)} – ${e.tittel}`;
      }
      case "endre_hendelse": {
        const i = oFinnH(d, oDato(op.dato), oTekst(op.tittel, "tittel", 140, true)), e = { ...d.hendelser[i] }, ny = op.ny, f = [];
        if (!ny || typeof ny !== "object") oFeil("«ny» mangler");
        if ("dato" in ny) { e.d = oDato(ny.dato); f.push("ny dato"); }
        if ("tid" in ny) { e.t = oTid(ny.tid); f.push(e.t ? "ny tid" : "uten tid"); }
        if ("sted" in ny) { e.sted = oSted(d, ny.sted); f.push("nytt sted"); }
        if ("tittel" in ny) { e.tittel = oTekst(ny.tittel, "tittel", 140, true); f.push("ny tittel"); }
        if ("merk" in ny) { e.merk = oTekst(ny.merk, "merk") || ""; f.push("ny merknad"); }
        if ("oppgave" in ny) { e.oppgave = !!ny.oppgave; f.push(e.oppgave ? "gjort til oppgave" : "ikke lenger oppgave"); }
        if ("kontakt" in ny) { e.kontakt = oKontakt(d, ny.kontakt); f.push("ny kontakt"); }
        if (!f.length) oFeil("«ny» sier ikke hva som skal endres");
        d.hendelser[i] = e;
        return `Endret: ${tidTekst(e)} – ${e.tittel} (${f.join(", ")})`;
      }
      case "fjern_hendelse": {
        const i = oFinnH(d, oDato(op.dato), oTekst(op.tittel, "tittel", 140, true)), [e] = d.hendelser.splice(i, 1);
        return `Fjernet: ${tidTekst(e)} – ${e.tittel}`;
      }
      case "kontakt": {
        const id = oTekst(op.id, "id", 40, true);
        if (!/^[a-z0-9-]{2,40}$/.test(id)) oFeil(`ugyldig kontakt-id «${id}» (små bokstaver, tall og bindestrek)`);
        const i = d.kontakter.findIndex((k) => k.id === id), gammel = i >= 0 ? d.kontakter[i] : null;
        const k = gammel ? { ...gammel } : { id, rolle: "", sted: "alle", gruppe: "Annet", knapper: [], bruk: "", merk: "" };
        if (!gammel || "navn" in op) k.navn = oTekst(op.navn, "navn", 80, true);
        if ("rolle" in op) k.rolle = oTekst(op.rolle, "rolle", 160) || "";
        if ("sted" in op) k.sted = oSted(d, op.sted, true);
        if ("gruppe" in op) k.gruppe = oTekst(op.gruppe, "gruppe", 40) || "Annet";
        if ("knapper" in op) k.knapper = oKnapper(op.knapper);
        if ("bruk" in op) k.bruk = oTekst(op.bruk, "bruk") || "";
        if ("merk" in op) k.merk = oTekst(op.merk, "merk") || "";
        if (i >= 0) d.kontakter[i] = k; else d.kontakter.push(k);
        return `${gammel ? "Endret kontakt" : "Ny kontakt"}: ${k.navn}${k.rolle ? " – " + k.rolle : ""}`;
      }
      case "fly": {
        const id = oTekst(op.id, "id", 12, true), i = d.fly.findIndex((x) => x.id === id);
        if (i < 0) oFeil(`ukjent fly «${id}»`);
        const f = { ...d.fly[i] }, n = op.endre, e = [];
        if (!n || typeof n !== "object") oFeil("«endre» mangler");
        if ("nyttNr" in n) {
          const nr = oTekst(n.nyttNr, "nyttNr", 12, true).toUpperCase().replace(/\s+/g, "");
          if (!/^[A-Z0-9]{2}\d{1,5}$/.test(nr)) oFeil(`ugyldig flynummer «${nr}»`);
          for (const s of d.steder) s.seksjoner = (s.seksjoner || []).map((x) => (x.fly ? { ...x, fly: x.fly.map((y) => (y === f.id ? nr : y)) } : x));
          d.hendelser = d.hendelser.map((h) => (h.fly === f.id ? { ...h, fly: nr } : h));
          f.id = nr; e.push("nytt flynummer " + nr);
        }
        if ("dato" in n) { f.d = oDato(n.dato); e.push("dato " + kort(f.d)); }
        if ("avgang" in n) { f.dep = oTid(n.avgang, "avgang", false); e.push("avgang " + f.dep); }
        if ("ankomst" in n) { f.arr = oTid(n.ankomst, "ankomst", false); e.push("ankomst " + f.arr); }
        if ("ankomstPlussDag" in n) f.arrPluss = n.ankomstPlussDag ? 1 : 0;
        if ("fraTerminal" in n) { f.fraT = oTekst(n.fraTerminal, "fraTerminal", 20) || ""; e.push("terminal"); }
        if ("tilTerminal" in n) { f.tilT = oTekst(n.tilTerminal, "tilTerminal", 20) || ""; e.push("terminal"); }
        if ("info" in n) { f.info = oTekst(n.info, "info") || ""; e.push("info"); }
        if ("seter" in n) {
          if (!n.seter || typeof n.seter !== "object") oFeil("«seter» skrives {\"B\":\"12A\", …}");
          f.seter = { ...(f.seter || {}) };
          for (const [p, v] of Object.entries(n.seter)) { if (!d.personer.some((x) => x.id === p)) oFeil(`ukjent person «${p}» i seter`); f.seter[p] = oTekst(v, "sete", 6, true).toUpperCase(); }
          e.push("seter");
        }
        if (!e.length) oFeil("«endre» sier ikke hva som skal endres");
        d.fly[i] = f;
        return `Fly ${id}: ${[...new Set(e)].join(", ")}`;
      }
      case "hotell": {
        const sid = oSted(d, op.sted), si = d.steder.findIndex((x) => x.id === sid), n = op.endre, e = [];
        if (!d.steder[si].hotell) oFeil(`${sid} har ikke noe hotell`);
        if (!n || typeof n !== "object") oFeil("«endre» mangler");
        const h = { ...d.steder[si].hotell };
        for (const [fra, til, navn, maks] of [["navn", "navn", "navn", 100], ["adresse", "adr", "adresse", 200], ["ref", "ref", "ref", 120], ["inn", "inn", "innsjekk", 60], ["ut", "ut", "utsjekk", 60], ["rom", "rom", "rom", 600], ["betaling", "betaling", "betaling", 600]]) {
          if (fra in n) { h[til] = oTekst(n[fra], fra, maks, fra === "navn") || ""; e.push(navn); }
        }
        if ("navn" in n || "adresse" in n) h.kartq = `${h.navn} ${h.adr}`;
        if (!e.length) oFeil("«endre» sier ikke hva som skal endres");
        d.steder[si] = { ...d.steder[si], hotell: h };
        return `Hotell ${h.navn}: ${e.join(", ")}`;
      }
      case "seksjon": {
        const sid = oSted(d, op.sted), si = d.steder.findIndex((x) => x.id === sid), s = { ...d.steder[si], seksjoner: [...(d.steder[si].seksjoner || [])] };
        const x = { tittel: oTekst(op.tittel, "tittel", 100, true), type: op.stil || "info" };
        if (!OPPD_STIL.includes(x.type)) oFeil(`ukjent stil «${x.type}» (${OPPD_STIL.join(", ")})`);
        const rader = oRader(op.rader); if (rader) x.rader = rader;
        if (op.tekst !== undefined) { if (!Array.isArray(op.tekst) || op.tekst.length > 10) oFeil("«tekst» må være en liste"); x.tekst = op.tekst.map((t) => oTekst(t, "tekst", 600, true)); }
        if (op.kontakter !== undefined) { if (!Array.isArray(op.kontakter)) oFeil("«kontakter» må være en liste"); x.kontakter = op.kontakter.map((k) => oKontakt(d, k)); }
        const finnes = s.seksjoner.some((y) => y.tittel === x.tittel);
        if (!finnes && !x.rader && !x.tekst) oFeil("en ny seksjon trenger «rader» eller «tekst»");
        if (finnes && !op.stil) delete x.type;
        const i = s.seksjoner.findIndex((y) => y.tittel === x.tittel);
        if (i >= 0) s.seksjoner[i] = { ...s.seksjoner[i], ...x };
        else { const av = s.seksjoner.findIndex((y) => y.type === "avreise"); s.seksjoner.splice(av < 0 ? s.seksjoner.length : av, 0, x); }
        d.steder[si] = s;
        return `${i >= 0 ? "Endret" : "Ny"} seksjon på ${s.navn}: ${x.tittel}`;
      }
      case "fjern_seksjon": {
        const sid = oSted(d, op.sted), si = d.steder.findIndex((x) => x.id === sid), t = oTekst(op.tittel, "tittel", 100, true);
        const i = (d.steder[si].seksjoner || []).findIndex((y) => y.tittel === t);
        if (i < 0) oFeil(`fant ingen seksjon «${t}» på ${d.steder[si].navn}`);
        const s = { ...d.steder[si], seksjoner: d.steder[si].seksjoner.filter((_, j) => j !== i) }; d.steder[si] = s;
        return `Fjernet seksjon på ${s.navn}: ${t}`;
      }
      case "frase": {
        const x = { no: oTekst(op.norsk, "norsk", 120, true), vi: oTekst(op.vietnamesisk, "vietnamesisk", 200, true), fraClaude: 1 };
        const merk = oTekst(op.merk, "merk", 200); if (merk) x.merk = merk;
        const F = d.parlor.fraser, i = F.findIndex((y) => y.no.toLowerCase() === x.no.toLowerCase());
        if (i >= 0) F[i] = { ...F[i], ...x }; else F.push(x);
        return `${i >= 0 ? "Endret frase" : "Ny frase"}: ${x.no} = ${x.vi}`;
      }
      case "fjern_frase": {
        const no = oTekst(op.norsk, "norsk", 120, true), F = d.parlor.fraser, i = F.findIndex((y) => y.no.toLowerCase() === no.toLowerCase());
        if (i < 0) oFeil(`fant ingen frase «${no}»`);
        F.splice(i, 1); return `Fjernet frase: ${no}`;
      }
      case "restaurant": {
        const sted = oSted(d, op.sted), navn = oTekst(op.navn, "navn", 100, true), L = d.restauranter.liste;
        const i = L.findIndex((r) => r.sted === sted && r.navn.toLowerCase() === navn.toLowerCase()), gammel = i >= 0 ? L[i] : null;
        const tall = (v, n) => { const x = Number(v); if (!Number.isInteger(x) || x < 1 || x > 10) oFeil(`«${n}» må være et helt tall 1–10`); return x; };
        const r = gammel ? { ...gammel } : { sted, navn, omrade: ((L.find((y) => y.sted === sted) || {}).omrade) || (d.steder.find((s) => s.id === sted) || {}).navn, prio: Math.max(0, ...L.filter((y) => y.sted === sted).map((y) => Number(y.prio) || 0)) + 1, F: false, L: false, M: false, kjokken: "", begrunnelse: "", s2: "", adresse: "", avstand: "", apent: "", prisPP: "", rating: "", tips: "", web: "", tlf: "" };
        if (!gammel && !(FA() in op && "begrunnelse" in op)) oFeil("en ny restaurant trenger «⟦fa⟧» (1–10) og «begrunnelse»");
        if (FA() in op) r.s1 = tall(op[FA()], FA());
        if ("pris" in op) r.pris = tall(op.pris, "pris"); else if (!gammel) r.pris = 7;
        if ("kvalitet" in op) r.kvalitet = tall(op.kvalitet, "kvalitet"); else if (!gammel) r.kvalitet = 7;
        for (const [fra, til, maks] of [["kjokken", "kjokken", 80], ["begrunnelse", "begrunnelse", 400], [FU(), "s2", 300], ["adresse", "adresse", 200], ["avstand", "avstand", 120], ["apent", "apent", 120], ["prisPerPerson", "prisPP", 120], ["omtaler", "rating", 120], ["tips", "tips", 400], ["omrade", "omrade", 40]]) if (fra in op) r[til] = oTekst(op[fra], fra, maks) || "";
        if ("maaltider" in op) { if (!Array.isArray(op.maaltider)) oFeil("«maaltider» skrives [\"frokost\",\"lunsj\",\"middag\"]"); const m = op.maaltider.map((x) => String(x).toLowerCase()); r.F = m.includes("frokost"); r.L = m.includes("lunsj"); r.M = m.includes("middag"); }
        if ("nettside" in op) { const w = oTekst(op.nettside, "nettside", 300) || ""; if (w && !/^https:\/\/[^\s]+$/.test(w)) oFeil("nettside må starte med https://"); r.web = w; }
        if ("telefon" in op) { const t = oTekst(op.telefon, "telefon", 40) || ""; if (t && !/\d{3}/.test(t)) oFeil(`ugyldig telefon «${t}»`); r.tlf = t ? tlfNorm(t) : ""; }
        if (!r.adresse) oFeil("restauranten trenger «adresse» (brukes til kart og sjåførkort)");
        r.fraClaude = 1; delete r.sjofor;
        if (i >= 0) L[i] = r; else L.push(r);
        return `${gammel ? "Endret restaurant" : "Ny restaurant"} (${(d.steder.find((s) => s.id === sted) || {}).navn}): ${r.navn} – ⟦r2l⟧ ${risikoTekst(r.s1)}`;
      }
      case "fjern_restaurant": {
        const sted = oSted(d, op.sted), navn = oTekst(op.navn, "navn", 100, true), L = d.restauranter.liste;
        const i = L.findIndex((r) => r.sted === sted && r.navn.toLowerCase() === navn.toLowerCase());
        if (i < 0) oFeil(`fant ingen restaurant «${navn}» på ${sted}`);
        L.splice(i, 1); return `Fjernet restaurant: ${navn}`;
      }
      default: oFeil(`ukjent type «${op.type}»`);
    }
  }
  function oppdTolk(tekst) {
    const t = String(tekst || ""), a = t.indexOf("{"), b = t.lastIndexOf("}");
    if (a < 0 || b < a) oFeil("Fant ingen kode. Kopier hele kodeblokken fra Claude.");
    let o; const raa = t.slice(a, b + 1);
    try { o = JSON.parse(raa); } catch { try { o = JSON.parse(raa.replace(/[“”„]/g, '"')); } catch { oFeil("Koden er ufullstendig. Be Claude skrive den på nytt, og kopier hele kodeblokken."); } }
    if (!o || o.reiseapp !== 1 || !Array.isArray(o.endringer)) oFeil("Dette ser ikke ut som en oppdateringskode for appen.");
    if (!o.endringer.length) oFeil("Koden inneholder ingen endringer.");
    if (o.endringer.length > 40) oFeil("For mange endringer i én kode (maks 40) – del den opp.");
    return { tittel: String(o.tittel || "Oppdatering").trim().slice(0, 100) || "Oppdatering", ops: o.endringer };
  }
  // Teksten som kopieres til Claude: formatet + det appen inneholder nå (ID-ene Claude må bruke)
  function oppdBeskrivelse() {
    const L = [];
    L.push("Jeg bruker en reiseapp for familieferien. Hjelp meg å lage en OPPDATERINGSKODE som jeg limer inn i appen.",
      "Svar med ÉN kodeblokk som bare inneholder JSON i formatet under. Skriv etter kodeblokken en kort liste på norsk over hva koden endrer.",
      "Bruk bare ID-er, datoer og titler som står under «Slik er det nå». Er noe uklart: spør meg i stedet for å gjette.", "",
      "FORMAT", '{"reiseapp":1,"tittel":"<kort beskrivelse>","endringer":[ … ]}', "",
      "ENDRINGSTYPER",
      '1. {"type":"ny_hendelse","dato":"ÅÅÅÅ-MM-DD","tid":"TT:MM" eller "","sted":"<sted-id>","tittel":"…","merk":"…","oppgave":false,"kontakt":"<kontakt-id>"}  (oppgave:true = noe vi må huske å gjøre; kontakt er valgfri)',
      '2. {"type":"endre_hendelse","dato":"<dato>","tittel":"<nøyaktig eksisterende tittel>","ny":{bare feltene som endres: dato, tid, sted, tittel, merk, oppgave, kontakt}}',
      '3. {"type":"fjern_hendelse","dato":"<dato>","tittel":"<nøyaktig eksisterende tittel>"}',
      '4. {"type":"kontakt","id":"<ny eller eksisterende id: små bokstaver, tall og bindestrek>","navn":"…","rolle":"hvem de er for oss","sted":"<sted-id> eller alle","gruppe":"Transport|Overnatting|Aktiviteter|Mat|Annet","knapper":[["wa|tel|mail|web","<nummer med landskode, e-post eller https-lenke>","<knappetekst, f.eks. WhatsApp guiden>"]],"bruk":"når vi skal kontakte dem","merk":"annet, f.eks. bookingref"}  (eksisterende id = bare feltene som står, endres)',
      '5. {"type":"fly","id":"<eksisterende flynummer>","endre":{bare det som endres: nyttNr, dato, avgang, ankomst, ankomstPlussDag (true/false), fraTerminal, tilTerminal, info, seter:{"<person>":"12A"}}}',
      '6. {"type":"hotell","sted":"<sted-id>","endre":{bare det som endres: navn, adresse, ref, inn, ut, rom, betaling}}',
      '7. {"type":"seksjon","sted":"<sted-id>","tittel":"f.eks. Bestilt: Båttur","stil":"bestilt|info|advarsel|ankomst|avreise","rader":[["Hva","…"],["Henting","…"],["Betaling","…"]],"tekst":["…"],"kontakter":["<kontakt-id>"]}  (samme tittel på samme sted = endrer den: bare «stil», «rader», «tekst» og «kontakter» som står, byttes ut – skriv da alle radene)',
      '8. {"type":"fjern_seksjon","sted":"<sted-id>","tittel":"<nøyaktig tittel>"}',
      '9. {"type":"frase","norsk":"…","vietnamesisk":"…","merk":"kort forklaring (valgfri)"}  (samme norske tekst = endrer frasen)',
      '10. {"type":"fjern_frase","norsk":"<nøyaktig norsk tekst>"}',
      '11. {"type":"restaurant","sted":"<sted-id>","navn":"…","kjokken":"…","maaltider":["frokost","lunsj","middag"],"⟦fa⟧":1-10,"begrunnelse":"hvorfor – hva på menyen, i sausene og i oljen som gir risiko","⟦fu⟧":"⟦fuT⟧","pris":1-10,"kvalitet":1-10,"adresse":"…","avstand":"fra hotellet","apent":"…","prisPerPerson":"…","omtaler":"…","tips":"…","nettside":"https://…","telefon":"+84 …"}  (samme navn på samme sted = bare feltene som står, endres)',
      '12. {"type":"fjern_restaurant","sted":"<sted-id>","navn":"<nøyaktig navn>"}', "",
      "REGLER",
      "- En ny booking = gjerne flere endringer: en kontakt, en seksjon «Bestilt: …» med detaljene og en hendelse i programmet (og oppgaver som «Betal …» eller «Rebekreft …»). Kontakten må stå før endringer som bruker den.",
      "- Nytt flynummer (nyttNr) oppdaterer flykortene automatisk. Titler, merknader og seksjonstekster som nevner det gamle nummeret eller tidene, må endres for seg.",
      "- Tider er lokal tid der vi er. Beløp skrives som «490 000 ₫», «USD 25» eller «935 kr». **fet** er lov i tekst.",
      "- Bare det som faktisk er bestilt eller bestemt. Ikke ta med forslag.",
      "- Restauranter: ⟦fa⟧ 1–10 der 10 = ⟦r3⟧ (lista vår har høyst 8). Gi aldri over 8 uten at kjøkkenet har bekreftet det. pris 10 = billigst, kvalitet 10 = best. Adresse er påkrevd.",
      "- Fraser: kort og høflig, forstått i hele Vietnam. Er du usikker på vietnamesisken, si det.",
      "- Ikke skriv noe annet enn JSON i kodeblokken.", "",
      `SLIK ER DET NÅ (fra appen ${idagISO()})`,
      "Personer (seter): " + D.personer.map((p) => `${p.id} = ${p.navn}`).join(", "));
    L.push("", "Steder:"); D.steder.forEach((s) => L.push(`- ${s.id} = ${s.navn} ${s.fra} – ${s.til}${s.hotell ? ` · hotell: ${s.hotell.navn} (inn ${s.hotell.inn}, ut ${s.hotell.ut})` : ""}`));
    L.push("", "Fly:"); D.fly.forEach((f) => L.push(`- ${f.id} ${f.d} ${f.dep}–${f.arr}${f.arrPluss ? " (+1 dag)" : ""} ${f.fra} → ${f.til}`));
    L.push("", "Kontakter:"); D.kontakter.forEach((k) => L.push(`- ${k.id}: ${k.navn}${k.rolle ? " – " + k.rolle : ""} [${k.sted}]`));
    L.push("", "Hendelser (dato tid | tittel):");
    const kutt = (t, n = 160) => { t = rensMd(t).replace(/\s+/g, " ").trim(); return t.length > n ? t.slice(0, n - 1) + "…" : t; };
    [...D.hendelser].sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : minutter(a.t) - minutter(b.t))).forEach((e) => L.push(`- ${e.d} ${e.t || "–"} | ${e.tittel}${e.oppgave ? " (oppgave)" : ""} [${e.sted}${e.kontakt ? ", kontakt " + e.kontakt : ""}]${e.merk ? " – " + kutt(e.merk, 120) : ""}`));
    L.push("", "Seksjoner på stedssidene (tittel · stil · innhold):");
    D.steder.forEach((s) => (s.seksjoner || []).forEach((x) => {
      const del = [...(x.rader || []).map(([k, v]) => `${k}: ${kutt(v)}`), ...(x.tekst || []).map((t) => kutt(t)), ...(x.steg ? [`(${x.steg.length} steg – kan ikke endres herfra)`] : []), ...(x.fly ? ["fly: " + x.fly.join(", ")] : []), ...(x.kontakter ? ["kontakter: " + x.kontakter.join(", ")] : [])];
      L.push(`- ${s.id} «${x.tittel}» · ${x.type || "info"}${del.length ? "\n    " + del.join("\n    ") : ""}`);
    }));
    if (D.parlor) { L.push("", "Fraser (norsk = vietnamesisk):"); D.parlor.fraser.forEach((x) => L.push(`- ${x.no} = ${x.vi}`)); }
    L.push("", "Restauranter (sted: navn · ⟦fa⟧/pris/kvalitet):");
    D.steder.forEach((s) => { const r = D.restauranter.liste.filter((x) => x.sted === s.id); if (r.length) L.push(`- ${s.id}: ` + r.map((x) => `${x.navn} · ${x.s1}/${x.pris}/${x.kvalitet}`).join("; ")); });
    L.push("", "ENDRINGEN JEG VIL GJØRE:", "");
    return L.join("\n");
  }
  function oppdVisTekst(tekst, tittelTekst = "Kopier teksten") {
    const o = $("#overlay");
    o.className = "overlay sjofor";
    o.innerHTML = `<button class="lukk">Lukk</button><div class="sjofor-stor sfri"><h2>${esc(tittelTekst)}</h2><p class="sno">Hold fingeren i teksten → «Marker alt» → «Kopier».</p><textarea rows="14" readonly>${esc(tekst)}</textarea></div>`;
    o.hidden = false; o.scrollTop = 0;
  }
  const oppdHvemNaar = (u) => `${personNavn(u.hvem) || "Ukjent"} · ${new Date(u.c || u.t).toLocaleString("nb-NO", { day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" })}`;
  function oppdForhandHtml() {
    const u = oppdUtkast; if (!u) return "";
    if (u.feilTekst) return `<p class="oppdfeil">${esc(u.feilTekst)}</p>`;
    const feil = u.linjer.filter((l) => !l.ok).length, n = u.linjer.length;
    return `<div class="oppdforh"><h3>${esc(u.tittel)}</h3><ul class="oppdlinjer">${u.linjer.map((l) => `<li class="${l.ok ? "ok" : "ikkeok"}">${esc(l.t)}</li>`).join("")}</ul>
      ${u.dobbel ? `<p class="oppdfeil">Denne koden er allerede lagt inn.</p>` : ""}
      ${feil ? `<p class="oppdfeil">${feil === 1 ? "Én endring" : feil + " endringer"} kan ikke legges inn. Be Claude rette koden:</p><button class="kb" data-oppdfeilkopier>Kopier feilene til Claude</button>` : ""}
      <div class="knapper oppdvalg"><button class="knapp" data-oppdlegg ${feil || u.dobbel ? "disabled" : ""}>Legg inn ${n === 1 ? "endringen" : n + " endringer"}</button><button class="kb" data-oppdavbryt>Avbryt</button></div></div>`;
  }
  function oppdTegnForh() { const el = $("#oppdForhand"); if (el) { el.innerHTML = oppdForhandHtml(); if (oppdUtkast) el.scrollIntoView({ block: "nearest", behavior: "smooth" }); } }
  function oppdLesKode() {
    const f = $("#oppdKode");
    try {
      const u = oppdTolk(f ? f.value : ""), d = oppdKlon(D);
      u.linjer = u.ops.map((op) => { try { return { ok: 1, t: oppdOp(d, op) }; } catch (e) { return { ok: 0, t: `${op && op.type ? op.type + ": " : ""}${e.message}` }; } });
      u.hash = pakkHash(u.ops); u.dobbel = oppdLes().some((x) => x.hash === u.hash && x.pa);
      oppdUtkast = u;
    } catch (e) { oppdUtkast = { feilTekst: e.message }; }
    oppdTegnForh();
  }
  function oppdLeggInn() {
    const u = oppdUtkast; if (!u || !u.linjer || u.dobbel || u.linjer.some((l) => !l.ok)) return;
    synkSett({ k: "u", id: tilfeldigHex(6), tittel: u.tittel, ops: u.ops, linjer: u.linjer.map((l) => l.t), hash: u.hash, pa: 1, hvem: meg() || "", c: Date.now() });
    D = oppdBruk(D0); oppdUtkast = null;
    vis(); window.scrollTo(0, 0);
    toast("Lagt inn – vises på alle telefonene", 3200);
  }
  async function oppdKlikk(t) {
    const kopier = async (tekst, ok, tittelTekst) => { try { await navigator.clipboard.writeText(ui(tekst)); toast(ok, 3200); } catch { oppdVisTekst(tekst, tittelTekst); } };
    if (t.hasAttribute("data-oppdkopier")) return kopier(oppdBeskrivelse(), "Kopiert – lim inn i en ny samtale med Claude", "Kopier beskrivelsen til Claude");
    if (t.hasAttribute("data-oppdfeilkopier") && oppdUtkast) return kopier("Appen godtok ikke hele koden. Rett dette og skriv hele koden på nytt:\n" + oppdUtkast.linjer.filter((l) => !l.ok).map((l) => "- " + l.t).join("\n"), "Feilene er kopiert – lim dem inn hos Claude", "Kopier feilene til Claude");
    if (t.hasAttribute("data-oppdlim")) {
      const f = $("#oppdKode");
      try { const x = await navigator.clipboard.readText(); if (x && f) { f.value = x; oppdLesKode(); } else toast("Utklippstavlen er tom", 2200, "info"); }
      catch { if (f) f.focus(); toast("Hold fingeren i feltet og velg «Lim inn»", 2600, "info"); }
      return;
    }
    if (t.hasAttribute("data-oppdles")) return oppdLesKode();
    if (t.hasAttribute("data-oppdavbryt")) { oppdUtkast = null; const f = $("#oppdKode"); if (f) f.value = ""; return oppdTegnForh(); }
    if (t.hasAttribute("data-oppdlegg")) return oppdLeggInn();
    if (t.dataset.oppdav) {
      const u = oppdLes().find((x) => x.id === t.dataset.oppdav); if (!u) return;
      synkSett({ ...u, pa: u.pa ? 0 : 1 }); D = oppdBruk(D0);
      const y = window.scrollY; vis(); window.scrollTo(0, y);
      toast(u.pa ? "Slått av på alle telefonene" : "Slått på igjen", 2600);
    }
  }
  function sideClaude() {
    let h = tittel("Oppdater fra Claude", "Endringer uten Mac – deles med alle telefonene");
    h += `<section class="kort"><h2>${ikon("info")}Slik gjør du</h2><ol class="steg">
      <li>Trykk <b>Kopier beskrivelse</b> og lim den inn i en ny samtale med Claude.</li>
      <li>Skriv nederst hva som er endret – f.eks. «innenriksflyet er flyttet en time senere» eller «vi har booket en båttur med henting kl. 08:00».</li>
      <li>Kopier kodeblokken Claude svarer med, og lim den inn under. Du ser alt som endres før det legges inn.</li></ol>
      <button class="knapp knapp-full" data-oppdkopier>Kopier beskrivelse til Claude</button></section>`;
    h += `<section class="kort"><h2>${ikon("stjerne")}Lim inn koden</h2>
      <textarea id="oppdKode" class="oppdkode" rows="5" placeholder="Lim inn koden fra Claude her" autocomplete="off" autocapitalize="off" spellcheck="false"></textarea>
      <div class="knapper"><button class="kb" data-oppdlim>Lim inn</button><button class="kb kb-hoved" data-oppdles>Se hva som endres</button></div>
      <div id="oppdForhand">${oppdForhandHtml()}</div></section>`;
    const alle = oppdLes().slice().reverse();
    if (alle.length) {
      h += `<div class="seksjonstittel">Lagt inn (${alle.length})</div>`;
      h += alle.map((u) => {
        const innb = oppdInnbakt(u), status = innb ? "nå med i reiseinfoen" : u.pa ? "på" : "slått av";
        return `<details class="fold oppdpost${u.pa && !innb ? "" : " av"}"><summary>${ikon(u.pa && !innb ? "bestilt" : "info")}<span class="oppdtit">${esc(u.tittel)}<small>${esc(oppdHvemNaar(u))} · ${status}</small></span></summary>
          <div class="innhold"><ul class="oppdlinjer">${(u.linjer || []).map((t) => `<li class="ok">${esc(t)}</li>`).join("")}</ul>
          ${innb ? "" : `<button class="kb" data-oppdav="${esc(u.id)}">${u.pa ? "Slå av" : "Slå på igjen"}</button>`}</div></details>`;
      }).join("");
    }
    return h + bunn();
  }

  // ---------- SIDE: Mer ----------
  function sideMer() {
    const m = meg();
    let h = tittel("Mer");
    h += `<div class="liste">
      <a href="#/fly"><span class="lik">${ikon("reise", "")}</span><span class="ltekst">Fly<small>Tider, seter og referanser</small></span><span class="pil"></span></a>
      <a href="#/hotell"><span class="lik">${ikon("hotell", "")}</span><span class="ltekst">Hotell<small>Referanser, innsjekk og adresse til sjåføren</small></span><span class="pil"></span></a>
      <a href="#/pakk"><span class="lik">${ikon("bestilt", "")}</span><span class="ltekst">Pakkeliste<small>Kryss av før avreise og mellom stedene</small></span><span class="pil"></span></a>
      <a href="#/kontakter"><span class="lik">${ikon("kontakt", "")}</span><span class="ltekst">Kontakter<small>Alle hoteller, sjåfører og guider – søkbar</small></span><span class="pil"></span></a>
      <a href="#/parlor"><span class="lik">${ikon("mat", "")}</span><span class="ltekst">Fraser, tips og priser<small>Si det på vietnamesisk · drikkepenger · vanlige priser</small></span><span class="pil"></span></a>
      <a href="#/nod"><span class="lik rod">${ikon("sykehus", "")}</span><span class="ltekst">Nød og helse<small>Nødnumre, sykehus, forsikring</small></span><span class="pil"></span></a>
      <button class="rad" data-hk><span class="lik rod">${ikon("advarsel", "")}</span><span class="ltekst">⟦k3⟧<small>Vis på vietnamesisk i stor skrift</small></span><span class="pil"></span></button>
    </div>`;
    h += `<div class="seksjonstittel">Hvem bruker denne telefonen?</div><section class="kort"><div class="personer">${D.personer.map((p) => `<button data-meg="${p.id}" class="${p.id === m ? "valgt" : ""}" aria-pressed="${p.id === m}">${esc(p.navn)}</button>`).join("")}</div><p class="krolle" style="margin-top:10px">Da ser du ditt eget sete på flyene og din egen pakkeliste.</p></section>`;
    h += `<div class="seksjonstittel">Appen</div><div class="liste">
      <a href="#/claude"><span class="lik">${ikon("stjerne", "")}</span><span class="ltekst">Oppdater fra Claude<small>Lim inn endringer Claude har skrevet – uten Mac${D.oppdAntall ? ` · ${D.oppdAntall} lagt inn` : ""}</small></span><span class="pil"></span></a>
      <button class="rad" data-oppdater><span class="lik">${ikon("oppdater", "")}</span><span class="ltekst">Hent nyeste versjon<small>Krever nett · reiseinfo oppdatert ${esc(oppdatertTekst())} · appversjon ${APP.versjon} (${esc(APP.tid)})</small></span></button>
      <button class="rad" data-laas><span class="lik gul">${ikon("last", "")}</span><span class="ltekst">Lås appen på denne telefonen<small>Passordet må skrives inn på nytt</small></span></button>
    </div>
    <p class="krolle" style="margin:0 4px">Legg appen på hjemskjermen: Del-knappen i Safari → «Legg til på Hjem-skjerm». Da åpnes den i fullskjerm og virker uten nett.</p>
    <p class="pl-lenke"><a href="#/tlogg">Logg for ⟦t1⟧</a></p>`;
    return h + bunn();
  }

  // ---------- ruting ----------
  const TITLER = { pakk: "Pakkeliste", idag: "I dag", reisen: "Reisen", mat: "Mat", kontakter: "Kontakter", mer: "Mer", fly: "Fly", hotell: "Hotell", penger: "Penger", nod: "Nød og helse", sok: "Søk", tlogg: "Logg", parlor: "Fraser", claude: "Fra Claude", stat: "Statistikk" };
  const rute = () => { const [, side = "idag", arg, del] = (location.hash.startsWith("#/") ? location.hash : "#/idag").split("/"); return { side: side || "idag", arg, del }; };
  function vis() {
    if (!D) return;
    const { side, arg, del } = rute();
    const html = side === "reisen" ? sideReisen() : side === "sted" ? sideSted(arg) : side === "mat" ? sideMat(arg) : side === "kontakter" ? sideKontakter()
      : side === "pakk" ? sidePakk() : side === "fly" ? sideFly() : side === "hotell" ? sideHotell() : side === "penger" ? sidePenger() : side === "nod" ? sideNod() : side === "mer" ? sideMer() : side === "sok" ? sideSok() : side === "tlogg" ? sideTlogg() : side === "parlor" ? sideParlor() : side === "claude" ? sideClaude() : side === "stat" ? sideStat() : sideIdag();
    $("#innhold").innerHTML = html;
    sistVistDato = idagISO();
    const fane = side === "sted" ? "reisen" : ["fly", "hotell", "kontakter", "nod", "pakk", "tlogg", "parlor", "claude", "stat"].includes(side) ? "mer" : TITLER[side] ? side : "idag";
    $$(".faner a").forEach((a) => { const on = a.dataset.fane === fane; a.classList.toggle("aktiv", on); if (on) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current"); });
    $("#toppTittel").textContent = side === "sted" ? (stedEtterId(arg) || {}).navn || "" : TITLER[side] || "";
    const tb = $("#tilbake");
    if (side === "sted") { tb.hidden = false; tb.href = "#/reisen"; tb.querySelector("span").textContent = "Reisen"; }
    else if (["fly", "hotell", "kontakter", "nod", "pakk", "tlogg", "parlor", "claude", "stat"].includes(side)) { tb.hidden = false; tb.href = "#/mer"; tb.querySelector("span").textContent = "Mer"; }
    else if (side === "sok") { tb.hidden = false; tb.href = sokFra; tb.querySelector("span").textContent = "Tilbake"; }
    else tb.hidden = true;
    $("#sos").hidden = side === "nod";
    const skk = $("#sokknapp"); if (skk) skk.hidden = side === "sok";
    $$(".velger button.valgt").forEach((b) => { const v = b.parentElement; v.scrollLeft = b.offsetLeft - v.offsetLeft - 16; });
    if (side === "penger") koblOmregner();
    if (side === "kontakter") koblSok();
    if (side === "sok") koblSokAlt();
    if (side === "sted" && del) setTimeout(() => { const el = document.getElementById(del); if (el) { el.open = true; el.scrollIntoView({ block: "start" }); } }, 60);
    skyggeTopp();
  }
  window.addEventListener("hashchange", () => { vis(); window.scrollTo(0, 0); });
  // Appen kan ligge åpen i bakgrunnen over natta: ved ny dag, hopp til dagens dato igjen.
  let sistVistDato = null;
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible" || !D) return;
    if (sistVistDato && sistVistDato !== idagISO()) { valgtDag = null; vis(); }
    else if (rute().side === "idag") vis();
  });
  const skyggeTopp = () => $("#topp").classList.toggle("skygge", window.scrollY > 24);
  window.addEventListener("scroll", skyggeTopp, { passive: true });

  function koblOmregner() {
    const vnd = $("#vnd"), nok = $("#nok"), kurs = $("#kurs");
    const k = () => Number(String(kurs.value).replace(/\D/g, "")) || kursInfo().kurs;
    const tall = (s) => Number(String(s).replace(/[\s .]/g, "").replace(",", ".")) || 0;
    const fraVnd = () => { const v = tall(vnd.value); nok.value = v ? (v / k()).toLocaleString("nb-NO", { maximumFractionDigits: v / k() < 100 ? 1 : 0 }) : ""; };
    const fraNok = () => { const n = Number(String(nok.value).replace(/[\s ]/g, "").replace(",", ".")) || 0; vnd.value = n ? Math.round(n * k()).toLocaleString("nb-NO") : ""; };
    vnd.addEventListener("input", fraVnd); nok.addEventListener("input", fraNok);
    kurs.addEventListener("input", () => {
      const v = Number(String(kurs.value).replace(/\D/g, ""));
      if (v) lagre.set(LS.kurs, JSON.stringify({ kurs: v, dato: idagISO() })); else lagre.del(LS.kurs);
      $("#kursinfo").textContent = kursInfo().tekst; fraVnd();
    });
    $$("[data-vnd]").forEach((b) => b.addEventListener("click", () => { vnd.value = Number(b.dataset.vnd).toLocaleString("nb-NO"); fraVnd(); }));
  }
  function koblSok() {
    const inp = $("#sok");
    inp.addEventListener("input", () => { sokTekst = inp.value; $("#kliste").innerHTML = kontaktListe(); });
  }

  // ---------- SIDE: Søk (i reiseinfoen som allerede er dekryptert på telefonen – virker uten nett; pakkelistene er ikke med) ----------
  let sokQ = "", sokFra = "#/idag", sokAlle = {}, sokVist = [], sokIdx = null, sokIdxD = null;
  const SOK_GRUPPER = [["hotell", "Hotell"], ["kontakt", "Kontakter"], ["fly", "Fly"], ["program", "Program"], ["reise", "Reiseinfo"], ["mat", "Mat"], ["nod", "Nød og helse"], ["ide", "Ideer – ikke bestilt"], ["penger", "Penger"], ["parlor", "Fraser, tips og priser"]];
  const SOK_MAKS = 6;
  const SOK_FORSLAG = ["sjåfør", "innsjekk", "WhatsApp", "kontant", "sykehus", "phở"];
  // Små bokstaver og uten vietnamesiske tonemerker (đ → d), så «pho» finner «phở». Norsk å beholdes.
  const sokNorm1 = (c) => (c === "å" || c === "Å" ? "å" : c.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d"));
  function sokKart(s) { // normalisert tekst + posisjonen i originalen for hvert normaliserte tegn
    let n = ""; const pos = [];
    for (let i = 0; i < s.length;) { const c = String.fromCodePoint(s.codePointAt(i)); for (const x of sokNorm1(c)) { n += x; pos.push(i); } i += c.length; }
    return { n, pos };
  }
  const sokNorm = (s) => sokKart(String(s ?? "")).n;
  const rensMd = (s) => String(s ?? "").replace(/\[([^\]]+)\]\([^)\s]+\)/g, "$1").replace(/\*\*|`/g, "").replace(/\s+/g, " ").trim();
  const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  function sokBygg() {
    if (sokIdx && sokIdxD === D) return sokIdx;
    const L = [], stedNavn = (id) => (stedEtterId(id) || {}).navn || "";
    const legg = (g, tittel, under, felt, maal, knapper = null, merke = "") => { tittel = ui(tittel); under = ui(under); felt = Array.isArray(felt) ? felt.map(ui) : ui(felt);
      const f = [rensMd(tittel), rensMd(under), ...(felt || []).map(rensMd).filter(Boolean)];
      L.push({ g, tittel: f[0], under: f[1], felt: f, n: f.map(sokNorm), maal, knapper, merke });
    };
    const seksjonTekst = (x) => [...(x.steg || []), ...(x.rader || []).map((r) => r.join(": ")), ...(x.tekst || []), ...(x.bildetekst || [])];

    [...D.hendelser].sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : minutter(a.t) - minutter(b.t))).forEach((e) => {
      const k = e.kontakt ? kontaktEtterId(e.kontakt) : null;
      const naar = `${pen(e.d)}${e.t ? (e.t === "kveld" ? " · kveld" : " kl. " + e.t) : ""}`;
      legg("program", e.tittel, [naar, stedNavn(e.sted), e.oppgave ? "Husk" : ""].filter(Boolean).join(" · "), [e.merk, k && k.navn, k && k.rolle],
        { hash: "#/idag", sel: ".tidslinje li", tekst: rensMd(e.tittel), for: () => { valgtDag = e.d; } }, k ? () => ringeKnapper(k) : null);
    });
    D.kontakter.forEach((k) => legg("kontakt", k.navn, [k.rolle, k.sted === "alle" ? k.gruppe : stedNavn(k.sted)].filter(Boolean).join(" · "),
      [k.bruk, k.merk, k.gruppe, ...k.knapper.map(([, v]) => v)], { hash: "#/kontakter", sel: ".kontakt .knavn", tekst: k.navn, for: () => { sokTekst = ""; } }, () => ringeKnapper(k)));
    D.steder.filter((s) => s.hotell).forEach((s) => {
      const h = s.hotell;
      legg("hotell", h.navn, `Hotell · ${s.navn} · ${s.dato}`, [h.adr, h.ref, "Inn " + h.inn, "Ut " + h.ut, h.rom, h.betaling],
        { hash: "#/hotell", sel: ".hliste .hnavn", tekst: h.navn, apne: ".hdet" },
        h.sjofor !== false ? () => `<button class="kb" data-sjofor="${esc(s.id)}">${ikon("kart", "")}Vis til sjåføren</button>` : null);
    });
    D.fly.forEach((f) => legg("fly", `${f.id} ${f.fra} → ${f.til}`, `${pen(f.d)} kl. ${f.dep} · ${f.sel}`,
      [f.ref, f.info, f.gruppe, f.fraT, f.tilT, f.seterTekst, ...Object.values(f.seter || {})], { hash: "#/fly", sel: ".fly .fnr", tekst: f.id }));
    (D.meta.bonus || []).forEach(([k, v]) => legg("fly", k, "Bonusprogram", [v], { hash: "#/fly", sel: ".rader dt", tekst: k }));
    D.steder.forEach((s) => {
      legg("reise", s.navn, `${s.dato}${s.netter ? " · " + s.netter + (s.netter === 1 ? " natt" : " netter") : ""}`, [s.ingress], { hash: "#/sted/" + s.id });
      (s.seksjoner || []).forEach((x) => legg("reise", x.tittel, s.navn, seksjonTekst(x), { hash: "#/sted/" + s.id, sel: "section.kort > h2", tekst: x.tittel }));
    });
    const R = D.restauranter;
    R.liste.forEach((r) => legg("mat", r.navn, `${stedNavn(r.sted)} · ${r.kjokken}`, [r.omrade, r.adresse, r.s2, r.tips, r.apent],
      { hash: "#/mat/" + r.sted, sel: ".rest .rnavn", tekst: r.navn, for: () => { matMaal = "alle"; } }));
    for (const [id, l] of Object.entries(R.fraraad || {})) legg("mat", `Frarådes – ${stedNavn(id)}`, "Mat", l, { hash: "#/mat/" + id, sel: "section.kort > h2", tekst: "Frarådes", for: () => { matMaal = "alle"; } });
    for (const [id, l] of Object.entries(R.vite || {})) legg("mat", `Verdt å vite – ${stedNavn(id)}`, "Mat", l, { hash: "#/mat/" + id, sel: "section.kort > h2", tekst: "Verdt å vite", for: () => { matMaal = "alle"; } });
    if ((R.generelt || []).length) legg("mat", R.generelltTittel || "Generelle råd", "Mat", R.generelt, { hash: "#/mat", sel: "details.fold > summary", tekst: R.generelltTittel || "Generelle råd" });
    const fam = D.nod.hk && D.nod.hk.familie;
    if (fam) {
      fam.grupper.forEach((g) => g.retter.forEach((x) => {
        const i = x.indexOf(" – "), navn = i > 0 ? x.slice(0, i) : x;
        legg("mat", navn, g.tittel, [i > 0 ? x.slice(i + 3) : ""], { hash: "#/mat", sel: ".rettgruppe li", tekst: navn }, null, g.type || "");
      }));
      legg("mat", fam.tittel, "Regler", fam.regler, { hash: "#/mat", sel: "details.fold > summary", tekst: fam.tittel });
    }
    legg("nod", "⟦k2⟧", "Vis på vietnamesisk i stor skrift", [], { fn: () => visHk({ aapne: true, skjerm: "restaurant" }) });
    D.nod.nodnumre.forEach(([n, t]) => legg("nod", `${n} ${t}`, "Nødnummer", [D.nod.nodmerk], { hash: "#/nod", sel: ".nodgrid a", tekst: t }, () => knapp("tel", t, "Ring " + t)));
    D.steder.forEach((s) => (D.sykehus[s.id] || []).forEach((x) => legg("nod", x.navn, `Sykehus · ${s.navn}`, [x.adr, x.avst, x.merk, ...x.tel.map(([n, e]) => `${e}: ${n}`)],
      { hash: "#/nod", sel: ".sykehus .snavn", tekst: x.navn, for: () => { nodSted = s.id; } }, () => x.tel.slice(0, 2).map(([n, e]) => knapp("tel", n, `${e}: ${n}`)).join(""))));
    legg("nod", D.nod.hnT || "⟦k4⟧", "Nød og helse", D.nod.hn, { hash: "#/nod", sel: "section.kort > h2", tekst: D.nod.hnT || "⟦k4⟧" });
    legg("nod", "Helseråd", "Nød og helse", D.nod.helse, { hash: "#/nod", sel: "details.fold > summary", tekst: "Helseråd" });
    for (const [id, l] of Object.entries(D.ideer || {})) l.forEach((i) => legg("ide", i.navn, `${stedNavn(id)} · ikke bestilt`, [i.tekst, i.praktisk], { hash: "#/sted/" + id, sel: "#ideerher .ide b", tekst: i.navn }));
    (D.penger.seksjoner || []).forEach((x) => legg("penger", x.tittel, "Penger", seksjonTekst(x), { hash: "#/penger", sel: "section.kort > h2", tekst: x.tittel }));
    if (D.parlor) {
      D.parlor.fraser.forEach((x, i) => legg("parlor", x.no, x.vi, [x.merk], { fn: () => visFrase(i) }));
      [["Drikkepenger (tips)", D.parlor.tips], ["Vanlige priser", D.parlor.priser]].forEach(([t, l]) => l.forEach(([k, v]) => legg("parlor", k, t, [v], { hash: "#/parlor", sel: ".rader dt", tekst: k })));
    }
    sokIdxD = D; sokIdx = L;
    return L;
  }

  // Alle ord må finnes et sted i treffet. Poeng: tittel som starter med ordet > ord i tittel > undertittel > resten.
  function sokFinn(q) {
    const nq = sokNorm(q), ord = [...new Set(nq.split(/[\s,.;:/]+/).filter(Boolean))];
    if (!ord.length || nq.replace(/\s/g, "").length < 2) return null;
    const res = [];
    for (const x of sokBygg()) {
      const alt = x.n.join("\n");
      if (!ord.every((o) => alt.includes(o))) continue;
      let p = 0;
      for (const o of ord) {
        const t = x.n[0];
        p += t.startsWith(o) ? 6 : new RegExp("(^|[^\\p{L}\\p{N}])" + escRe(o), "u").test(t) ? 5 : t.includes(o) ? 3 : x.n[1].includes(o) ? 2 : 1;
      }
      res.push({ x, p });
    }
    return { ord, res };
  }
  function sokMerk(s, ord) { // uthev ordene uten å bry seg om tonemerker
    const { n, pos } = sokKart(s), r = [];
    for (const o of ord) for (let i = n.indexOf(o); i >= 0; i = n.indexOf(o, i + 1)) {
      const j = pos[i + o.length - 1]; r.push([pos[i], j + String.fromCodePoint(s.codePointAt(j)).length]);
    }
    if (!r.length) return esc(s);
    r.sort((a, b) => a[0] - b[0]);
    let h = "", sist = 0;
    for (const [a, b] of r) { if (b <= sist) continue; const a2 = Math.max(a, sist); h += esc(s.slice(sist, a2)) + "<mark>" + esc(s.slice(a2, b)) + "</mark>"; sist = b; }
    return h + esc(s.slice(sist));
  }
  function sokUtdrag(s, ord) {
    const { n, pos } = sokKart(s);
    let i = Math.min(...ord.map((o) => n.indexOf(o)).filter((x) => x >= 0));
    i = Number.isFinite(i) ? pos[i] : 0;
    if (s.length <= 130) return sokMerk(s, ord);
    let a = Math.max(0, i - 45); if (a > 0) { const m = s.lastIndexOf(" ", a); a = m > a - 15 ? m + 1 : a; }
    let b = Math.min(s.length, a + 130); if (b < s.length) { const m = s.indexOf(" ", b); b = m > 0 && m < b + 15 ? m : b; }
    return (a > 0 ? "… " : "") + sokMerk(s.slice(a, b), ord) + (b < s.length ? " …" : "");
  }
  function sokTreffHtml(r, ord, i) {
    const x = r.x, kn = x.knapper ? x.knapper() : "";
    let utdrag = "";
    for (let j = 2; j < x.felt.length; j++) if (ord.some((o) => x.n[j].includes(o))) { utdrag = sokUtdrag(x.felt[j], ord); break; }
    return `<div class="sk-treff"><button class="sk-gaa" data-sokgaa="${i}">
      <span class="sk-tittel">${x.merke ? `<i class="sk-prikk ${esc(x.merke)}"></i>` : ""}${sokMerk(x.tittel, ord)}</span>
      ${x.under ? `<span class="sk-under">${sokMerk(x.under, ord)}</span>` : ""}${utdrag ? `<span class="sk-utdrag">${utdrag}</span>` : ""}${ikon("chev", "sk-pil")}</button>
      ${kn ? `<div class="knapper">${kn}</div>` : ""}</div>`;
  }
  function sokResultat() {
    sokVist = [];
    const f = sokFinn(sokQ);
    if (!f) return `<p class="sk-hjelp">Søk i program, kontakter, hotell, fly, mat, nød og ideer. Virker uten nett.</p>
      <div class="sk-forslag">${SOK_FORSLAG.map((t) => `<button data-sokforslag="${esc(t)}">${esc(t)}</button>`).join("")}</div>`;
    if (!f.res.length) return `<p class="tom sk-hjelp">Ingen treff på «${esc(sokQ.trim())}».</p>`;
    const grupper = SOK_GRUPPER.map(([g, t], n) => { const l = f.res.filter((r) => r.x.g === g).sort((a, b) => b.p - a.p); return { g, t, n, l, best: l.length ? l[0].p : 0 }; })
      .filter((x) => x.l.length).sort((a, b) => b.best - a.best || a.n - b.n);
    let h = `<p class="sk-antall">${f.res.length} treff</p>`;
    for (const gr of grupper) {
      const vis = sokAlle[gr.g] ? gr.l : gr.l.slice(0, SOK_MAKS);
      h += `<div class="seksjonstittel">${esc(gr.t)} <span class="antall">(${gr.l.length})</span></div><section class="kort sk-gruppe">${vis.map((r) => { sokVist.push(r.x); return sokTreffHtml(r, f.ord, sokVist.length - 1); }).join("")}${gr.l.length > vis.length ? `<button class="sk-flere" data-sokflere="${gr.g}">Vis alle ${gr.l.length}</button>` : ""}</section>`;
    }
    return h;
  }
  function sideSok() {
    return tittel("Søk") + `<div class="sok"><input id="sokAlt" type="search" placeholder="Søk i hele reisen …" value="${esc(sokQ)}" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" enterkeyhint="search" aria-label="Søk i hele reisen"></div><div id="sokTreff">${sokResultat()}</div>` + bunn();
  }
  function koblSokAlt() {
    const inp = $("#sokAlt"); if (!inp) return;
    inp.addEventListener("input", () => { sokQ = inp.value; sokAlle = {}; $("#sokTreff").innerHTML = sokResultat(); });
    inp.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); inp.blur(); } });
    if (!sokQ) { try { inp.focus({ preventScroll: true }); } catch {} }
  }
  // Etter hopp: åpne det som er lukket, rull dit og blink kort rundt treffet
  function sokVisFunn(m, forsok = 0) {
    if (!m.sel) return;
    const nt = sokNorm(m.tekst), el = $$(m.sel, $("#innhold")).find((e) => sokNorm(e.textContent).includes(nt));
    if (!el) { if (forsok < 8) setTimeout(() => sokVisFunn(m, forsok + 1), 80); return; }
    for (let d = el.closest("details"); d; d = d.parentElement ? d.parentElement.closest("details") : null) d.open = true;
    const boks = el.closest("details.rest, .kontakt, .sykehus, .hliste, .fly, .ide, li, .nodgrid a, section.kort, details.fold") || el;
    if (m.apne) $$(m.apne, boks).forEach((d) => (d.open = true));
    boks.style.scrollMarginTop = "calc(var(--topp-h) + env(safe-area-inset-top) + 12px)";
    boks.scrollIntoView({ block: boks.offsetHeight > window.innerHeight * 0.6 ? "start" : "center", behavior: "smooth" });
    boks.classList.remove("sk-funn"); void boks.offsetWidth; boks.classList.add("sk-funn");
    setTimeout(() => boks.classList.remove("sk-funn"), 2600);
  }
  function sokGaa(x) {
    const m = x.maal;
    if (m.for) m.for();
    if (m.fn) { m.fn(); return; }
    if (location.hash === m.hash) { vis(); window.scrollTo(0, 0); } else location.hash = m.hash;
    setTimeout(() => sokVisFunn(m), 60);
  }
  document.addEventListener("click", (e) => {
    if (e.target.closest("#sokknapp")) { const h = location.hash; if (h && !h.startsWith("#/sok")) sokFra = h; return; }
    const t = e.target.closest("[data-sokgaa],[data-sokforslag],[data-sokflere]");
    if (!t) return;
    e.preventDefault();
    if (t.dataset.sokforslag) { sokQ = t.dataset.sokforslag; sokAlle = {}; const inp = $("#sokAlt"); if (inp) inp.value = sokQ; $("#sokTreff").innerHTML = sokResultat(); }
    else if (t.dataset.sokflere) { sokAlle[t.dataset.sokflere] = true; $("#sokTreff").innerHTML = sokResultat(); }
    else { const x = sokVist[Number(t.dataset.sokgaa)]; if (x) sokGaa(x); }
  });

  // ---------- sveip mellom dager ----------
  let tx = null, ty = null;
  document.addEventListener("touchstart", (e) => { if (!D || rute().side !== "idag" || !$("#overlay").hidden) { tx = null; return; } const t = e.touches[0]; tx = t.clientX; ty = t.clientY; }, { passive: true });
  document.addEventListener("touchend", (e) => {
    if (tx === null) return;
    const t = e.changedTouches[0], dx = t.clientX - tx, dy = t.clientY - ty; tx = null;
    if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.6) byttDag(dx < 0 ? 1 : -1);
  }, { passive: true });
  function byttDag(n) {
    const s0 = start(), s1 = slutt();
    valgtDag = n === 0 ? idagISO() : pluss(valgtDag, n);
    if (valgtDag < s0) valgtDag = s0;
    if (valgtDag > s1) valgtDag = s1;
    vis();
  }

  // ---------- toast ----------
  let toastT;
  // Små kvitteringer nederst (samme stil som oppdateringsvarselet): type ok | info | feil. toastAngre = ok + «Angre».
  let angreFn = null, toastUtT;
  const TS_IKON = {
    ok: `<path d="M6.5 12.5l3.6 3.6 7.4-8"/>`,
    info: `<path d="M12 11v6"/><circle cx="12" cy="7.4" r=".6"/>`,
    feil: `<path d="M12 7v6.5"/><circle cx="12" cy="17" r=".6"/>`,
  };
  function toastVis(t, ms, type, angre) {
    const el = $("#toast"); clearTimeout(toastT); clearTimeout(toastUtT);
    el.className = `toast ts-${TS_IKON[type] ? type : "ok"}`; el.setAttribute("role", type === "feil" ? "alert" : "status");
    el.innerHTML = `<span class="ts-merke" aria-hidden="true"><svg viewBox="0 0 24 24">${TS_IKON[type] || TS_IKON.ok}</svg></span><span class="ts-tekst">${esc(t)}</span>${angre ? `<button type="button" class="angre" data-angre>Angre</button>` : ""}<span class="ts-tid" style="animation-duration:${ms}ms" aria-hidden="true"></span>`;
    el.hidden = false; void el.offsetWidth; el.classList.add("inn");
    toastT = setTimeout(toastSkjul, ms);
  }
  function toastSkjul() {
    const el = $("#toast"); clearTimeout(toastT); if (el.hidden) return;
    el.classList.remove("inn"); el.classList.add("ut");
    toastUtT = setTimeout(() => { el.hidden = true; el.classList.remove("ut"); angreFn = null; }, 260);
  }
  function toast(t, ms = 2200, type = "ok") { angreFn = null; toastVis(t, ms, type, false); }
  function toastAngre(t, fn) { toastVis(t, 5000, "ok", true); angreFn = fn; }
  // ---------- varsel: kort som glir ned fra toppen (oppdateringer) ----------
  // Nytt i hver appversjon – vises i varselet etter oppdatering (maks tre siste). Legg til én kort linje per ny versjon.
  const NYTT = {
    21: "Ny I dag-visning på reisedagene",
    22: "«Hent nyeste versjon» svarer straks",
    23: "Lenke til hotellenes nettsider",
    24: "Nytt oppdateringsvarsel",
    25: "Pris og kvalitet fargekodet på restaurantene",
    26: "Legg til egne avtaler, romnotater og møtested",
    27: "Reisen-kartet viser flybyttet på vei ut og hjem",
    28: "Ryddigere Mer-meny",
    29: "Hør uttalen av frasene på vietnamesisk",
    30: "Velg restaurant og marker bordreservasjon i egne avtaler",
    31: "Oppdater appen fra Claude – uten Mac",
    32: "Sammenhengende flystreker gjennom kartbruddet",
    34: "Enkel bruksstatistikk",
  };
  const VS_PIL = `<svg class="vs-pil" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h13M13 6l6 6-6 6"/></svg>`;
  const VS_IKON = {
    ok: `<svg viewBox="0 0 24 24"><path class="vs-hake" d="M6.5 12.5l3.6 3.6 7.4-8"/></svg>`,
    nyeste: `<svg viewBox="0 0 24 24"><path class="vs-hake" d="M6.5 12.5l3.6 3.6 7.4-8"/></svg>`,
    info: `<svg viewBox="0 0 24 24"><path d="M12 4v11M7 10.5l5 5 5-5"/><path d="M5 19.5h14"/></svg>`,
    feil: `<svg viewBox="0 0 24 24"><path d="M12 7.5v6"/><circle cx="12" cy="17" r=".6"/></svg>`,
  };
  const reiseinfoKort = () => {
    try { const t = new Date(D.meta.bygget); const f = (o) => new Intl.DateTimeFormat("nb-NO", { timeZone: "Europe/Oslo", ...o }).format(t);
      return `${f({ day: "numeric", month: "short" }).replace(/\.$/, "")} ${f({ hour: "2-digit", minute: "2-digit", hourCycle: "h23" })}`; }
    catch { return oppdatertTekst().replace(" (norsk tid)", ""); }
  };
  let varselT = null, varselRest = 0, varselStart = 0;
  function lukkVarsel(straks) {
    const el = $("#varsel"); clearTimeout(varselT); if (!el) return;
    el.id = ""; if (straks) { el.remove(); return; }
    el.classList.remove("inn"); el.classList.add("ut"); el.style.transform = "";
    setTimeout(() => el.remove(), 450);
  }
  function varsel({ type = "ok", tittel, tekst = "", chips = [], nytt = [], ms = 4500 }) {
    lukkVarsel(true);
    const el = document.createElement("div");
    el.id = "varsel"; el.className = `varsel vs-${type}`; el.setAttribute("role", type === "feil" ? "alert" : "status");
    const konfetti = type === "ok" ? `<span class="vs-konfetti" aria-hidden="true">${Array.from({ length: 12 }, (_, i) => `<i style="--i:${i}"></i>`).join("")}</span>` : "";
    el.innerHTML = `<span class="vs-glod" aria-hidden="true"></span>
      <div class="vs-rad"><span class="vs-merke" aria-hidden="true">${VS_IKON[type] || VS_IKON.ok}${konfetti}</span>
        <span class="vs-tekst"><b>${esc(tittel)}</b>${tekst ? `<span>${esc(tekst)}</span>` : ""}</span>
        <button type="button" class="vs-lukk" aria-label="Lukk"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7l10 10M17 7 7 17"/></svg></button></div>
      ${chips.length ? `<div class="vs-chips">${chips.join("")}</div>` : ""}
      ${nytt.length ? `<div class="vs-nytt"><small>Nytt</small><ul>${nytt.map((n) => `<li>${esc(n)}</li>`).join("")}</ul></div>` : ""}
      <span class="vs-tid" style="animation-duration:${ms}ms" aria-hidden="true"></span>`;
    document.body.appendChild(el);
    requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add("inn")));
    const planlegg = (t) => { varselRest = t; varselStart = Date.now(); clearTimeout(varselT); varselT = setTimeout(() => lukkVarsel(), t); };
    planlegg(ms);
    // Hold fingeren på kortet = pause. Dra opp = lukk. Trykk = lukk.
    let y0 = null, dy = 0;
    el.addEventListener("pointerdown", (e) => { y0 = e.clientY; dy = 0; clearTimeout(varselT); varselRest -= Date.now() - varselStart; el.classList.add("pause"); try { el.setPointerCapture(e.pointerId); } catch {} });
    el.addEventListener("pointermove", (e) => { if (y0 === null) return; dy = Math.min(0, e.clientY - y0) + Math.max(0, e.clientY - y0) * .15; el.style.transition = "none"; el.style.transform = `translate(-50%, ${dy}px)`; });
    const slipp = () => {
      if (y0 === null) return; y0 = null; el.style.transition = ""; el.classList.remove("pause");
      if (dy < -30 || Math.abs(dy) < 4) lukkVarsel(); else { el.style.transform = ""; planlegg(Math.max(1800, varselRest)); }
    };
    el.addEventListener("pointerup", slipp); el.addEventListener("pointercancel", slipp);
  }
  // ---------- kort (hk): to skjermer (restaurant / nød), to varianter (v1 / egen) ----------
  const AK = { variant: null, skjerm: "restaurant", svar: null };
  // ---------- tidspunkt (tp): klokkeslettet deles med familien, og alt loggføres i databasen ----------
  // Hver handling er en egen post i synk-lageret som aldri overskrives (to telefoner kan registrere samtidig uten å miste noe):
  // {k:"e", id, a:"satt"|"angret"|"fjernet", tp (tidspunkt, ms), ref (id som angres), refs (id-er som fjernes), hvem (person-id), enh (telefon), t}.
  const TP_MAKS = 6 * 3600e3;
  const tilfeldigHex = (n) => Array.from(crypto.getRandomValues(new Uint8Array(n)), (b) => b.toString(16).padStart(2, "0")).join("");
  const enhet = () => { let x = lagre.get(LS.enhet); if (!x) { x = tilfeldigHex(3); lagre.set(LS.enhet, x); } return x; };
  const personNavn = (id) => { const p = (D.personer || []).find((x) => x.id === id); return p ? p.navn : ""; };
  const tpLogg = () => Object.values(synkLes().p).filter((p) => p.k === "e" && p.id).sort((a, b) => a.t - b.t);
  function tpListe() { // gjeldende registreringer (ikke angret/fjernet, yngre enn 6 t), eldste først
    const logg = tpLogg(), bort = new Set(), na = Date.now();
    for (const p of logg) { if (p.a === "angret" && p.ref) bort.add(p.ref); if (p.a === "fjernet") (p.refs || []).forEach((r) => bort.add(r)); }
    return logg.filter((p) => p.a === "satt" && !bort.has(p.id) && na - p.tp < TP_MAKS).sort((a, b) => a.tp - b.tp);
  }
  const tpLes = () => { const l = tpListe(); return l.length ? l[l.length - 1].tp : 0; };
  function tpNy(a, ekstra) { const p = { k: "e", id: tilfeldigHex(8), a, hvem: meg() || "", enh: enhet(), ...ekstra }; synkSett(p); return p; }
  const tpSett = () => tpNy("satt", { tp: Date.now() });
  function tpAngre() { const l = tpListe(), s = l[l.length - 1]; if (s) tpNy("angret", { ref: s.id, tp: s.tp }); return !!s; }
  function tpFjern() { const l = tpListe(); if (l.length) tpNy("fjernet", { refs: l.map((p) => p.id) }); }
  // Eldre versjoner lagret klokkeslettet bare på telefonen – flytt det inn i loggen én gang.
  function tpMigrer() {
    const t = Number(lagre.get(LS.tp) || 0); if (!t) return;
    if (Date.now() - t < TP_MAKS && !tpLogg().some((p) => p.tp === t)) tpNy("satt", { tp: t, flyttet: 1 });
    lagre.del(LS.tp);
  }
  const hhmm = (t) => new Date(t).toLocaleTimeString("nb-NO", { hour: "2-digit", minute: "2-digit" });
  const avHvem = (p) => (p.hvem && personNavn(p.hvem) ? ` (${esc(personNavn(p.hvem))})` : "");
  function tpTekst() {
    const l = tpListe(); if (!l.length) return "";
    const s = l[l.length - 1], min = Math.max(0, Math.floor((Date.now() - s.tp) / 60000)), siden = min < 1 ? "nå nettopp" : min + " min siden";
    if (l.length === 1) return `⟦t2⟧ satt kl. ${hhmm(s.tp)}${avHvem(s)} – ${siden}. ${min >= 5 ? "<b>⟦t5⟧</b>" : "⟦t6⟧"}`;
    return l.map((p, i) => `⟦t2⟧ ${i + 1} kl. ${hhmm(p.tp)}${avHvem(p)}`).join(" · ") + ` – siste ${siden}.`;
  }
  // Loggen ligger bevisst litt bortgjemt (liten lenke nederst på Mer → #/tlogg). Den trengs bare hvis en ekte registrering
  // er angret eller fjernet ved en feil: «Gjenopprett» legger inn samme klokkeslett igjen (ny post med igjen = opprinnelig id).
  let tpGjenBekreft = null;
  function sideTlogg() {
    const logg = tpLogg(), aktive = new Set(tpListe().map((p) => p.tp)), na = Date.now();
    const dag = (t) => new Date(t).toLocaleDateString("nb-NO", { day: "numeric", month: "numeric" });
    const hvem = (p) => esc(personNavn(p.hvem) || "Ukjent");
    const angretAv = (id) => logg.find((x) => (x.a === "angret" && x.ref === id) || (x.a === "fjernet" && (x.refs || []).includes(id)));
    let h = tittel("Logg – ⟦t1⟧", synkHtml(""), "Brukes bare hvis et klokkeslett er angret eller fjernet ved en feil. **Gjenopprett** legger klokkeslettet inn igjen for hele familien.");
    if (!logg.length) return h + `<p class="tom">Ingen registreringer ennå.</p>` + bunn();
    h += `<div class="liste tlogg">${logg.slice().reverse().map((p) => {
      let hva, status = "", knapp = "";
      if (p.a === "satt") {
        hva = `${p.igjen ? `Gjenopprettet ⟦t3⟧ kl. ${hhmm(p.tp)}${p.hvem && p.hvem !== p.av && personNavn(p.hvem) ? ` (satt av ${esc(personNavn(p.hvem))})` : ""}` : `⟦t2⟧ satt kl. ${hhmm(p.tp)}`}`; hva += `${p.flyttet ? " (flyttet fra telefonen)" : ""}`;
        const b = angretAv(p.id);
        if (aktive.has(p.tp)) status = `<span class="pl-aktiv">Gjelder nå</span>`;
        else if (na - p.tp >= TP_MAKS) status = `<span class="pl-gammel">Eldre enn 6 t</span>`;
        else if (b) {
          status = `<span class="pl-bort">${b.a === "angret" ? "Angret" : "Fjernet"} kl. ${hhmm(b.t)} av ${hvem(b)}</span>`;
          knapp = `<button class="knapp ${tpGjenBekreft === p.id ? "knapp-rod" : "knapp-lys"}" data-tpgjen="${esc(p.id)}">${tpGjenBekreft === p.id ? "Trykk igjen for å gjenopprette" : "Gjenopprett"}</button>`;
        }
      } else if (p.a === "angret") {
        const o = logg.find((x) => x.id === p.ref);
        hva = `Angret registreringen kl. ${hhmm(p.tp)}${o && o.hvem && o.hvem !== p.hvem && personNavn(o.hvem) ? ` (satt av ${esc(personNavn(o.hvem))})` : ""}`;
      } else if (p.a === "fjernet") { const n = (p.refs || []).length; hva = `Fjernet klokkeslettet (${n} ⟦t3⟧${n === 1 ? "" : "er"})`; }
      else hva = esc(p.a);
      const usendt = synkLes().u[postNokkel(p)] ? ` · <i>ikke sendt ennå</i>` : "";
      return `<div class="pl-rad"><div><b>${hva}</b><small>${dag(p.t)} kl. ${hhmm(p.t)} · ${hvem("av" in p ? { hvem: p.av } : p)}${usendt}</small>${status}</div>${knapp}</div>`;
    }).join("")}</div>`;
    h += `<p class="krolle" style="margin:12px 4px">${D.synk ? "Loggen lagres i familiens database og kan ikke slettes fra appen." : "Loggen lagres bare på denne telefonen."}</p>`;
    return h + bunn();
  }
  // Rød linje øverst på alle sider så lenge et tidspunkt er registrert – også på telefonene som ikke registrerte den.
  function tpVarsel() {
    let el = $("#tpVarsel"); const l = D ? tpListe() : [];
    if (!el) { if (!l.length) return; el = document.createElement("button"); el.id = "tpVarsel"; el.className = "tpvarsel"; el.dataset.hk = "nod"; $("#nett").after(el); }
    if (!l.length) { el.hidden = true; return; }
    const s = l[l.length - 1], min = Math.max(0, Math.floor((Date.now() - s.tp) / 60000));
    el.hidden = false;
    el.innerHTML = `<b>${l.length > 1 ? `⟦t2⟧ ${l.length}` : "⟦t4⟧"} satt kl. ${hhmm(s.tp)}</b>${avHvem(s)} · ${min < 1 ? "nå nettopp" : min + " min siden"}<span>Åpne nødkortet</span>`;
  }
  function tpOppdater() {
    tpVarsel();
    if (rute().side === "tlogg" && trygtAaTegne()) { const y = window.scrollY; vis(); window.scrollTo(0, y); }
    const o = $("#overlay");
    if (!o.hidden && AK.skjerm === "nod" && o.querySelector(".ak-nod")) visHk({ beholdRull: true });
  }
  setInterval(() => { if (!D) return; const el = $("#tpTeller"); if (el) el.innerHTML = tpTekst(); tpVarsel(); }, 15000);
  function visHk(opts = {}) {
    const a = D.nod.hk, o = $("#overlay"), r = a.restaurant, n = a.nod;
    if (opts.aapne) { AK.variant = meg() === a.egenId ? "egen" : "v1"; AK.skjerm = opts.skjerm || "restaurant"; AK.svar = null; }
    if (opts.variant) AK.variant = opts.variant;
    if (opts.skjerm) AK.skjerm = opts.skjerm;
    const v = AK.variant in a.varianter ? AK.variant : "v1", nv = n[v], vv = a.varianter[v];
    const rull = opts.beholdRull ? o.scrollTop : 0;
    if (opts.aapne && D.synk) synkSnart(0);
    const bilde = D.bilder && D.bilder[a.bilde] ? `<img class="ak-bilde" src="${D.bilder[a.bilde]}" alt="${esc(a.bildeAlt || "")}">` : "";
    let h = `<button class="lukk">Lukk</button><div class="hk-stor">
      <div class="kortskjerm"><button data-kortskjerm="restaurant" class="${AK.skjerm === "restaurant" ? "valgt" : ""}">Restaurant</button><button data-kortskjerm="nod" class="nod ${AK.skjerm === "nod" ? "valgt" : ""}">Nødsituasjon</button></div>`;
    if (AK.skjerm === "restaurant") {
      const s = AK.svar && r.svar.find((x) => x.id === AK.svar);
      h += `<div class="ak">
        <p class="ak-til">${esc(r.til)}</p>
        <div class="ak-topp">${bilde}<div><p class="ak-overskrift">${esc(r.overskrift)}</p><p class="ak-stoff">${esc(r.stoff)}</p></div></div>
        <p class="ak-eks">${esc(r.eksempler)}</p>
        <p class="ak-intro">${esc(r.intro[v])}</p>
        <ul class="ak-forbud">${r.forbud.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>
        <div class="ak-sp"><p>${esc(r.sporsmal)}</p>
          <div class="ak-svar">${r.svar.map((x) => `<button data-kortsvar="${x.id}" class="${x.type} ${AK.svar === x.id ? "valgt" : ""}">${esc(x.vi)}<small>${esc(x.en)}</small></button>`).join("")}</div>
          ${s ? `<div class="ak-resultat ${s.type}"><b>${esc(s.svarVi)}</b><span>${esc(s.no)}</span></div>` : ""}</div>
        <p class="ak-usikker">${esc(r.usikker)}</p>
        <p class="ak-takk">${esc(r.takk)}</p></div>
        <details class="ak-en"><summary>English</summary><p>${esc(r.en[v])}</p></details>`;
    } else {
      const t = tpLes();
      h += `<div class="ak ak-nod">
        <p class="ak-nodtittel">${esc(n.tittel)}</p>
        <p class="ak-hoved">${esc(nv.hoved)}</p>
        <a class="ak-115" href="tel:115">${esc(nv.ring)}<small>Ring 115</small></a>
        <ul class="ak-linjer">${nv.linjer.map((x, i) => `<li>${esc(x)}</li>` + (t && i === (v === "v1" ? 0 : 1) ? `<li class="tidli"><p class="ak-tid">${esc(n.tidLinje.replace("{tid}", hhmm(t)))}</p></li>` : "")).join("")}</ul>
        ${nv.kontakt ? `<p class="ak-kontakt">${esc(nv.kontakt[0])} <a href="tel:${esc(nv.kontakt[1].replace(/\s/g, ""))}">${esc(nv.kontakt[1])}</a></p>` : ""}</div>
        <div class="ak-fam">
          <button class="knapp knapp-full ${t ? "" : "knapp-rod"}" data-tpnaa>${t ? "Registrer ny ⟦t3⟧ nå" : "⟦t4⟧ satt nå – registrer klokkeslett"}</button>
          ${t ? `<p id="tpTeller">${tpTekst()}</p><div class="ak-angre"><button class="lenkeknapp" data-tpangre>Angre siste registrering</button><button class="lenkeknapp" data-tpnull>Fjern klokkeslettet</button></div>` : `<p>Klokkeslettet vises på vietnamesisk på kortet, til ambulanse og sykehus.</p>`}
          <p class="ak-synk">${D.synk ? "Deles med familien · " : ""}${synkHtml("")}</p>
          <a class="knapp knapp-full knapp-lys" href="#/nod" data-lukkkort>Nærmeste sykehus</a>
        </div>
        <details class="ak-en"><summary>English</summary><p>${esc(nv.en)}</p></details>`;
    }
    h += `<div class="kortvalg">${Object.entries(a.varianter).map(([k, x]) => `<button data-kortvariant="${k}" class="${k === v ? "valgt" : ""}">${esc(x.knapp)}</button>`).join("")}</div>
      <p class="no">${esc(vv.no)}</p>`;
    if (a.familie) h += `<details class="ak-familie"><summary>${esc(a.familie.tittel)}</summary>${familieInnhold(a.familie)}</details>`;
    h += `</div>`;
    o.className = "overlay" + (AK.skjerm === "nod" ? " nodkort" : "");
    o.innerHTML = h; o.hidden = false; o.scrollTop = rull;
  }
  // Rettelista for familien: grupper (grønn/gul/rød) først, så regler. Rettnavnet (før « – ») i fet skrift.
  function familieInnhold(f) {
    const rett = (x) => { const k = x.indexOf(" – "); return k > 0 ? `<b>${esc(x.slice(0, k))}</b>${esc(x.slice(k))}` : esc(x); };
    return f.grupper.map((g) => `<div class="rettgruppe ${esc(g.type || "")}"><h3>${esc(g.tittel)}</h3><ul>${g.retter.map((x) => `<li>${rett(x)}</li>`).join("")}</ul></div>`).join("")
      + `<div class="rettregler">${f.regler.map((x) => `<p>${md(x)}</p>`).join("")}</div>`;
  }
  function familieRetterHtml() {
    const f = D.nod.hk.familie; if (!f) return "";
    return `<details class="fold"><summary>${ikon("info")}${esc(f.tittel)}</summary><div class="innhold">${familieInnhold(f)}</div></details>`;
  }


  // ---------- vær (Open-Meteo – gratis, uten nøkkel; siste varsel lagres så det vises uten nett) ----------
  const VK = { 0: ["Klart", "sol"], 1: ["Lettskyet", "sol"], 2: ["Delvis skyet", "solsky"], 3: ["Overskyet", "sky"], 45: ["Tåke", "take"], 48: ["Tåke", "take"],
    51: ["Litt yr", "regn"], 53: ["Yr", "regn"], 55: ["Tett yr", "regn"], 56: ["Underkjølt yr", "regn"], 57: ["Underkjølt yr", "regn"],
    61: ["Litt regn", "regn"], 63: ["Regn", "regn"], 65: ["Kraftig regn", "regn"], 66: ["Underkjølt regn", "regn"], 67: ["Underkjølt regn", "regn"],
    71: ["Litt snø", "sno"], 73: ["Snø", "sno"], 75: ["Mye snø", "sno"], 77: ["Snø", "sno"], 80: ["Regnbyger", "byge"], 81: ["Regnbyger", "byge"],
    82: ["Kraftige byger", "byge"], 85: ["Snøbyger", "sno"], 86: ["Snøbyger", "sno"], 95: ["Tordenvær", "torden"], 96: ["Torden og hagl", "torden"], 99: ["Torden og hagl", "torden"] };
  const SOL = '<circle cx="12" cy="12" r="4.2" fill="#f5b400"/><g stroke="#f5b400" stroke-width="2" stroke-linecap="round"><path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6"/></g>';
  const SKY = (x = 0, y = 0, f = "#b9c2c9") => `<path transform="translate(${x} ${y})" d="M7 18.5h10.2a4 4 0 0 0 .5-8 5.5 5.5 0 0 0-10.5 1.3A3.4 3.4 0 0 0 7 18.5z" fill="${f}"/>`;
  const DRAPER = '<g stroke="#2f7fd8" stroke-width="2" stroke-linecap="round"><path d="M9 20.5l-1 2M13 20.5l-1 2M17 20.5l-1 2"/></g>';
  const VI = {
    sol: SOL,
    solsky: `<g transform="translate(-3 -3) scale(.8)">${SOL}</g>${SKY(1, 1)}`,
    sky: SKY(0, 0),
    take: '<g stroke="#b9c2c9" stroke-width="2.2" stroke-linecap="round"><path d="M4 9h16M3 13h18M5 17h14"/></g>',
    regn: `${SKY(0, -3, "#9aa7b1")}${DRAPER}`,
    byge: `<g transform="translate(-3 -4) scale(.75)">${SOL}</g>${SKY(1, -2, "#9aa7b1")}${DRAPER}`,
    torden: `${SKY(0, -3, "#7d8a94")}<path d="M12.5 15.5l-2.5 4h3l-2 4" fill="none" stroke="#f5b400" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    sno: `${SKY(0, -3)}<g fill="#8fb8e0"><circle cx="9" cy="21" r="1.2"/><circle cx="13" cy="22" r="1.2"/><circle cx="17" cy="21" r="1.2"/></g>`,
  };
  const vaerIkon = (kode, st = "vikon") => { const k = (VK[kode] || VK[3])[1]; return `<svg class="${st}" viewBox="0 0 24 24" aria-hidden="true">${VI[k]}</svg>`; };
  const vaerTekst = (kode) => (VK[kode] || ["–"])[0];
  const RETN = ["nord", "nordøst", "øst", "sørøst", "sør", "sørvest", "vest", "nordvest"];
  const retning = (g) => RETN[Math.round(((g % 360) + 360) % 360 / 45) % 8];
  function vaerSted(d) {
    if (D.vaerDager && D.vaerDager[d]) return D.vaerDager[d];
    const s = stedForDato(d); return s && s.vaer;
  }
  const vaerNokkel = (v) => `vn.vaer.${v.lat},${v.lon}`;
  const vaerLes = (v) => { try { return JSON.parse(lagre.get(vaerNokkel(v)) || "null"); } catch { return null; } };
  const vaerPaagaar = {};
  async function hentVaer(v) {
    const k = vaerNokkel(v), c = vaerLes(v);
    if (vaerPaagaar[k] || !navigator.onLine || (c && Date.now() - c.t < 2 * 3600e3)) return;
    vaerPaagaar[k] = 1;
    try {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${v.lat}&longitude=${v.lon}&timezone=auto&wind_speed_unit=ms&forecast_days=16`
        + "&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_speed_10m_max,wind_gusts_10m_max,wind_direction_10m_dominant"
        + "&hourly=temperature_2m,precipitation_probability,weather_code";
      const r = await fetch(url, { cache: "no-store", referrerPolicy: "no-referrer" });
      if (!r.ok) throw new Error(r.status);
      const j = await r.json(), dg = j.daily, ho = j.hourly, dager = {};
      dg.time.forEach((t, i) => { dager[t] = { kode: vTall(dg.weather_code[i]), maks: vTall(dg.temperature_2m_max[i]), min: vTall(dg.temperature_2m_min[i]), mm: vTall(dg.precipitation_sum[i]),
        pst: vTall(dg.precipitation_probability_max[i]), vind: vTall(dg.wind_speed_10m_max[i]), kast: vTall(dg.wind_gusts_10m_max[i]), retn: vTall(dg.wind_direction_10m_dominant[i]), timer: [] }; });
      ho.time.forEach((t, i) => { const [dag, kl] = t.split("T"), h = Number(kl.slice(0, 2)); if (dager[dag] && [9, 14, 19].includes(h)) dager[dag].timer.push([h, vTall(ho.temperature_2m[i]), vTall(ho.precipitation_probability[i]), vTall(ho.weather_code[i])]); });
      lagre.set(k, JSON.stringify({ t: Date.now(), dager }));
      if (rute().side === "idag") vis();
    } catch {} finally { delete vaerPaagaar[k]; }
  }
  const rund = (x) => (x == null ? "–" : Math.round(x));
  function vaerHtml(d) {
    const v = vaerSted(d); if (!v) return "";
    hentVaer(v);
    const c = vaerLes(v), x = c && c.dager[d], n = D.vaerNormal && D.vaerNormal[d];
    let h = `<section class="kort vaer"><div class="vtopp"><h2>Været${v.navn ? ` i ${esc(v.navn)}` : ""}</h2>`;
    if (x) {
      const naar = new Date(c.t), sammeDag = naar.toDateString() === new Date().toDateString();
      h += `<span class="vtid">${sammeDag ? `oppdatert kl. ${hhmm(c.t)}` : `oppdatert ${naar.toLocaleDateString("nb-NO", { day: "numeric", month: "short" })}`}${navigator.onLine ? "" : " · lagret"}</span></div>
        <div class="vhoved">${vaerIkon(x.kode, "vikon stor")}<div><div class="vtemp">${rund(x.maks)}°<span> / ${rund(x.min)}°</span></div><div class="vbeskr">${esc(vaerTekst(x.kode))}</div></div></div>
        <div class="vfakta">
          <div><span>Nedbør</span><b>${x.mm != null ? String(Math.round(x.mm * 10) / 10).replace(".", ",") : "–"} mm</b><small>${x.pst != null ? `${x.pst} % sjanse` : ""}</small></div>
          <div><span>Vind</span><b>${rund(x.vind)} m/s</b><small>${x.retn != null ? `fra ${retning(x.retn)}` : ""}${x.kast != null ? ` · kast ${rund(x.kast)}` : ""}</small></div>
        </div>
        ${x.timer && x.timer.length ? `<div class="vtimer">${x.timer.map(([t, temp, pst, kode]) => `<div><span>${t === 9 ? "Morgen" : t === 14 ? "Dag" : "Kveld"}</span>${vaerIkon(kode)}<b>${rund(temp)}°</b><small>${pst != null ? `${pst} %` : ""}</small></div>`).join("")}</div>` : ""}`;
      if (mellom(idagISO(), d) > 7) h += `<p class="vmerk">Varsel over en uke fram er usikkert.</p>`;
    } else {
      const dagerTil = mellom(idagISO(), d);
      const tekst = dagerTil > 15 ? `Værmeldingen for denne dagen kommer ca. ${pen(pluss(d, -15), false)}.`
        : dagerTil < 0 ? "" : c ? "Denne dagen er ikke med i varselet ennå." : navigator.onLine ? "Henter værmelding …" : "Værmeldingen hentes når telefonen har nett.";
      h += `</div>${tekst ? `<p class="vmerk">${tekst}</p>` : ""}`;
    }
    if (n && !x) h += `<div class="vnormal"><span>Vanlig på denne tiden</span><b>${n.maks}° / ${n.min}°</b><small>regn ca. ${n.regnPst} % av dagene · vind ${n.vind} m/s</small></div>`;
    return h + `</section>`;
  }

  // ---------- valuta ----------
  // Alle beløp i appen blir automatisk trykkbare (uten synlig lenke): NOK → VND, alle andre valutaer → NOK.
  // Trykk igjen for originalen. Gjelder all tekst som noen gang vises (MutationObserver), også ny tekst i fremtiden.
  const VAL_TALL = "\\d{1,3}(?:[ \\u00a0\\u202f.]\\d{3})+(?:,\\d+)?|\\d+(?:,\\d+)?";
  const VAL_SPENN = `(?:${VAL_TALL})(?:\\s?[–-]\\s?(?:${VAL_TALL}))?`;
  const VAL_KODE = { "₫": "VND", "VND": "VND", "VNĐ": "VND", "đ": "VND", "k": "VNDK", "kr": "NOK", "NOK": "NOK", "kroner": "NOK", "DKK": "DKK", "USD": "USD", "US$": "USD", "$": "USD", "EUR": "EUR", "€": "EUR", "SGD": "SGD" };
  const VAL_RE = new RegExp(`(?<![\\p{L}\\d.,$])(?:(VND|VNĐ|NOK|USD|US\\$|DKK|EUR|SGD|\\$|€)\\s?(${VAL_SPENN})(\\s?mill\\.?)?|(${VAL_SPENN})(?:(\\s?mill\\.?)?\\s?(₫|VND|VNĐ|đ|kr|NOK|kroner|DKK|USD|EUR|SGD|€)|(k)))(?![\\p{L}\\d])`, "gu");
  const VAL_HOPP = "script,style,textarea,input,select,button,.valuta,.omregner,.snarvei,[data-ingen-valuta]";
  const valTall = (s) => Number(s.replace(/[   .]/g, "").replace(",", "."));
  function valKurser() {
    let auto = null; try { auto = JSON.parse(lagre.get(LS.kursAuto) || "null"); } catch {}
    return Object.assign({}, (D && D.penger.reserveKurser) || {}, (auto && auto.andre) || {}, { VND: kursInfo().kurs });
  }
  const valFmt = (x) => (x < 10 ? x.toLocaleString("nb-NO", { maximumFractionDigits: 1 }) : Math.round(x).toLocaleString("nb-NO"));
  function valOmregn(el) {
    const kode = el.dataset.kode, verdier = el.dataset.v.split("|").map(Number), k = valKurser();
    if (kode === "NOK") return "≈ " + verdier.map((x) => (Math.round((x * k.VND) / 1000) * 1000).toLocaleString("nb-NO")).join("–") + " ₫";
    const per = k[kode]; if (!per) return null;
    return "≈ " + verdier.map((x) => valFmt(x / per)).join("–") + " kr";
  }
  function valBygg(tekst) {
    const f = document.createDocumentFragment(); let sist = 0, m; VAL_RE.lastIndex = 0;
    while ((m = VAL_RE.exec(tekst))) {
      const spenn = m[2] || m[4], mill = m[3] || m[5], sym = m[1] || m[6] || m[7];
      let kode = VAL_KODE[sym], faktor = mill ? 1e6 : 1;
      if (kode === "VNDK") { kode = "VND"; faktor = 1000; }
      const verdier = spenn.split(/\s?[–-]\s?/).map((x) => valTall(x) * faktor);
      if (!kode || verdier.some((x) => !isFinite(x) || x <= 0)) continue;
      if (m.index > sist) f.append(tekst.slice(sist, m.index));
      const s = document.createElement("span");
      s.className = "valuta"; s.dataset.kode = kode; s.dataset.v = verdier.join("|"); s.dataset.orig = m[0]; s.textContent = m[0];
      f.append(s); sist = m.index + m[0].length;
    }
    if (!sist) return null;
    if (sist < tekst.length) f.append(tekst.slice(sist));
    return f;
  }
  function merkValuta(rot) {
    if (!rot || !D) return;
    const ok = (n) => { const p = n.parentElement; if (!p || !/\d/.test(n.data) || p.closest(VAL_HOPP)) return false; VAL_RE.lastIndex = 0; return VAL_RE.test(n.data); };
    const noder = [];
    if (rot.nodeType === 3) { if (ok(rot)) noder.push(rot); }
    else if (rot.nodeType === 1) {
      if (rot.closest(VAL_HOPP)) return;
      const w = document.createTreeWalker(rot, NodeFilter.SHOW_TEXT, { acceptNode: (n) => (ok(n) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT) });
      while (w.nextNode()) noder.push(w.currentNode);
    }
    for (const n of noder) { const f = valBygg(n.data); if (f) n.replaceWith(f); }
  }
  new MutationObserver((ms) => { if (!D) return; for (const m of ms) m.addedNodes.forEach(merkValuta); }).observe(document.body, { childList: true, subtree: true });
  function valutaBytt(el) {
    if (el.dataset.vist) { el.textContent = el.dataset.orig; delete el.dataset.vist; el.classList.remove("omregnet"); return; }
    const t = valOmregn(el); if (!t) return;
    el.textContent = t; el.dataset.vist = "1"; el.classList.add("omregnet");
  }
  // ---------- sjåførkort ----------
  // Knappen vises ikke der sjåfør er uaktuelt (hotell.sjofor === false på stedet)
  const sjoforHer = (stedId) => { const x = stedEtterId(stedId); return !(x && x.hotell && x.hotell.sjofor === false); };
  const sjoforSiste = () => { try { const l = JSON.parse(lagre.get(LS.sjoforSiste) || "[]"); return Array.isArray(l) ? l : []; } catch { return []; } };
  // Innlimt tekst fra Google Maps: fjern lenker og tomme linjer; første linje = navn når det er flere linjer
  function sjoforTolk(tekst) {
    const linjer = String(tekst || "").replace(/https?:\/\/\S+/g, "").split(/\r?\n/).map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean);
    if (!linjer.length) return null;
    return linjer.length > 1 ? { navn: linjer[0], adr: linjer.slice(1).join(", ") } : { navn: "", adr: linjer[0] };
  }
  function visSjoforKort(x) {
    const o = $("#overlay"), hel = x.navn ? x.navn + ", " + x.adr : x.adr;
    o.className = "overlay sjofor";
    o.innerHTML = `<button class="lukk">Lukk</button><div class="sjofor-stor">
      <p class="svn" lang="vi">Xin vui lòng đưa chúng tôi đến địa chỉ này:</p>
      <p class="sen" lang="en">Please take us to this address</p>
      ${x.navn ? `<div class="snavn">${esc(x.navn)}</div>` : ""}
      <div class="sadr">${esc(x.adr)}</div>
      ${x.tlf ? `<p class="snr"><span lang="vi">${esc(x.tlfVi)}</span> / ${esc(x.tlfEn)}<b>${esc(x.tlf)}</b></p>` : ""}
      <p class="sno">Norsk: «Vennligst kjør oss til denne adressen.» Snu telefonen mot sjåføren.</p>
      <div class="knapper"><button class="kb" data-kopier="${esc(hel)}">Kopier adressen (til Grab)</button>${knapp("kart", x.kartq || hel, "Vis i kart")}${x.fri ? `<button class="kb" data-sjofor="fri">Ny adresse</button>` : ""}</div>
    </div>`;
    o.hidden = false; o.scrollTop = 0;
  }
  function visSjoforFri() {
    const o = $("#overlay"), siste = sjoforSiste();
    o.className = "overlay sjofor";
    o.innerHTML = `<button class="lukk">Lukk</button><div class="sjofor-stor sfri">
      <h2>Vis en adresse til sjåføren</h2>
      <p class="sno">I Google Maps: hold fingeren på adressen og velg «Kopier». Lim den inn her. Navnet på stedet kan stå på første linje.</p>
      <textarea id="sjoforTekst" rows="4" placeholder="Navn på stedet&#10;Adresse" autocomplete="off" autocapitalize="off" spellcheck="false"></textarea>
      <div class="knapper"><button class="kb" data-sjoforlim>Lim inn</button></div>
      <button class="knapp knapp-full sfri-vis" data-sjoforvis>Vis til sjåføren</button>
      ${siste.length ? `<h3>Siste adresser</h3><div class="sfri-siste">${siste.map((t, i) => `<button data-sjofor="s:${i}">${esc(t.replace(/\n/g, ", "))}</button>`).join("")}</div><p class="sno">Lagres bare på denne telefonen.</p>` : ""}
    </div>`;
    o.hidden = false; o.scrollTop = 0;
  }
  function sjoforVisTekst(tekst) {
    const x = sjoforTolk(tekst);
    if (!x) { toast(/https?:/.test(tekst || "") ? "Det var bare en lenke – kopier selve adressen i Google Maps" : "Skriv eller lim inn en adresse først", 3400, "info"); return; }
    const ren = x.navn ? x.navn + "\n" + x.adr : x.adr;
    lagre.set(LS.sjoforSiste, JSON.stringify([ren, ...sjoforSiste().filter((t) => t !== ren)].slice(0, 5)));
    visSjoforKort({ ...x, fri: true });
  }
  function visSjofor(id) {
    if (id === "fri") return visSjoforFri();
    if (id.startsWith("s:")) { const t = sjoforSiste()[Number(id.slice(2))]; if (t) sjoforVisTekst(t); return; }
    if (id.startsWith("a:")) {
      const a = avtLes().find((x) => x.id === id.slice(2)); if (!a || !a.adr) return;
      const x = sjoforTolk(a.adr) || { navn: "", adr: a.adr };
      return visSjoforKort({ navn: x.navn, adr: x.adr, tlf: a.tlf, tlfVi: "Số điện thoại", tlfEn: "Phone", kartq: (x.navn ? x.navn + " " : "") + x.adr });
    }
    if (id.startsWith("r:")) {
      const r = D.restauranter.liste[Number(id.slice(2))]; if (!r) return;
      return visSjoforKort({ navn: (r.sjofor || r).navn, adr: r.sjofor ? r.sjofor.adr : r.adresse, tlf: r.tlf, tlfVi: "Số điện thoại nhà hàng", tlfEn: "Restaurant phone", kartq: r.navn + " " + r.adresse });
    }
    const s = stedEtterId(id); if (!s || !s.hotell) return;
    const h = s.hotell;
    visSjoforKort({ navn: h.navn, adr: h.adr, tlf: hotellNummer(kontaktEtterId(h.kontakt)), tlfVi: "Số điện thoại khách sạn", tlfEn: "Hotel phone", kartq: h.kartq });
  }
  const lukkOverlay = () => { uttaleStopp(); $("#overlay").hidden = true; $("#overlay").innerHTML = ""; };

  // ---------- klikk ----------
  document.addEventListener("click", async (e) => {
    const pk = e.target.closest("[data-angre],[data-pakkskjul],[data-pakkrediger],[data-pny],[data-pnyok],[data-pslett],[data-pflytt],[data-pgslett],[data-pdel],[data-pnullstillegne]");
    if (pk) { e.preventDefault(); pakkKlikk(pk); return; }
    const val = e.target.closest(".valuta");
    if (val) { e.preventDefault(); e.stopPropagation(); valutaBytt(val); return; }
    const gj = e.target.closest("[data-tpgjen]");
    if (gj) {
      const id = gj.dataset.tpgjen;
      if (tpGjenBekreft !== id) { tpGjenBekreft = id; vis(); setTimeout(() => { if (tpGjenBekreft === id) { tpGjenBekreft = null; if (rute().side === "tlogg") vis(); } }, 4000); return; }
      tpGjenBekreft = null; const o = tpLogg().find((x) => x.id === id);
      if (o && Date.now() - o.tp < TP_MAKS && !tpListe().some((x) => x.tp === o.tp)) { tpNy("satt", { tp: o.tp, igjen: o.id, hvem: o.hvem, av: meg() || "" }); toast(`Gjenopprettet: ⟦t3⟧ kl. ${hhmm(o.tp)}`); }
      tpVarsel(); const y = window.scrollY; vis(); window.scrollTo(0, y); return;
    }
    const k = e.target.closest("[data-kortskjerm],[data-kortsvar],[data-tpnaa],[data-tpnull],[data-tpangre],[data-lukkkort]");
    if (k) {
      if (k.dataset.kortskjerm) visHk({ skjerm: k.dataset.kortskjerm });
      else if (k.dataset.kortsvar) { AK.svar = AK.svar === k.dataset.kortsvar ? null : k.dataset.kortsvar; visHk({ beholdRull: true }); }
      else if (k.hasAttribute("data-tpnaa")) {
        const p = tpSett(); visHk({ beholdRull: false }); tpVarsel();
        toastAngre("Klokkeslett registrert", () => { if (tpListe().some((x) => x.id === p.id)) tpNy("angret", { ref: p.id, tp: p.tp }); tpOppdater(); });
      }
      else if (k.hasAttribute("data-tpangre")) { if (tpAngre()) toast("Registreringen er angret"); tpOppdater(); }
      else if (k.hasAttribute("data-tpnull")) { tpFjern(); tpOppdater(); }
      else if (k.hasAttribute("data-lukkkort")) lukkOverlay();
      return;
    }
    const oc = e.target.closest("[data-oppdkopier],[data-oppdfeilkopier],[data-oppdlim],[data-oppdles],[data-oppdavbryt],[data-oppdlegg],[data-oppdav]");
    if (oc) { e.preventDefault(); oppdKlikk(oc); return; }
    const av = e.target.closest("[data-avtny],[data-avt],[data-avttype],[data-avtlagre],[data-avtslett],[data-avtbord],[data-avtbordvalg]");
    if (av) { e.preventDefault(); avtKlikk(av); return; }
    const ut = e.target.closest("[data-uttale]");
    if (ut) { e.preventDefault(); uttale(ut); return; }
    const fr = e.target.closest("[data-frase]");
    if (fr) { e.preventDefault(); uttaleStopp(); visFrase(Number(fr.dataset.frase)); return; }
    const t = e.target.closest("[data-pakkrunde],[data-pakkliste],[data-pakknull],[data-nodsted],[data-kortvariant],[data-dag],[data-laas],[data-hk],[data-stort],[data-kopier],[data-matsted],[data-maal],[data-sort],[data-meg],[data-oppdater],[data-rull],[data-sjofor],[data-sjoforlim],[data-sjoforvis],.lukk");
    if (!t) return;
    if (t.dataset.nodsted) { nodSted = t.dataset.nodsted; vis(); return; }
    if (t.dataset.pakkrunde) { pakkRunde = t.dataset.pakkrunde; vis(); return; }
    if (t.dataset.pakkliste) { pakkListe = t.dataset.pakkliste; vis(); return; }
    if (t.dataset.pakknull) {
      if (!t.dataset.bekreft) { t.dataset.bekreft = "1"; t.textContent = D.synk ? "Trykk igjen – felles lister nullstilles for alle" : "Trykk igjen for å fjerne alle kryss"; t.classList.add("knapp-rod"); setTimeout(() => { if (t.isConnected) vis(); }, 4000); return; }
      const a = pakkAktiv();
      for (const [k] of a.lister) synkSett({ k: "n", r: t.dataset.pakknull, l: k === "meg" ? a.m : k });
      toast("Kryssene er fjernet"); vis(); return;
    }
    if (t.dataset.dag !== undefined) byttDag(Number(t.dataset.dag));
    else if (t.hasAttribute("data-laas")) { lagre.del(LS.nokkel); location.hash = ""; location.reload(); }
    else if (t.dataset.kortvariant) visHk({ variant: t.dataset.kortvariant, beholdRull: true });
    else if (t.hasAttribute("data-hk")) {
      visHk({ aapne: true, skjerm: t.dataset.hk === "nod" ? "nod" : "restaurant" });
    } else if (t.dataset.stort) {
      const o = $("#overlay"); o.className = "overlay bilde";
      o.innerHTML = `<button class="lukk">Lukk</button><img src="${D.bilder[t.dataset.stort]}" alt="">`; o.hidden = false;
    } else if (t.dataset.kopier) {
      e.preventDefault();
      try { await navigator.clipboard.writeText(t.dataset.kopier); toast("Kopiert: " + t.dataset.kopier); } catch { toast(t.dataset.kopier); }
    } else if (t.dataset.matsted) { location.hash = "#/mat/" + t.dataset.matsted; }
    else if (t.dataset.maal) { matMaal = t.dataset.maal; vis(); }
    else if (t.dataset.sort) { matSort = t.dataset.sort; vis(); }
    else if (t.dataset.meg) { lagre.set(LS.meg, t.dataset.meg === meg() ? "" : t.dataset.meg); vis(); }
    else if (t.dataset.sjofor) visSjofor(t.dataset.sjofor);
    else if (t.hasAttribute("data-sjoforvis")) sjoforVisTekst(($("#sjoforTekst") || {}).value);
    else if (t.hasAttribute("data-sjoforlim")) {
      const felt = $("#sjoforTekst");
      try { const txt = await navigator.clipboard.readText(); if (felt && txt) { felt.value = txt; felt.focus(); } else toast("Utklippstavlen er tom", 2600, "info"); }
      catch { if (felt) felt.focus(); toast("Hold fingeren i feltet og velg «Lim inn»", 3200, "info"); }
    }
    else if (t.dataset.rull) { const el = document.getElementById(t.dataset.rull); if (el) { el.open = true; el.scrollIntoView({ behavior: "smooth", block: "start" }); } }
    else if (t.hasAttribute("data-oppdater")) { hentNyeste(t);
    } else if (t.classList.contains("lukk")) lukkOverlay();
  });
  document.addEventListener("change", (e) => {
    if (e.target.id === "avtRest" && AV) { avtFelt(); const r = D.restauranter.liste[Number(e.target.value)]; AV.fri = e.target.value === "fri"; if (r) { AV.rnavn = r.navn; AV.rsted = r.sted; } return visAvtSkjema(AV); }
    const f = e.target.closest("[data-pnavn],[data-pmerk],[data-pgtittel]");
    if (f) { pakkFeltEndret(f); return; }
    const hk = e.target.closest("[data-husk]");
    if (hk) {
      synkSett({ k: "x", r: "husk", l: "felles", n: hk.dataset.husk, v: hk.checked ? 1 : 0, hvem: meg() || "" });
      const y = window.scrollY; vis(); window.scrollTo(0, y);
      if (hk.checked) toastAngre("Gjort – vises for hele familien", () => { synkSett({ k: "x", r: "husk", l: "felles", n: hk.dataset.husk, v: 0, hvem: meg() || "" }); vis(); window.scrollTo(0, y); });
      return;
    }
    const cb = e.target.closest("[data-pakk]"); if (!cb) return;
    synkSett({ k: "x", r: cb.dataset.pakkrundeId, l: cb.dataset.pakklisteId, n: cb.dataset.pakk, v: cb.checked ? 1 : 0 });
    cb.closest(".pakkrad").classList.toggle("ok", cb.checked);
    if (!$("#pakkTeller")) { const det = cb.closest("details"), y = window.scrollY; vis(); window.scrollTo(0, y); if (det) { const ny = $("details.romsjekk"); if (ny && $$("details.romsjekk input:not(:checked)").length) ny.open = true; } return; }
    const alle = $$("[data-pakk]"), n = alle.filter((x) => x.checked).length;
    $("#pakkTeller").textContent = `${n} av ${alle.length} pakket`;
    $(".fbar span").style.width = `${Math.round(100 * n / alle.length)}%`;
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !$("#overlay").hidden) lukkOverlay();
    if (e.key === "Enter" && e.target.id === "avtTekst" && e.target.tagName === "INPUT") { e.preventDefault(); avtLagre(); return; }
    if (e.key === "Enter" && e.target.id === "pakkNyInput") { e.preventDefault(); pakkNyLagre(e.target); }
    else if (e.key === "Enter" && e.target.closest("[data-pnavn],[data-pmerk],[data-pgtittel]")) { e.preventDefault(); e.target.blur(); }
    else if (e.key === "Escape" && e.target.id === "pakkNyInput") { pakkNy = null; vis(); }
  });
  function pakkNyLagre(inp) {
    if (inp.hasAttribute("data-pnygruppe")) {
      const t = inp.value.trim(); if (!t) { pakkNy = null; vis(); return; }
      pakkEndre((g) => { g.push({ tittel: t, ting: [] }); pakkNy = g.length - 1; });
      vis(); fokusNy(); return;
    }
    const gi = Number(inp.dataset.pnyting);
    if (pakkLeggTil(gi, inp.value)) { vis(); fokusNy(); toast("Lagt til"); } else { pakkNy = null; vis(); }
  }
  function pakkFeltEndret(f) {
    const v = f.value.trim();
    if (f.dataset.pgtittel !== undefined) { const gi = Number(f.dataset.pgtittel); if (v) pakkEndre((g) => { g[gi].tittel = v; }); return; }
    const [gi, ti] = (f.dataset.pnavn || f.dataset.pmerk).split(":").map(Number);
    const a = pakkAktiv();
    pakkEndre((g) => {
      const t = g[gi].ting[ti];
      if (f.dataset.pmerk !== undefined) { if (v) t.merk = v; else delete t.merk; return; }
      if (!v) return;
      if (t.under) { t.under = v; return; }
      if (t.navn !== v) { pakkFlyttKryss(a.nokkel, t.navn, v); t.navn = v; }
    });
  }
  function pakkKlikk(t) {
    if (t.hasAttribute("data-angre")) { const fn = angreFn; angreFn = null; toastSkjul(); if (fn) { fn(); vis(); } return; }
    if (t.hasAttribute("data-pakkskjul")) { lagre.set("vn.pakkSkjul", pakkSkjul() ? "0" : "1"); const y = window.scrollY; vis(); window.scrollTo(0, y); return; }
    if (t.hasAttribute("data-pakkrediger")) { pakkRediger = !pakkRediger; pakkNy = null; vis(); if (!pakkRediger) synkSnart(100); return; }
    if (t.dataset.pny !== undefined) { pakkNy = t.dataset.pny === "gruppe" ? "gruppe" : Number(t.dataset.pny); vis(); fokusNy(); return; }
    if (t.dataset.pnyok !== undefined) { const inp = $("#pakkNyInput"); if (inp) pakkNyLagre(inp); return; }
    if (t.dataset.pslett) {
      const [gi, ti] = t.dataset.pslett.split(":").map(Number);
      const a = pakkAktiv(), for_ = kopi(a.grupper), tekst = a.grupper[gi].ting[ti].navn || a.grupper[gi].ting[ti].under;
      pakkEndre((g) => { g[gi].ting.splice(ti, 1); });
      vis(); toastAngre(`«${tekst}» er fjernet`, () => pakkLagreGrupper(a.nokkel, for_)); return;
    }
    if (t.dataset.pflytt) {
      const [gi, ti, r] = t.dataset.pflytt.split(":").map(Number);
      pakkEndre((g) => {
        const ting = g[gi].ting, [x] = ting.splice(ti, 1), ny = ti + r;
        if (ny < 0 && gi > 0) g[gi - 1].ting.push(x);
        else if (ny >= ting.length + 1 && gi < g.length - 1) g[gi + 1].ting.unshift(x);
        else ting.splice(Math.max(0, Math.min(ny, ting.length)), 0, x);
      });
      vis(); return;
    }
    if (t.dataset.pgslett !== undefined) {
      const gi = Number(t.dataset.pgslett), a = pakkAktiv(), for_ = kopi(a.grupper), gr = a.grupper[gi];
      pakkEndre((g) => { g.splice(gi, 1); });
      vis(); toastAngre(`Gruppen «${gr.tittel}» er fjernet`, () => pakkLagreGrupper(a.nokkel, for_)); return;
    }
    if (t.hasAttribute("data-pdel")) { pakkDel(); return; }
    if (t.hasAttribute("data-pnullstillegne")) {
      if (!t.dataset.bekreft) { t.dataset.bekreft = "1"; t.textContent = "Trykk igjen – dine endringer forsvinner"; t.classList.add("knapp-rod"); setTimeout(() => { if (t.isConnected) vis(); }, 4000); return; }
      const a = pakkAktiv(), for_ = egneLes()[a.nokkel]; pakkLagreGrupper(a.nokkel, null);
      pakkRediger = false; vis(); toastAngre("Lista er tilbake til originalen", () => pakkLagreGrupper(a.nokkel, for_)); return;
    }
  }

  // ---------- nettstatus ----------
  const nett = () => { $("#nett").hidden = navigator.onLine; };
  window.addEventListener("online", nett); window.addEventListener("offline", nett);

  // ---------- rask oppstart: appen vises fra lagret kopi, service workeren sier fra når noe nytt er hentet ----------
  let K = null, nyVenter = false;
  function visOppdLinje() {
    if ($("#oppdlinje")) return;
    const b = document.createElement("button"); b.id = "oppdlinje"; b.className = "oppdlinje"; b.type = "button";
    b.innerHTML = `<span class="ol-merke" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 4.5v10M7.5 10.5 12 15l4.5-4.5"/><path d="M5.5 19.5h13"/></svg></span><span class="ol-tekst"><b>Ny versjon er klar</b><span>Trykk for å oppdatere</span></span><svg class="ol-pil" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>`;
    requestAnimationFrame(() => requestAnimationFrame(() => b.classList.add("inn")));
    b.addEventListener("click", () => { b.disabled = true; b.querySelector(".ol-tekst").innerHTML = "<b>Oppdaterer …</b><span>Appen starter på nytt</span>"; b.classList.add("henter"); try { sessionStorage.setItem("vn.hentet", JSON.stringify({ v: APP.versjon, r: D ? oppdatertTekst() : "" })); } catch {} setTimeout(() => location.reload(), 150); });
    document.body.appendChild(b);
  }
  function trygtAaTegne() {
    if (pakkRediger || pakkNy !== null || !$("#overlay").hidden) return false;
    const f = document.activeElement; return !(f && f.matches && f.matches("input,textarea,select"));
  }
  async function nyReiseinfo() {
    if (!D || !K) { nyVenter = true; return; }
    nyVenter = false;
    let ny;
    try { const p = await hentPakke(); ny = await dekrypter(K, p); } catch { visOppdLinje(); return; } // f.eks. nytt passord: last på nytt
    D0 = D = ny; D = oppdBruk(D0); tpVarsel();
    if (trygtAaTegne()) { const y = window.scrollY; vis(); window.scrollTo(0, y); }
    varsel({ type: "info", tittel: "Ny reiseinfo", tekst: "Hentet i bakgrunnen", chips: [`<span class="vs-chip ny"><small>Reiseinfo</small><b>${esc(reiseinfoKort())}</b></span>`], ms: 4200 });
  }
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.addEventListener("message", (e) => {
      const m = e.data || {}; if (m.t !== "ny") return;
      if (m.fil === "data.enc") nyReiseinfo(); else if (["app.js", "stil.css", "index.html", "sw.js"].includes(m.fil)) visOppdLinje();
    });
  }

  // «Hent nyeste versjon»: knappen svarer med én gang (grå, snurrende ikon, ny tekst). Filene hentes fra nett FØR appen
  // starter på nytt – mislykkes det, beholdes appen som den er (ingen tom cache uten nett).
  const HENT_FILER = ["./", "index.html", "app.js", "stil.css", "data.enc"];
  async function hentNyeste(knapp) {
    if (knapp.dataset.henter) return;
    if (!navigator.onLine) { toast("Krever nett – prøv igjen når du er på nett", 2800, "feil"); return; }
    knapp.dataset.henter = "1"; knapp.disabled = true; knapp.classList.add("henter");
    const lt = knapp.querySelector(".ltekst"), gammel = lt ? lt.innerHTML : "";
    if (lt) lt.innerHTML = `Henter nyeste versjon …<small>Appen starter på nytt av seg selv</small>`;
    const t0 = Date.now(), for_ = { v: APP.versjon, r: D ? oppdatertTekst() : "" };
    try {
      const reg = navigator.serviceWorker && await navigator.serviceWorker.getRegistration();
      if (reg) {
        await reg.update().catch(() => {});
        const ny = reg.installing || reg.waiting;
        if (ny) await new Promise((ok) => { const f = () => { if (ny.state === "activated" || ny.state === "redundant") ok(); }; ny.addEventListener("statechange", f); f(); setTimeout(ok, 10000); });
      }
      const svar = await Promise.all(HENT_FILER.map((f) => fetch(f, { cache: "reload", headers: { "x-vn-hent": "1" } })));
      if (svar.some((r) => !r.ok)) throw new Error("hent");
      await new Promise((ok) => setTimeout(ok, Math.max(0, 700 - (Date.now() - t0)))); // så knappen rekker å synes
      try { sessionStorage.setItem("vn.hentet", JSON.stringify(for_)); } catch {}
      location.reload();
    } catch {
      delete knapp.dataset.henter; knapp.disabled = false; knapp.classList.remove("henter"); if (lt) lt.innerHTML = gammel;
      varsel({ type: "feil", tittel: "Fikk ikke hentet", tekst: "Prøv igjen når nettet er bedre – appen er som før", ms: 4800 });
    }
  }
  function hentetMelding() {
    let f = null; try { f = sessionStorage.getItem("vn.hentet"); sessionStorage.removeItem("vn.hentet"); } catch {}
    if (!f) return;
    let o = null; try { o = JSON.parse(f); } catch {}
    if (!o || typeof o !== "object") o = {};
    const naa = oppdatertTekst(), nyApp = typeof o.v === "number" ? o.v !== APP.versjon : true, nyInfo = o.r ? o.r !== naa : false;
    const appChip = `<span class="vs-chip${nyApp ? " ny" : ""}"><small>App</small>${nyApp && o.v ? `<s>${o.v}</s>${VS_PIL}` : ""}<b>${APP.versjon}</b></span>`;
    const infoChip = `<span class="vs-chip${nyInfo ? " ny" : ""}"><small>Reiseinfo</small><b>${esc(reiseinfoKort())}</b></span>`;
    if (!nyApp && !nyInfo) { varsel({ type: "nyeste", tittel: "Du har nyeste versjon", tekst: "Ingenting nytt å hente akkurat nå", chips: [appChip, infoChip], ms: 3800 }); return; }
    const nytt = nyApp ? Object.keys(NYTT).map(Number).filter((v) => v > (o.v || APP.versjon - 1) && v <= APP.versjon).sort((a, b) => b - a).slice(0, 3).map((v) => NYTT[v]) : [];
    varsel({ type: "ok", tittel: nyApp ? "Appen er oppdatert" : "Reiseinfoen er oppdatert", tekst: nyApp && nyInfo ? "Ny app og ny reiseinfo er på plass" : nyApp ? "Du har nå den nyeste appen" : "Siste endringer i planen er hentet", chips: [appChip, infoChip], nytt, ms: nytt.length ? 6500 : 4800 });
  }

  // ---------- oppstart ----------
  async function lasOpp(p, n) {
    D0 = D = await dekrypter(n, p); K = n; synkMigrer(); D = oppdBruk(D0); tpMigrer(); $("#faner").hidden = false; vis(); tpVarsel(); brukStart();
    try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {}); } catch {}
    synk();
    hentetMelding();
    hentKurs().then((ny) => { if (ny && rute().side === "penger") vis(); });
    if (nyVenter) nyReiseinfo();
  }
  window.addEventListener("online", () => { if (D) synk(); });
  window.addEventListener("offline", () => synkStatus("vent"));
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && D) synk(); });
  // Hvert 10. s mens nødkortet er åpent (tidspunktet), ellers hvert 30. s – et tomt søk i databasen er billig.
  let synkTikk = 0;
  setInterval(() => {
    if (!D || document.visibilityState !== "visible") return;
    synkTikk++; const nodkort = !$("#overlay").hidden && AK.skjerm === "nod";
    if (nodkort || synkTikk % 3 === 0) synk();
  }, 10000);
  window.addEventListener("hashchange", () => { if (D && ["pakk", "tlogg", "stat"].includes(rute().side)) { tpGjenBekreft = null; if (rute().side === "stat") B.tving = true; synk(); } });
  window.addEventListener("online", () => { if (D) hentKurs().then((ny) => { if (ny && rute().side === "penger") vis(); }); });
  async function oppstart() {
    nett();
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
    let p;
    try { p = await hentPakke(); }
    catch { $("#laasFeil").textContent = "Fikk ikke lastet reisedata. Åpne appen én gang med nett først."; return; }
    const m = location.hash.match(/[#&]k=([^&]+)/);
    if (m) {
      history.replaceState(null, "", location.pathname + location.search + "#/idag");
      try { const n = await nokkelFraPassord(decodeURIComponent(m[1]).trim().toLowerCase(), p); await lasOpp(p, n); await huskNokkel(n, p).catch(() => {}); return; }
      catch { $("#laasFeil").textContent = "Lenka inneholdt feil passord."; }
    }
    const lagret = await lagretNokkel(p);
    if (lagret) { try { await lasOpp(p, lagret); return; } catch { lagre.del(LS.nokkel); } }
    $("#laasSkjema").addEventListener("submit", async (e) => {
      e.preventDefault();
      const knappEl = $("#laasKnapp"), husk = $("#husk").checked;
      knappEl.disabled = true; knappEl.textContent = "Låser opp …"; $("#laasFeil").textContent = "";
      try {
        const n = await nokkelFraPassord($("#passord").value.trim().toLowerCase(), p);
        await lasOpp(p, n);
        if (husk) await huskNokkel(n, p).catch(() => {});
      } catch { $("#laasFeil").textContent = "Feil passord."; knappEl.disabled = false; knappEl.textContent = "Lås opp"; }
    });
  }
  oppstart();
})();
