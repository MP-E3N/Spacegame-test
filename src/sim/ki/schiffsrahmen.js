// ZWECK: Zielansicht im Schiffsrahmen für die Turm-KI am fliegenden Schiff (R14, Entscheidung 3: zwei Zielansichten
//        mit gleichen ids — Welt für Flak und Schaden, Schiffsrahmen für die KI).
// LIEFERT: inSchiffsrahmen(zieleWelt, schiffZ, aus) → aus (Liste, gleich lang, feste Objekte) ·
//          zuSchiff(schiffZ, v, aus) / zuWelt(schiffZ, v, aus) (Richtungen drehen, ohne Verschieben)
//          aus[i] = { id, aktiv, angriff, r, hp, hpMax, pos{x,y,z}, vel{x,y,z} } — pos = R⁻¹(p − s), vel = R⁻¹(v − vs)
//          schiffZ = { pos, vel, rot (Quaternion {x,y,z,w}) } (Zustand aus schiff.js)
// REGEL: MOMENTAUFNAHME je Takt. vel NIE aus Lagedifferenzen im Schiffsrahmen — WARUM: der Rahmen dreht sich mit;
//        die Differenz enthielte die Scheinfahrt −ω×r (0,18 rad/s · 1000 m = 180 m/s). Messung Frühwarnung R14:
//        Schiffsschaden −28 statt −21 %/min. Mit der Momentaufnahme ist die Abfangrechnung exakt, wenn die Waffe den
//        Punkt im selben Takt mit derselben Drehung zurückrechnet und die Granate das Schiffstempo erbt.
//        Neue Objekte nur, wenn die Liste wächst (erster Aufruf); kein DOM, kein Math.random.

/** v mit dem Einheits-Quaternion q drehen (k = +1) bzw. mit seinem Kehrwert (k = −1, konjugiert); schreibt nach aus. */
function drehe(q, k, vx, vy, vz, aus) {
  const qx = k * q.x, qy = k * q.y, qz = k * q.z, qw = q.w;
  // t = 2 · (q⃗ × v); v' = v + w·t + q⃗ × t (wie three.js Vector3.applyQuaternion)
  const tx = 2 * (qy * vz - qz * vy), ty = 2 * (qz * vx - qx * vz), tz = 2 * (qx * vy - qy * vx);
  aus.x = vx + qw * tx + (qy * tz - qz * ty);
  aus.y = vy + qw * ty + (qz * tx - qx * tz);
  aus.z = vz + qw * tz + (qx * ty - qy * tx);
  return aus;
}

/** Richtung (ohne Verschieben) Welt → Schiff. */
export const zuSchiff = (schiffZ, v, aus) => drehe(schiffZ.rot, -1, v.x, v.y, v.z, aus);
/** Richtung (ohne Verschieben) Schiff → Welt. */
export const zuWelt = (schiffZ, v, aus) => drehe(schiffZ.rot, 1, v.x, v.y, v.z, aus);

export function inSchiffsrahmen(zieleWelt, schiffZ, aus = []) {
  const s = schiffZ.pos, vs = schiffZ.vel ?? NULL, q = schiffZ.rot;
  while (aus.length < zieleWelt.length) aus.push({ id: 0, aktiv: false, angriff: false, r: 0, hp: 0, hpMax: 0, pos: { x: 0, y: 0, z: 0 }, vel: { x: 0, y: 0, z: 0 } });
  aus.length = zieleWelt.length;
  for (let i = 0; i < zieleWelt.length; i++) {
    const z = zieleWelt[i], o = aus[i];
    o.id = z.id; o.aktiv = z.aktiv; o.angriff = !!z.angriff; o.r = z.r; o.hp = z.hp; o.hpMax = z.hpMax;
    drehe(q, -1, z.pos.x - s.x, z.pos.y - s.y, z.pos.z - s.z, o.pos);
    drehe(q, -1, z.vel.x - vs.x, z.vel.y - vs.y, z.vel.z - vs.z, o.vel);
  }
  return aus;
}
const NULL = { x: 0, y: 0, z: 0 };
