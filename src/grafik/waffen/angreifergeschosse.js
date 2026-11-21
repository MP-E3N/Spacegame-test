// ZWECK: Darstellung der Angreifer-Geschosse (Autokanone der Kanonenboote, Runde 14): grünliche Leuchtspur, deutlich
//        anders als die orange Flak-Spur — man soll auf einen Blick sehen, wer auf wen schießt.
// LIEFERT: erstelleAngreiferGeschossGrafik(scene, { max }) → { aktualisiere(pool, alpha, bezugVel?), zaehler: { spuren }, netz }
//          pool = Geschoss-Pool der Angreifer-KI { max, aktiv (Uint8), pos/vorPos/vel (Float64 ×3), alter (Takte)? } in WELT.
//          bezugVel (optional, {x,y,z}) = Tempo des Beobachters (Spielerschiff): der Schweif folgt dem Tempo relativ dazu.
// REGEL: liest den Pool nur, einmal pro Bild. Ein Draw-Call (InstancedBufferGeometry), Vorrat fester Größe, keine neuen
//        Objekte pro Bild. Keine Lichter. HDR über das Spur-Material gedeckelt (shader.js).
import * as THREE from 'three';
import { spurMaterial } from './shader.js';

const SIM_DT = 1 / 60;
// WARUM 30 m und 0,5 m breit: 600 m/s sind 10 m je Schritt — kürzer als ~2 Schrittwege wird die Spur zur Perlenkette;
// etwas breiter als die Flak-Spur (0,35), weil sie auf die Kamera zufliegt und sonst als Punkt endet.
// R14 Spieltest („grüne Feindgeschosse kaum zu erkennen“): breiter und heller (0,5 → 0,9 m, 3,5 → 6)
const LAENGE = 30, BREITE = 0.9, HELL = 6;
// Grün-gelblich (Rand) → fast weiß-grün (Kern). WARUM grün: Orange ist die eigene Flak, Rot/Weiß sind Explosionen.
const FARBE_RAND = [0.25, 1.0, 0.35], FARBE_KERN = [0.8, 1.0, 0.75];

export function erstelleAngreiferGeschossGrafik(scene, { max = 256 } = {}) {
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([-1, 0, 0, 1, 0, 0, -1, 1, 0, 1, 1, 0], 3));
  g.setIndex([0, 1, 2, 2, 1, 3]);
  const puffer = {};
  for (const [name, n] of [['aKopf', 3], ['aSchweif', 3], ['aHell', 1]]) {
    const a = new THREE.InstancedBufferAttribute(new Float32Array(max * n), n);
    a.setUsage(THREE.DynamicDrawUsage); g.setAttribute(name, a); puffer[name] = a;
  }
  g.instanceCount = 0;
  const netz = new THREE.Mesh(g, spurMaterial({ breite: BREITE, farbeRand: FARBE_RAND, farbeKern: FARBE_KERN }));
  netz.frustumCulled = false; netz.renderOrder = 12; netz.name = 'angreifer-geschosse';
  scene.add(netz);
  const zaehler = { spuren: 0 };

  function aktualisiere(pool, alpha, bezugVel) {
    const K = puffer.aKopf.array, S = puffer.aSchweif.array, H = puffer.aHell.array;
    const bx = bezugVel ? bezugVel.x : 0, by = bezugVel ? bezugVel.y : 0, bz = bezugVel ? bezugVel.z : 0;
    let n = 0;
    if (pool) for (let i = 0; i < pool.max && n < max; i++) {
      if (!pool.aktiv[i]) continue;
      const j = i * 3, P = pool.pos, V = pool.vorPos;
      const x = V[j] + (P[j] - V[j]) * alpha, y = V[j + 1] + (P[j + 1] - V[j + 1]) * alpha, z = V[j + 2] + (P[j + 2] - V[j + 2]) * alpha;
      const vx = pool.vel[j] - bx, vy = pool.vel[j + 1] - by, vz = pool.vel[j + 2] - bz, v = Math.hypot(vx, vy, vz) || 1;
      // Schweif wächst aus dem Rohr (Alter in Takten, falls vorhanden), höchstens LAENGE
      const weg = pool.alter ? (pool.alter[i] + alpha) * v * SIM_DT : LAENGE;
      const l = Math.min(LAENGE, weg) / v;
      K[n * 3] = x; K[n * 3 + 1] = y; K[n * 3 + 2] = z;
      S[n * 3] = x - vx * l; S[n * 3 + 1] = y - vy * l; S[n * 3 + 2] = z - vz * l;
      H[n] = HELL; n++;
    }
    g.instanceCount = zaehler.spuren = n;
    puffer.aKopf.needsUpdate = puffer.aSchweif.needsUpdate = puffer.aHell.needsUpdate = true;
  }

  return { aktualisiere, zaehler, netz };
}
