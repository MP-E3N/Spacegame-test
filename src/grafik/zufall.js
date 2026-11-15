// ZWECK: Zufall mit festem Startwert und glattes 3D-Rauschen für die Grafik-Erzeugung.
// LIEFERT: zufall(start) → () => 0..1 · rauschen3(x,y,z) → −1..1 · fbm3(x,y,z, oktaven) → ca. −1..1
// REGEL: kein Math.random — gleiches Schiff und gleiche Sterne bei jedem Start (Bilder vergleichbar).

export function zufall(start = 1) {
  let s = start >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash(x, y, z) {
  let h = (x * 374761393 + y * 668265263 + z * 1274126177) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296 * 2 - 1;
}
const glatt = (t) => t * t * (3 - 2 * t);
const mix = (a, b, t) => a + (b - a) * t;

/** Wert-Rauschen 3D, −1..1. */
export function rauschen3(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const u = glatt(x - xi), v = glatt(y - yi), w = glatt(z - zi);
  const e = (dx, dy, dz) => hash(xi + dx, yi + dy, zi + dz);
  return mix(
    mix(mix(e(0, 0, 0), e(1, 0, 0), u), mix(e(0, 1, 0), e(1, 1, 0), u), v),
    mix(mix(e(0, 0, 1), e(1, 0, 1), u), mix(e(0, 1, 1), e(1, 1, 1), u), v), w);
}

export function fbm3(x, y, z, oktaven = 4) {
  let s = 0, a = 0.5, f = 1, n = 0;
  for (let i = 0; i < oktaven; i++) { s += a * rauschen3(x * f, y * f, z * f); n += a; a *= 0.5; f *= 2.03; }
  return s / n;
}
