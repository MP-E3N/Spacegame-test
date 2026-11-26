// ZWECK: Geometrie eines Form-Körpers (Runde 16): Loft durch die Spanten (32 Profilpunkte je Spant, i-ter zu i-tem
//        Punkt), mit Kappen, Knick-Normalen (rund = glatt, Fase/Kante = hart). Grundlage für Werkstatt und Verschweißen.
// LIEFERT: koerperGeometrie(k, { zugabe }) → indizierte BufferGeometry (position + normal) in Körper-Koordinaten,
//          zwischengespeichert · koerperNetz(k, lage, { zugabe }) → Geometrie in Form-Koordinaten (Spiegel mit
//          umgedrehter Wicklung) · lageMatrix4(lage) · KNICK (Grenzwinkel der Normalen)
// REGEL: Daten und Profil-Mathematik NUR aus src/sim/form/form.js (profilPunkte, koerperSchluessel). Läuft ohne document.
//        Zugabe (Schweißzugabe F6, m): Spanten um 2·zugabe breiter/höher, erster/letzter Spant um zugabe nach außen —
//        nur fürs Verschweißen (bündige Flächen), der Nutzer sieht sie nicht. Rückgabe NICHT verändern (geteilt).
import * as THREE from 'three';
import { toCreasedNormals, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { profilPunkte, koerperSchluessel } from '../../sim/form/form.js';

/** Grenzwinkel: Bogen-Schritte (90°/7 ≈ 12,9°) bleiben glatt, Fasen (45°) und Kappen (90°) hart. */
export const KNICK = 30 * Math.PI / 180;

const ablage = new Map();

/**
 * Loft eines Körpers. WARUM erst Dreieckssuppe, dann Knick-Normalen, dann Punkte zusammenlegen: mergeVertices legt nur
 * Punkte mit gleicher Lage UND gleicher Normale zusammen → harte Kanten bleiben getrennt, glatte Flächen teilen Punkte;
 * die Lage ist trotzdem geschlossen (CSG und Prüfung arbeiten über die Positionen).
 */
export function koerperGeometrie(k, { zugabe = 0 } = {}) {
  const schluessel = koerperSchluessel(k) + '|' + zugabe;
  if (ablage.has(schluessel)) return ablage.get(schluessel);
  const sp = k.spanten, n = sp.length, last = n - 1;
  const ringe = sp.map((s, i) => {
    const z = s.z + (i === 0 ? -zugabe : i === last ? zugabe : 0);
    return profilPunkte(zugabe ? { ...s, b: s.b + 2 * zugabe, h: s.h + 2 * zugabe } : s).map(([x, y]) => [x, y, z]);
  });
  const pos = [];
  const tri = (a, b, c) => pos.push(...a, ...b, ...c);
  const P = ringe[0].length;
  for (let i = 0; i < n - 1; i++) {
    const A = ringe[i], B = ringe[i + 1];
    for (let j = 0; j < P; j++) {
      const j2 = (j + 1) % P;
      // Profil gegen den Uhrzeigersinn, Loft nach +Z → (A_j, A_j+1, B_j+1) zeigt nach außen
      tri(A[j], A[j2], B[j2]); tri(A[j], B[j2], B[j]);
    }
  }
  if (sp[0].p) {
    // Eigener Umriss (Runde 17) darf hohl sein (L, U, Pfeil) → Kappen per Ohrenschneiden (three ShapeUtils, earcut).
    // WARUM je Dreieck den Umlauf prüfen: earcut garantiert keine Richtung; Kappe vorn muss nach −Z, hinten nach +Z zeigen
    for (const [R, vorn] of [[ringe[0], true], [ringe[last], false]]) {
      const flach = R.map(([x, y]) => new THREE.Vector2(x, y));
      for (const [a, b, c] of THREE.ShapeUtils.triangulateShape(flach, [])) {
        const A = R[a], B = R[b], C = R[c], ccw = (B[0] - A[0]) * (C[1] - A[1]) - (B[1] - A[1]) * (C[0] - A[0]) > 0;
        if (ccw !== vorn) tri(A, B, C); else tri(A, C, B);
      }
    }
  } else {
    // Kappen als Fächer um die Profilmitte (Profil ist konvex: Mischung aus Fase und Viertelkreis)
    const mitte = (R, s) => [s.x ?? 0, s.y ?? 0, R[0][2]];
    const c0 = mitte(ringe[0], sp[0]), c1 = mitte(ringe[last], sp[last]);
    for (let j = 0; j < P; j++) {
      const j2 = (j + 1) % P;
      tri(c0, ringe[0][j2], ringe[0][j]);       // Normale −Z
      tri(c1, ringe[last][j], ringe[last][j2]); // Normale +Z
    }
  }
  const suppe = new THREE.BufferGeometry();
  suppe.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  const g = mergeVertices(toCreasedNormals(suppe, KNICK), 1e-5);
  ablage.set(schluessel, g);
  return g;
}

/** Lage { m (3×3 zeilenweise), t, spiegel (null | [sx, sy, sz]) } → Matrix4 (Form-Punkt = S · (m · p + t)). */
export function lageMatrix4(lage, ziel = new THREE.Matrix4()) {
  const { m, t } = lage, [a, b, c] = lage.spiegel ?? [1, 1, 1];
  return ziel.set(a * m[0][0], a * m[0][1], a * m[0][2], a * t[0], b * m[1][0], b * m[1][1], b * m[1][2], b * t[1],
    c * m[2][0], c * m[2][1], c * m[2][2], c * t[2], 0, 0, 0, 1);
}

/**
 * Körper in Form-Koordinaten (neue Geometrie, darf verändert werden). WARUM Wicklung umdrehen: eine Spiegelung
 * (Determinante −1) dreht den Umlaufsinn, applyMatrix4 aber nicht — sonst zeigen die Flächen nach innen (CSG falsch).
 */
export function koerperNetz(k, lage, { zugabe = 0 } = {}) {
  const m4 = lageMatrix4(lage), g = koerperGeometrie(k, { zugabe }).clone().applyMatrix4(m4);
  if (m4.determinant() < 0) {
    const ix = g.index.array;
    for (let i = 0; i < ix.length; i += 3) { const t = ix[i + 1]; ix[i + 1] = ix[i + 2]; ix[i + 2] = t; }
    g.index.needsUpdate = true;
  }
  return g;
}
