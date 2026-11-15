// ZWECK: Gemeinsame Bausteine aller Schiffsmodelle: Rumpf-Querschnitte (loft), Kisten/Rohre, Aufbauten, Box-UVs,
//        Materialien, Zusammenfügen je Material, Geschütztürme, Düsen, Beschriftung und die Effekte je Bild
//        (Triebwerksglut, Flammen, Steuerdüsen, Blinklichter).
// LIEFERT: siehe Exporte. Ein Schiff baut Teile in „Eimer“ (je Material eine Liste), ruft fuegeZusammen() und
//          ausstattung() und gibt { gruppe, tuerme, laenge, name, darstellen } zurück.
// REGEL: Schiff lokal +Z vorne, +X links (Backbord), +Y oben. UVs per Box-Projektion in Schiffskoordinaten.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { rumpfTexturen, beschriftung, KACHEL } from './texturen.js';

// ---------------- Geometrie ----------------
/** Achteck-Querschnitt (Rechteck mit Fasen), Punkte im Umlauf. */
export function profil(w, h, fase) {
  const c = Math.min(w, h) * fase;
  return [[w, h - c], [w - c, h], [-(w - c), h], [-w, h - c], [-w, -(h - c)], [-(w - c), -h], [w - c, -h], [w, -(h - c)]];
}

/** Rumpfstück aus Querschnitten [{z, w, h, x?, y?, fase?}] (z aufsteigend). Nicht indiziert (harte Kanten). */
export function loft(abschnitte, fase = 0.25) {
  const pos = [];
  const n = new THREE.Vector3(), e1 = new THREE.Vector3(), e2 = new THREE.Vector3();
  const tri = (a, b, c, aussen) => {
    e1.subVectors(b, a); e2.subVectors(c, a); n.crossVectors(e1, e2);
    if (n.dot(aussen) < 0) [b, c] = [c, b];
    pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
  };
  const ringe = abschnitte.map((s) => profil(s.w, s.h, s.fase ?? fase).map(([px, py]) => new THREE.Vector3((s.x ?? 0) + px, (s.y ?? 0) + py, s.z)));
  const mitte = abschnitte.map((s) => new THREE.Vector3(s.x ?? 0, s.y ?? 0, s.z));
  const fc = new THREE.Vector3(), m = new THREE.Vector3(), aussen = new THREE.Vector3();
  for (let i = 0; i < ringe.length - 1; i++) {
    const A = ringe[i], B = ringe[i + 1];
    m.addVectors(mitte[i], mitte[i + 1]).multiplyScalar(0.5);
    for (let k = 0; k < 8; k++) {
      const k2 = (k + 1) % 8;
      fc.copy(A[k]).add(A[k2]).add(B[k]).add(B[k2]).multiplyScalar(0.25);
      aussen.subVectors(fc, m); aussen.z = 0;
      tri(A[k], A[k2], B[k2], aussen);
      tri(A[k], B[k2], B[k], aussen);
    }
  }
  const deckel = (R, c, richtung) => { for (let k = 0; k < 8; k++) tri(c, R[k], R[(k + 1) % 8], richtung); };
  deckel(ringe[0], mitte[0], new THREE.Vector3(0, 0, -1));
  deckel(ringe[ringe.length - 1], mitte[mitte.length - 1], new THREE.Vector3(0, 0, 1));
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

/** Maße eines Lofts an Stelle z (linear zwischen den Querschnitten), sonst null. */
export function masse(abschnitte, z) {
  for (let i = 0; i < abschnitte.length - 1; i++) {
    const a = abschnitte[i], b = abschnitte[i + 1];
    if (z >= a.z && z <= b.z) {
      const t = (z - a.z) / (b.z - a.z), l = (p, d = 0) => (a[p] ?? d) + ((b[p] ?? d) - (a[p] ?? d)) * t;
      return { w: l('w'), h: l('h'), x: l('x'), y: l('y') };
    }
  }
  return null;
}

/** Nur Position + Normale, nicht indiziert — WARUM: mergeGeometries verlangt gleiche Attribute; UVs kommen danach. */
export function nur(g) {
  if (g.index) g = g.toNonIndexed();
  for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal') g.deleteAttribute(name);
  if (!g.attributes.normal) g.computeVertexNormals();
  return g;
}

/** Box-Projektion: je Dreieck die Hauptachse der Normale wählen, UV = die beiden anderen Koordinaten / KACHEL. */
export function boxUv(g, kachel = KACHEL) {
  const p = g.attributes.position, uv = new Float32Array(p.count * 2);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3(), d = new THREE.Vector3();
  for (let i = 0; i < p.count; i += 3) {
    a.fromBufferAttribute(p, i); b.fromBufferAttribute(p, i + 1); c.fromBufferAttribute(p, i + 2);
    n.subVectors(b, a).cross(d.subVectors(c, a));
    const ax = Math.abs(n.x), ay = Math.abs(n.y), az = Math.abs(n.z);
    for (let k = 0; k < 3; k++) {
      const v = k === 0 ? a : k === 1 ? b : c;
      let u, w;
      if (ax >= ay && ax >= az) { u = v.z; w = v.y; } else if (ay >= az) { u = v.x; w = v.z; } else { u = v.x; w = v.y; }
      uv[(i + k) * 2] = u / kachel; uv[(i + k) * 2 + 1] = w / kachel;
    }
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}

export const kiste = (b, h, t, x, y, z) => nur(new THREE.BoxGeometry(b, h, t).translate(x, y, z));
export const rohrZ = (r, l, x, y, z, seg = 10) => nur(new THREE.CylinderGeometry(r, r, l, seg).rotateX(Math.PI / 2).translate(x, y, z));
export const rohrX = (r, l, x, y, z, seg = 10) => nur(new THREE.CylinderGeometry(r, r, l, seg).rotateZ(Math.PI / 2).translate(x, y, z));
export const rohrY = (r, l, x, y, z, seg = 10) => nur(new THREE.CylinderGeometry(r, r, l, seg).translate(x, y, z));

/** Aufbauten (Kisten, Lüfterblöcke) auf Ober-, Unter- und Seitenflächen eines Lofts. */
export function aufbauten(rnd, ab, z0, z1, eimer, { oben = true, unten = true, seiten = true, dichte = 1, fase = 0.25, skala = 1 } = {}) {
  for (let z = z0; z < z1; z += (1.5 + rnd() * 3.5) * skala / dichte) {
    const m = masse(ab, z); if (!m) continue;
    const c = Math.min(m.w, m.h) * fase;
    const wohin = rnd();
    const bw = (0.6 + Math.pow(rnd(), 1.5) * 4) * skala, bd = (0.8 + Math.pow(rnd(), 1.5) * 6) * skala, bh = (0.25 + Math.pow(rnd(), 2) * 1.4) * skala;
    const ziel = rnd() < 0.55 ? eimer.dunkel : eimer.rumpf;
    if (wohin < 0.4 && oben) {
      const x = m.x + (rnd() * 2 - 1) * Math.max(0, m.w - c - bw / 2);
      ziel.push(kiste(bw, bh, bd, x, m.y + m.h + bh / 2 - 0.08, z));
      if (rnd() < 0.25) eimer.dunkel.push(kiste(bw * 0.6, bh * 0.6, bd * 0.5, x, m.y + m.h + bh + bh * 0.3 - 0.08, z));
    } else if (wohin < 0.8 && seiten) {
      const s = rnd() < 0.5 ? 1 : -1, y = m.y + (rnd() * 2 - 1) * Math.max(0, m.h - c - bw / 2);
      ziel.push(kiste(bh, bw, bd, m.x + s * (m.w + bh / 2 - 0.08), y, z));
    } else if (unten) {
      const x = m.x + (rnd() * 2 - 1) * Math.max(0, m.w - c - bw / 2);
      ziel.push(kiste(bw, bh, bd, x, m.y - m.h - bh / 2 + 0.08, z));
    }
  }
}

// ---------------- Materialien ----------------
let texturen = null; // WARUM gemeinsam: beide Schiffe nutzen dieselben Canvas-Texturen (einmal erzeugen)
export function materialien() {
  texturen ??= rumpfTexturen();
  const tex = texturen;
  return {
    rumpf: new THREE.MeshStandardMaterial({ map: tex.farbe, roughnessMap: tex.rauheit, bumpMap: tex.relief, bumpScale: 2, roughness: 1, metalness: 0.35, color: 0xd8dade }),
    dunkel: new THREE.MeshStandardMaterial({ map: tex.farbe, roughnessMap: tex.rauheit, bumpMap: tex.relief, bumpScale: 2, roughness: 1, metalness: 0.4, color: 0x7a7c80 }),
    metall: new THREE.MeshStandardMaterial({ color: 0x8a8580, roughness: 0.42, metalness: 0.85 }),
    duese: new THREE.MeshStandardMaterial({ color: 0x45403b, roughness: 0.5, metalness: 0.9, side: THREE.DoubleSide }),
    schacht: new THREE.MeshStandardMaterial({ color: 0x0c0c0d, roughness: 0.9, metalness: 0.2 }),
    warn: new THREE.MeshStandardMaterial({ color: 0x7a2a22, roughness: 0.7, metalness: 0.3 }),
  };
}
export const leereEimer = () => ({ rumpf: [], dunkel: [], metall: [], duese: [], schacht: [], warn: [] });

/** Je Material ein Netz (wenige Draw-Calls), mit Schatten. */
export function fuegeZusammen(eimer, mats, gruppe, praefix = 'schiff') {
  for (const [name, liste] of Object.entries(eimer)) {
    if (!liste.length) continue;
    const m = new THREE.Mesh(boxUv(mergeGeometries(liste)), mats[name]);
    m.castShadow = true; m.receiveShadow = true; m.name = praefix + '-' + name;
    gruppe.add(m);
  }
}

/** Geschützturm als eigene Gruppe (die Waffen-Station dreht ihn später). s = Größe. */
export function turm(gruppe, mats, x, y, z, unten, s = 1) {
  const t = new THREE.Group();
  const teile = {
    dunkel: [nur(new THREE.CylinderGeometry(2.4 * s, 2.7 * s, 1.2 * s, 20).translate(0, 0.6 * s, 0))],
    rumpf: [kiste(4 * s, 1.8 * s, 4.6 * s, 0, 2.0 * s, 0.3 * s), kiste(3 * s, 0.6 * s, 2 * s, 0, 3.1 * s, -0.6 * s)],
    metall: [rohrZ(0.28 * s, 7 * s, 0.8 * s, 2.1 * s, 5.6 * s, 8), rohrZ(0.28 * s, 7 * s, -0.8 * s, 2.1 * s, 5.6 * s, 8),
      rohrZ(0.45 * s, 1.2 * s, 0.8 * s, 2.1 * s, 2.9 * s, 8), rohrZ(0.45 * s, 1.2 * s, -0.8 * s, 2.1 * s, 2.9 * s, 8)],
  };
  for (const [name, liste] of Object.entries(teile)) {
    const m = new THREE.Mesh(boxUv(mergeGeometries(liste)), mats[name]);
    m.castShadow = true; m.receiveShadow = true; t.add(m);
  }
  t.position.set(x, y, z);
  if (unten) t.rotation.z = Math.PI;
  gruppe.add(t);
  return t;
}

/** Triebwerksdüse (Glocke) mit Gehäuse und Stellzylindern; seg = 8 → achteckig. Liefert die Düsenbeschreibung. */
export function duese(eimer, x, y, z, r, { seg = 32, gehaeuse = 1.25, gehaeuseLaenge = 5 } = {}) {
  const P = [[0.85, 0], [0.95, 0.3], [1.08, 1.0], [1.16, 1.6], [1.12, 1.68], [1.02, 1.6], [0.92, 1.0], [0.8, 0.3], [0.72, 0]];
  const g = new THREE.LatheGeometry(P.map(([a, b]) => new THREE.Vector2(a * r, b * r)), seg).rotateX(-Math.PI / 2).translate(x, y, z);
  eimer.duese.push(nur(g));
  eimer.dunkel.push(nur(new THREE.CylinderGeometry(r * gehaeuse, r * gehaeuse, gehaeuseLaenge, seg === 8 ? 8 : 16).rotateX(Math.PI / 2).translate(x, y, z + gehaeuseLaenge / 2 - 0.5)));
  for (let k = 0; k < 8; k++) {
    const w = k / 8 * Math.PI * 2;
    eimer.metall.push(rohrZ(0.18 * r / 3.6, r * 1.4, x + Math.cos(w) * r * 1.2, y + Math.sin(w) * r * 1.2, z - r * 0.5, 6));
  }
  return { x, y, z, r, ende: z - 1.68 * r, seg };
}

/** Abziehbild-Material für Beschriftungen. */
export function schriftMaterial(text, unter) {
  return new THREE.MeshStandardMaterial({ map: beschriftung(text, unter), transparent: true, roughness: 0.8, metalness: 0.2,
    depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
}

// ---------------- Effekte ----------------
function weicheTextur() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const k = c.getContext('2d'), g = k.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.25, 'rgba(255,255,255,0.6)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  k.fillStyle = g; k.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

function flammenMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { staerke: { value: 0 }, farbe: { value: new THREE.Color(0.55, 0.72, 1.0) } },
    vertexShader: /* glsl */`
      varying float vT; varying float vRand;
      void main(){
        vT = 1.0 - uv.y;
        vec3 n = normalize(normalMatrix * normal);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vRand = abs(dot(n, normalize(-mv.xyz)));
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      uniform float staerke; uniform vec3 farbe; varying float vT; varying float vRand;
      void main(){
        float a = pow(max(1.0 - vT, 0.0), 1.8) * pow(max(vRand, 0.0), 1.6) * staerke;
        vec3 c = mix(farbe, vec3(1.0), pow(max(1.0 - vT, 0.0), 6.0) * 0.7);
        gl_FragColor = vec4(min(c * a, vec3(30.0)), 1.0);
      }`,
  });
}

const lichtMat = (r, g, b) => { const m = new THREE.MeshBasicMaterial(); m.color.setRGB(r, g, b); return m; };
export const LICHT = { rot: [14, 0.6, 0.4], gruen: [0.4, 12, 2], weiss: [16, 16, 16] };

/**
 * Effekte anbringen und die Darstellungs-Funktion liefern.
 * @param duesen  Liste aus duese()
 * @param steuer  { name: [x, y, z, dx, dy, dz] } — Namen wie in der Zuordnung unten (bugL/R/O/U, heckL/R/O/U, podLO/LU/RO/RU)
 * @param lampen  [[x, y, z, farbe[3], takt, phase, radius]]
 * @param arbeit  [[x, y, z]] kleine gelbliche Dauerlichter
 * @param heckZ   z-Position des Heck-Punktlichts
 */
export function ausstattung(gruppe, { duesen, steuer, lampen, arbeit, heckZ, puffGroesse = 1 }) {
  const weich = weicheTextur();
  const glutMat = new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.DoubleSide });
  const flamme = flammenMaterial();
  const halo = new THREE.SpriteMaterial({ map: weich, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
  const flammen = [], halos = [];
  for (const d of duesen) {
    const s = new THREE.Mesh(new THREE.CircleGeometry(d.r * 0.82, d.seg === 8 ? 8 : 32).rotateY(Math.PI), glutMat);
    s.position.set(d.x, d.y, d.z - d.r * 0.15); gruppe.add(s);
    const f = new THREE.Mesh(new THREE.CylinderGeometry(d.r * 0.95, d.r * 0.3, 1, 24, 6, true).translate(0, -0.5, 0).rotateX(Math.PI / 2), flamme);
    f.position.set(d.x, d.y, d.ende + 0.3); f.renderOrder = 5; gruppe.add(f); flammen.push(f);
    const h = new THREE.Sprite(halo); h.position.set(d.x, d.y, d.ende - 1); gruppe.add(h); halos.push(h);
  }
  const heckLicht = new THREE.PointLight(0x9ab8ff, 0, 140, 2);
  heckLicht.position.set(0, 0, heckZ); gruppe.add(heckLicht);

  const puffs = {};
  for (const [k, [x, y, z, dx, dy, dz]] of Object.entries(steuer)) {
    const m = new THREE.SpriteMaterial({ map: weich, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, color: 0x000000 });
    const s = new THREE.Sprite(m); s.position.set(x + dx * 1.8, y + dy * 1.8, z + dz * 1.8);
    gruppe.add(s); puffs[k] = { s, m, x, wert: 0 };
  }

  const blink = [];
  for (const [x, y, z, f, takt, phase, rr = 0.45] of lampen) {
    const mat = lichtMat(...f);
    const m = new THREE.Mesh(new THREE.SphereGeometry(rr, 10, 6), mat); m.position.set(x, y, z); gruppe.add(m);
    if (takt) blink.push({ mat, basis: mat.color.clone(), takt, phase });
  }
  // kleine, ruhige Arbeitslichter — WARUM: Schattenseite wirkt sonst tot
  const im = new THREE.InstancedMesh(new THREE.BoxGeometry(0.35, 0.35, 0.35), lichtMat(5, 3.2, 1.3), arbeit.length);
  const mm = new THREE.Matrix4();
  arbeit.forEach(([x, y, z], i) => im.setMatrixAt(i, mm.makeTranslation(x, y, z)));
  gruppe.add(im);

  let glatt = 0;
  return function darstellen(pos, rot, z, zeit, dt) {
    gruppe.position.copy(pos); gruppe.quaternion.copy(rot);
    const vor = Math.max(0, z.schub.z), hebel = Math.max(0, z.hebel);
    // g: Triebwerksleistung fürs Auge, 0..~1,35 (Leerlauf-Glimmen nach Hebel, dazu echter Schub, dazu Nachbrenner)
    // WARUM nicht nur echter Schub: bei Marschfahrt ohne Reibung wäre der Schub 0 und die Düsen dunkel.
    const soll = z.hebel > 0.01 || vor > 0.02 ? Math.min(1, 0.1 + 0.35 * hebel + 0.3 * vor) + 0.35 * z.nachbrenner : 0;
    glatt += (soll - glatt) * Math.min(1, dt * 6);
    const g = glatt * (1 + 0.04 * Math.sin(zeit * 53) + 0.03 * Math.sin(zeit * 31.7));
    // WARUM gedämpft: Spieltest R1 — volle Glut machte die Düsen zu weißen Scheinwerfern
    glutMat.color.setRGB(0.35 + 1.1 * g, 0.5 + 1.4 * g, 0.8 + 2.0 * g).multiplyScalar(g > 0.001 ? 1 : 0.15);
    flamme.uniforms.staerke.value = g * 0.5;
    for (let i = 0; i < flammen.length; i++) {
      const d = duesen[i];
      flammen[i].scale.set(1, 1, d.r * (1.5 + 6 * g));
      halos[i].scale.setScalar(d.r * (1.0 + 1.0 * g));
    }
    halo.color.setRGB(0.08 * g, 0.11 * g, 0.16 * g);
    heckLicht.intensity = 120 * g * duesen.length / 4;

    // Steuerdüsen aus Drehwunsch (drehSchub) und Querschub
    const ax = z.drehSchub.x, ay = z.drehSchub.y, az = z.drehSchub.z, sx = z.schub.x, sy = z.schub.y;
    const p = (v) => Math.max(0, v);
    const an = {
      bugR: p(ay) + p(sx), bugL: p(-ay) + p(-sx), heckL: p(ay) + p(-sx), heckR: p(-ay) + p(sx),
      bugO: p(ax) + p(-sy), bugU: p(-ax) + p(sy), heckU: p(ax) + p(sy), heckO: p(-ax) + p(-sy),
      podLU: p(az), podRO: p(az), podLO: p(-az), podRU: p(-az),
    };
    for (const [k, q] of Object.entries(puffs)) {
      const ziel = Math.min(1, Math.max(0, ((an[k] ?? 0) - 0.12) * 1.4));
      q.wert += (ziel - q.wert) * Math.min(1, dt * 12);
      const f = q.wert * (0.85 + 0.15 * Math.sin(zeit * 70 + q.x));
      q.m.color.setRGB(2.2 * f, 2.4 * f, 2.8 * f);
      q.s.scale.setScalar((2 + 4 * q.wert) * puffGroesse);
    }
    for (const b of blink) {
      const t = ((zeit / b.takt + b.phase) % 1 + 1) % 1;
      b.mat.color.copy(b.basis).multiplyScalar(t < 0.08 ? 1 : 0.04);
    }
  };
}
