// ZWECK: Gefechtstest (Runde 14, Nutzer: „das Schiff fliegen und von gegnerischen Schiffen angegriffen werden“) —
//        Bollwerk mit 14 Flak-Türmen fliegen (Steuerung wie im Freiflug), Kanonenboote greifen in Wellen an.
// ABLAUF: Renderer/Weltraum/Schiff/Kamera wie main.js → feste Sim 60 Hz (src/sim/gefecht.js) → interpolierte Darstellung:
//         Schiff, Turm-Modelle (von der Flak-Grafik gedreht), Flak-Effekte, Angreifer (Drohnen-Platzhalter), deren Geschosse.
// REGEL: Sim kennt keine Grafik; Ereignisse je Sim-Schritt an die Grafik (grafik.nachSchritt). Flak-Standards = Konfig T1.
import * as THREE from 'three';
import { erstelleRenderer } from '../grafik/renderer.js';
import { erstelleStaub } from '../grafik/staub.js';
import { erstelleAsteroiden } from '../grafik/asteroiden.js';
import { erstelleBollwerk } from '../grafik/schiff/bollwerk.js';
import { erstelleKamera } from '../grafik/kamera.js';
import { erstelleFlakGrafik } from '../grafik/waffen/flakgrafik.js';
import { erstelleAngreiferGeschossGrafik } from '../grafik/waffen/angreifergeschosse.js';
import { erstelleDrohnenGrafik } from '../labor/drohnen.js';
import { lokaleGeschwindigkeit } from '../sim/schiff.js';
import { erstelleGefecht } from '../sim/gefecht.js';
import { leseEingabe } from '../eingabe.js';
import { zeigeHud, zeigeMeldung, hilfeUmschalten, ladenFertig, zeigeSchiff } from '../hud.js';
import { formZuSchiff } from '../sim/form/bauteile.js';
import { formId } from '../sim/form/form.js';
import { erstelleFormSchiff } from '../grafik/form/schiff.js';

const SCHRITT = 1 / 60;
const KAMERA_NAMEN = { verfolger: 'Verfolger', weit: 'Übersicht', frei: 'Frei — Maus ziehen, Rad zoomt' };

const bild = erstelleRenderer(document.getElementById('leinwand'));
bild.camera.far = Math.max(bild.camera.far, 12000); bild.camera.updateProjectionMatrix(); // Angreifer sammeln sich auf 1,8–2,6 km
const staub = erstelleStaub(bild.scene);
const asteroiden = erstelleAsteroiden(bild.scene);
// R21 (Nutzer: „ich kann gespeicherte Formen nicht im Gefecht testen“): gefecht.html?form=<Name> lädt eine Werkstatt-Form
// als eigenes Schiff. WARUM vor dem ersten Bild (await): das Schiff bringt sein Heck-Licht mit (Lichtanzahl fest, Regel 5).
// WARUM dasselbe daten-Objekt an Sim und Grafik: die Turm-Modelle werden über die Turm-id den Flak-Lafetten zugeordnet.
const formName = new URLSearchParams(location.search).get('form');
let formDaten = null, formFehler = '';
if (formName) {
  try {
    const r = await fetch('/api/formen/' + encodeURIComponent(formName)); const d = await r.json();
    if (!r.ok) throw new Error(d.fehler ?? r.status);
    formDaten = formZuSchiff(d);
  } catch (f) { console.error(f); formFehler = 'Form „' + formName + '“ ließ sich nicht laden — ' + (f.message ?? f) + ' · Bollwerk statt dessen'; }
}
const modell = formDaten ? erstelleFormSchiff(bild.scene, formDaten) : erstelleBollwerk(bild.scene);
const SCHIFFSNAME = formDaten ? (modell.kennung + ' ' + modell.name).trim() : 'BOLLWERK';
const kamera = erstelleKamera(bild.camera);
kamera.setzeSkala(modell.laenge / 150);
bild.setzeSchattenRadius(Math.max(110, modell.laenge * 0.62));

const gefecht = formDaten ? erstelleGefecht({ typ: formId(formDaten.name), daten: formDaten, werte: formDaten.werte }) : erstelleGefecht();
const { welt, schiff, flak, angreifer } = gefecht;
const sim = schiff;
// Turm-Modelle des Schiffs in der Reihenfolge der Flak-Lafetten (Zuordnung über die Schiffs-Turm-id)
const grafik = erstelleFlakGrafik(bild.scene, bild.camera, { turmModelle: gefecht.lafetten.map((l) => modell.tuerme[l.id]) });
// WARUM größer als im Labor: Kanonenboote sollen im Gefecht auch auf 1–2 km als Schiff mit rotem Auge lesbar sein (Spieltest R14)
const feindGrafik = erstelleDrohnenGrafik(bild.scene, 16, { skala: 2, augePx: 6 });
const feindFeuer = erstelleAngreiferGeschossGrafik(bild.scene, { max: angreifer.geschosse.max });

// Flak-Befehl (Seite → Sim): Standards wie im Labor, Killzone/Räume rechnet die KI im Schiffsrahmen
const flakBefehl = { modus: 'sperrfeuer', feuerFrei: true, folgen: true, schirmAbstand: 800, v0: 1100 };

// ---------------- Flak-Tasten (zusätzlich zur Flugsteuerung aus eingabe.js) ----------------
const flakTasten = new Set();
addEventListener('keydown', (e) => { if (!e.repeat && ['Space', 'Digit1', 'Digit2', 'Numpad1', 'Numpad2', 'KeyL'].includes(e.code)) flakTasten.add(e.code); });
function flakBedienen() {
  if (flakTasten.has('Space')) { flakBefehl.feuerFrei = !flakBefehl.feuerFrei; zeigeMeldung(flakBefehl.feuerFrei ? 'Flak: Feuer frei' : 'Flak: Feuer halt'); }
  if (flakTasten.has('Digit1') || flakTasten.has('Numpad1')) { flakBefehl.modus = 'sperrfeuer'; zeigeMeldung('Flak: Sperrfeuer — Raum vor den Angreifern sättigen'); }
  if (flakTasten.has('Digit2') || flakTasten.has('Numpad2')) { flakBefehl.modus = 'zielfeuer'; zeigeMeldung('Flak: Zielfeuer — Türme wählen Ziele'); }
  if (flakTasten.has('KeyL')) { grafik.regler.spurImmer = !grafik.regler.spurImmer; zeigeMeldung(grafik.regler.spurImmer ? 'Leuchtspur dauerhaft' : 'Leuchtspur nur im Nahbereich'); }
  flakTasten.clear();
}

// ---------------- Gefecht-Anzeige ----------------
const $ = (id) => document.getElementById(id);
const gel = { welle: $('g-welle'), angreifer: $('g-angreifer'), abschuesse: $('g-abschuesse'), treffer: $('g-treffer'), flak: $('g-flak'), alarm: $('g-alarm'), bildzeit: $('g-bildzeit') };
const galt = {};
const gsetze = (k, t) => { if (galt[k] !== t) { gel[k].textContent = t; galt[k] = t; } };
let bildMittel = 16, hudUhr = 0;
function gefechtHud(dt) {
  bildMittel += (dt * 1000 - bildMittel) * 0.05;
  if ((hudUhr += dt) < 0.2) return;
  hudUhr = 0;
  const w = angreifer.welle;
  gsetze('welle', w.pause > 0 ? (w.nr ? 'Pause · Welle ' + (w.nr + 1) + ' in ' + Math.ceil(w.pause) + ' s' : 'Anflug in ' + Math.ceil(w.pause) + ' s') : String(w.nr));
  let aktiv = 0; for (const z of angreifer.ziele) if (z.aktiv) aktiv++;
  gsetze('angreifer', String(aktiv));
  gsetze('abschuesse', String(gefecht.zaehler.abschuesse));
  // WARUM „durch Beschuss“: der Rumpf-Wert unten links enthält auch Kollisionen (Asteroiden) — Spieltest R14
  gsetze('treffer', gefecht.zaehler.trefferAmSchiff + ' · −' + Math.round(gefecht.zaehler.schadenAmSchiff / welt.werte.hpMax * 100) + ' % Rumpf');
  gsetze('flak', (flakBefehl.modus === 'sperrfeuer' ? 'Sperrfeuer' : 'Zielfeuer') + ' · ' + (flakBefehl.feuerFrei ? 'frei' : 'HALT'));
  const nah = !!gefecht.ki.lage?.nahbereich;
  gsetze('alarm', nah ? 'NAHBEREICH' : '');
  gel.alarm.classList.toggle('an', nah);
  gsetze('bildzeit', bildMittel.toFixed(1) + ' ms');
}

// ---------------- Hauptschleife ----------------
const lagePos = new THREE.Vector3(), lageRot = new THREE.Quaternion(), vl = new THREE.Vector3();
let zeit = 0, rest = 0, zuletzt = performance.now(), gelesen = 0;
const offen = { stopp: false, daempfer: false };
const schrittBefehl = {};
let schadenImBild = 0, trefferImBild = 0, wrackGemeldet = false;

function simSchritt(befehl) {
  Object.assign(schrittBefehl, befehl);
  schrittBefehl.stopp = offen.stopp; schrittBefehl.daempferUmschalten = offen.daempfer;
  const daempferVorher = sim.z.daempfer;
  const r = gefecht.schritt(SCHRITT, schrittBefehl, flakBefehl);
  if (r.kollision?.schaden > 0) schadenImBild += r.kollision.schaden;
  trefferImBild += r.treffer;
  if (offen.daempfer && sim.z.daempfer !== daempferVorher) zeigeMeldung(sim.z.daempfer ? 'Trägheitsdämpfer EIN' : 'Trägheitsdämpfer AUS — das Schiff treibt');
  offen.stopp = false; offen.daempfer = false;
  grafik.nachSchritt(flak);
  while (gelesen < gefecht.zaehler.abschuesse) { grafik.explosion(gefecht.abschuesse[gelesen % gefecht.abschuesse.length], 1); gelesen++; }
}

function darstellen(dt, alpha) {
  sim.lage(alpha, lagePos, lageRot);
  modell.darstellen(lagePos, lageRot, sim.z, zeit, dt);
  asteroiden.aktualisiere(zeit);
  bild.folgeSchatten(lagePos);
  // WARUM nach modell.darstellen: die Turm-Modelle hängen am Schiff — erst die Schiffslage, dann die Rohre
  grafik.aktualisiere(flak, alpha, dt, zeit, gefecht.ki.lage);
  feindGrafik.aktualisiere(angreifer.ziele, alpha, zeit, bild.camera);
  feindFeuer.aktualisiere(angreifer.geschosse, alpha, sim.z.vel);
  zeigeHud(sim.z, lokaleGeschwindigkeit(sim.z, vl), welt.werte);
}

function frame(jetzt) {
  const dt = Math.min(0.1, (jetzt - zuletzt) / 1000);
  zuletzt = jetzt;
  const e = leseEingabe();
  flakBedienen();
  const befehl = window.spiel.befehlErsatz ? { ...e.befehl, ...window.spiel.befehlErsatz } : e.befehl;
  if (e.neustart) { gefecht.zuruecksetzen(); gelesen = 0; wrackGemeldet = false; zeigeMeldung('Neustart — Angreifer im Anflug'); }
  if (e.hilfe) hilfeUmschalten();
  if (e.kamera) zeigeMeldung('Kamera: ' + KAMERA_NAMEN[kamera.naechsterModus()]);
  if ((e.maus.dx || e.maus.dy) && kamera.modus() !== 'frei') { kamera.setzeModus('frei'); zeigeMeldung('Kamera: ' + KAMERA_NAMEN.frei + ' (C = zurück)'); }
  if (befehl.stopp) offen.stopp = true;
  if (befehl.daempferUmschalten) offen.daempfer = !offen.daempfer;

  rest += dt; zeit += dt;
  while (rest >= SCHRITT) { simSchritt(befehl); rest -= SCHRITT; }
  if (schadenImBild > 0) { zeigeMeldung('KOLLISION — Rumpf −' + Math.max(1, Math.round(schadenImBild / welt.werte.hpMax * 100)) + ' %'); schadenImBild = 0; }
  if (trefferImBild > 0) { document.body.classList.add('treffer'); setTimeout(() => document.body.classList.remove('treffer'), 120); trefferImBild = 0; }
  if (sim.z.zerstoert && !wrackGemeldet) { zeigeMeldung(SCHIFFSNAME + ' ZERSTÖRT — N = Neustart'); wrackGemeldet = true; }
  darstellen(dt, rest / SCHRITT);
  kamera.update(dt, lagePos, lageRot, e);
  staub.aktualisiere(bild.camera.position, sim.z.vel);
  bild.zeichnen();
  gefechtHud(dt);
  requestAnimationFrame(frame);
}

// ---------------- DEBUG / Testhilfen (Browser-Konsole) ----------------
window.spiel = {
  THREE, bild, gefecht, welt, sim, flak, angreifer, grafik, modell, kamera, flakBefehl, SCHRITT,
  befehlErsatz: null,
  /** n ganze Bilder von Hand (verdecktes Pane: requestAnimationFrame läuft nicht). */
  bilder(n = 60, befehl = {}) {
    flakBedienen();
    for (let i = 0; i < n; i++) { simSchritt({ ...befehl, ...(this.befehlErsatz ?? {}) }); zeit += SCHRITT; darstellen(SCHRITT, 1); kamera.update(SCHRITT, lagePos, lageRot, null); }
    staub.aktualisiere(bild.camera.position, sim.z.vel);
    bild.zeichnen(); gefechtHud(SCHRITT * n);
    return { ...gefecht.zaehler, hp: Math.round(sim.z.hp), welle: angreifer.welle.nr, ...grafik.zaehler };
  },
  taste(code) { flakTasten.add(code); return code; },
  bildzeit(n = 60) {
    const t = [];
    for (let i = 0; i < n; i++) { const a = performance.now(); bild.zeichnen(); bild.renderer.getContext().finish(); t.push(performance.now() - a); }
    t.sort((x, y) => x - y);
    return { median: +t[n >> 1].toFixed(2), max: +t[n - 1].toFixed(2), ...bild.messwerte() };
  },
};

// ---------------- Schiffswahl (R21): Bollwerk oder gespeicherte Form → Seite neu laden ----------------
const wahl = $('g-schiff');
if (wahl) {
  wahl.innerHTML = '<option value="">BT-12 Bollwerk</option>';
  fetch('/api/formen').then((r) => r.json()).then((namen) => {
    for (const n of namen) { const o = document.createElement('option'); o.value = n; o.textContent = n; wahl.append(o); }
    wahl.value = formDaten ? formName : '';
  }).catch(() => { /* ohne Dev-Server nur Bollwerk */ });
  wahl.addEventListener('change', () => { location.href = wahl.value ? '/gefecht.html?form=' + encodeURIComponent(wahl.value) : '/gefecht.html'; });
  // WARUM blur: sonst steuern Pfeil-/Buchstabentasten danach die Auswahl statt des Schiffs
  wahl.addEventListener('keydown', (e) => { if (e.key === 'Escape') wahl.blur(); });
}
if (formDaten) zeigeSchiff(SCHIFFSNAME); // Spieltest R21 (Soll): oben stand weiter „STEUER · BT-12 BOLLWERK“
setTimeout(() => {
  if (formFehler) zeigeMeldung(formFehler);
  else if (formDaten) {
    const stumm = gefecht.stumm?.length ?? gefecht.stumm ?? 0;
    zeigeMeldung(`Gefecht mit ${SCHIFFSNAME}: ${gefecht.lafetten.length} Flak-Türme${stumm ? ` (${stumm} stumm — Montage prüfen)` : ''}` +
      (formDaten.flugtauglich ? '' : ' · NICHT flugtauglich: ' + (formDaten.meldungen.find((m) => m.stufe === 'fehler')?.text ?? '')));
  }
}, 300);

ladenFertig();
requestAnimationFrame(frame);
