// ZWECK: Das 3D-Modell der Fregatte „Ambos“ (~150 m), komplett aus Code: gepanzerter Rumpf, Bugpanzer, zwei
//        Seitenrümpfe mit Triebwerken, Kommandoblock ohne Fenster, Aufbauten, Geschütztürme, Positionslichter.
// LIEFERT: erstelleSchiffModell(scene) → { gruppe, tuerme, darstellen(pos, rot, z, zeit, dt) }
//   z = Zustand aus sim/schiff.js (hebel, schub, drehSchub, nachbrenner) → Triebwerksglut, Steuerdüsen.
// REGEL: Schiff lokal +Z vorne, +X links (Backbord), +Y oben. Rumpfteile werden je Material zu EINEM Netz
//        zusammengefügt (wenige Draw-Calls). UVs per Box-Projektion in Schiffskoordinaten → gleich große Platten überall.
// STIL: industriell, abgenutzt, grau; keine Fenster (Brücke liegt gepanzert im Rumpf).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { zufall } from '../zufall.js';
import { rumpfTexturen, beschriftung, KACHEL } from './texturen.js';

// ---------------- Geometrie-Helfer ----------------
/** Achteck-Querschnitt (Rechteck mit Fasen), Punkte im Umlauf. */
function profil(w, h, fase) {
  const c = Math.min(w, h) * fase;
  return [[w, h - c], [w - c, h], [-(w - c), h], [-w, h - c], [-w, -(h - c)], [-(w - c), -h], [w - c, -h], [w, -(h - c)]];
}

/** Rumpfstück aus Querschnitten [{z, w, h, x?, y?}] (z aufsteigend). Liefert nicht-indizierte Geometrie (harte Kanten). */
function loft(abschnitte, fase = 0.25) {
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

/** Maße eines Lofts an Stelle z (linear zwischen den Querschnitten). */
function masse(abschnitte, z) {
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
function nur(g) {
  if (g.index) g = g.toNonIndexed();
  for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal') g.deleteAttribute(name);
  if (!g.attributes.normal) g.computeVertexNormals();
  return g;
}

/** Box-Projektion: je Dreieck die Hauptachse der Normale wählen, UV = die beiden anderen Koordinaten / KACHEL. */
function boxUv(g, kachel = KACHEL) {
  const p = g.attributes.position, uv = new Float32Array(p.count * 2);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3();
  for (let i = 0; i < p.count; i += 3) {
    a.fromBufferAttribute(p, i); b.fromBufferAttribute(p, i + 1); c.fromBufferAttribute(p, i + 2);
    n.subVectors(b, a).cross(c.clone().sub(a));
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

const kiste = (b, h, t, x, y, z) => nur(new THREE.BoxGeometry(b, h, t).translate(x, y, z));
const rohrZ = (r, l, x, y, z, seg = 10) => nur(new THREE.CylinderGeometry(r, r, l, seg).rotateX(Math.PI / 2).translate(x, y, z));
const rohrX = (r, l, x, y, z, seg = 10) => nur(new THREE.CylinderGeometry(r, r, l, seg).rotateZ(Math.PI / 2).translate(x, y, z));
const rohrY = (r, l, x, y, z, seg = 10) => nur(new THREE.CylinderGeometry(r, r, l, seg).translate(x, y, z));

// ---------------- Rumpf-Maße ----------------
const RUECKGRAT = [
  { z: -66, w: 8, h: 7.5 }, { z: -58, w: 10.5, h: 9 }, { z: -20, w: 11, h: 9.5 }, { z: 25, w: 11, h: 9 },
  { z: 48, w: 9, h: 7, y: -0.5 }, { z: 72, w: 6, h: 4.5, y: -1 }, { z: 84, w: 3.8, h: 2.6, y: -1.4 },
];
const BUGPANZER = [
  { z: 6, w: 11, h: 1.2, y: 9.6 }, { z: 18, w: 15, h: 2.2, y: 9.9 }, { z: 52, w: 14, h: 2.4, y: 8.4 },
  { z: 74, w: 9, h: 1.8, y: 5.4 }, { z: 86, w: 5, h: 1.1, y: 3.4 },
];
const KIEL = [{ z: -40, w: 5, h: 1, y: -9.6 }, { z: 0, w: 7, h: 1.4, y: -9.6 }, { z: 40, w: 7.5, h: 1.6, y: -8.2 }, { z: 70, w: 4.5, h: 1.1, y: -5.6 }];
const SEITENRUMPF = (x) => [
  { z: -64, w: 4.5, h: 5, x, y: -1 }, { z: -56, w: 5.5, h: 6, x, y: -1 }, { z: 4, w: 5.5, h: 6, x, y: -1 },
  { z: 18, w: 4.6, h: 4.6, x, y: -1 }, { z: 26, w: 2.8, h: 3, x, y: -1.2 },
];
const KOMMANDO = [{ z: -36, w: 6, h: 2.5, y: 11.2 }, { z: -28, w: 7, h: 3.4, y: 12 }, { z: -9, w: 6, h: 3.2, y: 12 }, { z: -2, w: 4, h: 2, y: 11.4 }];
const POD_X = 21;

/** Aufbauten (Kisten, Lüfterblöcke) auf Ober-, Unter- und Seitenflächen eines Lofts. */
function aufbauten(rnd, ab, z0, z1, eimer, { oben = true, unten = true, seiten = true, dichte = 1, fase = 0.25 } = {}) {
  for (let z = z0; z < z1; z += (1.5 + rnd() * 3.5) / dichte) {
    const m = masse(ab, z); if (!m) continue;
    const c = Math.min(m.w, m.h) * fase;
    const wohin = rnd();
    const bw = 0.6 + Math.pow(rnd(), 1.5) * 4, bd = 0.8 + Math.pow(rnd(), 1.5) * 6, bh = 0.25 + Math.pow(rnd(), 2) * 1.4;
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

// ---------------- Modell ----------------
export function erstelleSchiffModell(scene) {
  const rnd = zufall(1977);
  const tex = rumpfTexturen();
  const mats = {
    rumpf: new THREE.MeshStandardMaterial({ map: tex.farbe, roughnessMap: tex.rauheit, bumpMap: tex.relief, bumpScale: 2, roughness: 1, metalness: 0.35, color: 0xd8dade }),
    dunkel: new THREE.MeshStandardMaterial({ map: tex.farbe, roughnessMap: tex.rauheit, bumpMap: tex.relief, bumpScale: 2, roughness: 1, metalness: 0.4, color: 0x7a7c80 }),
    metall: new THREE.MeshStandardMaterial({ color: 0x8a8580, roughness: 0.42, metalness: 0.85 }),
    duese: new THREE.MeshStandardMaterial({ color: 0x45403b, roughness: 0.5, metalness: 0.9, side: THREE.DoubleSide }),
  };
  const eimer = { rumpf: [], dunkel: [], metall: [], duese: [] };

  // --- Hauptkörper ---
  eimer.rumpf.push(loft(RUECKGRAT), loft(BUGPANZER, 0.4), loft(KOMMANDO, 0.35));
  eimer.dunkel.push(loft(KIEL, 0.4));
  for (const s of [1, -1]) {
    eimer.rumpf.push(loft(SEITENRUMPF(s * POD_X)));
    // Ausleger zwischen Rückgrat und Seitenrumpf
    for (const z of [-46, -22, 0]) {
      eimer.dunkel.push(kiste(6.5, 3, 7, s * 13.8, -1, z));
      eimer.metall.push(rohrX(0.45, 7, s * 13.8, 1.1, z - 2.6), rohrX(0.45, 7, s * 13.8, 1.1, z + 2.6), rohrX(0.3, 7, s * 13.8, -2.9, z));
    }
    // Kühlrippen außen am Seitenrumpf
    for (let z = -44; z < -14; z += 1.3) eimer.dunkel.push(kiste(1.4, 5.5, 0.18, s * (POD_X + 5.5 + 0.6), -1, z));
    eimer.metall.push(rohrZ(0.35, 32, s * (POD_X + 5.9), 2.2, -29), rohrZ(0.35, 32, s * (POD_X + 5.9), -4.2, -29));
    // Rohrleitungen an den Rumpfseiten
    for (const [y, r] of [[3.2, 0.55], [1.9, 0.4], [-4.6, 0.5]]) {
      eimer.metall.push(rohrZ(r, 42, s * (11 + r * 0.8), y, 3));
      for (let z = -16; z <= 22; z += 3.8) eimer.dunkel.push(kiste(r * 2.4, r * 2.6, 0.4, s * (11 + r * 0.6), y, z));
    }
    // seitliche Hangarklappe (ohne Öffnung, nur schwere Tore)
    eimer.dunkel.push(kiste(0.5, 6, 14, s * 11.1, -1.5, -40));
    aufbauten(rnd, SEITENRUMPF(s * POD_X), -60, 16, eimer, { dichte: 0.8 });
  }
  aufbauten(rnd, RUECKGRAT, -60, 80, eimer, { dichte: 1.3 });
  aufbauten(rnd, BUGPANZER, 8, 82, eimer, { unten: false, seiten: false, dichte: 0.9, fase: 0.4 });
  aufbauten(rnd, KOMMANDO, -34, -3, eimer, { unten: false, dichte: 1.5, fase: 0.35 });

  // --- Sensor- und Funkmast auf dem Kommandoblock ---
  eimer.metall.push(rohrY(0.35, 9, 0, 19.5, -20), rohrY(0.2, 6, 2.5, 18, -26), rohrY(0.2, 4, -2.5, 17, -14));
  eimer.dunkel.push(kiste(5, 0.4, 0.4, 0, 22, -20), kiste(0.4, 0.4, 3, 0, 20.5, -20), kiste(3.5, 2, 3.5, 0, 16, -30));
  const schuessel = nur(new THREE.SphereGeometry(3.2, 20, 8, 0, Math.PI * 2, 0, 0.9).rotateX(-0.9).translate(-3, 17.5, -11));
  eimer.metall.push(schuessel);
  // Bug: Rammsporn-Kante und Sensornasen
  eimer.dunkel.push(kiste(1.2, 1.2, 10, 0, -1.4, 86), rohrZ(0.5, 6, 3, -0.8, 85), rohrZ(0.5, 6, -3, -0.8, 85));

  // --- Triebwerke ---
  const duesen = [];
  const duese = (x, y, z, r) => {
    const P = [[0.85, 0], [0.95, 0.3], [1.08, 1.0], [1.16, 1.6], [1.12, 1.68], [1.02, 1.6], [0.92, 1.0], [0.8, 0.3], [0.72, 0]];
    const g = new THREE.LatheGeometry(P.map(([a, b]) => new THREE.Vector2(a * r, b * r)), 32).rotateX(-Math.PI / 2).translate(x, y, z);
    eimer.duese.push(nur(g));
    eimer.dunkel.push(nur(new THREE.CylinderGeometry(r * 1.25, r * 1.25, 5, 16).rotateX(Math.PI / 2).translate(x, y, z + 2)));
    for (let k = 0; k < 8; k++) { // Stellzylinder rund um die Düse
      const w = k / 8 * Math.PI * 2;
      eimer.metall.push(rohrZ(0.18, r * 1.4, x + Math.cos(w) * r * 1.2, y + Math.sin(w) * r * 1.2, z - r * 0.5, 6));
    }
    duesen.push({ x, y, z, r, ende: z - 1.68 * r });
  };
  duese(4.4, 0, -66, 3.6); duese(-4.4, 0, -66, 3.6);
  duese(POD_X, -1, -64, 3.4); duese(-POD_X, -1, -64, 3.4);

  // --- Zusammenfügen ---
  const gruppe = new THREE.Group();
  gruppe.name = 'schiff';
  for (const [name, liste] of Object.entries(eimer)) {
    const g = boxUv(mergeGeometries(liste));
    const m = new THREE.Mesh(g, mats[name]);
    m.castShadow = true; m.receiveShadow = true; m.name = 'schiff-' + name;
    gruppe.add(m);
  }

  // --- Geschütztürme (eigene Gruppen: dreht später die Waffen-Station) ---
  const tuerme = [];
  const turm = (x, y, z, unten) => {
    const t = new THREE.Group();
    const teile = { dunkel: [nur(new THREE.CylinderGeometry(2.4, 2.7, 1.2, 20).translate(0, 0.6, 0))],
      rumpf: [kiste(4, 1.8, 4.6, 0, 2.0, 0.3), kiste(3, 0.6, 2, 0, 3.1, -0.6)],
      metall: [rohrZ(0.28, 7, 0.8, 2.1, 5.6, 8), rohrZ(0.28, 7, -0.8, 2.1, 5.6, 8), rohrZ(0.45, 1.2, 0.8, 2.1, 2.9, 8), rohrZ(0.45, 1.2, -0.8, 2.1, 2.9, 8)] };
    for (const [name, liste] of Object.entries(teile)) {
      const m = new THREE.Mesh(boxUv(mergeGeometries(liste)), mats[name]);
      m.castShadow = true; m.receiveShadow = true; t.add(m);
    }
    t.position.set(x, y, z);
    if (unten) t.rotation.z = Math.PI;
    gruppe.add(t); tuerme.push(t);
  };
  turm(0, 9.4, -48, false); turm(0, 12.1, 34, false); turm(0, -10.5, -24, true); turm(0, -9.7, 28, true);

  // --- Beschriftung ---
  const schriftMat = (t) => new THREE.MeshStandardMaterial({ map: t, transparent: true, roughness: 0.8, metalness: 0.2,
    depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
  const name = schriftMat(beschriftung('AMBOS', 'FK-07  FLOTTENKORVETTE'));
  // Name vorn an der Rumpfseite, vor den Seitenrümpfen (sonst verdecken die ihn); Fläche folgt der Verjüngung
  const neigung = Math.atan2(RUECKGRAT[3].w - RUECKGRAT[4].w, RUECKGRAT[4].z - RUECKGRAT[3].z);
  for (const s of [1, -1]) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(21, 3.5), name);
    const m = masse(RUECKGRAT, 36.5);
    p.rotation.y = s * (Math.PI / 2 - neigung); p.position.set(s * (m.w + 0.04), 0.6, 36.5);
    p.receiveShadow = true; gruppe.add(p);
  }
  const nummer = new THREE.Mesh(new THREE.PlaneGeometry(18, 3), schriftMat(beschriftung('07')));
  nummer.rotation.x = -Math.PI / 2; nummer.rotation.z = Math.PI; nummer.position.set(2, 9.53, -57);
  // WARUM rotation.z = π: so liest man die Zahl von hinten oben (Verfolgerkamera) richtig herum
  nummer.receiveShadow = true; gruppe.add(nummer);

  // --- Triebwerksglut, Flammen, Licht ---
  const weich = weicheTextur();
  const glutMat = new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.DoubleSide });
  const flamme = flammenMaterial();
  const halo = new THREE.SpriteMaterial({ map: weich, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
  const flammen = [], halos = [];
  for (const d of duesen) {
    const s = new THREE.Mesh(new THREE.CircleGeometry(d.r * 0.82, 32).rotateY(Math.PI), glutMat);
    s.position.set(d.x, d.y, d.z - d.r * 0.15); gruppe.add(s);
    const f = new THREE.Mesh(new THREE.CylinderGeometry(d.r * 0.95, d.r * 0.3, 1, 24, 6, true).translate(0, -0.5, 0).rotateX(Math.PI / 2), flamme);
    f.position.set(d.x, d.y, d.ende + 0.3); f.renderOrder = 5; gruppe.add(f); flammen.push(f);
    const h = new THREE.Sprite(halo); h.position.set(d.x, d.y, d.ende - 1); h.scale.setScalar(d.r * 4); gruppe.add(h); halos.push(h);
  }
  const heckLicht = new THREE.PointLight(0x9ab8ff, 0, 90, 2);
  heckLicht.position.set(0, 0, -80); gruppe.add(heckLicht);

  // --- Steuerdüsen (Manöver): Position, Ausstoßrichtung ---
  const STEUER = {
    bugL: [6.2, -1, 74, 1, 0, 0], bugR: [-6.2, -1, 74, -1, 0, 0], bugO: [0, 3.6, 76, 0, 1, 0], bugU: [0, -5.6, 76, 0, -1, 0],
    heckL: [8.6, 0, -60, 1, 0, 0], heckR: [-8.6, 0, -60, -1, 0, 0], heckO: [0, 9.2, -62, 0, 1, 0], heckU: [0, -9.2, -62, 0, -1, 0],
    podLO: [POD_X, 5.2, 14, 0, 1, 0], podLU: [POD_X, -7.2, 14, 0, -1, 0], podRO: [-POD_X, 5.2, 14, 0, 1, 0], podRU: [-POD_X, -7.2, 14, 0, -1, 0],
  };
  const puffs = {};
  for (const [k, [x, y, z, dx, dy, dz]] of Object.entries(STEUER)) {
    const m = new THREE.SpriteMaterial({ map: weich, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, color: 0x000000 });
    const s = new THREE.Sprite(m); s.position.set(x + dx * 1.8, y + dy * 1.8, z + dz * 1.8); s.scale.setScalar(4);
    gruppe.add(s); puffs[k] = { s, m, x, y, z, dx, dy, dz, wert: 0 };
  }

  // --- Positions- und Rumpflichter ---
  const lichtMat = (r, g, b) => { const m = new THREE.MeshBasicMaterial(); m.color.setRGB(r, g, b); return m; };
  const blink = [];
  const lampe = (x, y, z, mat, takt, phase, rr = 0.45) => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(rr, 10, 6), mat); m.position.set(x, y, z); gruppe.add(m);
    if (takt) blink.push({ mat, basis: mat.color.clone(), takt, phase });
  };
  lampe(POD_X + 2.9, -1.2, 26.3, lichtMat(14, 0.6, 0.4), 1.2, 0);      // Backbord rot
  lampe(-POD_X - 2.9, -1.2, 26.3, lichtMat(0.4, 12, 2), 1.2, 0);        // Steuerbord grün
  lampe(0, 24.2, -20, lichtMat(16, 16, 16), 1.6, 0.2, 0.35);              // Mastspitze weiß (Blitz)
  lampe(0, 0, -67, lichtMat(16, 16, 16), 1.6, 0.9, 0.35);                 // Heck weiß
  lampe(0, 3.5, 87, lichtMat(14, 0.6, 0.4), 2.4, 0.5, 0.35);              // Bugspitze rot
  // kleine, ruhige Arbeitslichter (gelblich) — WARUM: Schattenseite wirkt sonst tot
  const arbeit = lichtMat(5, 3.2, 1.3);
  const arbeitGeo = new THREE.BoxGeometry(0.35, 0.35, 0.35);
  const punkte = [];
  for (let i = 0; i < 46; i++) {
    const z = -58 + rnd() * 130, m = masse(RUECKGRAT, z), s = rnd() < 0.5 ? 1 : -1;
    if (!m) continue;
    if (rnd() < 0.6) punkte.push([s * (m.w + 0.1), m.y + (rnd() * 2 - 1) * m.h * 0.6, z]);
    else punkte.push([m.x + (rnd() * 2 - 1) * m.w * 0.6, m.y - m.h - 0.1, z]);
  }
  for (let i = 0; i < 16; i++) { const s = i % 2 ? 1 : -1; punkte.push([s * (POD_X + 5.6), -1 + (rnd() * 2 - 1) * 4, -58 + rnd() * 70]); }
  const im = new THREE.InstancedMesh(arbeitGeo, arbeit, punkte.length);
  const mm = new THREE.Matrix4();
  punkte.forEach(([x, y, z], i) => im.setMatrixAt(i, mm.makeTranslation(x, y, z)));
  gruppe.add(im);

  scene.add(gruppe);

  // ---------------- Darstellung je Bild ----------------
  let glatt = 0;
  function darstellen(pos, rot, z, zeit, dt) {
    gruppe.position.copy(pos); gruppe.quaternion.copy(rot);
    const vor = Math.max(0, z.schub.z), hebel = Math.max(0, z.hebel);
    // g: Triebwerksleistung fürs Auge, 0..~1,35 (Leerlauf-Glimmen nach Hebel, dazu echter Schub, dazu Nachbrenner)
    // WARUM nicht nur echter Schub: bei Marschfahrt ohne Reibung wäre der Schub 0 und die Düsen dunkel.
    const soll = z.hebel > 0.01 || vor > 0.02 ? Math.min(1, 0.1 + 0.35 * hebel + 0.3 * vor) + 0.35 * z.nachbrenner : 0;
    glatt += (soll - glatt) * Math.min(1, dt * 6);
    const flackern = 1 + 0.04 * Math.sin(zeit * 53) + 0.03 * Math.sin(zeit * 31.7);
    const g = glatt * flackern;
    // WARUM gedämpft: Spieltest R1 — volle Glut machte die Düsen zu weißen Scheinwerfern
    glutMat.color.setRGB(0.35 + 1.1 * g, 0.5 + 1.4 * g, 0.8 + 2.0 * g).multiplyScalar(g > 0.001 ? 1 : 0.15);
    flamme.uniforms.staerke.value = g * 0.5;
    for (let i = 0; i < flammen.length; i++) {
      const d = duesen[i];
      flammen[i].scale.set(1, 1, d.r * (1.5 + 6 * g));
      halos[i].scale.setScalar(d.r * (1.0 + 1.0 * g));
    }
    halo.color.setRGB(0.08 * g, 0.11 * g, 0.16 * g);
    heckLicht.intensity = 120 * g;

    // Steuerdüsen: aus Drehwunsch (drehSchub) und Querschub ableiten
    const ax = z.drehSchub.x, ay = z.drehSchub.y, az = z.drehSchub.z, sx = z.schub.x, sy = z.schub.y;
    const p = (v) => Math.max(0, v);
    const an = {
      bugR: p(ay) + p(sx), bugL: p(-ay) + p(-sx), heckL: p(ay) + p(-sx), heckR: p(-ay) + p(sx),
      bugO: p(ax) + p(-sy), bugU: p(-ax) + p(sy), heckU: p(ax) + p(sy), heckO: p(-ax) + p(-sy),
      podLU: p(az), podRO: p(az), podLO: p(-az), podRU: p(-az),
    };
    for (const [k, q] of Object.entries(puffs)) {
      const ziel = Math.min(1, Math.max(0, (an[k] - 0.12) * 1.4));
      q.wert += (ziel - q.wert) * Math.min(1, dt * 12);
      const f = q.wert * (0.85 + 0.15 * Math.sin(zeit * 70 + q.x));
      q.m.color.setRGB(2.2 * f, 2.4 * f, 2.8 * f);
      q.s.scale.setScalar(2 + 4 * q.wert);
    }
    // Blinklichter: kurzer Blitz je Takt
    for (const b of blink) {
      const t = ((zeit / b.takt + b.phase) % 1 + 1) % 1;
      const an = t < 0.08 ? 1 : 0.04;
      b.mat.color.copy(b.basis).multiplyScalar(an);
    }
  }

  return { gruppe, tuerme, darstellen };
}
