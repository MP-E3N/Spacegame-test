// ZWECK: Prüfungen ohne Browser für Schiffsdaten und Asteroidenfeld (`node tests/schiffe.mjs`).
//   1) Spaltmaß jedes Turms: Fußpunkt liegt bündig auf dem ECHTEN Loft (Strahltest auf die Grafik-Geometrie,
//      feiner als fusspunkt() abtastet) und die Schürze reicht bis zum tiefsten Punkt der Standfläche.
//   2) Feld == alter Erzeuger aus grafik/asteroiden.js (Runde 4, hier eingefroren), Abweichung < 1e-9.
//   3) src/sim/** importiert nichts aus grafik/; src/sim/schiffe/ und feld.js auch kein three (reine Daten).
//   4) Kugel-Deckung des Rumpfs (Rumpfpunkte höchstens 1,5 m außerhalb einer Kugel) — WARN unter 85 %; Überstand als Info.
// LIEFERT: Tabelle „Messgröße | Ziel | Wert | ok“; Exit-Code 1 bei FEHLER.
import * as THREE from 'three';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { SCHIFFSDATEN, alleTeile, TURM, masse } from '../src/sim/schiffe/index.js';
import { erstelleFeld } from '../src/sim/feld.js';
import { loft } from '../src/grafik/schiff/bauteile.js';
import { zufall } from '../src/grafik/zufall.js';

const zeilen = [];
let harte = 0;
const zeile = (groesse, ziel, wert, ok, hart = true) => {
  if (!ok && hart) harte++;
  zeilen.push({ groesse, ziel, wert, ok: ok ? 'ok' : hart ? 'FEHLER' : 'WARN' });
};

// ---------- 1) Spaltmaß ----------
const strahl = new THREE.Raycaster(), o = new THREE.Vector3(), d = new THREE.Vector3();
for (const [key, schiff] of Object.entries(SCHIFFSDATEN)) {
  const netze = alleTeile(schiff.teile).map((t) => new THREE.Mesh(loft(t.ab, t.fase)));
  netze.forEach((n) => n.updateMatrixWorld());
  schiff.tuerme.forEach((t, i) => {
    const r = TURM.fussR * t.s, auf = t.oben ? 1 : -1;
    let hoch = -Infinity, tief = Infinity; // „hoch“ = am weitesten vom Rumpf weg
    for (let k = 0; k <= 8; k++) for (let j = 0, n = k ? 64 : 1; j < n; j++) {
      const w = j / n * Math.PI * 2, rr = r * k / 8;
      o.set(t.x + Math.cos(w) * rr, auf * 1000, t.z + Math.sin(w) * rr); d.set(0, -auf, 0);
      strahl.set(o, d);
      const hit = strahl.intersectObjects(netze, false)[0];
      if (!hit) continue;
      const v = auf * hit.point.y;
      hoch = Math.max(hoch, v); tief = Math.min(tief, v);
    }
    const spalt = auf * t.y - hoch, schuerze = auf * t.y - t.schuerze - tief;
    zeile(`${key} Turm ${i} (${t.typ}) Spalt m`, '|x| < 0,05', spalt.toFixed(3), Math.abs(spalt) < 0.05 && t.id === i);
    zeile(`${key} Turm ${i} Schürze bis Rumpf m`, '≤ 0,05', schuerze.toFixed(3), schuerze <= 0.05);
  });
}

// ---------- 2) Feld == alter Erzeuger ----------
function alterErzeuger() { // Kopie aus grafik/asteroiden.js (Stand Runde 4) — NICHT ändern
  const rnd = zufall(2024);
  const liste = [];
  const v = new THREE.Vector3();
  for (let i = 0; i < 90; i++) {
    do v.set((rnd() - 0.5) * 7000, (rnd() - 0.5) * 1800, 300 + rnd() * 7000); while (v.length() < 450);
    const gross = rnd() < 0.08;
    const s = gross ? 120 + rnd() * 220 : 8 + Math.pow(rnd(), 2) * 70;
    liste.push({ form: i % 6, pos: v.clone(), skala: new THREE.Vector3(s * (0.8 + rnd() * 0.5), s * (0.6 + rnd() * 0.4), s * (0.8 + rnd() * 0.5)),
      achse: new THREE.Vector3(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).normalize(), tempo: (rnd() - 0.5) * 0.06, start: rnd() * 6 });
  }
  for (let i = 0; i < 90; i++) {
    v.set((rnd() - 0.5) * 2000, (rnd() - 0.5) * 700, (rnd() - 0.2) * 2400);
    if (v.length() < 200) continue;
    const s = 0.8 + Math.pow(rnd(), 2) * 6;
    liste.push({ form: i % 6, pos: v.clone(), skala: new THREE.Vector3(s, s * (0.6 + rnd() * 0.4), s * (0.7 + rnd() * 0.5)),
      achse: new THREE.Vector3(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).normalize(), tempo: (rnd() - 0.5) * 0.4, start: rnd() * 6 });
  }
  return liste;
}
{
  const alt = alterErzeuger(), neu = erstelleFeld();
  let fehler = 0, rOk = true;
  for (let i = 0; i < Math.min(alt.length, neu.length); i++) {
    const a = alt[i], b = neu[i];
    const paare = [[a.pos.x, b.x], [a.pos.y, b.y], [a.pos.z, b.z], [a.skala.x, b.skala[0]], [a.skala.y, b.skala[1]], [a.skala.z, b.skala[2]],
      [a.achse.x, b.achse[0]], [a.achse.y, b.achse[1]], [a.achse.z, b.achse[2]], [a.tempo, b.tempo], [a.start, b.start], [a.form, b.form]];
    for (const [p, q] of paare) fehler = Math.max(fehler, Math.abs(p - q));
    if (!(b.r > 0 && Number.isFinite(b.r))) rOk = false;
  }
  zeile('Feld: Anzahl alt = neu', String(alt.length), String(neu.length), alt.length === neu.length);
  zeile('Feld: größte Abweichung', '< 1e-9', fehler.toExponential(1), fehler < 1e-9);
  const rs = neu.map((a) => a.r);
  zeile('Feld: Radius r endlich > 0 (min–max m)', 'ja', `${Math.min(...rs).toFixed(1)}–${Math.max(...rs).toFixed(0)}`, rOk);
}

// ---------- 3) Importe in src/sim ----------
{
  const schlecht = [];
  const lauf = (ordner) => {
    for (const n of readdirSync(ordner)) {
      const p = join(ordner, n);
      if (statSync(p).isDirectory()) { lauf(p); continue; }
      if (!n.endsWith('.js')) continue;
      const text = readFileSync(p, 'utf8');
      // Regel 1 (CLAUDE.md) für ALLE Ordner unter src/sim: kein Math.random, kein DOM (Befund Prüfer R6). Kommentare zählen nicht.
      const code = text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
      for (const verboten of ['Math.random', 'document.', 'window.', 'requestAnimationFrame', 'performance.now']) {
        if (code.includes(verboten)) schlecht.push(`${n}: ${verboten}`);
      }
      for (const m of text.matchAll(/(?:from\s+|import\s*\(\s*|import\s+)['"]([^'"]+)['"]/g)) {
        // WARUM three nur in schiffe/ + feld.js verboten: sim/schiff.js (Flugsystem) nutzt Vector3/Quaternion, das ist erlaubt
        const reinDaten = p.includes('schiffe') || n === 'feld.js';
        if (m[1].includes('grafik') || (reinDaten && (m[1] === 'three' || m[1].startsWith('three/')))) schlecht.push(`${n}: ${m[1]}`);
      }
    }
  };
  lauf(new URL('../src/sim', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
  zeile('src/sim ohne grafik-Importe, Math.random, DOM (schiffe/, feld.js ohne three)', '0', schlecht.length ? schlecht.join(', ') : '0', schlecht.length === 0);
}

// ---------- 4) Kugel-Deckung ----------
// Rumpfpunkte flächengleich (≈ 1 je m²); gedeckt = höchstens 1,5 m außerhalb einer Kugel.
// Überstand = Anteil der Kugel-Oberfläche, der auch 3 m nach innen versetzt noch außerhalb jedes Rumpfteils liegt.
const innen = (teile, x, y, z) => teile.some((t) => { const m = masse(t.ab, z); return m && Math.abs(x - m.x) <= m.w && Math.abs(y - m.y) <= m.h; });
for (const [key, schiff] of Object.entries(SCHIFFSDATEN)) {
  const teile = alleTeile(schiff.teile);
  let drin = 0, alle = 0;
  for (const t of teile) {
    const p = loft(t.ab, t.fase).attributes.position, A = new THREE.Vector3(), u = new THREE.Vector3(), w = new THREE.Vector3(), q = new THREE.Vector3();
    for (let i = 0; i < p.count; i += 3) {
      A.fromBufferAttribute(p, i); u.fromBufferAttribute(p, i + 1).sub(A); w.fromBufferAttribute(p, i + 2).sub(A);
      const n = Math.max(1, Math.round(Math.sqrt(q.crossVectors(u, w).length() / 2)));
      for (let a = 0; a < n; a++) for (let b = 0; b < n - a; b++) {
        q.copy(A).addScaledVector(u, (a + 1 / 3) / n).addScaledVector(w, (b + 1 / 3) / n);
        alle++;
        if (schiff.kugeln.some((k) => Math.hypot(q.x - k.x, q.y - k.y, q.z - k.z) <= k.r + 1.5)) drin++;
      }
    }
  }
  let aus = 0, n = 0;
  for (const k of schiff.kugeln) for (let i = 0; i < 200; i++) {
    const y = 1 - (2 * i + 1) / 200, rr = Math.sqrt(1 - y * y), w = i * 2.39996, f = k.r - 3;
    n++; if (!innen(teile, k.x + Math.cos(w) * rr * f, k.y + y * f, k.z + Math.sin(w) * rr * f)) aus++;
  }
  zeile(`${key}: Rumpf in Kugeln (${schiff.kugeln.length} St., ±1,5 m)`, '≥ 85 %', (100 * drin / alle).toFixed(0) + ' %', drin / alle >= 0.85, false);
  zeile(`${key}: Kugel-Überstand > 3 m`, 'Info', (100 * aus / n).toFixed(0) + ' %', true, false);
}

console.table(zeilen);
console.log(harte ? `${harte} FEHLER` : 'Alle harten Prüfungen ok.');
process.exit(harte ? 1 : 0);
