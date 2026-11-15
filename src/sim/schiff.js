// ZWECK: Flugmodell des Spielerschiffs (reine Simulation, fester Schritt).
// LIEFERT: erstelleSchiffSim(werte?) → { z (Zustand), werte, schritt(dt, befehl), zuruecksetzen(), setzeWerte(w),
//          lage(alpha, pos, rot) } · lokaleGeschwindigkeit(z, ziel?)
//   befehl = { hebel: -1..1 (Schubhebel bewegen), stopp, gieren, nicken, rollen: -1..1, quer, hoch: -1..1,
//              nachbrenner: bool, daempferUmschalten: bool }
//   z = { pos, vel (Welt, m/s), rot (Quaternion), dreh (lokal, rad/s: x=nicken, y=gieren, z=rollen),
//         hebel, daempfer, nachbrenner (0..1 geglättet), schub (lokal, −1..1 je Achse, für Düsen-Effekte),
//         drehSchub (lokal, −1..1, für Steuerdüsen), hp (0..werte.hpMax), zerstoert (bool) }
// REGEL: Kein DOM, kein Renderer, kein Math.random → läuft in Node-Tests und später auf einem Server (Koop).
//        Der Befehl ist das, was später die Steuer-Station über das Netz schickt.
//        Wer z.hp senkt (Kollision, später Waffen), darf z.zerstoert setzen; schritt() setzt es spätestens bei hp ≤ 0.
// WRACK: zerstoert → Befehle wirkungslos, kein Antrieb, Schiff treibt und taumelt weiter; zuruecksetzen() füllt auf.
// VORZEICHEN: dreh.y > 0 = Nase nach links (Richtung +X), dreh.x > 0 = Nase runter, dreh.z > 0 = Rolle nach rechts.
import { Vector3, Quaternion } from 'three';
import { SCHIFF } from './werte.js';

const klemme = (x, a, b) => (x < a ? a : x > b ? b : x);
const LEER = {};

export function erstelleSchiffSim(werte = SCHIFF) {
  let W = werte;
  const z = {
    pos: new Vector3(), vel: new Vector3(), rot: new Quaternion(), dreh: new Vector3(),
    hebel: 0, daempfer: true, nachbrenner: 0,
    schub: new Vector3(), drehSchub: new Vector3(),
    hp: W.hpMax, zerstoert: false,
    vorherPos: new Vector3(), vorherRot: new Quaternion(),
  };
  // Vorlagen (keine neuen Objekte pro Schritt)
  const vl = new Vector3(), a = new Vector3(), dq = new Quaternion(), achse = new Vector3(), inv = new Quaternion();

  function zuruecksetzen() {
    z.pos.set(0, 0, 0); z.vel.set(0, 0, 0); z.rot.identity(); z.dreh.set(0, 0, 0);
    z.hebel = 0; z.daempfer = true; z.nachbrenner = 0; z.schub.set(0, 0, 0); z.drehSchub.set(0, 0, 0);
    z.hp = W.hpMax; z.zerstoert = false;
    z.vorherPos.copy(z.pos); z.vorherRot.copy(z.rot);
  }

  /** Anderes Schiff (V): Lage und Fahrt bleiben, der HP-Anteil bleibt erhalten. */
  function setzeWerte(w) {
    const anteil = W.hpMax > 0 ? z.hp / W.hpMax : 1;
    W = w;
    z.hp = anteil * W.hpMax;
  }

  /** Eine Achse des Dämpfers: Wunschgeschwindigkeit ansteuern, Beschleunigung begrenzt (−aMinus..+aPlus). */
  const regle = (soll, ist, aPlus, aMinus) => klemme((soll - ist) * W.regler, -aMinus, aPlus);
  /** Seiten-/Hochachse: Versetzen mit aQuer, Drift abbauen (zurück Richtung Soll) mit aDaempfer. */
  const regleQuer = (soll, ist) => {
    const versetzen = soll !== 0 && (soll - ist) * soll > 0; // Spieler will weiter nach außen
    const g = versetzen ? W.aQuer : W.aDaempfer;
    return regle(soll, ist, g, g);
  };

  function schritt(dt, befehl = LEER) {
    z.vorherPos.copy(z.pos); z.vorherRot.copy(z.rot);
    if (z.hp <= 0) { z.hp = 0; z.zerstoert = true; }
    const b = z.zerstoert ? LEER : befehl;
    if (b.daempferUmschalten) z.daempfer = !z.daempfer;
    if (b.stopp || z.zerstoert) z.hebel = 0;
    z.hebel = klemme(z.hebel + (b.hebel || 0) * W.hebelRate * dt, W.hebelMin, 1);
    // Nachbrenner nur bei Vorwärtsfahrt; weich ein/aus, damit Schub und Flamme nicht springen
    const nbSoll = b.nachbrenner && z.hebel > 0.05 ? 1 : 0;
    z.nachbrenner += klemme(nbSoll - z.nachbrenner, -dt * 1.5, dt * 1.5);
    const nb = 1 + (W.nachbrenner - 1) * z.nachbrenner;

    // ---------- Fahrt ----------
    const aVor = W.aVor * nb;
    if (z.zerstoert) {
      a.set(0, 0, 0); // Wrack: kein Antrieb, auch kein Dämpfer
    } else {
      inv.copy(z.rot).invert();
      vl.copy(z.vel).applyQuaternion(inv); // Geschwindigkeit im Schiffs-Rahmen
      const quer = klemme(b.quer || 0, -1, 1), hoch = klemme(b.hoch || 0, -1, 1);
      if (z.daempfer) {
        const sollZ = z.hebel >= 0 ? z.hebel * W.vMax * nb : (z.hebel / -W.hebelMin) * W.vRueck;
        a.set(regleQuer(quer * W.vQuer, vl.x), regleQuer(hoch * W.vQuer, vl.y), regle(sollZ, vl.z, aVor, W.aRueck));
      } else {
        // Ohne Dämpfer: Hebel = Schubkraft, nichts bremst von selbst (Treiben im All); Tempolimit unten
        a.set(quer * W.aQuer, hoch * W.aQuer, z.hebel >= 0 ? z.hebel * aVor : (z.hebel / -W.hebelMin) * W.aRueck);
      }
    }
    // Düsen-Anzeige je Achse auf −1..1 (Seite: auf aQuer bezogen — Drift-Abbau zeigt volle Düsen)
    z.schub.set(klemme(a.x / W.aQuer, -1, 1), klemme(a.y / W.aQuer, -1, 1), a.z >= 0 ? klemme(a.z / aVor, 0, 1) : klemme(a.z / W.aRueck, -1, 0));
    a.applyQuaternion(z.rot);
    z.vel.addScaledVector(a, dt);
    if (!z.daempfer) {
      // WARUM auch ohne Dämpfer ein Limit (Nutzer R4): sonst beschleunigt das Schiff endlos und braucht Minuten zum Bremsen.
      const vGrenze = W.vMax * W.nachbrenner, v2 = z.vel.lengthSq();
      if (v2 > vGrenze * vGrenze) z.vel.multiplyScalar(vGrenze / Math.sqrt(v2));
    }
    z.pos.addScaledVector(z.vel, dt);

    // ---------- Drehung (gedämpft; Wrack taumelt ungebremst weiter) ----------
    if (z.zerstoert) {
      z.drehSchub.set(0, 0, 0);
    } else {
      const M = W.drehMax, B = W.drehBeschl, k = W.drehRegler;
      const sollX = -klemme(b.nicken || 0, -1, 1) * M.nicken; // nicken +1 = Nase hoch → dreh.x negativ
      const sollY = klemme(b.gieren || 0, -1, 1) * M.gieren;
      const sollZ = klemme(b.rollen || 0, -1, 1) * M.rollen;
      const ax = klemme((sollX - z.dreh.x) * k, -B.nicken, B.nicken);
      const ay = klemme((sollY - z.dreh.y) * k, -B.gieren, B.gieren);
      const az = klemme((sollZ - z.dreh.z) * k, -B.rollen, B.rollen);
      z.drehSchub.set(ax / B.nicken, ay / B.gieren, az / B.rollen);
      z.dreh.x += ax * dt; z.dreh.y += ay * dt; z.dreh.z += az * dt;
    }
    const w = z.dreh.length();
    if (w > 1e-9) {
      achse.copy(z.dreh).divideScalar(w);
      dq.setFromAxisAngle(achse, w * dt);
      z.rot.multiply(dq).normalize(); // lokal drehen: rot = rot · dq
    }
  }

  /** Interpolierte Lage für die Darstellung (alpha 0..1 zwischen letztem und aktuellem Schritt). */
  function lage(alpha, pos, rot) {
    pos.lerpVectors(z.vorherPos, z.pos, alpha);
    rot.slerpQuaternions(z.vorherRot, z.rot, alpha);
  }

  zuruecksetzen();
  return { z, get werte() { return W; }, schritt, zuruecksetzen, setzeWerte, lage };
}

const invLokal = new Quaternion();
/** Geschwindigkeit im Schiffs-Rahmen (für Anzeige und Tests). WARUM Vorlage: wird jedes Bild aufgerufen. */
export function lokaleGeschwindigkeit(z, ziel = new Vector3()) {
  return ziel.copy(z.vel).applyQuaternion(invLokal.copy(z.rot).invert());
}
