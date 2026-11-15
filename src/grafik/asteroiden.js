// ZWECK: Ein lockeres Asteroidenfeld vor dem Startpunkt — Bezugspunkte für Fahrt und Kurven, später Deckung im Kampf.
// LIEFERT: erstelleAsteroiden(scene) → { aktualisiere(zeit) }
// REGEL: Lage/Größe kommen aus src/sim/feld.js (Kollision rechnet die Sim); hier nur Formen und Darstellung.
//        Wenige Formen, viele Exemplare → InstancedMesh je Form.
import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { fbm3 } from './zufall.js';
import { erstelleFeld, FORMEN } from '../sim/feld.js';

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
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0.0 });
  // Lage, Größe, Drehung aus der Simulation (Runde 5: Kollision) — gleiche Werte wie der frühere Erzeuger hier
  const liste = erstelleFeld().map((a) => ({ form: a.form, pos: new THREE.Vector3(a.x, a.y, a.z),
    skala: new THREE.Vector3(...a.skala), achse: new THREE.Vector3(...a.achse), tempo: a.tempo, start: a.start }));
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
