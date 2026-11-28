// ZWECK: Abnahme des Beispielschiffs „SL-01 Silberlanze“ (Runde 23, `node tests/silberlanze.mjs`) und der Gatling-/
//        Hauptbatterie-Modelle aus turm() (src/grafik/schiff/bauteile.js).
//   Schiff: flugtauglich (formZuSchiff), pruefeGeschuetze ohne Fehler, Gefecht ohne stumme Türme (auch mit allen Türmen
//   als Lafetten — Vorgriff auf E2, schwere Türme feuern ab R23), verschweißt dicht (Verfahren wie tests/dicht.mjs),
//   Länge 300–380 m, ≥ 4 schwere Türme, 10–16 PDC/Flak, BEISPIEL_FORMEN unverändert (Werkstatt-Startinhalt).
//   Gatling: je Flak-Mündung EIN Bündel-Netz, Achse genau auf Mündung x/y, Spitze auf Mündung z, rohre === buendel;
//   Draw-Calls der 17 Bollwerk-Türme wie vor R23 (134 inkl. Schatten).
// LIEFERT: Tabelle „Messgröße | Ziel | Wert | ok“; Exit-Code 1 bei FEHLER.
// REGEL: Budget ≤ 10 s (Verschweißen ~0,8 s in node).
import * as THREE from 'three';
import { performance } from 'node:perf_hooks';
import { BEISPIEL_SCHIFFE, BEISPIEL_FORMEN } from '../src/sim/form/beispiele.js';
import { normalisiere } from '../src/sim/form/form.js';
import { formZuSchiff } from '../src/sim/form/bauteile.js';
import { pruefeGeschuetze } from '../src/sim/form/geschuetze.js';
import { erstelleGefecht } from '../src/sim/gefecht.js';
import { formGeometrie } from '../src/grafik/form/schweissen.js';
import { erstelleFormSchiff } from '../src/grafik/form/schiff.js';
import { turm } from '../src/grafik/schiff/bauteile.js';
import { BOLLWERK } from '../src/sim/schiffe/bollwerk.js';

const START = performance.now();
const zeilen = [];
let harte = 0;
const zeile = (groesse, ziel, wert, ok, hart = true) => {
  if (!ok && hart) harte++;
  zeilen.push({ groesse, ziel, wert: String(wert), ok: ok ? 'ok' : hart ? 'FEHLER' : 'WARN' });
};
const fnv = (s) => { let x = 2166136261; for (let i = 0; i < s.length; i++) { x ^= s.charCodeAt(i); x = Math.imul(x, 16777619) >>> 0; } return x.toString(16); };

// ---------- Schiff ----------
const roh = BEISPIEL_SCHIFFE.find((f) => f.name === 'SL-01 Silberlanze');
zeile('BEISPIEL_SCHIFFE enthält „SL-01 Silberlanze“', 'ja', roh ? 'ja' : 'nein', !!roh);
// WARUM Prüfsumme: der Werkstatt-Startinhalt (BEISPIEL_FORMEN[0]) darf sich durch das neue Schiff nicht ändern
const h = fnv(JSON.stringify(BEISPIEL_FORMEN));
zeile('BEISPIEL_FORMEN unverändert (FNV der JSON-Form, Stand R22)', 'f88cc380', h, h === 'f88cc380');

const form = normalisiere(roh), daten = formZuSchiff(form);
const fehlerFlug = daten.meldungen.filter((m) => m.stufe === 'fehler');
zeile('formZuSchiff: flugtauglich', 'true', `${daten.flugtauglich}${fehlerFlug.length ? ' — ' + fehlerFlug.map((m) => m.code).join(', ') : ''}`, daten.flugtauglich === true);
zeile('Länge (Bug → Auslegerspitzen)', '300–380 m', daten.laenge.toFixed(1) + ' m', daten.laenge >= 300 && daten.laenge <= 380);
zeile('Masse | Schub | aVor | vMax', 'Info', `${Math.round(daten.masse)} t | ${daten.schub} kN | ${daten.werte.aVor} m/s² | ${daten.werte.vMax} m/s`, true);
zeile('Schwerpunkt auf der Rumpfachse (|x|, |y|)', '< 1e-6', `${Math.abs(daten.schwerpunkt[0])}, ${Math.abs(daten.schwerpunkt[1])}`,
  Math.abs(daten.schwerpunkt[0]) < 1e-6 && Math.abs(daten.schwerpunkt[1]) < 1e-6);

const geMeld = pruefeGeschuetze(form), geFehler = geMeld.filter((m) => m.stufe === 'fehler');
zeile('pruefeGeschuetze: Fehler | Warnungen', '0 | Info', `${geFehler.length} | ${geMeld.length - geFehler.length}${geMeld.length ? ' — ' + geMeld.map((m) => m.code + ':' + m.bauteil).join(', ') : ''}`, geFehler.length === 0);
const schwer = daten.tuerme.filter((t) => t.typ === 'schwer').length, flak = daten.tuerme.filter((t) => t.typ === 'flak').length;
zeile('Türme: schwer | PDC/Flak (werden Gatlings)', '≥ 4 | 10–16', `${schwer} | ${flak}`, schwer >= 4 && flak >= 10 && flak <= 16);
zeile('Haupttriebwerke | Manöverdüsen', '≥ 1 | ≥ 4', `${daten.duesen.filter((d) => d.art === 'haupt').length} | ${daten.duesen.filter((d) => d.art === 'steuer').length}`,
  daten.duesen.some((d) => d.art === 'haupt') && daten.duesen.filter((d) => d.art === 'steuer').length >= 4);

const g = erstelleGefecht({ typ: 'form:SL-01', daten, werte: daten.werte });
zeile('erstelleGefecht: stumme Türme (heutige Lafetten)', '0', `${g.stumm.length} von ${g.lafetten.length}`, g.stumm.length === 0);
// Vorgriff E2: alle Türme als Lafetten (schwere als Flak gerechnet — Sperre und Schussfeld hängen nur an Lage und Größe)
const alle = { ...daten, tuerme: daten.tuerme.map((t) => ({ ...t, typ: 'flak' })) };
const g2 = erstelleGefecht({ typ: 'form:SL-01-alle', daten: alle, werte: daten.werte });
const minFeld = Math.min(...g2.schussfeld);
zeile('Gefecht mit ALLEN Türmen als Lafetten: stumm | kleinstes Schussfeld', '0 | > 0', `${g2.stumm.length} von ${g2.lafetten.length} | ${(minFeld * 100).toFixed(0)} %`, g2.stumm.length === 0 && g2.lafetten.length === daten.tuerme.length);
// 40 s Gefecht: Angreifer kommen in Reichweite, die Türme schießen (Befehl wie tests/gefecht.mjs)
const fb = { modus: 'sperrfeuer', feuerFrei: true, folgen: true, schirmAbstand: 800, v0: 1100 };
for (let k = 0; k < 2400; k++) g.schritt(1 / 60, { hebel: k < 120 ? 1 : 0, gieren: 0 }, fb);
const feuerten = g.flak.tuerme.filter((t) => (t.schuesse ?? 0) > 0).length;
zeile('Gefecht 40 s: Schüsse | Abschüsse | Türme, die feuerten | Prüfsumme endlich', '> 0 | Info | Info | ja', `${g.zaehler.schuesse} | ${g.zaehler.abschuesse} | ${feuerten} von ${g.flak.tuerme.length} | ${Number.isFinite(g.pruefsumme()) ? 'ja' : 'nein'}`, g.zaehler.schuesse > 0 && Number.isFinite(g.pruefsumme()));

const t0 = performance.now(), info = formGeometrie(form).info, ms = performance.now() - t0;
zeile('Verschweißt: offene Kanten | Flächenschluss', `0 | < 1e-6`, `${info.offeneKanten} (${(info.offeneLaenge * 100).toFixed(0)} cm) | ${info.flaechenschluss.toExponential(1)}`, info.offeneKanten === 0 && info.flaechenschluss < 1e-6);
zeile('Verschweißen in node | Versuche | Dreiecke', 'Info', `${ms.toFixed(0)} ms | ${info.versuche} | ${info.dreiecke}`, true);

const mats = new Proxy({}, { get: (z, k) => (z[k] ??= new THREE.MeshStandardMaterial()) });
const modell = erstelleFormSchiff(null, daten, { mats, effekte: false });
let dreiecke = 0; modell.gruppe.traverse((o) => { if (o.isMesh) dreiecke += (o.geometry.index?.count ?? o.geometry.attributes.position.count) / 3; });
zeile('Modell: Draw-Calls inkl. Schatten | Dreiecke | Türme', 'Info', `${modell.drawCalls} | ${Math.round(dreiecke)} | ${modell.tuerme.length}`, modell.tuerme.length === daten.tuerme.length);

// ---------- Gatling / Hauptbatterie (turm()) ----------
const gr = new THREE.Group(), tm = BOLLWERK.tuerme.map((t) => turm(gr, mats, t));
let dc = 0, netze = 0, tri = 0;
gr.traverse((o) => { if (o.isMesh) { netze++; dc += o.castShadow ? 2 : 1; tri += (o.geometry.index?.count ?? o.geometry.attributes.position.count) / 3; } });
zeile('Bollwerk 17 Türme: Draw-Calls inkl. Schatten (vor R23: 134, 85 Netze, 4776 Dreiecke)', '≤ 134 + 17', `${dc} (${netze} Netze, ${Math.round(tri)} Dreiecke)`, dc <= 134 + 17);
let achse = 0, spitze = 0, falsch = 0;
BOLLWERK.tuerme.forEach((t, i) => {
  const m = tm[i], gat = t.typ === 'flak';
  if (gat !== (m.buendel.length === t.muendungen.length) || (!gat && m.buendel.length)) falsch++;
  m.rohre.forEach((r, k) => {
    r.geometry.computeBoundingBox();
    const bb = r.geometry.boundingBox, mu = t.muendungen[k];
    spitze = Math.max(spitze, Math.abs(bb.max.z + r.position.z - mu.z));
    if (gat) {
      if (m.rohre[k] !== m.buendel[k]) falsch++;
      // Achse: Bündel-Mitte der Geometrie liegt im Ursprung des Netzes, das Netz sitzt auf der Mündung
      achse = Math.max(achse, Math.abs((bb.min.x + bb.max.x) / 2), Math.abs((bb.min.y + bb.max.y) / 2), Math.abs(r.position.x - mu.x), Math.abs(r.position.y - mu.y));
    }
  });
});
zeile('Gatling: Bündel je Flak-Mündung, rohre === buendel, schwer ohne Bündel', '0 falsch', falsch, falsch === 0);
zeile('Gatling: Drehachse ↔ Mündung x/y | Spitze ↔ Mündung z (alle Türme)', '< 1e-4 m', `${achse.toExponential(1)} | ${spitze.toExponential(1)}`, achse < 1e-4 && spitze < 1e-4);
const ohne = turm(new THREE.Group(), mats, BOLLWERK.tuerme[0], { gatling: false });
zeile('turm(…, { gatling: false }) → Zwillingsrohre (Prüfstand)', '0 Bündel', ohne.buendel.length, ohne.buendel.length === 0 && ohne.rohre.length === 2);

const dauer = (performance.now() - START) / 1000;
zeile('Dauer der ganzen Datei', '≤ 10 s', `${dauer.toFixed(1)} s`, dauer <= 10, false);
console.table(zeilen);
console.log(harte ? `${harte} FEHLER` : 'Alle harten Prüfungen ok.');
process.exit(harte ? 1 : 0);
