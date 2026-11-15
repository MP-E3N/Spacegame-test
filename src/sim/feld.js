// ZWECK: Asteroidenfeld als Simulations-Daten (Kollision) — Grafik (grafik/asteroiden.js) liest daraus.
// LIEFERT: erstelleFeld() → [{ x, y, z, r, skala:[sx,sy,sz], form, achse:[ax,ay,az], tempo, start }]
//          formRadius(form) → mittlerer Radius der verformten Einheitskugel (Form wie in grafik/asteroiden.js)
// REGEL: exakt dieselbe Zufalls-Reihenfolge wie der frühere Erzeuger in asteroiden.js (gleiche Positionen; geprüft in
//        tests/schiffe.mjs). r = mittlere Halbachse × mittlerer Formradius (Entscheidung 4, Runde 5). Kein three.
import { zufall, fbm3 } from './zufall.js';

export const FORMEN = 6;

/** Verformung wie in grafik/asteroiden.js form(start = form + 1), gemittelt über 2000 gleichmäßige Richtungen. */
const radien = [];
export function formRadius(form) {
  if (radien[form] !== undefined) return radien[form];
  const o = (form + 1) * 13.7, N = 2000;
  let summe = 0;
  for (let i = 0; i < N; i++) { // Fibonacci-Kugel
    const y = 1 - (2 * i + 1) / N, rr = Math.sqrt(1 - y * y), w = i * Math.PI * (3 - Math.sqrt(5));
    const x = Math.cos(w) * rr, z = Math.sin(w) * rr;
    const grob = fbm3(x * 1.3 + o, y * 1.3, z * 1.3, 3);
    const fein = fbm3(x * 5 + o, y * 5, z * 5, 3);
    const k = Math.max(0, fbm3(x * 2.6 - o, y * 2.6, z * 2.6, 2) - 0.25);
    summe += 1 + grob * 0.38 + fein * 0.08 - k * 0.5;
  }
  return (radien[form] = summe / N);
}

const laenge = (x, y, z) => Math.sqrt(x * x + y * y + z * z);
/** Richtung normieren wie THREE.Vector3.normalize (× 1/Länge) — WARUM: bitgleich mit dem alten Erzeuger. */
const norm = (x, y, z) => { const f = 1 / (laenge(x, y, z) || 1); return [x * f, y * f, z * f]; };

export function erstelleFeld() {
  const rnd = zufall(2024);
  const liste = [];
  const neu = (form, x, y, z, skala, achse, tempo, start) => {
    const r = (skala[0] + skala[1] + skala[2]) / 3 * formRadius(form);
    liste.push({ x, y, z, r, skala, form, achse, tempo, start });
  };
  // große Brocken
  for (let i = 0; i < 90; i++) {
    let x, y, z;
    do { x = (rnd() - 0.5) * 7000; y = (rnd() - 0.5) * 1800; z = 300 + rnd() * 7000; } while (laenge(x, y, z) < 450);
    const gross = rnd() < 0.08;
    const s = gross ? 120 + rnd() * 220 : 8 + Math.pow(rnd(), 2) * 70;
    const skala = [s * (0.8 + rnd() * 0.5), s * (0.6 + rnd() * 0.4), s * (0.8 + rnd() * 0.5)];
    const achse = norm(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5);
    neu(i % FORMEN, x, y, z, skala, achse, (rnd() - 0.5) * 0.06, rnd() * 6);
  }
  // Kleinzeug nahe am Startpunkt (Parallaxe beim Losfahren)
  for (let i = 0; i < 90; i++) {
    const x = (rnd() - 0.5) * 2000, y = (rnd() - 0.5) * 700, z = (rnd() - 0.2) * 2400;
    if (laenge(x, y, z) < 200) continue;
    const s = 0.8 + Math.pow(rnd(), 2) * 6;
    const skala = [s, s * (0.6 + rnd() * 0.4), s * (0.7 + rnd() * 0.5)];
    const achse = norm(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5);
    neu(i % FORMEN, x, y, z, skala, achse, (rnd() - 0.5) * 0.4, rnd() * 6);
  }
  return liste;
}
