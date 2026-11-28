// ZWECK: Darstellung der Angreifer-Geschosse (Autokanone der Kanonenboote, Runde 14): grünliche Leuchtspur, deutlich
//        anders als die orange Flak-Spur — man soll auf einen Blick sehen, wer auf wen schießt.
//        R23 (Wunsch KI): schwere Kanone des Panzerboots (pool.art[i] = 1) als dickere, längere, gelbgrüne Spur.
// LIEFERT: erstelleAngreiferGeschossGrafik(scene, { max }) → { aktualisiere(pool, alpha, bezugVel?), zaehler: { spuren, schwer },
//          netz, netzSchwer }
//          pool = Geschoss-Pool der Angreifer-KI { max, aktiv (Uint8), pos/vorPos/vel (Float64 ×3), alter (Takte)?,
//          art (Uint8, 0 Autokanone | 1 schwere Kanone)? } in WELT. Ohne art: alles Autokanone (wie R22).
//          bezugVel (optional, {x,y,z}) = Tempo des Beobachters (Spielerschiff): der Schweif folgt dem Tempo relativ dazu.
// REGEL: liest den Pool nur, einmal pro Bild. Zwei Draw-Calls (je Art eine InstancedBufferGeometry — WARUM zwei: die
//        Spurbreite ist ein Uniform des Materials), Vorräte fester Größe, keine neuen Objekte pro Bild. Keine Lichter.
//        HDR über das Spur-Material gedeckelt (shader.js).
import * as THREE from 'three';
import { spurMaterial } from './shader.js';

const SIM_DT = 1 / 60;
// WARUM 30 m und 0,5 m breit: 600 m/s sind 10 m je Schritt — kürzer als ~2 Schrittwege wird die Spur zur Perlenkette;
// etwas breiter als die Flak-Spur (0,35), weil sie auf die Kamera zufliegt und sonst als Punkt endet.
// R14 Spieltest („grüne Feindgeschosse kaum zu erkennen“): breiter und heller (0,5 → 0,9 m, 3,5 → 6)
const LAENGE = 30, BREITE = 0.9, HELL = 6;
// Grün-gelblich (Rand) → fast weiß-grün (Kern). WARUM grün: Orange ist die eigene Flak, Rot/Weiß sind Explosionen.
const FARBE_RAND = [0.25, 1.0, 0.35], FARBE_KERN = [0.8, 1.0, 0.75];
// R23 schwere Kanone (450 m/s ≈ 7,5 m je Schritt): 2,4 m breit, 40 m lang, gelber — WARUM: „das schwere Ding kommt“ soll
// man schon von weitem vom Autokanonen-Hagel unterscheiden; gleiche Grünfamilie = Feind.
const SCHWER = { laenge: 40, breite: 2.4, hell: 7, rand: [0.7, 1.0, 0.2], kern: [1.0, 1.0, 0.7] };

/** Ein Spur-Netz mit Vorrat max (eine Art). */
function spurNetz(scene, max, breite, rand, kern, name) {
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([-1, 0, 0, 1, 0, 0, -1, 1, 0, 1, 1, 0], 3));
  g.setIndex([0, 1, 2, 2, 1, 3]);
  const puffer = {};
  for (const [n, k] of [['aKopf', 3], ['aSchweif', 3], ['aHell', 1]]) {
    const a = new THREE.InstancedBufferAttribute(new Float32Array(max * k), k);
    a.setUsage(THREE.DynamicDrawUsage); g.setAttribute(n, a); puffer[n] = a;
  }
  g.instanceCount = 0;
  const netz = new THREE.Mesh(g, spurMaterial({ breite, farbeRand: rand, farbeKern: kern }));
  netz.frustumCulled = false; netz.renderOrder = 12; netz.name = name;
  scene.add(netz);
  return { g, puffer, netz };
}

export function erstelleAngreiferGeschossGrafik(scene, { max = 256 } = {}) {
  const A = spurNetz(scene, max, BREITE, FARBE_RAND, FARBE_KERN, 'angreifer-geschosse');
  const B = spurNetz(scene, max, SCHWER.breite, SCHWER.rand, SCHWER.kern, 'angreifer-geschosse-schwer');
  const zaehler = { spuren: 0, schwer: 0 };

  function aktualisiere(pool, alpha, bezugVel) {
    const bx = bezugVel ? bezugVel.x : 0, by = bezugVel ? bezugVel.y : 0, bz = bezugVel ? bezugVel.z : 0;
    let n = 0, m = 0;
    if (pool) for (let i = 0; i < pool.max; i++) {
      if (!pool.aktiv[i]) continue;
      const schwer = pool.art ? pool.art[i] === 1 : false;
      if (schwer ? m >= max : n >= max) continue;
      const Z = schwer ? B : A, k = schwer ? m++ : n++;
      const K = Z.puffer.aKopf.array, S = Z.puffer.aSchweif.array, H = Z.puffer.aHell.array;
      const j = i * 3, P = pool.pos, V = pool.vorPos;
      const x = V[j] + (P[j] - V[j]) * alpha, y = V[j + 1] + (P[j + 1] - V[j + 1]) * alpha, z = V[j + 2] + (P[j + 2] - V[j + 2]) * alpha;
      const vx = pool.vel[j] - bx, vy = pool.vel[j + 1] - by, vz = pool.vel[j + 2] - bz, v = Math.hypot(vx, vy, vz) || 1;
      // Schweif wächst aus dem Rohr (Alter in Takten, falls vorhanden), höchstens LAENGE
      const L = schwer ? SCHWER.laenge : LAENGE;
      const weg = pool.alter ? (pool.alter[i] + alpha) * v * SIM_DT : L;
      const l = Math.min(L, weg) / v;
      K[k * 3] = x; K[k * 3 + 1] = y; K[k * 3 + 2] = z;
      S[k * 3] = x - vx * l; S[k * 3 + 1] = y - vy * l; S[k * 3 + 2] = z - vz * l;
      H[k] = schwer ? SCHWER.hell : HELL;
    }
    A.g.instanceCount = zaehler.spuren = n;
    B.g.instanceCount = zaehler.schwer = m;
    for (const Z of [A, B]) Z.puffer.aKopf.needsUpdate = Z.puffer.aSchweif.needsUpdate = Z.puffer.aHell.needsUpdate = true;
  }

  return { aktualisiere, zaehler, netz: A.netz, netzSchwer: B.netz };
}
