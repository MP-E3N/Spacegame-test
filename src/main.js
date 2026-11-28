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
import { lokaleGeschwindigkeit } from './sim/schiff.js';
import { erstelleSimWelt } from './sim/welt.js';
import { leseEingabe } from './eingabe.js';
import { zeigeHud, zeigeMeldung, hilfeUmschalten, ladenFertig, zeigeSchiff } from './hud.js';
import { formZuSchiff } from './sim/form/bauteile.js';
import { BEISPIEL_SCHIFFE } from './sim/form/beispiele.js';
import { registriereSchiff } from './sim/schiffe/index.js';
import { erstelleFormSchiff } from './grafik/form/schiff.js';

const SCHRITT = 1 / 60;
const KAMERA_NAMEN = { verfolger: 'Verfolger', weit: 'Übersicht', frei: 'Frei — Maus ziehen, Rad zoomt' };

const bild = erstelleRenderer(document.getElementById('leinwand'));
const staub = erstelleStaub(bild.scene);
const asteroiden = erstelleAsteroiden(bild.scene);
// R19 Probeflug: freiflug.html?form=<Name> lädt eine Werkstatt-Form (konfig/formen) als eigenes Schiff. WARUM vor allen
// anderen Schiffen und vor dem ersten Bild (await): jedes Schiff bringt ein Heck-Licht mit — kommt eins später dazu,
// kompilieren alle Shader neu (Ruckler, CLAUDE.md Regel 5).
const formName = new URLSearchParams(location.search).get('form');
let eigenes = null, eigenesFehler = '', SCHIFFSINFO = null;
if (formName) {
  try {
    // R23: ?form=beispiel:<Name> = eingebautes Beispielschiff (SL-01 Silberlanze)
    const beispiel = formName.startsWith('beispiel:') ? BEISPIEL_SCHIFFE.find((b) => b.name === formName.slice(9)) : null;
    let d = beispiel ? structuredClone(beispiel) : null;
    if (!d) { const r = await fetch('/api/formen/' + encodeURIComponent(formName)); d = await r.json(); if (!r.ok) throw new Error(d.fehler ?? r.status); }
    const schiff = formZuSchiff(d); SCHIFFSINFO = schiff;
    registriereSchiff('eigen', schiff, schiff.werte);
    eigenes = erstelleFormSchiff(bild.scene, schiff); eigenes.typ = 'eigen';
  } catch (f) { console.error(f); eigenesFehler = 'Probeflug: Form „' + formName + '“ ließ sich nicht laden — ' + (f.message ?? f); }
}
// Schiffe einmal bauen, nur eins ist sichtbar (V wechselt). WARUM vorab: Wechsel ohne Ruckler.
const SCHIFFE = [...(eigenes ? [eigenes] : []), erstelleBollwerk(bild.scene), erstelleAmbos(bild.scene)];
let modell = SCHIFFE[0];
const kamera = erstelleKamera(bild.camera);
const welt = erstelleSimWelt('bollwerk');
const sim = welt.schiff; // Kurzname: Schiffs-Simulation (Zustand sim.z)
function waehleSchiff(i) {
  modell = SCHIFFE[i];
  welt.waehle(modell.typ ?? modell.name.toLowerCase()); // Flugwerte + Kollisionskugeln des Schiffs
  SCHIFFE.forEach((s) => { s.gruppe.visible = s === modell; });
  kamera.setzeSkala(modell.laenge / 150);
  bild.setzeSchattenRadius(Math.max(110, modell.laenge * 0.62));
  zeigeSchiff(modell.kennung + ' ' + modell.name);
}
waehleSchiff(0);
// Prüfer R19: über die URL kommt auch eine nicht flugtaugliche Form — dann sagen, was fehlt (die Sperre gilt nur am Knopf)
if (eigenes) setTimeout(() => zeigeMeldung(SCHIFFSINFO.flugtauglich ? 'Probeflug: ' + eigenes.kennung + ' ' + eigenes.name + ' — V wechselt das Schiff, Esc = Menü'
  : 'Probeflug: nicht flugtauglich — ' + (SCHIFFSINFO.meldungen.find((m) => m.stufe === 'fehler')?.text ?? '')), 300);
if (eigenesFehler) setTimeout(() => zeigeMeldung(eigenesFehler), 300);

const lagePos = new THREE.Vector3(), lageRot = new THREE.Quaternion(), vl = new THREE.Vector3();
let zeit = 0, rest = 0, zuletzt = performance.now(), standbild = false;
const offen = { stopp: false, daempfer: false }; // Einmal-Befehle, die noch kein Sim-Schritt verbraucht hat
const schrittBefehl = {};                         // Vorlage, keine Neuanlage pro Schritt
let schadenImBild = 0, wrackGemeldet = false;

function darstellen(dt) {
  sim.lage(rest / SCHRITT, lagePos, lageRot);
  modell.darstellen(lagePos, lageRot, sim.z, zeit, dt);
  asteroiden.aktualisiere(zeit);
  bild.folgeSchatten(lagePos);
  zeigeHud(sim.z, lokaleGeschwindigkeit(sim.z, vl), welt.werte);
}

function frame(jetzt) {
  const dt = Math.min(0.1, (jetzt - zuletzt) / 1000);
  zuletzt = jetzt;
  const e = leseEingabe();
  const ersatz = window.spiel.befehlErsatz; // DEBUG: Skripte steuern das Schiff
  const befehl = ersatz ? { ...e.befehl, ...ersatz } : e.befehl;
  if (e.neustart) { welt.zuruecksetzen(); wrackGemeldet = false; zeigeMeldung('Neustart'); }
  if (e.hilfe) hilfeUmschalten();
  if (e.schiff) { waehleSchiff((SCHIFFE.indexOf(modell) + 1) % SCHIFFE.length); zeigeMeldung('Schiff: ' + modell.kennung + ' ' + modell.name); }
  if (e.kamera) zeigeMeldung('Kamera: ' + KAMERA_NAMEN[kamera.naechsterModus()]);
  if ((e.maus.dx || e.maus.dy) && kamera.modus() !== 'frei') { kamera.setzeModus('frei'); zeigeMeldung('Kamera: ' + KAMERA_NAMEN.frei + ' (C = zurück)'); }
  // Einmal-Befehle sammeln, bis ein Sim-Schritt sie verbraucht. WARUM: bei > 60 Hz gibt es Bilder ohne Schritt —
  // vorher gingen T/X dort verloren, die Meldung kam trotzdem (Befund Flugsystem R4).
  if (befehl.stopp) offen.stopp = true;
  if (befehl.daempferUmschalten) offen.daempfer = !offen.daempfer; // zweimal im selben Takt hebt sich auf

  if (!standbild) {
    rest += dt; zeit += dt;
    while (rest >= SCHRITT) {
      Object.assign(schrittBefehl, befehl);
      schrittBefehl.stopp = offen.stopp; schrittBefehl.daempferUmschalten = offen.daempfer;
      const daempferVorher = sim.z.daempfer;
      const k = welt.schritt(SCHRITT, schrittBefehl);
      if (k.schaden > 0) schadenImBild += k.schaden;
      // Meldung nur, wenn sich wirklich etwas geändert hat (Wrack ignoriert Befehle — Befund Prüfer R5)
      if (offen.daempfer && sim.z.daempfer !== daempferVorher) zeigeMeldung(sim.z.daempfer ? 'Trägheitsdämpfer EIN' : 'Trägheitsdämpfer AUS — das Schiff treibt');
      offen.stopp = false; offen.daempfer = false;
      rest -= SCHRITT;
    }
    if (schadenImBild > 0) { zeigeMeldung('KOLLISION — Rumpf −' + Math.max(1, Math.round(schadenImBild / welt.werte.hpMax * 100)) + ' %'); schadenImBild = 0; }
    if (sim.z.zerstoert && !wrackGemeldet) { zeigeMeldung('SCHIFF ZERSTÖRT — N = Neustart'); wrackGemeldet = true; }
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
  THREE, bild, welt, sim, SCHIFFE, get modell() { return modell; }, waehleSchiff, kamera, SCHRITT,
  befehlErsatz: null,
  /** n Simulationsschritte mit Befehl rechnen (ohne Bild). */
  takt(n, befehl = {}) { for (let i = 0; i < n; i++) welt.schritt(SCHRITT, befehl); return { pos: sim.z.pos.toArray(), v: sim.z.vel.length() }; },
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
