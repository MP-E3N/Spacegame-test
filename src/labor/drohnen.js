// ZWECK: Platzhalter-Grafik der Zieldrohnen im Flak-Labor (bis der Schiffbauer das echte Drohnen-Modell baut).
// LIEFERT: erstelleDrohnenGrafik(scene, anzahl) → { aktualisiere(ziele, alpha, zeit) }
// REGEL: liest nur den Sim-Zustand (ziele[i].pos/vorPos/vel/aktiv/hp), interpoliert mit alpha. 3 Draw-Calls (Rumpf,
//        Sensorauge, Antriebsglut) über InstancedMesh, keine Neuanlage pro Bild.
// STIL: unbemannt, kantig, dunkles Metall, rotes Sensorauge (Nutzer-Entscheidung R4).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

function rumpfGeometrie() {
  const teile = [
    new THREE.BoxGeometry(2.2, 1.3, 5.2),                                     // Mittelkörper
    new THREE.BoxGeometry(1.4, 0.9, 1.6).translate(0, 0.2, 2.9),             // Sensorkopf
    new THREE.BoxGeometry(5.5, 0.22, 2.4).rotateZ(0.32).translate(3.3, -0.6, -0.6),  // Schwingen, nach unten geknickt
    new THREE.BoxGeometry(5.5, 0.22, 2.4).rotateZ(-0.32).translate(-3.3, -0.6, -0.6),
    new THREE.BoxGeometry(0.5, 1.6, 2.2).translate(5.7, -1.7, -0.9),         // Schwingen-Enden (Zangen)
    new THREE.BoxGeometry(0.5, 1.6, 2.2).translate(-5.7, -1.7, -0.9),
    new THREE.BoxGeometry(1.6, 1.0, 1.2).translate(0, 0, -3.1),              // Antriebsblock
  ].map((g) => g.toNonIndexed());
  return mergeGeometries(teile);
}

// Optionen (R14, Spieltester: „Angreifer im Gefecht nur winzige Punkte“): skala = Sichtgröße des Modells, augePx = Mindestgröße
// des roten Auges in Bildpunkten. Labor-Standard 1 / 3 (unverändert).
export function erstelleDrohnenGrafik(scene, anzahl = 16, { skala: SICHT = 1, augePx = 3 } = {}) {
  const rumpf = new THREE.InstancedMesh(rumpfGeometrie(),
    new THREE.MeshStandardMaterial({ color: 0x45474b, roughness: 0.55, metalness: 0.75 }), anzahl);
  // WARUM Werte > 1: HDR-Ziel + Bloom → das Auge leuchtet auch auf 2 km noch als roter Punkt (Deckel 30, CLAUDE.md Regel 5)
  const auge = new THREE.InstancedMesh(new THREE.SphereGeometry(0.5, 10, 8),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(14, 0.5, 0.25) }), anzahl);
  const glut = new THREE.InstancedMesh(new THREE.BoxGeometry(1.1, 0.6, 0.15),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 1.3, 0.7) }), anzahl);
  for (const m of [rumpf, auge, glut]) { m.frustumCulled = false; m.count = 0; scene.add(m); }
  rumpf.name = 'drohnen-rumpf';

  const m = new THREE.Matrix4(), off = new THREE.Matrix4(), pos = new THREE.Vector3(), dir = new THREE.Vector3();
  const hoch = new THREE.Vector3(0, 1, 0), null3 = new THREE.Vector3(), skala = new THREE.Vector3();
  const augeOff = new THREE.Matrix4().makeTranslation(0, 0.2, 3.75), glutOff = new THREE.Matrix4().makeTranslation(0, 0, -3.78);
  const letzteRichtung = Array.from({ length: anzahl }, () => new THREE.Vector3(0, 0, 1));

  const kamPos = new THREE.Vector3(), augeSkala = new THREE.Vector3();
  function aktualisiere(ziele, alpha, zeit, camera) {
    const n = Math.min(anzahl, ziele.length);
    // Winkel eines Bildpunkts (rad) → Mindestgröße des Auges. WARUM: Auge (1 m) ist auf 1–2 km kleiner als ein Pixel und
    // verschwindet (Bildprüfer R6: 0 rote Pixel). Mit ≥ 3 px bleibt das Ziel als roter Punkt lesbar.
    const pixWinkel = camera ? 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) / (globalThis.innerHeight || 900) : 0;
    if (camera) camera.getWorldPosition(kamPos);
    for (let i = 0; i < n; i++) {
      const z = ziele[i];
      if (!z.aktiv) { m.makeScale(0, 0, 0); rumpf.setMatrixAt(i, m); auge.setMatrixAt(i, m); glut.setMatrixAt(i, m); continue; }
      const v = z.vorPos ?? z.pos;
      pos.set(v.x + (z.pos.x - v.x) * alpha, v.y + (z.pos.y - v.y) * alpha, v.z + (z.pos.z - v.z) * alpha);
      dir.set(z.vel.x, z.vel.y, z.vel.z);
      if (dir.lengthSq() > 1) letzteRichtung[i].copy(dir.normalize()); else dir.copy(letzteRichtung[i]);
      m.lookAt(dir, null3, hoch);                       // WARUM lookAt(dir, 0): Matrix4.lookAt legt +Z auf (eye − target) = Flugrichtung
      const s = ((z.r ?? 6) / 6) * SICHT;
      m.scale(skala.set(s, s, s)).setPosition(pos);
      rumpf.setMatrixAt(i, m);
      // Beschädigt: Auge flackert (lesbar, ohne Extra-Effekt)
      const flackern = z.hpMax && z.hp < z.hpMax * 0.45 && Math.sin(zeit * 37 + i) > 0.3;
      if (flackern) off.makeScale(0, 0, 0);
      else {
        off.multiplyMatrices(m, augeOff);
        const groesse = Math.max(1, (augePx * pos.distanceTo(kamPos) * pixWinkel) / (1.0 * s)); // Auge Ø 1 m × s
        if (groesse > 1) off.scale(augeSkala.set(groesse, groesse, groesse));
      }
      auge.setMatrixAt(i, off);
      glut.setMatrixAt(i, off.multiplyMatrices(m, glutOff));
    }
    for (const g of [rumpf, auge, glut]) { g.count = n; g.instanceMatrix.needsUpdate = true; }
  }
  return { aktualisiere };
}
