// ZWECK: Messflüge ohne Browser (`npm test`) für sim/schiff.js und sim/kollision.js — je Schiff (Bollwerk, Ambos).
// LIEFERT: Tabelle „Messgröße | Ziel | Wert | ok“; Exit-Code 1 bei FEHLER (NaN, Gleichlauf verletzt, grob falsche Richtung,
//          Durchtunneln, Tempolimit gebrochen).
// REGEL: Zielverfehlung = WARN (Abstimmung), harte Fehler = FEHLER. Kollision mit Stub-Kugeln/-Feld (echte Daten: sim/schiffe, sim/feld).
import { Vector3 } from 'three';
import { erstelleSchiffSim, lokaleGeschwindigkeit } from '../src/sim/schiff.js';
import { WERTE } from '../src/sim/werte.js';
import { kollidiere } from '../src/sim/kollision.js';

const DT = 1 / 60;
const zeilen = [];
let harte = 0;
const zeile = (groesse, ziel, wert, ok, hart = false) => {
  if (!ok && hart) harte++;
  zeilen.push({ groesse, ziel, wert, ok: ok ? 'ok' : hart ? 'FEHLER' : 'WARN' });
};
const fliege = (sim, sek, befehl, bis, jeSchritt) => {
  for (let i = 0, n = Math.round(sek / DT); i < n; i++) {
    sim.schritt(DT, typeof befehl === 'function' ? befehl(i * DT) : befehl);
    jeSchritt?.(sim.z);
    if (bis?.(sim.z)) return (i + 1) * DT;
  }
  return Infinity;
};
const vl = new Vector3();
const grad = (r) => (r * 180 / Math.PI).toFixed(1);
const ergebnisse = {};

for (const [name, W] of Object.entries(WERTE)) {
  const N = name === 'bollwerk' ? 'B' : 'A';
  const e = (ergebnisse[name] = {});
  // 1) Beschleunigen auf Marschfahrt
  {
    const sim = erstelleSchiffSim(W);
    const t = fliege(sim, 60, { hebel: 1 }, (z) => lokaleGeschwindigkeit(z, vl).z >= W.vMax * 0.95);
    e.t95 = t;
    zeile(`${N} 0 → 95 % vMax (s)`, '7–20', t.toFixed(1), t >= 7 && t <= 20);
    fliege(sim, 15, {});
    const v = lokaleGeschwindigkeit(sim.z, vl).z;
    zeile(`${N} Marschfahrt Hebel 1 (m/s)`, W.vMax, v.toFixed(1), Math.abs(v - W.vMax) < 1);
    zeile(`${N} Fahrtrichtung = Bug (+Z)`, 'pos.z > 0', sim.z.pos.z.toFixed(0), sim.z.pos.z > 1000 && Math.abs(sim.z.pos.x) < 1, true);
    fliege(sim, 20, { nachbrenner: true });
    const vnb = lokaleGeschwindigkeit(sim.z, vl).z;
    zeile(`${N} Nachbrenner (m/s)`, (W.vMax * W.nachbrenner).toFixed(0), vnb.toFixed(1), Math.abs(vnb - W.vMax * W.nachbrenner) < 2);
    const tStopp = fliege(sim, 60, (t) => ({ stopp: t === 0 }), (z) => z.vel.length() < 1);
    zeile(`${N} Vollbremsung aus Nachbrenner (s)`, '15–45', tStopp.toFixed(1), tStopp >= 15 && tStopp <= 45);
  }
  // 2) Drehrate und Richtungen
  {
    const sim = erstelleSchiffSim(W);
    fliege(sim, 4, { gieren: 1 });
    e.gier = sim.z.dreh.y;
    zeile(`${N} Gierrate (°/s)`, grad(W.drehMax.gieren), grad(sim.z.dreh.y), Math.abs(sim.z.dreh.y - W.drehMax.gieren) < 0.01);
    const nase = new Vector3(0, 0, 1).applyQuaternion(sim.z.rot);
    zeile(`${N} A (gieren +1) dreht Nase nach links (+X)`, 'x > 0', nase.x.toFixed(2), nase.x > 0, true);
    const t = fliege(sim, 10, {}, (z) => Math.abs(z.dreh.y) < 0.002);
    zeile(`${N} Drehung stoppt nach Loslassen (s)`, '< 3', t.toFixed(2), t < 3);
    const s2 = erstelleSchiffSim(W);
    fliege(s2, 2, { nicken: 1 });
    const n2 = new Vector3(0, 0, 1).applyQuaternion(s2.z.rot);
    zeile(`${N} ↑ (nicken +1) hebt die Nase`, 'y > 0', n2.y.toFixed(2), n2.y > 0, true);
    const s3 = erstelleSchiffSim(W);
    fliege(s3, 2, { rollen: 1 });
    const l3 = new Vector3(1, 0, 0).applyQuaternion(s3.z.rot);
    zeile(`${N} E (rollen +1) hebt Backbordseite`, 'y > 0', l3.y.toFixed(2), l3.y > 0, true);
  }
  // 3) Kurve mit Dämpfer: Drift-Spitze und Abbau (Nutzer R4: weniger Drift)
  {
    const sim = erstelleSchiffSim(W);
    fliege(sim, 30, { hebel: 1 });
    let spitze = 0;
    const drift = (z) => { lokaleGeschwindigkeit(z, vl); return Math.hypot(vl.x, vl.y); };
    fliege(sim, 5, { gieren: 1 }, null, (z) => { spitze = Math.max(spitze, drift(z)); });
    const tAb = fliege(sim, 30, {}, (z) => { spitze = Math.max(spitze, drift(z)); return drift(z) < 1; });
    zeile(`${N} Drift-Spitze 5-s-Kurve (m/s)`, '≤ 15', spitze.toFixed(1), spitze <= 15);
    zeile(`${N} Drift < 1 m/s nach Kurve (s)`, '≤ 8', tAb.toFixed(1), tAb <= 8);
  }
  // 4) Ohne Dämpfer: treibt, aber mit Tempolimit
  {
    const sim = erstelleSchiffSim(W);
    fliege(sim, 25, { hebel: 1 });
    fliege(sim, 0.1, (t) => ({ daempferUmschalten: t === 0, stopp: t === 0 }));
    const v0 = sim.z.vel.length();
    fliege(sim, 10, {});
    zeile(`${N} Ohne Dämpfer: Fahrt bleibt (m/s)`, v0.toFixed(1), sim.z.vel.length().toFixed(1), Math.abs(sim.z.vel.length() - v0) < 0.01);
    let vMaxGes = 0;
    fliege(sim, 120, { hebel: 1, nachbrenner: true, quer: 1, hoch: 1 }, null, (z) => { vMaxGes = Math.max(vMaxGes, z.vel.length()); });
    const grenze = W.vMax * W.nachbrenner;
    zeile(`${N} Ohne Dämpfer 120 s Vollschub (m/s)`, `≤ ${grenze}`, vMaxGes.toFixed(2), vMaxGes <= grenze + 1e-6, true);
  }
  // 5) Düsen-Anzeige bleibt in −1..1
  {
    const sim = erstelleSchiffSim(W);
    let s = 7, max = 0;
    const zuf = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff) * 2 - 1;
    let b = {};
    for (let i = 0; i < 6000; i++) {
      if (i % 30 === 0) b = { hebel: zuf(), gieren: zuf(), nicken: zuf(), quer: zuf(), hoch: zuf(), nachbrenner: zuf() > -0.5, daempferUmschalten: zuf() > 0.9 };
      sim.schritt(DT, b);
      const z = sim.z;
      max = Math.max(max, Math.abs(z.schub.x), Math.abs(z.schub.y), Math.abs(z.schub.z), Math.abs(z.drehSchub.x), Math.abs(z.drehSchub.y), Math.abs(z.drehSchub.z));
    }
    zeile(`${N} Düsen-Anzeige |schub| max`, '≤ 1', max.toFixed(3), max <= 1 + 1e-9);
  }
}
// Ambos spürbar wendiger/schneller als Bollwerk
zeile('Ambos schneller (vMax A / B)', '> 1,2', (WERTE.ambos.vMax / WERTE.bollwerk.vMax).toFixed(2), WERTE.ambos.vMax / WERTE.bollwerk.vMax > 1.2);
zeile('Ambos wendiger (Gierrate A / B)', '> 1,5', (ergebnisse.ambos.gier / ergebnisse.bollwerk.gier).toFixed(2), ergebnisse.ambos.gier / ergebnisse.bollwerk.gier > 1.5);

// 6) HP, Schiffswechsel, Wrack
{
  const sim = erstelleSchiffSim(WERTE.bollwerk);
  sim.z.hp = 2500; // 50 %
  sim.setzeWerte(WERTE.ambos);
  zeile('setzeWerte erhält HP-Anteil (Ambos)', '1250', sim.z.hp.toFixed(0), Math.abs(sim.z.hp - 1250) < 1e-6, true);
  fliege(sim, 20, { hebel: 1 });
  zeile('nach setzeWerte: Ambos-vMax', WERTE.ambos.vMax, lokaleGeschwindigkeit(sim.z, vl).z.toFixed(1), Math.abs(vl.z - WERTE.ambos.vMax) < 2);
  fliege(sim, 2, { gieren: 1 });
  sim.z.hp = 0;
  const v0 = sim.z.vel.clone(), w0 = sim.z.dreh.clone();
  fliege(sim, 5, { hebel: 1, gieren: -1, nicken: 1, quer: 1, nachbrenner: true, stopp: true, daempferUmschalten: true });
  const treibt = sim.z.zerstoert && sim.z.vel.distanceTo(v0) < 1e-9 && sim.z.dreh.distanceTo(w0) < 1e-9 && sim.z.schub.length() === 0;
  zeile('Wrack: Befehle wirkungslos, treibt + taumelt', 'ja', treibt ? 'ja' : 'nein', treibt, true);
  sim.zuruecksetzen();
  zeile('zuruecksetzen füllt HP auf', WERTE.ambos.hpMax, sim.z.hp, sim.z.hp === WERTE.ambos.hpMax && !sim.z.zerstoert, true);
}

// 7) Kollision mit Stub-Daten (Schiff: 3 Kugeln längs, Fels r 60 voraus)
const KUGELN = [{ x: 0, y: 0, z: 60, r: 20 }, { x: 0, y: 0, z: 0, r: 25 }, { x: 0, y: 0, z: -60, r: 20 }];
{
  const W = WERTE.bollwerk;
  const feld = [{ x: 0, y: 0, z: 800, r: 60 }];
  const sim = erstelleSchiffSim(W);
  sim.z.vel.set(0, 0, 60); sim.z.hebel = 1; // Marschfahrt
  let vor = 0, nach = 0, tiefe = 0, hp1 = 0, nan = false;
  let tTreffer = -1, hpRuhe = 0;
  for (let i = 0; i < 45 * 60; i++) {
    const vz = sim.z.vel.z;
    sim.schritt(DT, { hebel: 1 });
    const r = kollidiere(sim.z, KUGELN, feld, W);
    // Eindringtiefe NACH dem Herausschieben (soll 0 sein)
    for (const k of KUGELN) {
      const p = new Vector3(k.x, k.y, k.z).applyQuaternion(sim.z.rot).add(sim.z.pos);
      tiefe = Math.max(tiefe, k.r + feld[0].r - p.distanceTo(new Vector3(feld[0].x, feld[0].y, feld[0].z)));
    }
    if (r.treffer && !vor) { vor = vz; nach = sim.z.vel.z; hp1 = sim.z.hp; tTreffer = i; }
    if (tTreffer >= 0 && i === tTreffer + 20 * 60) hpRuhe = sim.z.hp; // WARUM +20 s: Nachhüpfer (18 → 5,4 → 1,6 m/s) sind durch
    nan ||= !Number.isFinite(sim.z.pos.z + sim.z.vel.z + sim.z.hp);
  }
  const erwartet = W.hpMax - (vor - W.schadenSchwelle) * W.schadenProMs * W.hpMax;
  zeile('Fels frontal: Aufprall-Tempo (m/s)', '≈ 60', vor.toFixed(1), vor > 55, true);
  zeile('Fels frontal: Rückprall (m/s)', (-vor * W.abprall).toFixed(1), nach.toFixed(1), Math.abs(nach + vor * W.abprall) < 0.5);
  zeile('Fels frontal: HP nach 1. Aufprall', erwartet.toFixed(0), hp1.toFixed(0), Math.abs(hp1 - erwartet) < 1);
  zeile('Eindringtiefe nach Schritt (m)', '< 0,5', Math.max(0, tiefe).toFixed(3), tiefe < 0.5, true);
  zeile('Anpressen mit Hebel 1 (ab Treffer +20 s): Zusatzschaden', '0', (hpRuhe - sim.z.hp).toFixed(1), hpRuhe === sim.z.hp && tTreffer >= 0);
  zeile('Anpressen: Restbewegung (m/s)', '< 0,5', sim.z.vel.length().toFixed(3), sim.z.vel.length() < 0.5);
  zeile('Kollision: keine NaN', 'endlich', nan ? 'NaN!' : 'endlich', !nan, true);
}
// 8) Durchtunneln: Ambos mit Nachbrenner-Höchsttempo gegen kleinsten Brocken (r 1), seitlich versetzt
{
  const W = WERTE.ambos;
  const sim = erstelleSchiffSim(W);
  const feld = [{ x: 3, y: 0, z: 300, r: 1 }];
  sim.z.vel.set(0, 0, W.vMax * W.nachbrenner); sim.z.hebel = 1;
  let beruehrt = false;
  for (let i = 0; i < 6 * 60; i++) {
    sim.schritt(DT, { hebel: 1, nachbrenner: true });
    if (kollidiere(sim.z, KUGELN, feld, W).kontakte.length) beruehrt = true;
  }
  zeile(`Kein Durchtunneln (${(W.vMax * W.nachbrenner).toFixed(0)} m/s, Fels r 1)`, 'berührt + davor', beruehrt && sim.z.pos.z < 300 ? 'ja' : 'nein', beruehrt && sim.z.pos.z < 300, true);
  // Kontaktliste wird wiederverwendet (keine Neuanlage pro Schritt)
  const a = kollidiere(sim.z, KUGELN, feld, W), b = kollidiere(sim.z, KUGELN, feld, W);
  zeile('Kontaktliste wiederverwendet', 'gleiches Objekt', a === b && a.kontakte === b.kontakte ? 'ja' : 'nein', a === b);
}

// 9) Gleichlauf inkl. Kollision: gleiche Befehle → exakt gleicher Zustand (Voraussetzung für Koop/Netz)
{
  const feld = [];
  { let s = 99; const zuf = () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    for (let i = 0; i < 180; i++) feld.push({ x: (zuf() - 0.5) * 1500, y: (zuf() - 0.5) * 400, z: 100 + zuf() * 2500, r: 2 + zuf() * 80 }); }
  const lauf = (W) => {
    const sim = erstelleSchiffSim(W);
    let s = 12345, treffer = 0;
    const zuf = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff) * 2 - 1;
    let b = {};
    for (let i = 0; i < 6000; i++) {
      b = i % 30 === 0 ? { hebel: zuf() * 0.5 + 0.5, gieren: zuf(), nicken: zuf(), rollen: zuf(), quer: zuf(), hoch: zuf(), nachbrenner: zuf() > 0, daempferUmschalten: zuf() > 0.95 } : {};
      sim.schritt(DT, b);
      treffer += kollidiere(sim.z, KUGELN, feld, W).treffer;
    }
    return { zahlen: [...sim.z.pos.toArray(), ...sim.z.vel.toArray(), ...sim.z.rot.toArray(), sim.z.hp], treffer };
  };
  for (const [name, W] of Object.entries(WERTE)) {
    const a = lauf(W), b = lauf(W);
    const gleich = a.zahlen.every((x, i) => x === b.zahlen[i]);
    zeile(`Gleichlauf ${name} (100 s Zufall + Kollision, ${a.treffer} Treffer)`, 'identisch', gleich ? 'identisch' : 'abweichend', gleich, true);
    zeile(`Keine NaN/Unendlich ${name}`, 'endlich', a.zahlen.every(Number.isFinite) ? 'endlich' : 'NaN!', a.zahlen.every(Number.isFinite), true);
  }
}

console.table(zeilen);
const warn = zeilen.filter((z) => z.ok === 'WARN').length;
console.log(harte ? `${harte} FEHLER` : `Alle harten Prüfungen ok.${warn ? ` (${warn} WARN)` : ''}`);
process.exit(harte ? 1 : 0);
