// ZWECK: Darstellung der Flak-Batterie: 6 Turmmodelle (Rohre drehen interpoliert, Rückstoß), Leuchtspur, Mündungsblitz,
//        Detonationskern, Rauchwolken (Fake-Licht), große Explosion bei Drohnen-Abschuss.
// LIEFERT: erstelleFlakGrafik(scene, camera) → { nachSchritt(flak), aktualisiere(flak, alpha, dt, zeit, lage?), explosion(pos, groesse),
//          regler, zaehler: { spuren, gluehen, wolken, belegt, ueberschrieben, fuellVerworfen }, gruppe, maxWolken }
//          GRAFIK_REGLER (Export): Tabelle { name: { min, max, standard, schritt, text } } — die Seite baut daraus das Reglerfeld
//          und schreibt Werte in grafik.regler (R11). Standardwerte = R10-Look (bitgleich: gleiche Grafik-Zufallsfolge).
//          lage (optional, nur lesen) = ki.lage → Füll-Flak in den Sättigungsräumen (lage.schirme).
//          Je Detonation: Kern + Wolke + 4 Zusatz-Explosionen (R9/R10, nur Grafik, verzögert über negatives Alter),
//          Versatz wächst mit der benutzten Streuung der Granate (Ereignisfeld detonation.streu, R10).
// REGEL: liest den Sim-Zustand nur. nachSchritt() nach JEDEM flak.schritt (übernimmt Schüsse/Detonationen in die Vorräte),
//        aktualisiere() einmal pro Bild (Interpolation + Alterung). Vorräte fester Größe, keine neuen Objekte pro Bild.
//        Regler wirken nur auf NEUE Effekte (WARUM: lebende Wolken springen sonst beim Ziehen). Füll-Flak hat einen eigenen
//        Zufall und nimmt nur freie Plätze (nie lebende Wolken ersetzen) — was nicht passt, zählt fuellVerworfen.
//        Zusätzliche Draw-Calls: 3 Effekte + 6 × 5 Turmteile (turm() aus bauteile.js, nur lesend). Keine Lichter.
import * as THREE from 'three';
import { turm, materialien } from '../schiff/bauteile.js';
import { LAFETTEN } from '../../sim/waffen/lafetten.js';
import { SONNE_RICHTUNG } from '../weltraum.js';
import { zufall } from '../zufall.js';
import { uPixel, spurMaterial, gluehMaterial, rauchMaterial } from './shader.js';

// WARUM 384/2048: R10 je Detonation 1 + 4 Zusatz-Explosionen; 60 Det./s × (2,8 s + 4 × 2,0 s) ≈ 650 Wolken. R11 Regler am
//        Anschlag (Leben × 2, 6 Zusatz): 60 × (5,6 + 6 × 4 s) ≈ 1780, gemessen bis 2048 voll → 3072 (Node-Messung R11). Glühen: Füll-Flak glüht
//        nicht, Kerne bleiben kurz.
const MAX_SPUR = 256, MAX_GLUEH = 384, MAX_RAUCH = 3072;
const SPUR_LAENGE = 25;        // m (R8, Nutzer: „kleiner“) — WARUM nicht kürzer: unter ~1 Schrittweg (17 m bei 1000 m/s) wird die Spur zur Perlenkette
// Nahe der Kamera (Runde 7, Bildprüfer: weiße Glut vor der Batterie-Kamera): Glühen unter NAH_VOLL m gedämpft,
// Bildschirmradius gedeckelt (Blitz klein, Kern groß). Kamera steht im Prüfstand-Blick ~30 m vom nächsten Turm.
const NAH_MIN = 15, NAH_VOLL = 80, BLITZ_PX = 18, KERN_PX = 300;
const WOLKE_R = 42, WOLKE_DECKKRAFT = 0.7; // Quad-Radius m (dichter Kern ~28 m), Deckkraft — Runde 7 (Nutzer: „größer“)
const SIM_DT = 1 / 60;
const RUECK = 0.7, RUECK_ZEIT = 0.17; // m, s
// Mündung (R8, Nutzer: „zu rauchig“): Blitz kleiner/kürzer, Rauch nur jeder 3. Schuss, klein, kurz und durchscheinend
const BLITZ_M = 2.5, BLITZ_S = 0.05, MRAUCH_JEDER = 3, MRAUCH_M = 2.5, MRAUCH_S = 0.3, MRAUCH_DECKKRAFT = 0.3;
// Zusatz-Explosionen je Detonation (R9, Nutzer: „3 weitere Explosionseffekte, nur visuell, für mehr Fülle“; R10: 4, weiter,
// länger — „das Areal um ein Ziel viel weiter gestreut mit Flak-Wolken gesättigt“). Nur Grafik-Zufall (rnd), die Sim merkt
// nichts — diese Wolken tragen KEINEN Schaden (Absicht, Entscheidung R10/3). Verzögerung über negatives Alter.
// Versatz: 20 m bis versatzMax = clamp(30 + versatzJeStreu · streu, 30, 60) m. WARUM mitwachsend: im Nahbereich (Kugel
// ≤ 35 m) bleibt die Traube eng wie in R9, im Sättigungsraum (Kugel 140 m) füllt sie bis 51 m, ab 200 m bis 60 m.
// WARUM höchstens 60 m: weiter weg wirkt die Zusatzwolke wie eine eigene Granate ohne Schaden (ehrliche Optik).
const ZUSATZ = { anzahl: 4, versatz: [20, 30, 60], versatzJeStreu: 0.15, verzoegerung: [0.06, 0.12, 0.18, 0.26], verzoegerungStreu: 0.05,
  kern: [4, 6], kernDauer: 0.12, kernKraft: 0.3, glut: 0.25, wolke: [0.5, 0.65], leben: 2.0 };
// Glut (R10-Testrunde, Bildprüfer: „überstrahlter Ballen aus Glutkernen statt Wolkenfeld“): der Rauch trägt das Feld, Glut
// blitzt nur kurz. Zusatz-Kerne 0,3 Kraft / 0,12 s (vorher 0,8 / 0,25), Zusatz-Wolken mit 25 % Innenglut, Hauptkern 0,22 s.
// KERN_BUDGET: Summe der Kraft aller Granaten-Kerne (art 1) im Bild — darüber werden alle gleichmäßig gedämpft (Wert des
// Vorbilds, 1 Bild Verzug). WARUM: viele Detonationen auf einem Fleck addieren sich (additiv) zur weißen Fläche.
// Abschuss-Explosionen (art 2) zählen nicht und werden nie gedämpft — ein Abschuss soll knallen.
const KERN_DAUER = 0.22, KERN_BUDGET = 16;
const HAUPT_LEBEN = 2.8; // s, Hauptwolke einer Detonation
// Regler (R11, Nutzer: „Schieberegler für einen rein visuellen Flak-Screen, der die Leere zwischen den Points of Action
// füllt“ / „für die Länge der Explosionen und die Rauchentwicklung“). Nur Grafik, die Sim merkt nichts.
export const GRAFIK_REGLER = {
  fuellen:        { min: 0,   max: 3, standard: 0,   schritt: 0.1,  text: 'Füll-Flak (× 30 Wolken/s)' },
  lebenFaktor:    { min: 0.5, max: 2, standard: 1,   schritt: 0.05, text: 'Rauch-Lebensdauer (× 2,8 / 2,0 s)' },
  explosionDauer: { min: 0.5, max: 3, standard: 1,   schritt: 0.05, text: 'Explosionsdauer Glut (× 0,22 / 0,12 s)' },
  rauchDeckkraft: { min: 0.2, max: 1, standard: 0.7, schritt: 0.05, text: 'Rauch-Deckkraft' },
  rauchGroesse:   { min: 0.5, max: 2, standard: 1,   schritt: 0.05, text: 'Rauch-Größe (× 42 m)' },
  zusatzAnzahl:   { min: 0,   max: 6, standard: 4,   schritt: 1,    text: 'Zusatz-Explosionen je Detonation' },
  zusatzWeite:    { min: 0.5, max: 3, standard: 1,   schritt: 0.05, text: 'Zusatz-Weite (× 20–60 m)' },
};
// Füll-Flak: FUELL_RATE Wolken/s je Reglereinheit. Quelle A (immer): zwischen zwei Detonationen der letzten FUELL_FENSTER s,
// die höchstens FUELL_PAAR m auseinander liegen. Quelle B (mit lage): gleichverteilt in einem Kasten von lage.schirme
// (Lage-Mitte ± breite/hoehe quer, ± max(tiefeHalb, lagenAbstand/2) längs). WARUM kaum Glut und kein Kern: Füllwolken
// tragen keinen Schaden — ein Blitz sähe nach Treffer aus; die Wolke soll nur das Feld größer wirken lassen.
// FUELL_RESERVE: Füll-Flak setzt nur, solange weniger als MAX_RAUCH − Reserve belegt sind. WARUM: nimmt sie die letzten freien
// Plätze, müssen die echten Detonationswolken danach lebende ersetzen (Messung R11: 2806 überschrieben).
const FUELL_RATE = 30, FUELL_FENSTER = 2, FUELL_PAAR = 400, FUELL_RING = 64, FUELL_GLUT = 0.15, FUELL_RESERVE = 1024;
const klemme = (w, a, b) => (w < a ? a : w > b ? b : w);
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
  const rndF = zufall(9001); // eigener Zufall der Füll-Flak — WARUM: fuellen > 0 darf die Folge der echten Effekte nicht ändern
  const regler = Object.fromEntries(Object.entries(GRAFIK_REGLER).map(([k, v]) => [k, v.standard]));
  /** Reglerwert geklemmt (die Seite schreibt frei hinein). */
  const rw = (k) => { const R = GRAFIK_REGLER[k], w = regler[k]; return Number.isFinite(w) ? klemme(w, R.min, R.max) : R.standard; };
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

  // Glühen: art 0 = Mündungsblitz, 1 = Detonationskern (Granate), 2 = Abschuss-Kern (ohne Budget)
  const G = { pos: new Float32Array(MAX_GLUEH * 3), alter: new Float32Array(MAX_GLUEH).fill(99), dauer: new Float32Array(MAX_GLUEH).fill(1),
    groesse: new Float32Array(MAX_GLUEH), kraft: new Float32Array(MAX_GLUEH), art: new Uint8Array(MAX_GLUEH), zeiger: 0 };
  const W = { pos: new Float32Array(MAX_RAUCH * 3), vel: new Float32Array(MAX_RAUCH * 3), alter: new Float32Array(MAX_RAUCH).fill(99),
    dauer: new Float32Array(MAX_RAUCH).fill(1), r0: new Float32Array(MAX_RAUCH), rMax: new Float32Array(MAX_RAUCH),
    saat: new Float32Array(MAX_RAUCH), glut: new Float32Array(MAX_RAUCH), deckkraft: new Float32Array(MAX_RAUCH), zeiger: 0 };
  const mRauchZaehler = new Uint8Array(LAFETTEN.length); // je Turm: nur jeder MRAUCH_JEDER-te Schuss raucht
  // ueberschrieben: Effekte, die der volle Ring ersetzt hat, obwohl sie noch lebten/warteten (soll 0 bleiben)
  const zaehler = { spuren: 0, gluehen: 0, wolken: 0, ueberschrieben: 0, fuellVerworfen: 0, belegt: 0 }; // belegt: lebende + wartende Wolken (letztes Bild)

  /** Nächster freier Platz ab dem Ring-Zeiger. WARUM Suche (R9): kurze (Mündungsrauch 0,3 s) und lange Effekte
   *  (Abschuss 5 s) mischen sich — ein reiner Ring ersetzte lebende Wolken, obwohl der Vorrat nur halb voll war.
   *  Ist alles belegt, wird der Platz am Zeiger ersetzt und gezählt. */
  function freierPlatz(V, max) {
    for (let n = 0; n < max; n++) {
      const i = (V.zeiger + n) % max;
      if (V.alter[i] >= V.dauer[i]) { V.zeiger = (i + 1) % max; return i; }
    }
    const i = V.zeiger; V.zeiger = (i + 1) % max; zaehler.ueberschrieben++;
    return i;
  }
  function neuesGluehen(x, y, z, groesse, dauer, kraft, art, verzoegerung = 0) {
    const i = freierPlatz(G, MAX_GLUEH);
    G.pos[i * 3] = x; G.pos[i * 3 + 1] = y; G.pos[i * 3 + 2] = z;
    G.alter[i] = -verzoegerung; G.dauer[i] = dauer; G.groesse[i] = groesse; G.kraft[i] = kraft; G.art[i] = art;
  }
  function neueWolke(x, y, z, r0, rMax, dauer, vx = 0, vy = 0, vz = 0, glut = 1, deckkraft = WOLKE_DECKKRAFT, verzoegerung = 0, groesseStreuen = true) {
    setzeWolke(freierPlatz(W, MAX_RAUCH), rnd, x, y, z, r0, rMax, dauer, vx, vy, vz, glut, deckkraft, verzoegerung, groesseStreuen);
  }
  function setzeWolke(i, rnd, x, y, z, r0, rMax, dauer, vx, vy, vz, glut, deckkraft, verzoegerung, groesseStreuen) {
    W.pos[i * 3] = x; W.pos[i * 3 + 1] = y; W.pos[i * 3 + 2] = z;
    W.vel[i * 3] = vx + (rnd() - 0.5) * 3; W.vel[i * 3 + 1] = vy + (rnd() - 0.5) * 3; W.vel[i * 3 + 2] = vz + (rnd() - 0.5) * 3;
    W.alter[i] = -verzoegerung; W.dauer[i] = dauer; W.r0[i] = r0; W.saat[i] = rnd(); W.glut[i] = glut; W.deckkraft[i] = deckkraft;
    // WARUM breite Größenstreuung 0,6–1,3: gleich große Wolken verschmelzen zu einer glatten „Wattewurst“
    W.rMax[i] = groesseStreuen ? rMax * (0.6 + rnd() * 0.7) : rMax;
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
    if (!e.detonationen.length) return;
    const leben = rw('lebenFaktor'), dauer = rw('explosionDauer'), deck = rw('rauchDeckkraft'), gr = rw('rauchGroesse');
    for (const d of e.detonationen) {
      neuesGluehen(d.pos.x, d.pos.y, d.pos.z, d.art === 'nah' ? 13 : 11, KERN_DAUER * dauer, 1, 1);
      // Sichtgröße ≈ Splitter-Wirkradius (Runde 7) beim Standard-Regler
      neueWolke(d.pos.x, d.pos.y, d.pos.z, 6, WOLKE_R * gr, HAUPT_LEBEN * leben, 0, 0, 0, 1, deck);
      zusatzExplosionen(d.pos, d.streu || 0, leben, dauer, deck, gr);
      // Detonations-Ring für die Füll-Flak (Quelle A)
      const j = detRing.zeiger; detRing.zeiger = (j + 1) % FUELL_RING;
      detRing.pos[j * 3] = d.pos.x; detRing.pos[j * 3 + 1] = d.pos.y; detRing.pos[j * 3 + 2] = d.pos.z; detRing.zeit[j] = uhr;
    }
  }

  /** Kleinere, leicht verzögerte Explosionen um den Zündpunkt (nur Grafik, R9/R10); streu = benutzte Streuung (m).
   *  Anzahl/Weite/Leben/Dauer/Deckkraft/Größe aus den Reglern (R11); Standard = R10 (gleich viele rnd-Aufrufe). */
  function zusatzExplosionen(p, streu, leben, dauer, deck, gr) {
    const Z = ZUSATZ, weite = rw('zusatzWeite'), anzahl = Math.round(rw('zusatzAnzahl'));
    const vMax = Math.min(Z.versatz[2], Math.max(Z.versatz[1], Z.versatz[1] + Z.versatzJeStreu * streu));
    for (let k = 0; k < anzahl; k++) {
      // Richtung gleichverteilt auf der Kugel, Abstand 20 m … vMax
      const cz = 2 * rnd() - 1, phi = ZWEI_PI * rnd(), sz = Math.sqrt(1 - cz * cz);
      const r = (Z.versatz[0] + rnd() * (vMax - Z.versatz[0])) * weite;
      const x = p.x + r * sz * Math.cos(phi), y = p.y + r * sz * Math.sin(phi), z = p.z + r * cz;
      // ab der 5. Explosion eine Runde später (0,04 s je Runde) — WARUM: sonst blitzen je zwei gleichzeitig
      const nv = Z.verzoegerung.length, warte = Z.verzoegerung[k % nv] + 0.04 * Math.floor(k / nv) + rnd() * Z.verzoegerungStreu;
      neuesGluehen(x, y, z, Z.kern[0] + rnd() * (Z.kern[1] - Z.kern[0]), Z.kernDauer * dauer, Z.kernKraft, 1, warte);
      neueWolke(x, y, z, 3, WOLKE_R * gr * (Z.wolke[0] + rnd() * (Z.wolke[1] - Z.wolke[0])), Z.leben * leben, 0, 0, 0, Z.glut, deck, warte, false);
    }
  }

  /** Große Detonation (Drohnen-Abschuss): Kern + Nachblitze + mehrere Rauchballen, die auseinandertreiben. */
  function explosion(pos, groesse = 1) {
    const g = groesse;
    neuesGluehen(pos.x, pos.y, pos.z, 34 * g, 0.55, 1.6, 2);
    for (let k = 0; k < 3; k++) neuesGluehen(pos.x + (rnd() - 0.5) * 14 * g, pos.y + (rnd() - 0.5) * 14 * g, pos.z + (rnd() - 0.5) * 14 * g, 14 * g, 0.4 + rnd() * 0.3, 1, 2);
    for (let k = 0; k < 7; k++) {
      const vx = rnd() - 0.5, vy = rnd() - 0.5, vz = rnd() - 0.5, l = Math.hypot(vx, vy, vz) || 1, v = (10 + rnd() * 12) * g;
      neueWolke(pos.x + vx / l * 5 * g, pos.y + vy / l * 5 * g, pos.z + vz / l * 5 * g, 8 * g, 46 * g, 4 + rnd() * 1.5, vx / l * v, vy / l * v, vz / l * v);
    }
  }

  // ---------- Füll-Flak (R11) ----------
  const detRing = { pos: new Float32Array(FUELL_RING * 3), zeit: new Float32Array(FUELL_RING).fill(-1e9), zeiger: 0 };
  let uhr = 0, fuellRest = 0;
  const qa = new THREE.Vector3(), qb = new THREE.Vector3(), qe = new THREE.Vector3(), qr = new THREE.Vector3(), qo = new THREE.Vector3();
  const OBEN = new THREE.Vector3(0, 1, 0), fuellPunkt = new THREE.Vector3();
  /** Freier Platz ohne Ersetzen (−1 = voll). */
  function freierPlatzFuell() {
    for (let n = 0; n < MAX_RAUCH; n++) {
      const i = (W.zeiger + n) % MAX_RAUCH;
      if (W.alter[i] >= W.dauer[i]) { W.zeiger = (i + 1) % MAX_RAUCH; return i; }
    }
    return -1;
  }
  /** Quelle A: Punkt zwischen zwei jungen Detonationen (≤ FUELL_PAAR m). false = kein Paar gefunden. */
  function punktZwischen(aus) {
    for (let versuch = 0; versuch < 4; versuch++) {
      const i = (rndF() * FUELL_RING) | 0, j = (rndF() * FUELL_RING) | 0;
      if (i === j || uhr - detRing.zeit[i] > FUELL_FENSTER || uhr - detRing.zeit[j] > FUELL_FENSTER) continue;
      qa.fromArray(detRing.pos, i * 3); qb.fromArray(detRing.pos, j * 3);
      const d = qa.distanceTo(qb);
      if (d < 1 || d > FUELL_PAAR) continue;
      aus.lerpVectors(qa, qb, 0.25 + 0.5 * rndF());
      const cz = 2 * rndF() - 1, phi = ZWEI_PI * rndF(), sz = Math.sqrt(1 - cz * cz), r = 0.15 * d * Math.cbrt(rndF());
      aus.x += r * sz * Math.cos(phi); aus.y += r * sz * Math.sin(phi); aus.z += r * cz;
      return true;
    }
    return false;
  }
  /** Quelle B: gleichverteilt im Kasten einer Lage eines Sättigungsraums (lage.schirme, nur lesen). */
  function punktImRaum(lage, aus) {
    const S = lage.schirme, s = S[(rndF() * S.length) | 0];
    if (!s || !s.mitte) return false;
    const L = s.lagen && s.lagen.length ? s.lagen[(rndF() * s.lagen.length) | 0] : s.mitte;
    qe.set(s.laengs?.x ?? 0, s.laengs?.y ?? 0, s.laengs?.z ?? 1);
    if (qe.lengthSq() < 1e-9) qe.set(0, 0, 1);
    qe.normalize();
    qr.crossVectors(qe, OBEN); if (qr.lengthSq() < 1e-6) qr.set(1, 0, 0); qr.normalize();
    qo.crossVectors(qr, qe);
    const b = s.breite ?? 150, h = s.hoehe ?? 80, t = Math.max(s.tiefeHalb ?? 0, (s.lagenAbstand ?? 100) / 2);
    const u = 2 * rndF() - 1, v = 2 * rndF() - 1, w = 2 * rndF() - 1;
    aus.set(L.x, L.y, L.z).addScaledVector(qr, u * b).addScaledVector(qo, v * h).addScaledVector(qe, w * t);
    return true;
  }
  function fuellFlak(dt, lage) {
    const rate = FUELL_RATE * rw('fuellen');
    if (rate <= 0 || !(dt > 0)) { fuellRest = 0; return; }
    fuellRest = Math.min(fuellRest + rate * dt, 10); // WARUM Deckel: ein Ruckler (dt groß) soll keinen Schwall erzeugen
    const leben = rw('lebenFaktor'), deck = rw('rauchDeckkraft'), gr = rw('rauchGroesse');
    const mitRaum = !!(lage && lage.schirme && lage.schirme.length);
    while (fuellRest >= 1) {
      fuellRest -= 1;
      // halb A, halb B (mit Räumen); ohne Räume (Nahbereich/keine lage) nur A
      const ok = (mitRaum && rndF() < 0.5) ? punktImRaum(lage, fuellPunkt) : punktZwischen(fuellPunkt);
      if (!ok) continue;
      const i = zaehler.belegt < MAX_RAUCH - FUELL_RESERVE ? freierPlatzFuell() : -1;
      if (i < 0) { zaehler.fuellVerworfen++; continue; }
      zaehler.belegt++;
      setzeWolke(i, rndF, fuellPunkt.x, fuellPunkt.y, fuellPunkt.z, 4, WOLKE_R * gr * (0.5 + 0.4 * rndF()),
        ZUSATZ.leben * leben * (0.8 + 0.4 * rndF()), 0, 0, 0, FUELL_GLUT, deck, 0, false);
    }
  }

  // ---------- pro Bild ----------
  const kamPos = new THREE.Vector3(), kamDir = new THREE.Vector3();
  const tiefe = new Float32Array(MAX_RAUCH), reihe = [];
  let kernKraftVorher = 0; // Summe Kraft der Granaten-Kerne im letzten Bild (KERN_BUDGET)
  const hintenZuerst = (p, q) => tiefe[q] - tiefe[p]; // einmal angelegt (keine Closure pro Bild)

  function aktualisiere(flak, alpha, dt, zeit, lage) {
    uhr += dt;
    fuellFlak(dt, lage);
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
    const budget = kernKraftVorher > KERN_BUDGET ? KERN_BUDGET / kernKraftVorher : 1;
    kernKraftVorher = 0;
    for (let i = 0; i < MAX_GLUEH; i++) {
      const a = (G.alter[i] += dt), u = a / G.dauer[i];
      if (a < 0 || u >= 1) continue; // a < 0: Zusatz-Explosion wartet noch
      let k, gr;
      if (G.art[i] === 0) { k = 1 - u; gr = G.groesse[i] * (0.7 + 0.3 * u); }
      else {
        // Kern (Lichtsetzer): erste 50 ms bis 30, dann Abfall über ~0,3 s; Orange übertreiben (AgX entsättigt)
        k = a < 0.05 ? 30 / 18 : Math.max(0, 1 - (a - 0.05) / (G.dauer[i] - 0.05)) ** 2;
        gr = G.groesse[i] * (0.35 + 0.65 * Math.sqrt(Math.min(1, a / 0.12)));
      }
      k *= G.kraft[i];
      if (G.art[i] === 1) { kernKraftVorher += G.kraft[i]; k *= budget; }
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
    let belegt = 0;
    for (let i = 0; i < MAX_RAUCH; i++) {
      const a = (W.alter[i] += dt);
      if (a < W.dauer[i]) belegt++;
      if (a < 0 || a >= W.dauer[i]) continue; // a < 0: Zusatz-Explosion wartet noch
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
    rauch.g.instanceCount = zaehler.wolken = n; zaehler.belegt = belegt;
    for (const a of rauchListe) a.needsUpdate = true;
  }

  return { nachSchritt, aktualisiere, explosion, regler, zaehler, gruppe, maxWolken: MAX_RAUCH };
}
