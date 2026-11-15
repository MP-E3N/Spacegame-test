// ZWECK: Messflüge ohne Browser (`npm test`) für sim/schiff.js.
// LIEFERT: Tabelle „Messgröße | Ziel | Wert | ok“; Exit-Code 1 bei FEHLER (NaN, Gleichlauf verletzt, grob falsche Richtung).
// REGEL: Zielverfehlung = WARN (Abstimmung), harte Fehler = FEHLER.
import { Vector3 } from 'three';
import { erstelleSchiffSim, lokaleGeschwindigkeit } from '../src/sim/schiff.js';
import { SCHIFF } from '../src/sim/werte.js';

const DT = 1 / 60;
const zeilen = [];
let harte = 0;
const zeile = (groesse, ziel, wert, ok, hart = false) => {
  if (!ok && hart) harte++;
  zeilen.push({ groesse, ziel, wert, ok: ok ? 'ok' : hart ? 'FEHLER' : 'WARN' });
};
const fliege = (sim, sek, befehl, bis) => {
  for (let i = 0, n = Math.round(sek / DT); i < n; i++) {
    sim.schritt(DT, typeof befehl === 'function' ? befehl(i * DT) : befehl);
    if (bis?.(sim.z)) return (i + 1) * DT;
  }
  return Infinity;
};
const vl = new Vector3();

// 1) Beschleunigen auf Marschfahrt (Hebel 0 → 1 dauert 2 s)
{
  const sim = erstelleSchiffSim();
  const t = fliege(sim, 60, { hebel: 1 }, (z) => lokaleGeschwindigkeit(z, vl).z >= SCHIFF.vMax * 0.95);
  zeile('0 → 95 % vMax (s)', '7–20', t.toFixed(1), t >= 7 && t <= 20);
  fliege(sim, 15, {});
  const v = lokaleGeschwindigkeit(sim.z, vl).z;
  zeile('Marschfahrt Hebel 1 (m/s)', SCHIFF.vMax, v.toFixed(1), Math.abs(v - SCHIFF.vMax) < 1);
  zeile('Fahrtrichtung = Bug (+Z)', 'pos.z > 0', sim.z.pos.z.toFixed(0), sim.z.pos.z > 1000 && Math.abs(sim.z.pos.x) < 1, true);
  // 2) Nachbrenner
  fliege(sim, 20, { nachbrenner: true });
  const vnb = lokaleGeschwindigkeit(sim.z, vl).z;
  zeile('Nachbrenner (m/s)', (SCHIFF.vMax * SCHIFF.nachbrenner).toFixed(0), vnb.toFixed(1), Math.abs(vnb - SCHIFF.vMax * SCHIFF.nachbrenner) < 2);
  // 3) Stopp
  const tStopp = fliege(sim, 60, (t) => ({ stopp: t === 0 }), (z) => z.vel.length() < 1);
  zeile('Vollbremsung aus Nachbrenner (s)', '20–45', tStopp.toFixed(1), tStopp >= 20 && tStopp <= 45);
}

// 4) Drehrate (Gieren) und Richtung
{
  const sim = erstelleSchiffSim();
  fliege(sim, 4, { gieren: 1 });
  const w = sim.z.dreh.y;
  zeile('Gierrate (°/s)', (SCHIFF.drehMax.gieren * 180 / Math.PI).toFixed(1), (w * 180 / Math.PI).toFixed(1), Math.abs(w - SCHIFF.drehMax.gieren) < 0.01);
  const nase = new Vector3(0, 0, 1).applyQuaternion(sim.z.rot);
  zeile('A (gieren +1) dreht Nase nach links (+X)', 'x > 0', nase.x.toFixed(2), nase.x > 0, true);
  const t = fliege(sim, 10, {}, (z) => Math.abs(z.dreh.y) < 0.002);
  zeile('Drehung stoppt nach Loslassen (s)', '< 3', t.toFixed(2), t < 3);
  const s2 = erstelleSchiffSim();
  fliege(s2, 2, { nicken: 1 });
  const n2 = new Vector3(0, 0, 1).applyQuaternion(s2.z.rot);
  zeile('↑ (nicken +1) hebt die Nase', 'y > 0', n2.y.toFixed(2), n2.y > 0, true);
  const s3 = erstelleSchiffSim();
  fliege(s3, 2, { rollen: 1 });
  const l3 = new Vector3(1, 0, 0).applyQuaternion(s3.z.rot);
  zeile('E (rollen +1) hebt Backbordseite (Rolle rechts)', 'y > 0', l3.y.toFixed(2), l3.y > 0, true);
}

// 5) Kurve mit Dämpfer: Drift baut sich ab
{
  const sim = erstelleSchiffSim();
  fliege(sim, 25, { hebel: 1 });
  fliege(sim, 5, { gieren: 1 });
  fliege(sim, 40, {}); // WARUM 40 s: quer nur 6 m/s² → 140 m/s Seitendrift braucht ~25 s
  const v = lokaleGeschwindigkeit(sim.z, vl);
  const drift = Math.hypot(v.x, v.y);
  zeile('Drift 40 s nach 5-s-Kurve bei Marschfahrt (m/s)', '< 1', drift.toFixed(2), drift < 1);
}

// 6) Ohne Dämpfer: das Schiff treibt weiter
{
  const sim = erstelleSchiffSim();
  fliege(sim, 25, { hebel: 1 });
  fliege(sim, 0.1, (t) => ({ daempferUmschalten: t === 0, stopp: t === 0 }));
  const v0 = sim.z.vel.length();
  fliege(sim, 10, {});
  const v1 = sim.z.vel.length();
  zeile('Ohne Dämpfer: Fahrt bleibt (m/s)', v0.toFixed(1), v1.toFixed(1), Math.abs(v1 - v0) < 0.01);
}

// 7) Gleichlauf: gleiche Befehle → exakt gleicher Zustand (Voraussetzung für Koop/Netz)
{
  const lauf = () => {
    const sim = erstelleSchiffSim();
    let s = 12345;
    const zuf = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff) * 2 - 1;
    for (let i = 0; i < 6000; i++) {
      const b = i % 30 === 0 ? { hebel: zuf(), gieren: zuf(), nicken: zuf(), rollen: zuf(), quer: zuf(), hoch: zuf(), nachbrenner: zuf() > 0, daempferUmschalten: zuf() > 0.95 } : null;
      sim.schritt(DT, b ?? {});
    }
    return [...sim.z.pos.toArray(), ...sim.z.vel.toArray(), ...sim.z.rot.toArray()];
  };
  const a = lauf(), b = lauf();
  const gleich = a.every((x, i) => x === b[i]);
  const endlich = a.every(Number.isFinite);
  zeile('Gleichlauf (100 s Zufallsbefehle)', 'identisch', gleich ? 'identisch' : 'abweichend', gleich, true);
  zeile('Keine NaN/Unendlich', 'endlich', endlich ? 'endlich' : 'NaN!', endlich, true);
}

console.table(zeilen);
console.log(harte ? `${harte} FEHLER` : 'Alle harten Prüfungen ok.');
process.exit(harte ? 1 : 0);
