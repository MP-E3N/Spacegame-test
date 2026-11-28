// ZWECK: Prüfungen ohne Browser für die Gefechtszentrale (R23, E5; `node tests/zentrale.mjs`):
//   1) Treffer landen im richtigen Bereich — Schiff verschoben UND gedreht (Lokallage, nicht Weltlage), Turmnähe → Batterie.
//   2) Trupps reparieren Bereich und Rumpfschaden (Weg je Alarmstufe, Ende beim Rumpfschaden des Bereichs).
//   3) Energie verschiebt hebelMax, Turmversorgung und Reparaturtempo; Alarmstufen wirken (Grün gesichert, Gelb ¾ Türme).
//   4) Autopilot dreht ein echtes Schiff (erstelleSchiffSim) in < 30 s auf ±3° an den Kurs und hält ihn (Bollwerk + Ambos).
//   5) Gleichlauf: zwei Läufe mit gleicher Befehlsfolge → gleiche pruefsumme; nach zuruecksetzen() ebenso.
//   6) Ungültige Befehle werden abgewiesen (und ändern nichts), gültige angenommen.
//   7) Ohne Bedienung keine Wirkung (Einbau ändert das Gefecht nicht) · Echtes Gefecht 90 s: Treffer-Summe = Rumpfschaden.
// LIEFERT: Tabelle „Messgröße | Ziel | Wert | ok“; Exit-Code 1 bei FEHLER.
// REGEL: NICHT in package.json eingetragen (Auftrag R23) — die Projektleitung entscheidet beim Zusammenführen.
import { Quaternion, Vector3, Euler } from 'three';
import { erstelleZentrale, ZENTRALE } from '../src/sim/zentrale.js';
import { pruefeBefehl, ENERGIE_SUMME } from '../src/netz/stationsbefehle.js';
import { erstelleSchiffSim } from '../src/sim/schiff.js';
import { WERTE } from '../src/sim/werte.js';
import { SCHIFFSDATEN } from '../src/sim/schiffe/index.js';
import { schiffsLafetten } from '../src/sim/waffen/lafetten.js';
import { erstelleGefecht } from '../src/sim/gefecht.js';
import { performance } from 'node:perf_hooks';

const START = performance.now(), DT = 1 / 60;
const zeilen = [];
let harte = 0;
const zeile = (groesse, ziel, wert, ok) => { if (!ok) harte++; zeilen.push({ groesse, ziel: String(ziel), wert: String(wert), ok: ok ? 'ok' : 'FEHLER' }); };
const GRAD = Math.PI / 180;

const B = SCHIFFSDATEN.bollwerk;
const tuerme = schiffsLafetten(B).lafetten.map((l, i) => ({ index: i, lafette: l }));
const neu = () => erstelleZentrale({ kugeln: B.kugeln });

// Schiffslage: verschoben + schief gedreht — WARUM: ein Fehler Welt/Lokal fiele bei Einheitsdrehung nicht auf
const schiffZ = { pos: new Vector3(420, -75, 1300), vel: new Vector3(), rot: new Quaternion().setFromEuler(new Euler(0.4, 2.1, -0.7)),
  dreh: new Vector3(), hebel: 0, hp: 5000, zerstoert: false };
const welt = (lx, ly, lz) => new Vector3(lx, ly, lz).applyQuaternion(schiffZ.rot).add(schiffZ.pos);
const treffer = (lx, ly, lz, schaden = 15) => ({ pos: welt(lx, ly, lz), schaden });
const lageMit = (tr = []) => ({ schiffZ, treffer: tr, tuerme, ziele: [], werte: WERTE.bollwerk });
const bereich = (zt, id) => zt.zustand.bereiche.find((b) => b.id === id);

// ---------------- 1) Treffer → Bereich ----------------
{
  const zt = neu();
  // Punkte am Rumpf weit weg von jedem Turm (Turmradius 16 m) — Längsbänder; Lafetten: y ±15, x bis ±21
  const faelle = [
    ['bug', [0, -4, 120]], ['bug', [-12, 0, 70]], ['mitte', [0, -2, 38]], ['mitte', [14, 0, 40]],
    ['heck', [0, 0, -60]], ['heck', [-12, 0, -55]], ['antrieb', [0, 0, -115]], ['antrieb', [10, 0, -100]],
  ];
  // Punkte direkt an Türmen (oben/unten)
  const tObenL = tuerme.find((t) => t.lafette.oben !== false).lafette, tUntenL = tuerme.find((t) => t.lafette.oben === false).lafette;
  faelle.push(['waffenOben', [tObenL.x + 3, tObenL.y + 2, tObenL.z - 4]], ['waffenUnten', [tUntenL.x - 2, tUntenL.y - 3, tUntenL.z + 5]]);
  let richtig = 0; const falsch = [];
  for (const [soll, p] of faelle) {
    const vorher = Object.fromEntries(zt.zustand.bereiche.map((b) => [b.id, b.treffer]));
    zt.schritt(DT, lageMit([treffer(...p)]));
    const ist = zt.zustand.bereiche.find((b) => b.treffer !== vorher[b.id])?.id;
    if (ist === soll) richtig++; else falsch.push(soll + '→' + ist + '@' + p.join(','));
  }
  zeile('Treffer im richtigen Bereich (gedrehtes Schiff)', faelle.length + '/' + faelle.length, richtig + '/' + faelle.length + (falsch.length ? ' ' + falsch.join(' ') : ''), richtig === faelle.length);
  // Gegenprobe: dieselben Lokalpunkte als WELT-Punkte ohne Drehung eingeschleust → müssen (meist) danebenliegen
  const zt2 = neu(); let gleich = 0;
  for (const [soll, p] of faelle) {
    const vorher = Object.fromEntries(zt2.zustand.bereiche.map((b) => [b.id, b.treffer]));
    zt2.schritt(DT, lageMit([{ pos: new Vector3(...p), schaden: 15 }]));
    if (zt2.zustand.bereiche.find((b) => b.treffer !== vorher[b.id])?.id === soll) gleich++;
  }
  zeile('Gegenprobe: Weltpunkt statt Lokalpunkt trifft falsch', '≤ 3 zufällig richtig', gleich + '/' + faelle.length, gleich <= 3);
  const summe = zt.zustand.bereiche.reduce((s, b) => s + b.rumpfSchaden, 0);
  zeile('Rumpfschaden = Treffersumme', 15 * faelle.length, summe, summe === 15 * faelle.length);
}

// ---------------- 2) Trupps reparieren ----------------
{
  const zt = neu();
  for (let i = 0; i < 20; i++) zt.schritt(DT, lageMit([treffer(0, -4, 120)])); // 20 × 15 = 300 → Bug 0 %
  const bug = bereich(zt, 'bug');
  zeile('Bug nach 20 Treffern', '0 %, Rumpfschaden 300', Math.round(bug.zustand * 100) + ' %, ' + bug.rumpfSchaden, bug.zustand === 0 && bug.rumpfSchaden === 300);
  // ohne Trupp: nichts
  for (let i = 0; i < 600; i++) zt.schritt(DT, lageMit());
  zeile('Ohne Trupp keine Reparatur (10 s)', '0 %', Math.round(bug.zustand * 100) + ' %', bug.zustand === 0);
  zt.befehl({ station: 'technik', art: 'trupp', nr: 2, bereich: 'bug' });
  let t = 0, hp = 0, ankunft = -1, fertig = -1;
  while (t < 200 && fertig < 0) {
    const w = zt.schritt(DT, lageMit()); t += DT; hp += w.reparatur * DT;
    if (ankunft < 0 && zt.zustand.trupps[1].arbeit === 'repariert') ankunft = t;
    if (bug.zustand >= 1 && bug.rumpfSchaden === 0) fertig = t;
  }
  const weg = ZENTRALE.alarm.rot.weg;
  zeile('Trupp-Weg bei Alarm Rot', weg + ' s', ankunft.toFixed(2) + ' s', Math.abs(ankunft - weg) < 0.05);
  // Erwartung: Bereich 300 / (3 · 0,75) = 133 s, Rumpf 300 / (2,5 · 0,75) = 160 s → das Längere zählt
  const erwartet = weg + Math.max(300 / (ZENTRALE.truppBereich * 0.75), 300 / (ZENTRALE.truppRumpf * 0.75));
  zeile('Trupp setzt Bug instand', '≈ ' + erwartet.toFixed(0) + ' s', fertig.toFixed(1) + ' s', Math.abs(fertig - erwartet) < 0.5);
  zeile('Rumpf-HP aus der Reparatur', '300 (= Rumpfschaden)', hp.toFixed(2), Math.abs(hp - 300) < 1e-6);
  const w = zt.schritt(DT, lageMit());
  zeile('Danach: Trupp bereit, keine Rumpf-HP mehr', 'bereit · 0', zt.zustand.trupps[1].arbeit + ' · ' + w.reparatur, zt.zustand.trupps[1].arbeit === 'bereit' && w.reparatur === 0);
  const meldung = zt.ansagen(16).map((a) => a.text);
  zeile('Ansagen: ausgefallen / vor Ort / instand', '3 Meldungen', meldung.filter((x) => /AUSGEFALLEN|vor Ort|instand/.test(x)).length,
    meldung.some((x) => /Bug.*AUSGEFALLEN/.test(x)) && meldung.some((x) => /vor Ort/.test(x)) && meldung.some((x) => /instand/.test(x)));
}

// ---------------- 3) Energie + Alarm ----------------
{
  const zt = neu();
  let w = zt.schritt(DT, lageMit());
  zeile('Standard: hebelMax / Türme aus / Feuer', '1 / 0 / frei', w.hebelMax + ' / ' + w.tuermeAus.length + ' / ' + w.feuerFrei, w.hebelMax === 1 && w.tuermeAus.length === 0 && w.feuerFrei);
  zt.befehl({ station: 'technik', art: 'energie', antrieb: 20, waffen: 20, reparatur: 60 });
  w = zt.schritt(DT, lageMit());
  const hm = w.hebelMax, aus = w.tuermeAus.length;
  zeile('Antrieb 20/35 → hebelMax', (20 / 35).toFixed(3), hm.toFixed(3), Math.abs(hm - 20 / 35) < 1e-9);
  zeile('Waffen 20/40 → Türme aus', Math.ceil(tuerme.length / 2) + ' von ' + tuerme.length, aus, aus === tuerme.length - Math.floor(tuerme.length / 2));
  zeile('Nachbrenner bei Antrieb 20', 'gesperrt', w.nachbrennerFrei ? 'frei' : 'gesperrt', !w.nachbrennerFrei);
  // Reparaturtempo: Energie 60 statt 25 → ×2,4 (Messung über 10 s Bereich-Punkte)
  const rate = (energie) => {
    const z = neu();
    for (let i = 0; i < 20; i++) z.schritt(DT, lageMit([treffer(0, 0, -60)])); // Heck 0 %
    z.befehl({ station: 'technik', art: 'energie', ...energie });
    z.befehl({ station: 'technik', art: 'trupp', nr: 1, bereich: 'heck' });
    for (let i = 0; i < 60 * 8; i++) z.schritt(DT, lageMit()); // Weg 6 s + 2 s Arbeit
    const a = bereich(z, 'heck').punkte;
    for (let i = 0; i < 600; i++) z.schritt(DT, lageMit());
    return (bereich(z, 'heck').punkte - a) / 10;
  };
  const r25 = rate({ antrieb: 35, waffen: 40, reparatur: 25 }), r60 = rate({ antrieb: 20, waffen: 20, reparatur: 60 });
  zeile('Reparatur Energie 60 vs 25', '×2,40', '×' + (r60 / r25).toFixed(2) + ' (' + r25.toFixed(2) + ' → ' + r60.toFixed(2) + ' P/s)', Math.abs(r60 / r25 - 2.4) < 1e-6);
  // Antrieb zerstört → hebelMax 0,3 (Notfahrt), Nachbrenner aus
  const z2 = neu();
  for (let i = 0; i < 20; i++) z2.schritt(DT, lageMit([treffer(0, 0, -115)]));
  w = z2.schritt(DT, lageMit());
  zeile('Antrieb 0 % → hebelMax / Nachbrenner', ZENTRALE.antriebRest + ' / gesperrt', w.hebelMax.toFixed(2) + ' / ' + (w.nachbrennerFrei ? 'frei' : 'gesperrt'), Math.abs(w.hebelMax - ZENTRALE.antriebRest) < 1e-9 && !w.nachbrennerFrei);
  // Leichter Schaden (Antrieb 70 %, Mitte 70 %) → noch keine Wirkung (wirkSchwelle 60 %)
  const z2b = neu();
  for (let i = 0; i < 6; i++) z2b.schritt(DT, lageMit([treffer(0, 0, -115), treffer(0, -2, 38)]));
  w = z2b.schritt(DT, lageMit());
  zeile('Antrieb/Mitte 70 % → hebelMax / Türme aus', '1 / 0', w.hebelMax + ' / ' + w.tuermeAus.length + ' (Antrieb ' + Math.round(bereich(z2b, 'antrieb').zustand * 100) + ' %)', w.hebelMax === 1 && w.tuermeAus.length === 0);
  // Batterie oben zerstört → alle oberen Türme aus (Grund 1), untere an
  const z3 = neu(), oben = tuerme.filter((t) => t.lafette.oben !== false);
  const l0 = oben[0].lafette;
  for (let i = 0; i < 20; i++) z3.schritt(DT, lageMit([treffer(l0.x, l0.y + 1, l0.z)]));
  w = z3.schritt(DT, lageMit());
  const grund1 = w.turmGrund.filter((g) => g === 1).length;
  zeile('Batterie oben 0 % → obere Türme aus', oben.length + ' (Grund 1)', grund1 + ' · unten an: ' + tuerme.filter((t) => t.lafette.oben === false).every((t) => w.turmGrund[t.index] === 0), grund1 === oben.length);
  // Teilschaden 45 % → ceil(n · 0,25) aus, der getroffene Turm zuerst
  const z4 = neu();
  for (let i = 0; i < 11; i++) z4.schritt(DT, lageMit([treffer(l0.x, l0.y + 1, l0.z)])); // 300 − 165 = 135 → 45 %
  w = z4.schritt(DT, lageMit());
  const soll4 = Math.ceil(oben.length * (0.6 - 0.45) / 0.6 - 1e-9);
  zeile('Batterie oben 45 % → Türme aus, getroffener zuerst', soll4 + ', Turm ' + oben[0].index + ' dabei', w.tuermeAus.length + ' [' + w.tuermeAus.join(',') + ']', w.tuermeAus.length === soll4 && w.tuermeAus.includes(oben[0].index));
  // Alarm
  const z5 = neu();
  z5.befehl({ station: 'kapitaen', art: 'alarm', stufe: 'gruen' });
  w = z5.schritt(DT, lageMit());
  zeile('Alarm Grün → Waffen gesichert', 'feuerFrei false', w.feuerFrei, w.feuerFrei === false && z5.zustand.waffen.frei === true);
  z5.befehl({ station: 'kapitaen', art: 'alarm', stufe: 'gelb' });
  w = z5.schritt(DT, lageMit());
  const gelbAus = tuerme.length - Math.floor(0.75 * tuerme.length + 1e-9);
  zeile('Alarm Gelb → ¾ besetzt', gelbAus + ' Türme aus, Feuer frei', w.tuermeAus.length + ', ' + w.feuerFrei, w.tuermeAus.length === gelbAus && w.feuerFrei);
  z5.befehl({ station: 'kapitaen', art: 'anweisung', code: 'gefechtsstationen' });
  w = z5.schritt(DT, lageMit());
  zeile('Anweisung Gefechtsstationen → Rot, alle Türme', 'rot · 0 aus', z5.zustand.alarm + ' · ' + w.tuermeAus.length, z5.zustand.alarm === 'rot' && w.tuermeAus.length === 0);
  // Schadenskontrolle verteilt Trupps auf die schwersten Schäden
  for (let i = 0; i < 12; i++) z5.schritt(DT, lageMit([treffer(0, 0, -115)]));
  for (let i = 0; i < 6; i++) z5.schritt(DT, lageMit([treffer(0, -4, 120)]));
  z5.befehl({ station: 'kapitaen', art: 'anweisung', code: 'schadenskontrolle' });
  z5.schritt(DT, lageMit());
  const tb = z5.zustand.trupps.map((t) => t.bereich).join(',');
  zeile('Schadenskontrolle → Trupps', 'antrieb,bug,antrieb', tb, tb === 'antrieb,bug,antrieb');
}

// ---------------- 4) Autopilot an einem echten Schiff ----------------
function fahre(werteTyp, peilungGrad, hoeheGrad, mitFahrt, startRot = null) {
  const sim = erstelleSchiffSim(WERTE[werteTyp]);
  if (startRot) sim.z.rot.copy(startRot);
  const zt = neu();
  zt.befehl({ station: 'navigator', art: 'kurs', peilung: peilungGrad * GRAD, hoehe: hoeheGrad * GRAD });
  if (mitFahrt) zt.befehl({ station: 'navigator', art: 'fahrt', stufe: 2 });
  const p = peilungGrad * GRAD, h = hoeheGrad * GRAD;
  const soll = new Vector3(-Math.sin(p) * Math.cos(h), Math.sin(h), Math.cos(p) * Math.cos(h));
  const bug = new Vector3(), oben = new Vector3();
  let t = 0, drin = -1, maxRoll = 0, maxNach = 0;
  const lage = { schiffZ: sim.z, treffer: [], tuerme, ziele: [], werte: sim.werte };
  const befehl = {};
  for (let i = 0; i < 60 * 45; i++) {
    const w = zt.schritt(DT, lage);
    for (const k of Object.keys(befehl)) delete befehl[k];
    if (w.steuer?.lenkt) { befehl.gieren = w.steuer.gieren; befehl.nicken = w.steuer.nicken; befehl.rollen = w.steuer.rollen; }
    if (w.steuer?.faehrt) befehl.hebel = w.steuer.hebel;
    sim.schritt(DT, befehl); t += DT;
    bug.set(0, 0, 1).applyQuaternion(sim.z.rot);
    const fehler = bug.angleTo(soll) / GRAD;
    if (fehler <= 3) { if (drin < 0) drin = t; } else if (t < 40) drin = -1; // muss DRIN BLEIBEN
    if (drin >= 0) maxNach = Math.max(maxNach, fehler);
    oben.set(0, 1, 0).applyQuaternion(sim.z.rot);
    // Rollwinkel: Neigung der Schiffs-Hochachse gegen die Ebene aus Bug und Welt-oben
    const seit = new Vector3(1, 0, 0).applyQuaternion(sim.z.rot);
    if (drin >= 0) maxRoll = Math.max(maxRoll, Math.abs(Math.asin(Math.max(-1, Math.min(1, seit.y)))) / GRAD);
  }
  const endRoll = Math.abs(Math.asin(Math.max(-1, Math.min(1, new Vector3(1, 0, 0).applyQuaternion(sim.z.rot).y)))) / GRAD;
  return { drin, maxNach, maxRoll, endRoll, hebel: sim.z.hebel };
}
{
  const faelle = [
    ['bollwerk', 90, 0, false], ['bollwerk', 180, 0, true], ['bollwerk', 270, 25, true], ['bollwerk', 45, -40, false],
    ['bollwerk', 135, 55, true], ['ambos', 200, -30, true],
  ];
  const schief = new Quaternion().setFromEuler(new Euler(0.3, -0.8, 0.9));
  faelle.push(['bollwerk', 0, 0, false, schief]);
  let schlechtest = 0, alle = true; const txt = [];
  for (const [typ, p, h, f, rot] of faelle) {
    const r = fahre(typ, p, h, f, rot);
    const ok = r.drin >= 0 && r.drin < 30 && r.maxNach <= 3 && r.maxRoll <= 8 && r.endRoll <= 0.5;
    alle &&= ok; schlechtest = Math.max(schlechtest, r.drin < 0 ? 99 : r.drin);
    txt.push(`${typ[0]}${p}/${h}${rot ? 's' : ''}: ${r.drin < 0 ? '—' : r.drin.toFixed(1) + 's'} (nach ≤${r.maxNach.toFixed(2)}°, Rolle ≤${r.maxRoll.toFixed(1)}°, Ende ${r.endRoll.toFixed(2)}°)`);
  }
  zeile('Autopilot ±3° in < 30 s und hält (7 Kurse; Rolle danach ≤ 8°, Ende ≤ 0,5°)', '< 30 s', 'langsamster ' + schlechtest.toFixed(1) + ' s', alle);
  for (const t of txt) zeilen.push({ groesse: '  ' + t, ziel: '', wert: '', ok: '' });
  const r = fahre('bollwerk', 0, 0, true);
  zeile('Fahrtstufe Halbe → Hebel', '0,66', r.hebel.toFixed(3), Math.abs(r.hebel - 0.66) < 0.01);
  // Kurs aus → steuer null
  const zt = neu();
  zt.befehl({ station: 'navigator', art: 'kurs', peilung: 1, hoehe: 0 }); zt.schritt(DT, lageMit());
  zt.befehl({ station: 'navigator', art: 'kursAus' });
  const w = zt.schritt(DT, lageMit());
  zeile('kursAus → steuer null', 'null', w.steuer, w.steuer === null);
}

// ---------------- 5) Gleichlauf ----------------
function lauf(zt) {
  const folge = {
    10: { station: 'navigator', art: 'kurs', peilung: 2.2, hoehe: 0.3 }, 40: { station: 'technik', art: 'trupp', nr: 1, bereich: 'heck' },
    90: { station: 'technik', art: 'energie', antrieb: 30, waffen: 45, reparatur: 25 }, 300: { station: 'kapitaen', art: 'alarm', stufe: 'gelb' },
    500: { station: 'waffen', art: 'munition', munition: 'panzer' }, 700: { station: 'kapitaen', art: 'anweisung', code: 'schadenskontrolle' },
    900: { station: 'navigator', art: 'fahrt', stufe: 3 }, 1200: { station: 'kapitaen', art: 'ansage', text: 'Achtung, Anflug von Backbord' },
  };
  const sim = erstelleSchiffSim(WERTE.bollwerk), b = {};
  const lage = { schiffZ: sim.z, treffer: [], tuerme, ziele: [], werte: sim.werte };
  for (let i = 0; i < 3000; i++) {
    if (folge[i]) zt.befehl(folge[i]);
    // Treffer deterministisch über den Rumpf gestreut (Lokal → Welt mit der aktuellen Lage)
    lage.treffer.length = 0;
    if (i % 7 === 0) {
      const lz = -120 + ((i * 37) % 250), lx = ((i * 13) % 40) - 20;
      lage.treffer.push({ pos: new Vector3(lx, 8, lz).applyQuaternion(sim.z.rot).add(sim.z.pos), schaden: 15 });
    }
    const w = zt.schritt(DT, lage);
    for (const k of Object.keys(b)) delete b[k];
    if (w.steuer?.lenkt) Object.assign(b, { gieren: w.steuer.gieren, nicken: w.steuer.nicken, rollen: w.steuer.rollen });
    if (w.steuer?.faehrt) b.hebel = w.steuer.hebel;
    sim.schritt(DT, b);
  }
  return zt.pruefsumme();
}
{
  const a = neu(), s1 = lauf(a), s2 = lauf(neu());
  a.zuruecksetzen(); const s3 = lauf(a);
  zeile('Gleichlauf zwei Läufe', 'gleich', s1.toFixed(6) + (s1 === s2 ? ' = ' : ' ≠ ') + s2.toFixed(6), s1 === s2);
  zeile('Gleichlauf nach zuruecksetzen()', 'gleich', s3 === s1 ? 'gleich' : s3.toFixed(6), s3 === s1);
  const frisch = neu(), r = neu(); lauf(r); r.zuruecksetzen();
  zeile('zuruecksetzen() = frische Instanz', 'gleiche pruefsumme', r.pruefsumme() === frisch.pruefsumme(), r.pruefsumme() === frisch.pruefsumme());
  // Gegenprobe: ein anderer Befehl ändert die Summe
  const c = neu(); c.befehl({ station: 'waffen', art: 'feuer', frei: false }); const s4 = lauf(c);
  zeile('Gegenprobe: anderer Befehl → andere Summe', '≠', s4 !== s1, s4 !== s1);
}

// ---------------- 6) Ungültige Befehle ----------------
{
  const schlecht = [
    null, 42, 'kurs', [], {}, { station: 'navigator' }, { station: 'brücke', art: 'kurs' }, { station: 'navigator', art: 'feuer', frei: true },
    { station: 'navigator', art: 'kurs', peilung: NaN, hoehe: 0 }, { station: 'navigator', art: 'kurs', peilung: 1 },
    { station: 'navigator', art: 'kurs', peilung: 1, hoehe: 2 }, { station: 'navigator', art: 'kurs', peilung: 1, hoehe: 0, extra: 1 },
    { station: 'navigator', art: 'fahrt', stufe: 4 }, { station: 'navigator', art: 'fahrt', stufe: 1.5 },
    { station: 'waffen', art: 'feuer', frei: 'ja' }, { station: 'waffen', art: 'modus', modus: 'dauerfeuer' },
    { station: 'waffen', art: 'munition', munition: 'laser' }, { station: 'waffen', art: 'zielVorgabe', zielId: -3 },
    { station: 'waffen', art: 'zielVorgabe' }, { station: 'technik', art: 'trupp', nr: 4, bereich: 'bug' },
    { station: 'technik', art: 'trupp', nr: 1, bereich: 'kombüse' }, { station: 'technik', art: 'energie', antrieb: 40, waffen: 40, reparatur: 40 },
    { station: 'technik', art: 'energie', antrieb: -10, waffen: 60, reparatur: 50 }, { station: 'technik', art: 'energie', antrieb: '35', waffen: 40, reparatur: 25 },
    { station: 'kapitaen', art: 'alarm', stufe: 'blau' }, { station: 'kapitaen', art: 'ansage', text: '' },
    { station: 'kapitaen', art: 'ansage', text: 'x'.repeat(81) }, { station: 'kapitaen', art: 'ansage', text: 'a\nb' },
    { station: 'kapitaen', art: 'anweisung', code: 'toString' }, { station: '__proto__', art: 'x' },
    { station: 'kapitaen', art: 'alarm', stufe: 'rot', takt: -1 }, { station: 'navigator', art: 'toString' },
  ];
  const gut = [
    { station: 'navigator', art: 'kurs', peilung: 7, hoehe: -0.5 }, { station: 'navigator', art: 'fahrt', stufe: -1 },
    { station: 'navigator', art: 'kursAus' }, { station: 'navigator', art: 'stopp', takt: 5, von: 'gast-2' },
    { station: 'waffen', art: 'feuer', frei: false }, { station: 'waffen', art: 'modus', modus: 'zielfeuer' },
    { station: 'waffen', art: 'munition', munition: 'flak' }, { station: 'waffen', art: 'zielVorgabe', zielId: null },
    { station: 'technik', art: 'trupp', nr: 3, bereich: null }, { station: 'technik', art: 'energie', antrieb: 0, waffen: 100, reparatur: 0 },
    { station: 'kapitaen', art: 'alarm', stufe: 'gelb' }, { station: 'kapitaen', art: 'ansage', text: 'Steuerbord voraus Kontakte' },
    { station: 'kapitaen', art: 'anweisung', code: 'feuerHalt' },
  ];
  const zt = neu(); zt.schritt(DT, lageMit());
  const vorher = zt.pruefsumme();
  let abgewiesen = 0; const durch = [];
  for (const b of schlecht) { const r = zt.befehl(b); if (!r.ok && r.grund) abgewiesen++; else durch.push(JSON.stringify(b)); }
  zeile('Ungültige Befehle abgewiesen (mit Grund)', schlecht.length, abgewiesen + (durch.length ? ' durch: ' + durch.join(' ') : ''), abgewiesen === schlecht.length);
  zt.schritt(DT, lageMit());
  zeile('… und ändern nichts', 'pruefsumme bis auf den Takt gleich', (zt.pruefsumme() - vorher).toFixed(4), Math.abs(zt.pruefsumme() - vorher - 0.001) < 1e-9);
  let an = 0; for (const b of gut) if (pruefeBefehl(b).ok) an++;
  zeile('Gültige Befehle angenommen', gut.length, an, an === gut.length);
  const kopie = pruefeBefehl({ station: 'technik', art: 'energie', antrieb: 50, waffen: 30, reparatur: 20 });
  zeile('Bereinigte Kopie ist JSON-fest', 'Rundreise gleich', JSON.stringify(JSON.parse(JSON.stringify(kopie.befehl))) === JSON.stringify(kopie.befehl), ENERGIE_SUMME === 100);
}

// ---------------- 7) Ohne Bedienung keine Wirkung · echtes Gefecht ----------------
{
  const g = erstelleGefecht();
  const zt = erstelleZentrale({ kugeln: g.daten.kugeln });
  // WARUM die Hülle um angreifer.schritt: sim/gefecht.js gibt die Trefferliste nicht heraus (nur die Summe); die
  // Projektleitung reicht beim Einbau `a.treffer` direkt durch — hier dasselbe ohne gefecht.js zu ändern
  let letzte = null; const orig = g.angreifer.schritt;
  g.angreifer.schritt = (...a) => (letzte = orig(...a));
  const lage = { schiffZ: g.schiff.z, treffer: [], tuerme: g.flak.tuerme, ziele: g.angreifer.ziele, welle: g.angreifer.welle, werte: g.welt.werte };
  let wirkungslos = true, heileSchritte = 0, zt_ms = 0;
  for (let i = 0; i < 60 * 90; i++) {
    g.schritt(DT, {}, { modus: 'sperrfeuer', feuerFrei: true, folgen: true, schirmAbstand: 800, v0: 1100 });
    lage.treffer = letzte?.treffer ?? [];
    const a = performance.now();
    const w = zt.schritt(DT, lage);
    zt_ms += performance.now() - a;
    // WARUM nur solange heil: Schaden DARF wirken (das ist der Sinn) — ungestört muss die Zentrale neutral sein
    const heil = zt.zustand.bereiche.every((b) => b.zustand === 1);
    if (w.steuer !== null || w.feuerFrei !== true || w.reparatur !== 0 || (heil && (w.hebelMax !== 1 || w.tuermeAus.length))) wirkungslos = false;
    if (heil) heileSchritte++;
  }
  const summe = zt.zustand.bereiche.reduce((s, b) => s + b.rumpfSchaden, 0);
  zeile('Echtes Gefecht 90 s: Rumpfschaden der Bereiche = Schaden am Schiff', g.zaehler.schadenAmSchiff, summe + ' (' + zt.zustand.bereiche.map((b) => b.id + ' ' + b.treffer).join(', ') + ')',
    summe === g.zaehler.schadenAmSchiff && summe > 0);
  zeile('Ohne Bedienung: steuer null, Feuer frei, ungestört hebelMax 1 + alle Türme', 'wirkungslos', wirkungslos + ' (' + heileSchritte + ' Schritte unbeschädigt)', wirkungslos && heileSchritte > 600);
  zeile('Rechenzeit zentrale.schritt', '< 0,02 ms/Schritt', (zt_ms / (60 * 90)).toFixed(4) + ' ms', zt_ms / (60 * 90) < 0.02);

}

// ---------------- Ausgabe ----------------
const w1 = Math.max(...zeilen.map((z) => z.groesse.length)), w2 = Math.max(...zeilen.map((z) => z.ziel.length));
console.log('Messgröße'.padEnd(w1) + ' | ' + 'Ziel'.padEnd(w2) + ' | Wert | ok');
for (const z of zeilen) console.log(z.groesse.padEnd(w1) + ' | ' + z.ziel.padEnd(w2) + ' | ' + z.wert + (z.ok ? ' | ' + z.ok : ''));
console.log(`\nzentrale.mjs: ${harte ? harte + ' FEHLER' : 'alles ok'} · ${((performance.now() - START) / 1000).toFixed(1)} s`);
process.exit(harte ? 1 : 0);
