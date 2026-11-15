// ZWECK: Darstellung der Flak-Batterie: 6 Turmmodelle (Rohre drehen interpoliert, Rückstoß), Leuchtspur, Mündungsblitz,
//        Detonationskern, Rauchwolken (Fake-Licht), große Explosion bei Drohnen-Abschuss.
// LIEFERT: erstelleFlakGrafik(scene, camera) → { nachSchritt(flak), aktualisiere(flak, alpha, dt, zeit), explosion(pos, groesse),
//          zaehler: { spuren, gluehen, wolken }, gruppe }
// REGEL: liest den Sim-Zustand nur. nachSchritt() nach JEDEM flak.schritt (übernimmt Schüsse/Detonationen in die Vorräte),
//        aktualisiere() einmal pro Bild (Interpolation + Alterung). Vorräte fester Größe, keine neuen Objekte pro Bild.
//        Zusätzliche Draw-Calls: 3 Effekte + 6 × 5 Turmteile (turm() aus bauteile.js, nur lesend). Keine Lichter.
import * as THREE from 'three';
import { turm, materialien } from '../schiff/bauteile.js';
import { LAFETTEN } from '../../sim/waffen/lafetten.js';
import { SONNE_RICHTUNG } from '../weltraum.js';
import { zufall } from '../zufall.js';
import { uPixel, spurMaterial, gluehMaterial, rauchMaterial } from './shader.js';

const MAX_SPUR = 256, MAX_GLUEH = 128, MAX_RAUCH = 384;
const SPUR_LAENGE = 25;        // m (R8, Nutzer: „kleiner“) — WARUM nicht kürzer: unter ~1 Schrittweg (17 m bei 1000 m/s) wird die Spur zur Perlenkette
// Nahe der Kamera (Runde 7, Bildprüfer: weiße Glut vor der Batterie-Kamera): Glühen unter NAH_VOLL m gedämpft,
// Bildschirmradius gedeckelt (Blitz klein, Kern groß). Kamera steht im Prüfstand-Blick ~30 m vom nächsten Turm.
const NAH_MIN = 15, NAH_VOLL = 80, BLITZ_PX = 18, KERN_PX = 300;
const WOLKE_R = 42, WOLKE_DECKKRAFT = 0.7; // Quad-Radius m (dichter Kern ~28 m), Deckkraft — Runde 7 (Nutzer: „größer“)
const SIM_DT = 1 / 60;
const RUECK = 0.7, RUECK_ZEIT = 0.17; // m, s
// Mündung (R8, Nutzer: „zu rauchig“): Blitz kleiner/kürzer, Rauch nur jeder 3. Schuss, klein, kurz und durchscheinend
const BLITZ_M = 2.5, BLITZ_S = 0.05, MRAUCH_JEDER = 3, MRAUCH_M = 2.5, MRAUCH_S = 0.3, MRAUCH_DECKKRAFT = 0.3;
const ZWEI_PI = Math.PI * 2;
const umbruch = (w) => w - ZWEI_PI * Math.floor((w + Math.PI) / ZWEI_PI);

/** Billboard-Quad (x, y ∈ −1..1) als InstancedBufferGeometry mit den genannten Instanz-Attributen. */
function quadGeometrie(attribute, max, spur = false) {
  const g = new THREE.InstancedBufferGeometry();
  const p = spur ? [-1, 0, 0, 1, 0, 0, -1, 1, 0, 1, 1, 0] : [-1, -1, 0, 1, -1, 0, -1, 1, 0, 1, 1, 0];
  g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  g.setIndex([0, 1, 2, 2, 1, 3]);
  const puffer = {};
  for (const [name, n] of Object.entries(attribute)) {
    const a = new THREE.InstancedBufferAttribute(new Float32Array(max * n), n);
    a.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute(name, a); puffer[name] = a;
  }
  g.instanceCount = 0;
  return { g, puffer };
}
function effektNetz(scene, geo, mat, name, reihe) {
  const m = new THREE.Mesh(geo, mat);
  m.frustumCulled = false; m.renderOrder = reihe; m.name = name;
  scene.add(m);
  return m;
}

export function erstelleFlakGrafik(scene, camera) {
  const rnd = zufall(4711);
  // ---------- Turmmodelle ----------
  const gruppe = new THREE.Group(); gruppe.name = 'flak-batterie'; scene.add(gruppe);
  const mats = materialien();
  const modelle = LAFETTEN.map((l) => turm(gruppe, mats, l));
  const rueck = new Float32Array(LAFETTEN.length * 2).fill(1); // s seit dem letzten Schuss je Rohr

  // ---------- Effekt-Vorräte ----------
  const spur = quadGeometrie({ aKopf: 3, aSchweif: 3, aHell: 1 }, MAX_SPUR, true);
  const glueh = quadGeometrie({ aPos: 3, aGroesse: 1, aFarbe: 3 }, MAX_GLUEH);
  const rauch = quadGeometrie({ aPos: 3, aRadius: 1, aAlpha: 1, aGlut: 1, aSaat: 1 }, MAX_RAUCH);
  const gluehListe = Object.values(glueh.puffer), rauchListe = Object.values(rauch.puffer);
  const rauchMat = rauchMaterial();
  // Reihenfolge: Rauch (sortiert) → Glühen → Spur (additiv darüber)
  effektNetz(scene, rauch.g, rauchMat, 'flak-rauch', 10);
  effektNetz(scene, glueh.g, gluehMaterial(), 'flak-gluehen', 11);
  effektNetz(scene, spur.g, spurMaterial(), 'flak-spur', 12);

  // Glühen: art 0 = Mündungsblitz, 1 = Detonationskern
  const G = { pos: new Float32Array(MAX_GLUEH * 3), alter: new Float32Array(MAX_GLUEH).fill(99), dauer: new Float32Array(MAX_GLUEH).fill(1),
    groesse: new Float32Array(MAX_GLUEH), kraft: new Float32Array(MAX_GLUEH), art: new Uint8Array(MAX_GLUEH), zeiger: 0 };
  const W = { pos: new Float32Array(MAX_RAUCH * 3), vel: new Float32Array(MAX_RAUCH * 3), alter: new Float32Array(MAX_RAUCH).fill(99),
    dauer: new Float32Array(MAX_RAUCH).fill(1), r0: new Float32Array(MAX_RAUCH), rMax: new Float32Array(MAX_RAUCH),
    saat: new Float32Array(MAX_RAUCH), glut: new Float32Array(MAX_RAUCH), deckkraft: new Float32Array(MAX_RAUCH), zeiger: 0 };
  const mRauchZaehler = new Uint8Array(LAFETTEN.length); // je Turm: nur jeder MRAUCH_JEDER-te Schuss raucht
  const zaehler = { spuren: 0, gluehen: 0, wolken: 0 };

  // WARUM Ring statt Suche: ist der Vorrat voll, wird die älteste Wolke ersetzt (fällt im dichten Schirm nicht auf)
  function neuesGluehen(x, y, z, groesse, dauer, kraft, art) {
    const i = G.zeiger; G.zeiger = (i + 1) % MAX_GLUEH;
    G.pos[i * 3] = x; G.pos[i * 3 + 1] = y; G.pos[i * 3 + 2] = z;
    G.alter[i] = 0; G.dauer[i] = dauer; G.groesse[i] = groesse; G.kraft[i] = kraft; G.art[i] = art;
  }
  function neueWolke(x, y, z, r0, rMax, dauer, vx = 0, vy = 0, vz = 0, glut = 1, deckkraft = WOLKE_DECKKRAFT) {
    const i = W.zeiger; W.zeiger = (i + 1) % MAX_RAUCH;
    W.pos[i * 3] = x; W.pos[i * 3 + 1] = y; W.pos[i * 3 + 2] = z;
    W.vel[i * 3] = vx + (rnd() - 0.5) * 3; W.vel[i * 3 + 1] = vy + (rnd() - 0.5) * 3; W.vel[i * 3 + 2] = vz + (rnd() - 0.5) * 3;
    W.alter[i] = 0; W.dauer[i] = dauer; W.r0[i] = r0; W.saat[i] = rnd(); W.glut[i] = glut; W.deckkraft[i] = deckkraft;
    // WARUM breite Größenstreuung 0,6–1,3: gleich große Wolken verschmelzen zu einer glatten „Wattewurst“
    W.rMax[i] = rMax * (0.6 + rnd() * 0.7);
  }

  /** Nach JEDEM flak.schritt aufrufen: Ereignisse des Schritts in die Effekt-Vorräte übernehmen. */
  function nachSchritt(flak) {
    const e = flak.ereignisse;
    for (const s of e.schuesse) {
      neuesGluehen(s.pos.x + s.richtung.x * 1.2, s.pos.y + s.richtung.y * 1.2, s.pos.z + s.richtung.z * 1.2, BLITZ_M, BLITZ_S, 1, 0);
      // Mündungsrauch: kleiner Puff, treibt etwas mit dem Rohr — WARUM: ohne Leuchtspur soll man trotzdem sehen, dass
      // geschossen wird. WARUM nur jeder 3. Schuss: bei 10 Schuss/s standen sonst ~6 Puffs je Turm übereinander (Wurst).
      if (++mRauchZaehler[s.turmId] >= MRAUCH_JEDER) {
        mRauchZaehler[s.turmId] = 0;
        neueWolke(s.pos.x + s.richtung.x * 2, s.pos.y + s.richtung.y * 2, s.pos.z + s.richtung.z * 2, 0.8, MRAUCH_M, MRAUCH_S,
          s.richtung.x * 6, s.richtung.y * 6, s.richtung.z * 6, 0, MRAUCH_DECKKRAFT); // ohne Innenglut: grauer Hauch
      }
      rueck[s.turmId * 2 + s.rohr] = 0;
    }
    for (const d of e.detonationen) {
      neuesGluehen(d.pos.x, d.pos.y, d.pos.z, d.art === 'nah' ? 13 : 11, 0.3, 1, 1);
      neueWolke(d.pos.x, d.pos.y, d.pos.z, 6, WOLKE_R, 2.8); // Sichtgröße ≈ Splitter-Wirkradius (Runde 7)
    }
  }

  /** Große Detonation (Drohnen-Abschuss): Kern + Nachblitze + mehrere Rauchballen, die auseinandertreiben. */
  function explosion(pos, groesse = 1) {
    const g = groesse;
    neuesGluehen(pos.x, pos.y, pos.z, 34 * g, 0.55, 1.6, 1);
    for (let k = 0; k < 3; k++) neuesGluehen(pos.x + (rnd() - 0.5) * 14 * g, pos.y + (rnd() - 0.5) * 14 * g, pos.z + (rnd() - 0.5) * 14 * g, 14 * g, 0.4 + rnd() * 0.3, 1, 1);
    for (let k = 0; k < 7; k++) {
      const vx = rnd() - 0.5, vy = rnd() - 0.5, vz = rnd() - 0.5, l = Math.hypot(vx, vy, vz) || 1, v = (10 + rnd() * 12) * g;
      neueWolke(pos.x + vx / l * 5 * g, pos.y + vy / l * 5 * g, pos.z + vz / l * 5 * g, 8 * g, 46 * g, 4 + rnd() * 1.5, vx / l * v, vy / l * v, vz / l * v);
    }
  }

  // ---------- pro Bild ----------
  const kamPos = new THREE.Vector3(), kamDir = new THREE.Vector3();
  const tiefe = new Float32Array(MAX_RAUCH), reihe = [];
  const hintenZuerst = (p, q) => tiefe[q] - tiefe[p]; // einmal angelegt (keine Closure pro Bild)

  function aktualisiere(flak, alpha, dt) {
    camera.updateMatrixWorld();
    camera.getWorldPosition(kamPos); camera.getWorldDirection(kamDir);
    const hoehe = (globalThis.innerHeight || 1080);
    uPixel.value = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) / hoehe;
    rauchMat.uniforms.uSonne.value.copy(SONNE_RICHTUNG).transformDirection(camera.matrixWorldInverse);

    // Türme: interpolierte Winkel + Rückstoß
    for (let i = 0; i < modelle.length; i++) {
      const t = flak.tuerme[i], m = modelle[i];
      m.drehkranz.rotation.y = t.vorGier + umbruch(t.gier - t.vorGier) * alpha;
      m.wiege.rotation.x = -(t.vorNick + (t.nick - t.vorNick) * alpha);
      for (let r = 0; r < 2; r++) {
        const k = i * 2 + r, z = (rueck[k] += dt);
        m.rohre[r].position.z = z < 0.03 ? -RUECK * z / 0.03 : -RUECK * Math.max(0, 1 - (z - 0.03) / (RUECK_ZEIT - 0.03)) ** 2;
      }
    }

    // Leuchtspur aus dem Geschoss-Pool (interpoliert)
    const gs = flak.geschosse, K = spur.puffer.aKopf.array, S = spur.puffer.aSchweif.array, H = spur.puffer.aHell.array;
    let n = 0;
    for (let i = 0; i < gs.max && n < MAX_SPUR; i++) {
      if (!gs.aktiv[i] || !gs.leucht[i]) continue; // Spur nur für Leuchtspur-Granaten (Runde 7)
      const j = i * 3;
      const x = gs.vorPos[j] + (gs.pos[j] - gs.vorPos[j]) * alpha, y = gs.vorPos[j + 1] + (gs.pos[j + 1] - gs.vorPos[j + 1]) * alpha,
        z = gs.vorPos[j + 2] + (gs.pos[j + 2] - gs.vorPos[j + 2]) * alpha;
      const vx = gs.vel[j], vy = gs.vel[j + 1], vz = gs.vel[j + 2], v = Math.hypot(vx, vy, vz) || 1;
      const l = Math.min(SPUR_LAENGE, (gs.alter[i] + alpha) * v * SIM_DT) / v;
      K[n * 3] = x; K[n * 3 + 1] = y; K[n * 3 + 2] = z;
      S[n * 3] = x - vx * l; S[n * 3 + 1] = y - vy * l; S[n * 3 + 2] = z - vz * l;
      H[n] = 4; n++;
    }
    spur.g.instanceCount = zaehler.spuren = n;
    spur.puffer.aKopf.needsUpdate = spur.puffer.aSchweif.needsUpdate = spur.puffer.aHell.needsUpdate = true;
   

    // Glühen altern lassen
    const GP = glueh.puffer.aPos.array, GG = glueh.puffer.aGroesse.array, GF = glueh.puffer.aFarbe.array;
    n = 0;
    for (let i = 0; i < MAX_GLUEH; i++) {
      const a = (G.alter[i] += dt), u = a / G.dauer[i];
      if (u >= 1) continue;
      let k, gr;
      if (G.art[i] === 0) { k = 1 - u; gr = G.groesse[i] * (0.7 + 0.3 * u); }
      else {
        // Kern (Lichtsetzer): erste 50 ms bis 30, dann Abfall über ~0,3 s; Orange übertreiben (AgX entsättigt)
        k = a < 0.05 ? 30 / 18 : Math.max(0, 1 - (a - 0.05) / (G.dauer[i] - 0.05)) ** 2;
        gr = G.groesse[i] * (0.35 + 0.65 * Math.sqrt(Math.min(1, a / 0.12)));
      }
      k *= G.kraft[i];
      GP[n * 3] = G.pos[i * 3]; GP[n * 3 + 1] = G.pos[i * 3 + 1]; GP[n * 3 + 2] = G.pos[i * 3 + 2];
      // Nahe der Kamera: Größe auf Bildschirm-Pixel deckeln, Helligkeit dämpfen (sonst füllt Bloom das halbe Bild)
      const ex = G.pos[i * 3] - kamPos.x, ey = G.pos[i * 3 + 1] - kamPos.y, ez = G.pos[i * 3 + 2] - kamPos.z;
      const d = Math.max(1, Math.hypot(ex, ey, ez));
      gr = Math.min(gr, (G.art[i] === 0 ? BLITZ_PX : KERN_PX) * uPixel.value * d);
      const t = Math.min(1, Math.max(0, (d - NAH_MIN) / (NAH_VOLL - NAH_MIN)));
      k *= 0.12 + 0.88 * t * t * (3 - 2 * t);
      GG[n] = gr;
      if (G.art[i] === 0) { GF[n * 3] = 7 * k; GF[n * 3 + 1] = 2.4 * k; GF[n * 3 + 2] = 0.5 * k; } // orangeroter Funke
      else { GF[n * 3] = 18 * k; GF[n * 3 + 1] = 9 * k; GF[n * 3 + 2] = 3.5 * k; }
      n++;
    }
    glueh.g.instanceCount = zaehler.gluehen = n;
    for (const a of gluehListe) a.needsUpdate = true;

    // Rauch altern, treiben, nach Tiefe sortieren (hinten zuerst, vormultipliertes Alpha)
    reihe.length = 0;
    for (let i = 0; i < MAX_RAUCH; i++) {
      const a = (W.alter[i] += dt);
      if (a >= W.dauer[i]) continue;
      const j = i * 3, bremse = Math.exp(-dt * 0.8);
      W.pos[j] += W.vel[j] * dt; W.pos[j + 1] += W.vel[j + 1] * dt; W.pos[j + 2] += W.vel[j + 2] * dt;
      W.vel[j] *= bremse; W.vel[j + 1] *= bremse; W.vel[j + 2] *= bremse;
      tiefe[i] = (W.pos[j] - kamPos.x) * kamDir.x + (W.pos[j + 1] - kamPos.y) * kamDir.y + (W.pos[j + 2] - kamPos.z) * kamDir.z;
      if (tiefe[i] > -40) reihe.push(i); // hinter der Kamera weglassen
    }
    reihe.sort(hintenZuerst);
    const RP = rauch.puffer.aPos.array, RR = rauch.puffer.aRadius.array, RA = rauch.puffer.aAlpha.array,
      RG = rauch.puffer.aGlut.array, RS = rauch.puffer.aSaat.array;
    for (n = 0; n < reihe.length; n++) {
      const i = reihe[n], a = W.alter[i], u = a / W.dauer[i];
      RP[n * 3] = W.pos[i * 3]; RP[n * 3 + 1] = W.pos[i * 3 + 1]; RP[n * 3 + 2] = W.pos[i * 3 + 2];
      // Radius: schnell auf rMax (0,4 s), danach langsam weiter
      RR[n] = W.r0[i] + (W.rMax[i] - W.r0[i]) * (1 - Math.exp(-a / 0.13)) + a * 1.5;
      RA[n] = Math.min(1, a / 0.05) * W.deckkraft[i] * (1 - u) ** 1.4;
      RG[n] = Math.max(0, 1 - a / 0.4) * W.glut[i];
      RS[n] = W.saat[i];
    }
    rauch.g.instanceCount = zaehler.wolken = n;
    for (const a of rauchListe) a.needsUpdate = true;
  }

  return { nachSchritt, aktualisiere, explosion, zaehler, gruppe };
}
