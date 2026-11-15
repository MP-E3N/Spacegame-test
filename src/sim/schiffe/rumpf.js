// ZWECK: Rumpfgeometrie als reine Rechnung (ohne three): Maße eines Querschnitts-Lofts an Stelle z, Ober-/Unterkante an
//        Stelle (x, z) und der Fußpunkt eines Anbauteils (Turm) über seiner ganzen Standfläche.
// LIEFERT: masse(ab, z) · oberkante(teil, z, x) · unterkante(teil, z, x) · fusspunkt(teile, x, z, r, oben) · alleTeile(teile)
// REGEL: teil = { ab: [{z, w, h, x?, y?}], fase }. w/h sind HALBE Breite/Höhe, Fase 45° mit c = min(w, h)·fase —
//        genau wie profil()/loft() in grafik/schiff/bauteile.js. Schiff lokal: +Z Bug, +X Backbord, +Y oben.

/** Maße eines Lofts an Stelle z (linear zwischen den Querschnitten), sonst null. */
export function masse(ab, z) {
  for (let i = 0; i < ab.length - 1; i++) {
    const a = ab[i], b = ab[i + 1];
    if (z >= a.z && z <= b.z) {
      const t = (z - a.z) / (b.z - a.z), l = (p, d = 0) => (a[p] ?? d) + ((b[p] ?? d) - (a[p] ?? d)) * t;
      return { w: l('w'), h: l('h'), x: l('x'), y: l('y') };
    }
  }
  return null;
}

/** Querschnitt an z und Abfall der Fläche bei seitlichem Versatz (null = außerhalb). */
function rand(teil, z, x) {
  const m = masse(teil.ab, z); if (!m) return null;
  const d = Math.abs(x - m.x); if (d > m.w) return null;
  const c = Math.min(m.w, m.h) * teil.fase;
  return { m, tief: Math.max(0, d - (m.w - c)) }; // WARUM: in der Fase fällt die Fläche 1:1 ab (45°)
}
export function oberkante(teil, z, x) { const r = rand(teil, z, x); return r && r.m.y + r.m.h - r.tief; }
export function unterkante(teil, z, x) { const r = rand(teil, z, x); return r && r.m.y - r.m.h + r.tief; }

/**
 * Fußpunkt einer runden Standfläche (Radius r) auf dem Rumpf: höchste Oberkante (oben) bzw. tiefste Unterkante (unten)
 * aller Teile unter der Fläche. WARUM höchste: lieber leicht eingebettet als schwebend; den Spalt auf der tiefen
 * Seite füllt eine Schürze der Länge `schuerze` (Grafik).
 * @returns { y, schuerze } oder null, wenn nichts darunter liegt
 */
export function fusspunkt(teile, x, z, r, oben, ringe = 4, winkel = 24) {
  let hoch = -Infinity, tief = Infinity;
  for (let k = 0; k <= ringe; k++) {
    const rr = r * k / ringe, n = k ? winkel : 1;
    for (let j = 0; j < n; j++) {
      const w = j / n * Math.PI * 2, px = x + Math.cos(w) * rr, pz = z + Math.sin(w) * rr;
      let best = null;
      for (const t of teile) {
        const y = oben ? oberkante(t, pz, px) : unterkante(t, pz, px);
        if (y !== null && (best === null || (oben ? y > best : y < best))) best = y;
      }
      if (best === null) continue;
      const v = oben ? best : -best; // v = Abstand „vom Rumpf weg“
      if (v > hoch) hoch = v;
      if (v < tief) tief = v;
    }
  }
  if (hoch === -Infinity) return null;
  return { y: oben ? hoch : -hoch, schuerze: hoch - tief + 0.1 };
}

/** Alle Teile eines Schiffs (Objekt mit Teilen oder Teil-Listen) als flache Liste. */
export const alleTeile = (teile) => Object.values(teile).flat();
