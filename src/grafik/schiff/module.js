// ZWECK: Grafik der Werft-Module (Runde 15): ein Modul → Geometrie in Modul-Koordinaten (je Material eine
//        BufferGeometry, zwischengespeichert) und ein ganzes gebautes Schiff → eine Gruppe mit EINEM Netz je Material.
// LIEFERT: modulGeometrie(id) → { rumpf, dunkel, metall, … } · schiffNetz(teile, mats?, { effekte }) → THREE.Group
//          (userData: { drawCalls, netze, dreiecke, darstellen? }) · lageMatrix(lage, ziel?) → THREE.Matrix4
// REGEL: Daten (Querschnitte, Kisten, Düsen, Andockpunkte, Sperren) NUR aus src/sim/werft/module.js. Hier nur Aufbau und
//        dünne Details (≤ 0,5 m über den Hüllquadern). Türme stehen in Ruhelage (gier 0, nick 0) und sind EINGESCHMOLZEN
//        — WARUM: ein beweglicher Turm kostet 5 Netze (× 2 mit Schatten); in der Werft dreht sich nichts.
//        Zufall je Modul fest (Startwert aus der Id) → ein Modul sieht überall gleich aus. UVs erst nach dem
//        Zusammenfügen (boxUv in Schiffskoordinaten), damit die Textur über die Nähte läuft.
//        lage = { m: [[r00, r01, r02], [r10, …], [r20, …]] (zeilenweise, ganzzahlig), t: [x, y, z] } (E1).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { zufall } from '../zufall.js';
import { lofte, loft, nur, kiste, rohrZ, aufbauten, materialien, leereEimer, turm, duese, boxUv, masse, ausstattung } from './bauteile.js';
import { KATALOG, NORM, AUFBAU } from '../../sim/werft/module.js';

// Platzhalter-Materialien für turm(): nur zum Zurückfinden des Eimers (die echten Materialien kommen in schiffNetz)
const NAMEN = Object.keys(leereEimer());
const PLATZ = Object.fromEntries(NAMEN.map((n) => [n, new THREE.MeshBasicMaterial({ name: n })]));
const PLATZ_NAME = new Map(NAMEN.map((n) => [PLATZ[n], n]));

/** Startwert aus der Modul-Id (FNV-1a). */
function saat(id) { let h = 2166136261; for (const c of id) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; }

/**
 * Eimer, der Aufbauten-Kisten nur annimmt, wenn sie (a) höchstens AUFBAU.hoehe über Ober-/Unterkante und AUFBAU.seite
 * über die Seitenwand des Lofts ragen (genau die Zone, um die die Sim die Hüllquader vergrößert) und (b) keine freie Anbau-Andockebene kreuzen. WARUM: dort sitzt später ein Hangar oder
 * eine Panzerplatte — Kisten stächen hinein. Die Zufallsfolge bleibt unberührt (aufbauten zieht trotzdem).
 */
function gefiltert(eimer, teil, modul) {
  const ebenen = modul.andock.filter((p) => p.art === 'anbau');
  const box = new THREE.Box3();
  const ok = (g) => {
    g.computeBoundingBox(); box.copy(g.boundingBox);
    const z0 = teil.ab[0].z, z1 = teil.ab[teil.ab.length - 1].z;
    const m = masse(teil.ab, Math.min(z1, Math.max(z0, (box.min.z + box.max.z) / 2)));
    if (!m) return false;
    if (box.max.y > m.y + m.h + AUFBAU.hoehe || box.min.y < m.y - m.h - AUFBAU.hoehe) return false;
    if (box.max.x > m.x + m.w + AUFBAU.seite || box.min.x < m.x - m.w - AUFBAU.seite) return false;
    for (const p of ebenen) {
      // Ausdehnung der Kiste in Richtung n gegen die Andockebene (p·n) — ein Hauch Abstand (0,1 m)
      const weit = p.n[0] > 0 ? box.max.x : p.n[0] < 0 ? -box.min.x : p.n[1] > 0 ? box.max.y : p.n[1] < 0 ? -box.min.y : p.n[2] > 0 ? box.max.z : -box.min.z;
      const eben = p.p[0] * p.n[0] + p.p[1] * p.n[1] + p.p[2] * p.n[2];
      if (weit > eben - 0.1) return false;
    }
    return true;
  };
  const w = {};
  for (const k of Object.keys(eimer)) w[k] = { push: (...gs) => { for (const g of gs) if (ok(g)) eimer[k].push(g); } };
  return w;
}

/** Aufbauten auf einem benannten Loft (Flächen aus teil.aufbau der Sim, Lafetten-Sperren, Rand an den Enden, Filter). */
function kisten(rnd, eimer, m, name, opt = {}) {
  const t = m.teile.find((q) => q.name === name); if (!t || !t.aufbau) return;
  const z0 = t.ab[0].z, z1 = t.ab[t.ab.length - 1].z, a = t.aufbau;
  aufbauten(rnd, t.ab, z0, z1, gefiltert(eimer, t, m), { fase: t.fase, rand: 1.5, sperreOben: m.sperren.oben, sperreUnten: m.sperren.unten,
    oben: a.includes('o'), unten: a.includes('u'), seiten: /[spm]/.test(a), ...opt }); // p/m: Innenseite filtert gefiltert()
}

/** Spanten (umlaufende Verstärkungsringe, 0,3 m über der Hülle) — Maßstab und Schattenkanten. */
function spanten(eimer, g, liste) {
  const { w, h, fase } = NORM[g];
  for (const z of liste) eimer.rumpf.push(loft([{ z: z - 0.6, w: w + 0.3, h: h + 0.3 }, { z: z + 0.6, w: w + 0.3, h: h + 0.3 }], fase));
}

/** Turm in Ruhelage als Geometrie in die Eimer (Fußpunkt im Ursprung). */
function turmEinschmelzen(eimer, daten) {
  const g = new THREE.Group();
  turm(g, PLATZ, daten);
  g.updateMatrixWorld(true);
  g.traverse((o) => {
    if (!o.isMesh) return;
    eimer[PLATZ_NAME.get(o.material)].push(nur(o.geometry.clone().applyMatrix4(o.matrixWorld)));
    o.geometry.dispose();
  });
}

// ---------------- Details je Bauart ----------------
const DETAILS = {
  kommando(e, m, rnd) {
    spanten(e, 'M', [-15, 15]);
    for (const s of [1, -1]) {
      for (const z of [-1, 3, 7]) e.schacht.push(kiste(0.3, 1.4, 2.6, s * 7.55, 10.5, z)); // Lüftergitter der Brücke
      e.metall.push(rohrZ(0.35, 30, s * 8.6, 7.35, 0, 8));                                   // Leitungen auf der Fase
    }
    e.warn.push(kiste(4, 0.3, 0.6, 0, 14.05, -5.4));                                         // Warnkante vorn an der Brücke
    kisten(rnd, e, m, 'rumpf', { dichte: 1.8 });
    kisten(rnd, e, m, 'bruecke', { dichte: 1.4, skala: 0.7 });
  },
  rumpf(e, m, rnd) {
    const r = m.teile[0], z0 = r.ab[0].z, z1 = r.ab[r.ab.length - 1].z, g = r.ab[0].w === NORM.L.w ? 'L' : 'M';
    const liste = []; for (let z = z0 + 4; z <= z1 - 4 + 1e-9; z += 8) liste.push(z);
    spanten(e, g, liste);
    kisten(rnd, e, m, 'rumpf', { dichte: 2.2, skala: g === 'L' ? 1.2 : 0.9 });
    kisten(rnd, e, m, 'panzer', { dichte: 1.5, skala: 0.8 });
  },
  bug(e, m, rnd) {
    const l = m.teile[0].ab[0].w === NORM.L.w;
    spanten(e, l ? 'L' : 'M', [m.teile[0].ab[0].z + 3]);
    kisten(rnd, e, m, 'rumpf', { dichte: 1.6, skala: l ? 1.2 : 0.9 });
    kisten(rnd, e, m, 'panzer', { dichte: 1.2, skala: l ? 1.1 : 0.8 });
  },
  uebergang(e, m, rnd) {
    spanten(e, 'L', [-6.5]); spanten(e, 'M', [8.5]);
    kisten(rnd, e, m, 'rumpf', { dichte: 1.6, skala: 1.1 });
  },
  heck(e, m, rnd) {
    const r = m.teile[0], l = r.ab[0].w === NORM.L.w, W = r.ab[0].w;
    // Kühlrippen in der Rechen-Kiste unter dem Heck (kisten[0], zeichnen: false)
    const k = m.kisten[0], za = k.z - k.t / 2, ze = k.z + k.t / 2;
    for (let z = za + 1; z < ze - 0.5; z += 1.6) for (const s of [1, -1]) e.dunkel.push(kiste(k.b / 2 - 1, k.h * 0.9, 0.3, s * k.b / 4, k.y, z));
    e.dunkel.push(kiste(k.b, k.h, 1, 0, k.y, za + 0.5), kiste(k.b, k.h, 1, 0, k.y, ze - 0.5), kiste(0.8, k.h, k.t, 0, k.y, k.z));
    for (const s of [1, -1]) for (let z = r.ab[0].z + 4; z < r.ab[1].z - 6; z += 7) e.schacht.push(kiste(0.3, l ? 3.2 : 2.2, 4.5, s * (W + 0.05), l ? 5 : 3, z));
    spanten(e, l ? 'L' : 'M', [r.ab[1].z - 4]);
    kisten(rnd, e, m, 'panzer', { dichte: 1.2, skala: l ? 1.1 : 0.8 });
    kisten(rnd, e, m, 'rumpf', { dichte: 1.6, skala: l ? 1.2 : 0.9 });
  },
  hangar(e, m, rnd) {
    const s = m.seite, X = 7.5 * s, bodenY = -7, deckelZ = 22;
    for (const dx of [-3.6, 0, 3.6]) {                                                   // Startschächte vorn
      e.warn.push(kiste(3.2, 3.2, 0.25, X + dx, -1.5, deckelZ + 0.05));
      e.schacht.push(kiste(2.6, 2.6, 0.3, X + dx, -1.5, deckelZ + 0.15));
    }
    e.schacht.push(kiste(9, 0.3, 30, X, bodenY - 0.05, -2));                              // Landedeck unten
    e.warn.push(kiste(0.6, 0.32, 30, X + 4.8, bodenY - 0.06, -2), kiste(0.6, 0.32, 30, X - 4.8, bodenY - 0.06, -2));
    for (let z = -14; z <= 10; z += 8) e.warn.push(kiste(9, 0.33, 0.5, X, bodenY - 0.07, z));
    for (let z = -15; z <= 13; z += 7) e.schacht.push(kiste(0.3, 1.8, 3.6, s * 15.05, 0.5, z)); // Luken außen
    kisten(rnd, e, m, 'rumpf', { dichte: 1.5, skala: 0.9 });
  },
  platte(e) {
    for (const y of [-4.2, 4.2]) for (let z = -8; z <= 8; z += 2) e.metall.push(kiste(0.3, 0.45, 0.45, 1.9, y, z)); // Bolzen
    e.dunkel.push(kiste(0.3, 0.35, 17, 1.85, 0, 0));                                       // Stoßleiste
  },
  mast() {},
  turm() {},
};

const ablage = new Map();

/** Geometrie eines Moduls je Material (Modul-Koordinaten, ohne UV), zwischengespeichert. NICHT verändern (geteilt). */
export function modulGeometrie(id) {
  if (ablage.has(id)) return ablage.get(id);
  const m = KATALOG[id];
  if (!m) throw new Error(`Werft: unbekanntes Modul „${id}“`);
  const rnd = zufall(saat(id)), e = leereEimer();
  for (const t of m.teile) e[t.mat ?? 'rumpf'].push(lofte(t));
  for (const k of m.kisten) if (k.zeichnen !== false) e[k.mat ?? 'dunkel'].push(kiste(k.b, k.h, k.t, k.x, k.y, k.z));
  for (const d of m.duesen) duese(e, d.p[0], d.p[1], d.p[2], d.r, { seg: 8, gehaeuse: 1.18, gehaeuseLaenge: d.l ?? 5 });
  if (m.turm) turmEinschmelzen(e, m.turm.daten);
  DETAILS[m.grafik]?.(e, m, rnd);
  const geo = {};
  for (const [name, liste] of Object.entries(e)) {
    if (!liste.length) continue;
    geo[name] = mergeGeometries(liste);
    for (const g of liste) g.dispose();
  }
  ablage.set(id, geo);
  return geo;
}

/** Lage { m (zeilenweise 3×3), t } → Matrix4. */
export function lageMatrix({ m, t }, ziel = new THREE.Matrix4()) {
  return ziel.set(m[0][0], m[0][1], m[0][2], t[0], m[1][0], m[1][1], m[1][2], t[1], m[2][0], m[2][1], m[2][2], t[2], 0, 0, 0, 1);
}

/**
 * Ganzes Schiff aus gebauten Teilen [{ modul, lage }] (z. B. baue(…).teile) → Gruppe mit EINEM Netz je Material.
 * effekte: Triebwerksglut/Flammen über ausstattung() für Düsen, die nach −Z zeigen (braucht document; userData.darstellen).
 * userData.drawCalls = Netze × 2 (Schattendurchgang), ohne Effekte; drawCallsEffekte extra.
 */
export function schiffNetz(teile, mats = materialien(), { effekte = false } = {}) {
  const listen = {}, m4 = new THREE.Matrix4(), duesen = [], v = new THREE.Vector3();
  for (const teil of teile) {
    lageMatrix(teil.lage, m4);
    for (const [name, g] of Object.entries(modulGeometrie(teil.modul))) (listen[name] ??= []).push(g.clone().applyMatrix4(m4));
    const r = teil.lage.m;
    if (effekte && r[0][2] === 0 && r[1][2] === 0 && r[2][2] === 1) {
      for (const d of KATALOG[teil.modul].duesen) {
        v.set(...d.p).applyMatrix4(m4);
        duesen.push({ x: v.x, y: v.y, z: v.z, r: d.r, ende: v.z - 1.68 * d.r, seg: 8 });
      }
    }
  }
  const gruppe = new THREE.Group(); gruppe.name = 'werft-schiff';
  let netze = 0, dreiecke = 0;
  for (const [name, liste] of Object.entries(listen)) {
    const geo = boxUv(mergeGeometries(liste));
    for (const g of liste) g.dispose();
    const netz = new THREE.Mesh(geo, mats[name]);
    netz.castShadow = true; netz.receiveShadow = true; netz.name = 'werft-' + name;
    gruppe.add(netz); netze++; dreiecke += geo.attributes.position.count / 3;
  }
  gruppe.userData = { drawCalls: netze * 2, netze, dreiecke };
  if (effekte && duesen.length) {
    const heckZ = Math.min(...duesen.map((d) => d.ende)) - 10;
    gruppe.userData.darstellen = ausstattung(gruppe, { duesen, steuer: {}, lampen: [], arbeit: [], heckZ });
    gruppe.userData.drawCallsEffekte = duesen.length * 3 + 1; // Glutscheibe, Flamme, Halo je Düse + Arbeitslichter
  }
  return gruppe;
}
