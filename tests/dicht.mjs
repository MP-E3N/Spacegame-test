// ZWECK: Dichtheit der Generator-Formen nach dem Verschweißen (Runde 22, `node tests/dicht.mjs`) — echte CSG in node
//        (formGeometrie aus src/grafik/form/schweissen.js), gezählt mit offeneKanten.
//   Satz: Träger Kantigkeit 0 mit Seeds 1–100 (dort lagen die Lecks: v2 10 von 100) + 3 Klassen × 10 Seeds × Kantigkeit
//   0 / Standard / 1. Ziel: 0 Formen mit offenen Kanten, Flächenschluss < 1e-6.
//   Gegenprobe: ein Würfel mit einem fehlenden Dreieck MUSS offene Kanten zeigen.
// LIEFERT: Tabelle „Messgröße | Ziel | Wert | ok“; Exit-Code 1 bei FEHLER.
// REGEL: Budget ≤ 30 s (Messung R22: Korvette ~30 ms, Fregatte ~45 ms, Träger ~70 ms je Form in node).
import * as THREE from 'three';
import { formGeometrie, offeneKanten } from '../src/grafik/form/schweissen.js';
import { generiere, standardEinstellung, GENERATOR_REGLER, GENERATOR_VERSION } from '../src/sim/form/generator.js';
import { performance } from 'node:perf_hooks';

const START = performance.now();
const zeilen = [];
let harte = 0;
const zeile = (groesse, ziel, wert, ok, hart = true) => {
  if (!ok && hart) harte++;
  zeilen.push({ groesse, ziel, wert: String(wert), ok: ok ? 'ok' : hart ? 'FEHLER' : 'WARN' });
};

// Gegenprobe: offeneKanten erkennt ein Loch
{
  const g = new THREE.BoxGeometry(4, 3, 10).toNonIndexed(), pos = g.getAttribute('position');
  const loch = new THREE.BufferGeometry(); loch.setAttribute('position', new THREE.Float32BufferAttribute(Array.from(pos.array).slice(0, pos.array.length - 9), 3));
  const zu = offeneKanten({ a: g }).kanten, auf = offeneKanten({ a: loch }).kanten;
  zeile('Gegenprobe offeneKanten: Würfel ganz | Würfel ohne ein Dreieck', '0 | > 0', `${zu} | ${auf}`, zu === 0 && auf > 0);
}

const satz = [];
for (let seed = 1; seed <= 100; seed++) satz.push(['traeger', seed, { kantigkeit: 0 }]);
for (const k of ['korvette', 'fregatte', 'traeger']) for (let i = 0; i < 10; i++) for (const kant of [0, GENERATOR_REGLER.kantigkeit.standard, 1])
  satz.push([k, 1 + ((i * 104729 + 4711) % 999999), { kantigkeit: kant }]);
const offen = [], schluss = [], zeit = { korvette: [], fregatte: [], traeger: [] };
for (const [k, seed, mehr] of satz) {
  const f = generiere({ ...standardEinstellung(k), seed, ...mehr }), t0 = performance.now(), info = formGeometrie(f).info;
  zeit[k].push(performance.now() - t0);
  if (info.offeneKanten) offen.push(`${k} ${seed} kant ${mehr.kantigkeit}: ${info.offeneKanten} (${(info.offeneLaenge * 100).toFixed(0)} cm)`);
  if (!(info.flaechenschluss < 1e-6)) schluss.push(`${k} ${seed}`);
}
zeile(`Generator v${GENERATOR_VERSION} verschweißt: Formen mit offenen Kanten (${satz.length} Formen, davon 100 Träger Kantigkeit 0)`, '0', offen.length ? `${offen.length} — ${offen.slice(0, 4).join(' | ')}` : '0', offen.length === 0);
zeile('Flächenschluss < 1e-6 (geschlossene Hülle)', '0 abweichend', schluss.length ? `${schluss.length} — ${schluss.slice(0, 3).join(', ')}` : '0', schluss.length === 0);
const med = (a) => { const s = [...a].sort((x, y) => x - y); return s[s.length >> 1] ?? 0; };
zeile('Verschweißen in node je Form: Median Korvette / Fregatte / Träger | längste', 'Info', `${med(zeit.korvette).toFixed(0)} / ${med(zeit.fregatte).toFixed(0)} / ${med(zeit.traeger).toFixed(0)} ms | ${Math.max(...Object.values(zeit).flat()).toFixed(0)} ms`, true);

const dauer = (performance.now() - START) / 1000;
zeile('Dauer der ganzen Datei', '≤ 30 s', `${dauer.toFixed(1)} s`, dauer <= 30, false);
console.table(zeilen);
console.log(harte ? `${harte} FEHLER` : 'Alle harten Prüfungen ok.');
process.exit(harte ? 1 : 0);
