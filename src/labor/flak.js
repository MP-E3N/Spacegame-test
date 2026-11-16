// ZWECK: Flak-Labor (Runde 6) — Demo ohne Schiff: 6 Flaktürme auf einem Prüfstand gegen Zieldrohnen.
// ABLAUF: Renderer/Himmel → Prüfstand + Flak-Grafik + Drohnen-Platzhalter → feste Sim 60 Hz (src/sim/flaklabor.js)
//         + interpolierte Darstellung je Bild.
// REGEL: wie main.js — Sim kennt keine Grafik; die Grafik liest nur. Ereignisse (Schüsse, Detonationen) gelten je
//        Sim-Schritt und werden deshalb nach JEDEM Schritt an die Grafik gegeben (grafik.nachSchritt).
import * as THREE from 'three';
import { erstelleRenderer } from '../grafik/renderer.js';
import { erstelleFlakGrafik, GRAFIK_REGLER } from '../grafik/waffen/flakgrafik.js';
import { STREU_REGLER } from '../sim/ki/turmziel.js';
import { erstelleReglerfeld } from './regler.js';
import { erstelleFlakLabor } from '../sim/flaklabor.js';
import { STANDARD_SEKTOR } from '../sim/waffen/lafetten.js';
import { erstellePruefstand } from './pruefstand.js';
import { erstelleDrohnenGrafik } from './drohnen.js';

const SCHRITT = 1 / 60;
const SCHIRM = { min: 400, max: 2000, stufe: 100 };
// Mündungsgeschwindigkeit zum Umschalten (Runde 8, Bewertung im Protokoll): reale Flak 760–1150 m/s, im All ohne Abbremsen.
const V0_STUFEN = [
  { v: 620, art: 'Film (bisher)' },
  { v: 820, art: 'schwere Flak' },
  { v: 1000, art: '40-mm-Flak' },
  { v: 1100, art: 'Nahbereichsabwehr' },
];
const V0_START = 1100; // Runde 9, Nutzer: „standardmäßig die höchste Projektilgeschwindigkeit für die PDCs“

const bild = erstelleRenderer(document.getElementById('leinwand'));
bild.camera.near = 3; // WARUM: Kampfentfernung bis 2 km — near 1 gäbe zu grobe Tiefe (Lichtsetzer R6)
bild.camera.updateProjectionMatrix();
bild.setzeSchattenRadius(60);
bild.folgeSchatten(new THREE.Vector3(0, 0, 0)); // Prüfstand steht still → Schatten einmal setzen, kein Flimmern

erstellePruefstand(bild.scene);
const grafik = erstelleFlakGrafik(bild.scene, bild.camera);
const drohnenGrafik = erstelleDrohnenGrafik(bild.scene, 16);
const labor = erstelleFlakLabor();
// folgen (Runde 7, Nutzerwunsch): Flak-Schirm zieht mit den Gegnern mit; +/− setzt einen festen Abstand (folgen aus), F schaltet um.
// v0 (Runde 8): gilt für neu abgefeuerte Granaten; die KI rechnet den Vorhalt mit dem v0 der Türme.
// streu (Runde 11): Schieberegler für die Streuung — Standardwerte aus der KI-Tabelle (eine Quelle), Sim liest sie je Takt.
const befehl = { modus: 'sperrfeuer', feuerFrei: true, folgen: true, schirmAbstand: 800, v0: V0_START, sektor: { ...STANDARD_SEKTOR },
  streu: Object.fromEntries(Object.entries(STREU_REGLER).map(([k, r]) => [k, r.standard])) };

// ---------------- Kamera ----------------
// batterie: steht hinter dem Prüfstand, Maus = umsehen, Rad = Zoom (Brennweite).
// uebersicht: kreist um den Kampfraum vor der Batterie, Maus = kreisen, Rad = Abstand.
const kam = {
  modus: 'batterie',
  batterie: { pos: new THREE.Vector3(-24, 12, -36), gier: 0, nick: 0, fov: 62 },
  uebersicht: { ziel: new THREE.Vector3(0, 280, 650), gier: -2.3, nick: 0.32, abstand: 1700 },
};
{ // Startblick der Batterie-Kamera: über die Türme hinweg auf den Flak-Schirm (vor dem Gasriesen in +Z)
  const d = new THREE.Vector3(0, 190, 800).sub(kam.batterie.pos).normalize();
  kam.batterie.gier = Math.atan2(d.x, d.z); kam.batterie.nick = Math.asin(d.y);
}
const blick = new THREE.Vector3();
function kameraSetzen(maus) {
  const c = bild.camera;
  if (kam.modus === 'batterie') {
    const b = kam.batterie;
    b.gier -= maus.dx * 0.004; b.nick = Math.max(-0.6, Math.min(1.45, b.nick - maus.dy * 0.004));
    if (maus.rad) { b.fov = Math.max(14, Math.min(70, b.fov * Math.pow(1.1, maus.rad))); }
    if (c.fov !== b.fov) { c.fov = b.fov; c.updateProjectionMatrix(); }
    c.position.copy(b.pos);
    blick.set(Math.sin(b.gier) * Math.cos(b.nick), Math.sin(b.nick), Math.cos(b.gier) * Math.cos(b.nick)).add(b.pos);
    c.lookAt(blick);
  } else {
    const u = kam.uebersicht;
    u.gier -= maus.dx * 0.004; u.nick = Math.max(-0.3, Math.min(1.4, u.nick + maus.dy * 0.004));
    if (maus.rad) u.abstand = Math.max(300, Math.min(3800, u.abstand * Math.pow(1.12, maus.rad)));
    if (c.fov !== 55) { c.fov = 55; c.updateProjectionMatrix(); }
    c.position.set(Math.sin(u.gier) * Math.cos(u.nick), Math.sin(u.nick), Math.cos(u.gier) * Math.cos(u.nick))
      .multiplyScalar(u.abstand).add(u.ziel);
    c.lookAt(u.ziel);
  }
}

// ---------------- Eingabe ----------------
const einmal = new Set();
const maus = { dx: 0, dy: 0, rad: 0 };
let ziehen = false;
addEventListener('keydown', (e) => { if (!e.repeat || e.code.startsWith('Numpad') || e.code === 'Equal' || e.code === 'Minus') einmal.add(e.code); if (e.code === 'Space') e.preventDefault(); });
addEventListener('pointerdown', (e) => { if (e.button === 0 && e.target?.id === 'leinwand') { ziehen = true; e.target.setPointerCapture?.(e.pointerId); document.body.classList.add('zieht'); } });
addEventListener('pointerup', () => { ziehen = false; document.body.classList.remove('zieht'); });
addEventListener('pointercancel', () => { ziehen = false; document.body.classList.remove('zieht'); });
addEventListener('blur', () => { ziehen = false; });
addEventListener('pointermove', (e) => { if (ziehen) { maus.dx += e.movementX; maus.dy += e.movementY; } });
// Knöpfe des Bedienfelds: data-taste = derselbe Code wie die Taste → ein Weg für Taste und Klick (bedienen()).
// WARUM blur: sonst würde die Leertaste den zuletzt geklickten Knopf noch einmal auslösen.
document.getElementById('hud').addEventListener('click', (e) => {
  const k = e.target.closest?.('[data-taste]');
  if (k) { einmal.add(k.dataset.taste); k.blur(); }
});
addEventListener('wheel', (e) => { if (e.target?.id === 'leinwand') maus.rad += Math.sign(e.deltaY); }, { passive: true });

// ---------------- Anzeige ----------------
const $ = (id) => document.getElementById(id);
const el = { modus: $('modus'), feuer: $('feuer'), schirm: $('schirm'), granaten: $('granaten'), wolken: $('wolken'), schussrate: $('schussrate'),
  treffer: $('treffer'), abschuesse: $('abschuesse'), nah: $('nahbereich'), spuren: $('spuren'), bildzeit: $('bildzeit'), meldung: $('meldung'), bedienung: $('bedienung'), bedienungAuf: $('bedienung-auf'),
  kFeuer: $('k-feuer'), kSperr: $('k-sperr'), kZiel: $('k-ziel'), kFolgen: $('k-folgen'), kPause: $('k-pause'), kRegler: $('k-regler'), kKamera: $('k-kamera'), kV0: $('k-v0') };
// Stufen-Knöpfe der Mündungsgeschwindigkeit
const v0Knoepfe = V0_STUFEN.map((s) => {
  const k = document.createElement('button');
  k.dataset.taste = 'V0:' + s.v;
  k.innerHTML = '<span class="zahl">' + s.v + ' m/s</span><span class="art">' + s.art + '</span>';
  el.kV0.appendChild(k);
  return k;
});
// ---------------- Reglerfeld (Runde 11) ----------------
// Nutzer: „Schieberegler … mit Werten, damit wir diese als Konfig nehmen können“. Bereiche/Standard kommen aus
// STREU_REGLER (KI) und GRAFIK_REGLER (Grafik); hier stehen nur Anzeigename, Schrittweite, Einheit, Erklärung.
const R_NAMEN = {
  sperrQuer: ['Sperrfeuer: Streuung quer', 5, 'm', 'Radius quer zur Schusslinie um jeden Musterpunkt'],
  sperrTiefe: ['Sperrfeuer: Lagendicke', 5, 'm', 'Streuung längs der Schusslinie (Tiefe jeder Lage)'],
  raumZuschlag: ['Sperrfeuer: Raumgröße', 5, 'm', 'Zuschlag zur Gruppenstreuung → halbe Breite/Höhe des Raums'],
  lagenAnteil: ['Sperrfeuer: Lagenabstand', 0.05, '×', 'Abstand der 3 Tiefenlagen (vor / auf / hinter)'],
  ziel: ['Zielfeuer: Streuung', 5, 'm', 'Ellipsoid um den Vorhaltepunkt (quer = tief)'],
  nahMax: ['Nahbereich: Streuung max.', 1, 'm', 'Obergrenze unter 500 m (min mit 0,10 · Entfernung)'],
  fuellen: ['Füll-Flak (nur Optik)', 0.05, '×', 'Rein visuelle Wolken zwischen den Detonationen und in den Räumen'],
  zusatzAnzahl: ['Zusatz-Explosionen', 1, '', 'Visuelle Explosionen je Detonation'],
  zusatzWeite: ['Zusatz-Explosionen: Weite', 0.05, '×', 'Versatz der Zusatz-Explosionen'],
  explosionDauer: ['Explosion: Dauer (Glut)', 0.05, '×', 'Wie lange der Glutkern leuchtet'],
  lebenFaktor: ['Rauch: Lebensdauer', 0.05, '×', 'Wie lange die Rauchwolken stehen'],
  rauchGroesse: ['Rauch: Größe', 0.05, '×', 'Größe der Rauchwolken'],
  rauchDeckkraft: ['Rauch: Deckkraft', 0.05, '', 'Wie dicht der Rauch ist'],
};
const eintraegeAus = (tabelle) => Object.entries(tabelle).map(([feld, r]) => {
  const [name, schritt, einheit, hilfe] = R_NAMEN[feld] ?? [feld, (r.max - r.min) / 100, '', ''];
  return { feld, name, min: r.min, max: r.max, schritt, einheit, hilfe };
});
const reglerfeld = erstelleReglerfeld({
  wurzel: document.getElementById('regler-gruppen'),
  gruppen: [
    { titel: 'Streuung (Simulation)', schluessel: 'streu', ziel: () => befehl.streu, eintraege: eintraegeAus(STREU_REGLER) },
    { titel: 'Optik (nur Grafik)', schluessel: 'grafik', ziel: () => grafik.regler, eintraege: eintraegeAus(GRAFIK_REGLER) },
  ],
});
document.getElementById('regler-standard').addEventListener('click', (e) => { reglerfeld.standard(); e.currentTarget.blur(); meldung('Regler auf Standard (Runde 10)'); });
document.getElementById('regler-kopieren').addEventListener('click', (e) => {
  const text = JSON.stringify({ ...reglerfeld.konfig(), v0: befehl.v0 }, null, 2);
  const feld = document.getElementById('regler-konfig');
  feld.value = text; feld.classList.remove('versteckt');
  navigator.clipboard?.writeText(text).then(() => meldung('Konfig in die Zwischenablage kopiert'), () => meldung('Konfig steht unten im Feld — bitte selbst kopieren'));
  e.currentTarget.blur();
});
const reglerInfo = document.getElementById('regler-info');
/** Kennzahlen unter den Reglern: Vorrat, gedeckelte Granaten (Waffen-Deckel kürzt die Streuung), verworfene Füllwolken. */
function reglerZahlen() {
  const z = grafik.zaehler, g = labor.flak.geschosse;
  const anteil = labor.zaehler.schuesse ? Math.round((100 * (g.gedeckelt ?? 0)) / labor.zaehler.schuesse) : 0;
  reglerInfo.textContent = 'Wolken ' + (z.belegt ?? z.wolken) + ' / ' + (grafik.maxWolken ?? '–') + ' · gedeckelt ' + anteil + ' % · Füllung verworfen '
    + (z.fuellVerworfen ?? 0) + ' · überschrieben ' + (z.ueberschrieben ?? 0) + ' · Balance gilt für die Standardwerte';
}

/** Knopf-Zustände (an/aus) und Beschriftungen nachziehen. */
function knoepfe() {
  el.kFeuer.classList.toggle('an', befehl.feuerFrei);
  el.kFeuer.lastChild.textContent = befehl.feuerFrei ? 'Feuer frei' : 'Feuer halt';
  el.kSperr.classList.toggle('an', befehl.modus === 'sperrfeuer');
  el.kZiel.classList.toggle('an', befehl.modus === 'zielfeuer');
  el.kFolgen.classList.toggle('an', befehl.folgen);
  el.kFolgen.lastChild.textContent = befehl.folgen ? 'folgt den Zielen' : 'fest (F = wieder folgen)';
  el.kPause.classList.toggle('an', pause);
  el.kRegler.classList.toggle('an', !document.getElementById('regler').classList.contains('versteckt'));
  el.kKamera.lastChild.textContent = kam.modus === 'batterie' ? 'Kamera Prüfstand (→ Übersicht)' : 'Kamera Übersicht (→ Prüfstand)';
  V0_STUFEN.forEach((s, i) => v0Knoepfe[i].classList.toggle('an', s.v === befehl.v0));
}
const alt = {};
const setze = (k, t) => { if (alt[k] !== t) { el[k].textContent = t; alt[k] = t; } };
let meldungBis = 0;
function meldung(text) { el.meldung.textContent = text; el.meldung.classList.add('sichtbar'); meldungBis = performance.now() + 2200; }
const rate = { zeit: 0, schuesse: 0, wert: 0 };
let bildMittel = 16, hudUhr = 0;
function hud(dt) {
  rate.zeit += dt;
  if (rate.zeit >= 1) { rate.wert = (labor.zaehler.schuesse - rate.schuesse) / rate.zeit; rate.schuesse = labor.zaehler.schuesse; rate.zeit = 0; }
  bildMittel += (dt * 1000 - bildMittel) * 0.05;
  if ((hudUhr += dt) < 0.2) return;
  hudUhr = 0;
  knoepfe(); reglerZahlen();
  setze('modus', befehl.modus === 'sperrfeuer' ? 'SPERRFEUER' : 'ZIELFEUER');
  setze('feuer', befehl.feuerFrei ? 'FEUER FREI' : 'FEUER HALT');
  el.feuer.classList.toggle('halt', !befehl.feuerFrei);
  setze('schirm', schirmText());
  // WARUM lage.nahbereich statt Anzahl: der Alarm läuft 0,5 s nach (Hysterese der KI) — so endet die Anzeige mit der
  // Leuchtspur und nicht vorher (Befund Prüfer R7).
  const lage = labor.ki.lage, nah = lage?.eindringlinge?.length ?? 0, alarm = !!lage?.nahbereich;
  setze('nah', alarm ? 'NAHBEREICH' + (nah ? ' — ' + nah + (nah === 1 ? ' Eindringling' : ' Eindringlinge') : '') : '');
  el.nah.classList.toggle('an', alarm);
  setze('spuren', String(grafik.zaehler.spuren));
  setze('granaten', String(zaehleGranaten()));
  setze('wolken', String(grafik.zaehler.wolken));
  setze('schussrate', String(Math.round(rate.wert)));
  setze('treffer', Math.round(labor.zaehler.schaden) + ' HP');
  setze('abschuesse', String(labor.zaehler.abschuesse));
  setze('bildzeit', bildMittel.toFixed(1) + ' ms');
  if (meldungBis && performance.now() > meldungBis) { el.meldung.classList.remove('sichtbar'); meldungBis = 0; }
}
/** Schirm-Anzeige: im Folgen-Modus die Abstände der (bis zu 2) Schirme aus der KI, sonst der feste Wert. */
function schirmText() {
  if (befehl.modus !== 'sperrfeuer') return 'Zünder nach Ziel';
  if (!befehl.folgen) return 'fest · ' + befehl.schirmAbstand + ' m';
  const sch = labor.ki.lage?.schirme;
  if (!sch?.length) return 'folgt · –';
  let t = 'folgt · ';
  for (let i = 0; i < sch.length; i++) t += (i ? ' / ' : '') + Math.round(sch[i].abstand / 10) * 10;
  return t + ' m';
}
/** Aktueller Abstand des (ersten) KI-Schirms, auf 10 m gerundet, im erlaubten Bereich. */
function aktuellerAbstand() {
  const a = labor.ki.lage?.schirme?.[0]?.abstand;
  return a ? Math.max(SCHIRM.min, Math.min(SCHIRM.max, Math.round(a / 10) * 10)) : befehl.schirmAbstand;
}
function zaehleGranaten() { return labor.flak.geschosse.anzahlAktiv; }

// ---------------- Hauptschleife ----------------
let zeit = 0, rest = 0, zuletzt = performance.now(), pause = false, gelesen = 0;
function bedienen() {
  if (einmal.has('Space')) { befehl.feuerFrei = !befehl.feuerFrei; meldung(befehl.feuerFrei ? 'Feuer frei' : 'Feuer halt'); }
  if (einmal.has('Digit1') || einmal.has('Numpad1')) { befehl.modus = 'sperrfeuer'; meldung(befehl.folgen ? 'Sperrfeuer — Raum vor und um die Drohnengruppen sättigen' : 'Sperrfeuer — Flak-Schirm fest auf ' + befehl.schirmAbstand + ' m'); }
  if (einmal.has('Digit2') || einmal.has('Numpad2')) { befehl.modus = 'zielfeuer'; meldung('Zielfeuer — Türme wählen Ziele, Zünder nach Vorhalt'); }
  const plus = einmal.has('Equal') || einmal.has('NumpadAdd') || einmal.has('BracketRight');
  const minus = einmal.has('Minus') || einmal.has('NumpadSubtract') || einmal.has('Slash');
  if (plus || minus) {
    // + = Schirm näher heran (Nutzersicht „enger ziehen“), − = weiter hinaus
    // Beim ersten Druck aus dem Folgen-Modus: vom aktuellen Schirm der KI ausgehen (kein Sprung)
    const start = befehl.folgen ? aktuellerAbstand() : befehl.schirmAbstand;
    befehl.folgen = false;
    befehl.schirmAbstand = Math.max(SCHIRM.min, Math.min(SCHIRM.max, start + (plus ? -SCHIRM.stufe : SCHIRM.stufe)));
    meldung('Flak-Schirm fest auf ' + befehl.schirmAbstand + ' m (F = wieder folgen)');
  }
  if (einmal.has('KeyF')) {
    // Folgen → fest: Wand bleibt, wo sie ist (Abstand hier, Richtung merkt sich die KI) — Befund Prüfer R7
    if (befehl.folgen) befehl.schirmAbstand = aktuellerAbstand();
    befehl.folgen = !befehl.folgen; meldung(befehl.folgen ? 'Flak-Schirm folgt den Zielen' : 'Flak-Schirm fest auf ' + befehl.schirmAbstand + ' m'); }
  if (einmal.has('KeyN')) { labor.zuruecksetzen(); gelesen = 0; rate.schuesse = 0; meldung('Neue Drohnen'); }
  if (einmal.has('KeyP')) { pause = !pause; meldung(pause ? 'Pause' : 'Weiter'); }
  if (einmal.has('KeyC')) { kam.modus = kam.modus === 'batterie' ? 'uebersicht' : 'batterie'; meldung(kam.modus === 'batterie' ? 'Kamera: Prüfstand' : 'Kamera: Übersicht'); }
  if (einmal.has('KeyV')) {
    const i = V0_STUFEN.findIndex((s) => s.v === befehl.v0);
    setzeV0(V0_STUFEN[(i + 1) % V0_STUFEN.length]);
  }
  for (const s of V0_STUFEN) if (einmal.has('V0:' + s.v)) setzeV0(s);
  if (einmal.has('KeyR')) document.getElementById('regler').classList.toggle('versteckt');
  if (einmal.has('KeyH')) { el.bedienung.classList.toggle('versteckt'); el.bedienungAuf.classList.toggle('versteckt'); }
  if (einmal.size) hudUhr = 1; // Knöpfe sofort nachziehen
  einmal.clear();
}
function setzeV0(s) {
  befehl.v0 = s.v;
  meldung('Mündungsgeschwindigkeit ' + s.v + ' m/s — ' + s.art + ' (gilt für neue Granaten)');
}


function simSchritt() {
  labor.schritt(SCHRITT, befehl);
  grafik.nachSchritt(labor.flak);
  // Abschüsse → große Explosion (Ring in labor.abschuesse)
  while (gelesen < labor.zaehler.abschuesse) {
    const a = labor.abschuesse[gelesen % labor.abschuesse.length];
    grafik.explosion(a, 1);
    gelesen++;
  }
}

function frame(jetzt) {
  const dt = Math.min(0.1, (jetzt - zuletzt) / 1000);
  zuletzt = jetzt;
  bedienen();
  if (!pause) {
    rest += dt; zeit += dt;
    while (rest >= SCHRITT) { simSchritt(); rest -= SCHRITT; }
  }
  const alpha = pause ? 1 : rest / SCHRITT;
  kameraSetzen(maus); maus.dx = maus.dy = maus.rad = 0;
  grafik.aktualisiere(labor.flak, alpha, pause ? 0 : dt, zeit, labor.ki.lage);
  drohnenGrafik.aktualisiere(labor.drohnen.ziele, alpha, zeit, bild.camera);
  bild.zeichnen();
  hud(dt);
  requestAnimationFrame(frame);
}

// ---------------- DEBUG / Testhilfen (Browser-Konsole) ----------------
window.spiel = {
  THREE, bild, labor, grafik, befehl, kam, SCHRITT,
  /** n Sim-Schritte ohne Bild rechnen (Effekte werden mit übernommen). */
  takt(n = 60) { for (let i = 0; i < n; i++) simSchritt(); return { takt: labor.zaehler.takt, schuesse: labor.zaehler.schuesse, treffer: labor.zaehler.treffer, abschuesse: labor.zaehler.abschuesse }; },
  /** Ganze Bilder von Hand rechnen (Sim + Kamera + Effekte + Zeichnen), je 1/60 s.
   *  WARUM: im verdeckten Browser-Pane läuft requestAnimationFrame nicht — sonst steht die Kamera im Ursprung. */
  bilder(n = 60) {
    bedienen(); // Tasten, die seit dem letzten Aufruf gedrückt wurden (verdecktes Pane: frame() läuft nicht)
    for (let i = 0; i < n; i++) {
      simSchritt(); zeit += SCHRITT;
      kameraSetzen({ dx: 0, dy: 0, rad: 0 });
      grafik.aktualisiere(labor.flak, 1, SCHRITT, zeit, labor.ki.lage);
      drohnenGrafik.aktualisiere(labor.drohnen.ziele, 1, zeit, bild.camera);
    }
    bild.zeichnen(); hud(SCHRITT * n);
    return { ...grafik.zaehler, granaten: labor.flak.geschosse.anzahlAktiv, ...labor.zaehler };
  },
  /** Kamera wählen: 'batterie' | 'uebersicht'. */
  kamera(name) { kam.modus = name; return name; },
  /** Taste/Knopf auslösen wie vom Nutzer (Code wie KeyboardEvent.code oder 'V0:1000'); wirkt beim nächsten bilder()/Bild. */
  taste(code) { einmal.add(code); return code; },
  /** Reglerfeld: konfig() lesen, setze({ streu: {…}, grafik: {…} }), standard(). */
  regler: reglerfeld,
  pause(an = true) { pause = an; return pause; },
  /** Bildzeit messen: n Bilder direkt hintereinander zeichnen (Median/Max ms). */
  bildzeit(n = 60) {
    const t = [];
    for (let i = 0; i < n; i++) { const a = performance.now(); bild.zeichnen(); bild.renderer.getContext().finish(); t.push(performance.now() - a); }
    t.sort((x, y) => x - y);
    return { median: +t[n >> 1].toFixed(2), max: +t[n - 1].toFixed(2), ...bild.messwerte() };
  },
};

document.getElementById('laden')?.remove();
requestAnimationFrame(frame);
