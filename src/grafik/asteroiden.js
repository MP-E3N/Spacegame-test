// ZWECK: Ein lockeres Asteroidenfeld vor dem Startpunkt — Bezugspunkte für Fahrt und Kurven, später Deckung im Kampf.
// LIEFERT: erstelleAsteroiden(scene) → { aktualisiere(zeit) }
// REGEL: reine Deko (noch keine Kollision). Wenige Formen, viele Exemplare → InstancedMesh je Form.
import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { zufall, fbm3 } from './zufall.js';

const FORMEN = 6;

function form(start) {
  let g = new THREE.IcosahedronGeometry(1, 5);
  g.deleteAttribute('normal'); g.deleteAttribute('uv');
  g = mergeVertices(g);
  const p = g.attributes.position, v = new THREE.Vector3();
  const farbe = new Float32Array(p.count * 3);
  const o = start * 13.7;
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const grob = fbm3(v.x * 1.3 + o, v.y * 1.3, v.z * 1.3, 3);
    const fein = fbm3(v.x * 5 + o, v.y * 5, v.z * 5, 3);
    // Krater: abgeflachte Mulden, wo das mittlere Rauschen hoch ist
    const k = Math.max(0, fbm3(v.x * 2.6 - o, v.y * 2.6, v.z * 2.6, 2) - 0.25);
    const r = 1 + grob * 0.38 + fein * 0.08 - k * 0.5;
    v.multiplyScalar(r);
    p.setXYZ(i, v.x, v.y, v.z);
    // WARUM so dunkel: echte Asteroiden werfen nur 5–15 % des Lichts zurück; heller wirken sie wie Gips
    const hell = 0.75 + fein * 0.3 - k * 0.6;
    farbe.set([0.13 * hell, 0.12 * hell, 0.11 * hell], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(farbe, 3));
  g.computeVertexNormals();
  return g;
}

export function erstelleAsteroiden(scene) {
  const rnd = zufall(2024);
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0.0 });
  const liste = []; // { form, pos, skala, achse, tempo }
  const v = new THREE.Vector3();
  // große Brocken
  for (let i = 0; i < 90; i++) {
    do v.set((rnd() - 0.5) * 7000, (rnd() - 0.5) * 1800, 300 + rnd() * 7000); while (v.length() < 450);
    const gross = rnd() < 0.08;
    const s = gross ? 120 + rnd() * 220 : 8 + Math.pow(rnd(), 2) * 70;
    liste.push({ form: i % FORMEN, pos: v.clone(), skala: new THREE.Vector3(s * (0.8 + rnd() * 0.5), s * (0.6 + rnd() * 0.4), s * (0.8 + rnd() * 0.5)),
      achse: new THREE.Vector3(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).normalize(), tempo: (rnd() - 0.5) * 0.06, start: rnd() * 6 });
  }
  // Kleinzeug nahe am Startpunkt (Parallaxe beim Losfahren)
  for (let i = 0; i < 90; i++) {
    v.set((rnd() - 0.5) * 2000, (rnd() - 0.5) * 700, (rnd() - 0.2) * 2400);
    if (v.length() < 200) continue;
    const s = 0.8 + Math.pow(rnd(), 2) * 6;
    liste.push({ form: i % FORMEN, pos: v.clone(), skala: new THREE.Vector3(s, s * (0.6 + rnd() * 0.4), s * (0.7 + rnd() * 0.5)),
      achse: new THREE.Vector3(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).normalize(), tempo: (rnd() - 0.5) * 0.4, start: rnd() * 6 });
  }
  const netze = [];
  for (let f = 0; f < FORMEN; f++) {
    const eigene = liste.filter((a) => a.form === f);
    const im = new THREE.InstancedMesh(form(f + 1), mat, eigene.length);
    im.castShadow = true; im.receiveShadow = true;
    im.name = 'asteroiden' + f;
    scene.add(im);
    netze.push({ im, eigene });
  }
  const q = new THREE.Quaternion(), m = new THREE.Matrix4();
  function aktualisiere(zeit) {
    for (const { im, eigene } of netze) {
      for (let i = 0; i < eigene.length; i++) {
        const a = eigene[i];
        q.setFromAxisAngle(a.achse, a.start + zeit * a.tempo);
        im.setMatrixAt(i, m.compose(a.pos, q, a.skala));
      }
      im.instanceMatrix.needsUpdate = true;
    }
  }
  aktualisiere(0);
  for (const { im } of netze) im.computeBoundingSphere(); // WARUM nur einmal: Drehen ändert die Mittelpunkte nicht
  return { aktualisiere };
}
