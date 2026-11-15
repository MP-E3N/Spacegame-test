// ZWECK: Start und Hauptschleife.
// ABLAUF: Renderer/Weltraum/Schiff/Kamera → feste Simulation (60 Hz) + interpolierte Darstellung je Bild.
// REGEL: Simulation (src/sim) kennt keine Grafik. Grafik liest den Sim-Zustand nur. So kann die Simulation später
//        auf einem Host/Server laufen und vier Stationen schicken nur Befehle (Koop).
import * as THREE from 'three';
import { erstelleRenderer } from './grafik/renderer.js';
import { erstelleStaub } from './grafik/staub.js';
import { erstelleAsteroiden } from './grafik/asteroiden.js';
import { erstelleBollwerk } from './grafik/schiff/bollwerk.js';
import { erstelleAmbos } from './grafik/schiff/ambos.js';
import { erstelleKamera } from './grafik/kamera.js';
import { erstelleSchiffSim, lokaleGeschwindigkeit } from './sim/schiff.js';
import { leseEingabe } from './eingabe.js';
import { zeigeHud, zeigeMeldung, hilfeUmschalten, ladenFertig, zeigeSchiff } from './hud.js';

const SCHRITT = 1 / 60;
const KAMERA_NAMEN = { verfolger: 'Verfolger', weit: 'Übersicht', frei: 'Frei — Maus ziehen, Rad zoomt' };

const bild = erstelleRenderer(document.getElementById('leinwand'));
const staub = erstelleStaub(bild.scene);
const asteroiden = erstelleAsteroiden(bild.scene);
// Beide Schiffe einmal bauen, nur eins ist sichtbar (V wechselt). WARUM vorab: Wechsel ohne Ruckler.
const SCHIFFE = [erstelleBollwerk(bild.scene), erstelleAmbos(bild.scene)];
let modell = SCHIFFE[0];
const kamera = erstelleKamera(bild.camera);
const sim = erstelleSchiffSim();
function waehleSchiff(i) {
  modell = SCHIFFE[i];
  SCHIFFE.forEach((s) => { s.gruppe.visible = s === modell; });
  kamera.setzeSkala(modell.laenge / 150);
  bild.setzeSchattenRadius(Math.max(110, modell.laenge * 0.62));
  zeigeSchiff(modell.kennung + ' ' + modell.name);
}
waehleSchiff(0);

const lagePos = new THREE.Vector3(), lageRot = new THREE.Quaternion(), vl = new THREE.Vector3();
let zeit = 0, rest = 0, zuletzt = performance.now(), standbild = false;

function darstellen(dt) {
  sim.lage(rest / SCHRITT, lagePos, lageRot);
  modell.darstellen(lagePos, lageRot, sim.z, zeit, dt);
  asteroiden.aktualisiere(zeit);
  bild.folgeSchatten(lagePos);
  zeigeHud(sim.z, lokaleGeschwindigkeit(sim.z, vl));
}

function frame(jetzt) {
  const dt = Math.min(0.1, (jetzt - zuletzt) / 1000);
  zuletzt = jetzt;
  const e = leseEingabe();
  const ersatz = window.spiel.befehlErsatz; // DEBUG: Skripte steuern das Schiff
  const befehl = ersatz ? { ...e.befehl, ...ersatz } : e.befehl;
  if (e.neustart) { sim.zuruecksetzen(); zeigeMeldung('Neustart'); }
  if (e.hilfe) hilfeUmschalten();
  if (e.schiff) { waehleSchiff((SCHIFFE.indexOf(modell) + 1) % SCHIFFE.length); zeigeMeldung('Schiff: ' + modell.kennung + ' ' + modell.name); }
  if (e.kamera) zeigeMeldung('Kamera: ' + KAMERA_NAMEN[kamera.naechsterModus()]);
  if ((e.maus.dx || e.maus.dy) && kamera.modus() !== 'frei') { kamera.setzeModus('frei'); zeigeMeldung('Kamera: ' + KAMERA_NAMEN.frei + ' (C = zurück)'); }
  if (befehl.daempferUmschalten) zeigeMeldung(sim.z.daempfer ? 'Trägheitsdämpfer AUS — das Schiff treibt' : 'Trägheitsdämpfer EIN');

  if (!standbild) {
    rest += dt; zeit += dt;
    let erster = true;
    while (rest >= SCHRITT) {
      // WARUM nur im ersten Schritt: Einmal-Befehle (Stopp, Dämpfer) sonst mehrfach pro Bild
      sim.schritt(SCHRITT, erster ? befehl : { ...befehl, stopp: false, daempferUmschalten: false });
      erster = false;
      rest -= SCHRITT;
    }
    darstellen(dt);
    kamera.update(dt, lagePos, lageRot, e);
    staub.aktualisiere(bild.camera.position, sim.z.vel);
    bild.zeichnen();
  }
  requestAnimationFrame(frame);
}

// ---------------- DEBUG / Testhilfen (Browser-Konsole) ----------------
const ANSICHTEN = { // [gier, nick, abstand] der freien Kamera im Schiffs-Rahmen
  heck: [2.75, 0.22, 190], seite: [1.45, 0.12, 230], bug: [0.55, 0.18, 200], oben: [2.2, 1.0, 230], unten: [2.5, -0.5, 220], weit: [2.3, 0.3, 520],
};
window.spiel = {
  THREE, bild, sim, SCHIFFE, get modell() { return modell; }, waehleSchiff, kamera, SCHRITT,
  befehlErsatz: null,
  /** n Simulationsschritte mit Befehl rechnen (ohne Bild). */
  takt(n, befehl = {}) { for (let i = 0; i < n; i++) sim.schritt(SCHRITT, befehl); return { pos: sim.z.pos.toArray(), v: sim.z.vel.length() }; },
  /** Festen Blickwinkel zeichnen und einfrieren (Screenshots). */
  ansicht(name = 'heck') {
    const a = ANSICHTEN[name]; if (!a) return Object.keys(ANSICHTEN);
    standbild = true; rest = 0;
    kamera.setzeFrei(...a);
    darstellen(1); kamera.update(0.016, lagePos, lageRot, null); // dt = 1: geglättete Effekte (Glut) sofort am Ziel
    staub.aktualisiere(bild.camera.position, sim.z.vel);
    bild.zeichnen();
    return name;
  },
  standbildWeg() { standbild = false; zuletzt = performance.now(); kamera.setzeModus('verfolger'); },
  /** Bildzeit messen: n Bilder direkt hintereinander zeichnen (Median/Max ms). */
  bildzeit(n = 60) {
    const t = [];
    for (let i = 0; i < n; i++) { const a = performance.now(); bild.zeichnen(); bild.renderer.getContext().finish(); t.push(performance.now() - a); }
    t.sort((x, y) => x - y);
    return { median: +t[n >> 1].toFixed(2), max: +t[n - 1].toFixed(2), ...bild.messwerte() };
  },
};

ladenFertig();
requestAnimationFrame(frame);
