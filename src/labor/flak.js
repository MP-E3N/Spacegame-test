// ZWECK: Flak-Labor (Runde 6) — Demo ohne Schiff: 6 Flaktürme auf einem Prüfstand gegen Zieldrohnen.
// ABLAUF: Renderer/Himmel → Prüfstand + Flak-Grafik + Drohnen-Platzhalter → feste Sim 60 Hz (src/sim/flaklabor.js)
//         + interpolierte Darstellung je Bild.
// REGEL: wie main.js — Sim kennt keine Grafik; die Grafik liest nur. Ereignisse (Schüsse, Detonationen) gelten je
//        Sim-Schritt und werden deshalb nach JEDEM Schritt an die Grafik gegeben (grafik.nachSchritt).
import * as THREE from 'three';
import { erstelleRenderer } from '../grafik/renderer.js';
import { erstelleFlakGrafik } from '../grafik/waffen/flakgrafik.js';
import { erstelleFlakLabor } from '../sim/flaklabor.js';
import { STANDARD_SEKTOR } from '../sim/waffen/lafetten.js';
import { erstellePruefstand } from './pruefstand.js';
import { erstelleDrohnenGrafik } from './drohnen.js';

const SCHRITT = 1 / 60;
const SCHIRM = { min: 400, max: 2000, stufe: 100 };

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
const befehl = { modus: 'sperrfeuer', feuerFrei: true, folgen: true, schirmAbstand: 800, sektor: { ...STANDARD_SEKTOR } };

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
addEventListener('wheel', (e) => { if (e.target?.id === 'leinwand') maus.rad += Math.sign(e.deltaY); }, { passive: true });

// ---------------- Anzeige ----------------
const $ = (id) => document.getElementById(id);
const el = { modus: $('modus'), feuer: $('feuer'), schirm: $('schirm'), granaten: $('granaten'), wolken: $('wolken'), schussrate: $('schussrate'),
  treffer: $('treffer'), abschuesse: $('abschuesse'), nah: $('nahbereich'), spuren: $('spuren'), bildzeit: $('bildzeit'), meldung: $('meldung'), hilfe: $('hilfe') };
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
  setze('modus', befehl.modus === 'sperrfeuer' ? 'SPERRFEUER' : 'ZIELFEUER');
  setze('feuer', befehl.feuerFrei ? 'FEUER FREI' : 'FEUER HALT');
  el.feuer.classList.toggle('halt', !befehl.feuerFrei);
  setze('schirm', schirmText());
  const nah = labor.ki.lage?.eindringlinge?.length ?? 0;
  setze('nah', nah ? 'NAHBEREICH — ' + nah + (nah === 1 ? ' Eindringling' : ' Eindringlinge') : '');
  el.nah.classList.toggle('an', nah > 0);
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
function zaehleGranaten() { return labor.flak.geschosse.anzahlAktiv; }

// ---------------- Hauptschleife ----------------
let zeit = 0, rest = 0, zuletzt = performance.now(), pause = false, gelesen = 0;
function bedienen() {
  if (einmal.has('Space')) { befehl.feuerFrei = !befehl.feuerFrei; meldung(befehl.feuerFrei ? 'Feuer frei' : 'Feuer halt'); }
  if (einmal.has('Digit1') || einmal.has('Numpad1')) { befehl.modus = 'sperrfeuer'; meldung('Sperrfeuer — Flak-Schirm auf ' + befehl.schirmAbstand + ' m'); }
  if (einmal.has('Digit2') || einmal.has('Numpad2')) { befehl.modus = 'zielfeuer'; meldung('Zielfeuer — Türme wählen Ziele, Zünder nach Vorhalt'); }
  const plus = einmal.has('Equal') || einmal.has('NumpadAdd') || einmal.has('BracketRight');
  const minus = einmal.has('Minus') || einmal.has('NumpadSubtract') || einmal.has('Slash');
  if (plus || minus) {
    // + = Schirm näher heran (Nutzersicht „enger ziehen“), − = weiter hinaus
    // Beim ersten Druck aus dem Folgen-Modus: vom aktuellen Schirm der KI ausgehen (kein Sprung)
    const start = befehl.folgen && labor.ki.lage?.schirme?.length ? Math.round(labor.ki.lage.schirme[0].abstand / 100) * 100 : befehl.schirmAbstand;
    befehl.folgen = false;
    befehl.schirmAbstand = Math.max(SCHIRM.min, Math.min(SCHIRM.max, start + (plus ? -SCHIRM.stufe : SCHIRM.stufe)));
    meldung('Flak-Schirm fest auf ' + befehl.schirmAbstand + ' m (F = wieder folgen)');
  }
  if (einmal.has('KeyF')) { befehl.folgen = !befehl.folgen; meldung(befehl.folgen ? 'Flak-Schirm folgt den Zielen' : 'Flak-Schirm fest auf ' + befehl.schirmAbstand + ' m'); }
  if (einmal.has('KeyN')) { labor.zuruecksetzen(); gelesen = 0; rate.schuesse = 0; meldung('Neue Drohnen'); }
  if (einmal.has('KeyP')) { pause = !pause; meldung(pause ? 'Pause' : 'Weiter'); }
  if (einmal.has('KeyC')) { kam.modus = kam.modus === 'batterie' ? 'uebersicht' : 'batterie'; meldung(kam.modus === 'batterie' ? 'Kamera: Prüfstand' : 'Kamera: Übersicht'); }
  if (einmal.has('KeyH')) el.hilfe.classList.toggle('versteckt');
  einmal.clear();
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
  grafik.aktualisiere(labor.flak, alpha, pause ? 0 : dt, zeit);
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
    for (let i = 0; i < n; i++) {
      simSchritt(); zeit += SCHRITT;
      kameraSetzen({ dx: 0, dy: 0, rad: 0 });
      grafik.aktualisiere(labor.flak, 1, SCHRITT, zeit);
      drohnenGrafik.aktualisiere(labor.drohnen.ziele, 1, zeit, bild.camera);
    }
    bild.zeichnen(); hud(SCHRITT * n);
    return { ...grafik.zaehler, granaten: labor.flak.geschosse.anzahlAktiv, ...labor.zaehler };
  },
  /** Kamera wählen: 'batterie' | 'uebersicht'. */
  kamera(name) { kam.modus = name; return name; },
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
setTimeout(() => el.hilfe.classList.add('versteckt'), 12000);
requestAnimationFrame(frame);
