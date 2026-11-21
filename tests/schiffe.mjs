// ZWECK: Prüfungen ohne Browser für Schiffsdaten und Asteroidenfeld (`node tests/schiffe.mjs`).
//   1) Spaltmaß jedes Turms: Fußpunkt liegt bündig auf dem ECHTEN Loft (Strahltest auf die Grafik-Geometrie,
//      feiner als fusspunkt() abtastet) und die Schürze reicht bis zum tiefsten Punkt der Standfläche.
//   2) Feld == alter Erzeuger aus grafik/asteroiden.js (Runde 4, hier eingefroren), Abweichung < 1e-9.
//   3) src/sim/** importiert nichts aus grafik/; src/sim/schiffe/ und feld.js auch kein three (reine Daten).
//   4) Kugel-Deckung des Rumpfs (Rumpfpunkte höchstens 1,5 m außerhalb einer Kugel) — WARN unter 85 %; Überstand als Info.
//   5) Rumpftreffer (R14): Strahlen innerhalb Grenzen + rumpfSperre() treffen die echten Lofts nicht.
//   6) Abdeckung (R14, Bollwerk): 2000 Richtungen — jede von ≥ 1 Flak-Turm erreichbar; Ziel ≥ 80 % von ≥ 2.
// LIEFERT: Tabelle „Messgröße | Ziel | Wert | ok“; Exit-Code 1 bei FEHLER.
import * as THREE from 'three';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { SCHIFFSDATEN, alleTeile, TURM, masse, rumpfSperre, sperrSektor } from '../src/sim/schiffe/index.js';
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

// ---------- 5) Rumpftreffer (R14) ----------
// Strahlen aus dem Zapfen (Mitte + beide Rohrachsen) innerhalb der Turm-Grenzen UND der Rumpf-Sperre gegen die ECHTEN
// Lofts (auch TEILE.details) bis 300 m: kein Treffer erlaubt. Prüft rumpfSperre() unabhängig (Raycaster statt Kanten).
const umbruch = (w) => w - 2 * Math.PI * Math.floor((w + Math.PI) / (2 * Math.PI));
/** Turm-Rahmen → Schiff (unten: x, y gespiegelt, turm.js). */
const inSchiff = (t, v, punkt) => v.set(t.oben ? v.x : -v.x, t.oben ? v.y : -v.y, v.z).add(punkt ? o.set(t.x, t.y, t.z) : o.set(0, 0, 0));
const richtung = (g, n, v) => v.set(Math.sin(g) * Math.cos(n), Math.sin(n), Math.cos(g) * Math.cos(n));
const erreicht = (t, sperre, g, n) => (t.gier[1] >= Math.PI - 1e-6 || Math.abs(umbruch(g - t.gier[0])) <= t.gier[1])
  && n >= t.nick[0] && n <= t.nick[1] && n >= sperre[sperrSektor(g, sperre.length)];
for (const [key, schiff] of Object.entries(SCHIFFSDATEN)) {
  const netze = alleTeile(schiff.teile).map((t) => new THREE.Mesh(loft(t.ab, t.fase)));
  netze.forEach((n) => n.updateMatrixWorld());
  strahl.far = 300;
  let treffer = 0, strahlen = 0;
  const wo = [], p = new THREE.Vector3(), q = new THREE.Vector3();
  for (const t of schiff.tuerme) {
    const sperre = rumpfSperre(t, schiff.teile), voll = t.gier[1] >= Math.PI - 1e-6, NG = voll ? 96 : 48;
    let hier = 0;
    for (let a = 0; a <= NG; a++) {
      const g = voll ? -Math.PI + 2 * Math.PI * a / NG : t.gier[0] - t.gier[1] + 2 * t.gier[1] * a / NG;
      const nMin = Math.max(t.nick[0], sperre[sperrSektor(g)]);
      if (nMin > t.nick[1]) continue;
      for (let b = 0; b <= 10; b++) {
        const n = nMin + (t.nick[1] - nMin) * b / 10;
        richtung(g, n, q); inSchiff(t, q, false); const dir = q.clone();
        for (const seite of [0, t.muendungen[0].x, -t.muendungen[0].x]) {
          // Zapfen um gier gedreht + Seitenversatz quer zum Rohr (Turm-Rahmen)
          p.set(Math.sin(g) * t.zapfen.z + Math.cos(g) * seite, t.zapfen.y, Math.cos(g) * t.zapfen.z - Math.sin(g) * seite);
          inSchiff(t, p, true);
          strahl.set(p, dir); strahlen++;
          if (strahl.intersectObjects(netze, false).length) hier++;
        }
      }
    }
    if (hier) wo.push(`${t.id}: ${hier}`);
    treffer += hier;
  }
  strahl.far = Infinity;
  zeile(`${key}: Rumpftreffer in Grenzen + Sperre (${strahlen} Strahlen)`, '0', wo.length ? wo.join(', ') : '0', treffer === 0);
}

// ---------- 6) Abdeckung der Flak (R14) ----------
// 2000 Richtungen gleichmäßig auf der Kugel (Schiffs-Rahmen, „im Unendlichen“): von wie vielen Flak-Türmen erreichbar
// (Grenzen + Rumpf-Sperre)? Hart: jede Richtung von ≥ 1 Turm. Ziel (weich): ≥ 80 % von ≥ 2 Türmen.
for (const [key, schiff] of Object.entries(SCHIFFSDATEN)) {
  const flak = schiff.tuerme.filter((t) => t.typ === 'flak');
  if (key !== 'bollwerk') continue; // WARUM nur Bollwerk: Ambos-Türme sind nicht auf Rundum-Abdeckung ausgelegt (Nutzerregel R1)
  const sperren = flak.map((t) => rumpfSperre(t, schiff.teile));
  let eins = 0, zwei = 0; const N = 2000, v = new THREE.Vector3();
  for (let i = 0; i < N; i++) {
    const y = 1 - (2 * i + 1) / N, rr = Math.sqrt(1 - y * y), w = i * 2.39996323;
    let k = 0;
    flak.forEach((t, j) => {
      v.set(Math.cos(w) * rr, y, Math.sin(w) * rr); inSchiff(t, v, false); // Schiff → Turm (Spiegelung ist selbstinvers)
      if (erreicht(t, sperren[j], Math.atan2(v.x, v.z), Math.asin(Math.max(-1, Math.min(1, v.y))))) k++;
    });
    if (k >= 1) eins++;
    if (k >= 2) zwei++;
  }
  zeile(`${key}: Abdeckung ≥ 1 Flak-Turm (${flak.length} St., ${N} Richtungen)`, '100 %', (100 * eins / N).toFixed(1) + ' %', eins === N);
  zeile(`${key}: Abdeckung ≥ 2 Flak-Türme`, '≥ 80 %', (100 * zwei / N).toFixed(1) + ' %', zwei / N >= 0.8, false);
}

console.table(zeilen);
console.log(harte ? `${harte} FEHLER` : 'Alle harten Prüfungen ok.');
process.exit(harte ? 1 : 0);
