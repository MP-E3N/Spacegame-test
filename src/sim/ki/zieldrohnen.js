// ZWECK: Zieldrohnen des Flak-Labors — ~10 Drohnen fliegen gut sichtbar vor der Batterie (+Z-Halbraum, über y 80 m):
//        Angriffsläufe durch den Flak-Schirm, Kreisen, Schlangenlinien; Ausweichhaken bei Treffer/naher Detonation;
//        zerstört → nach 4 s neue Drohne mit NEUER id am Rand. R7: Vorstöße (Kreiser/Schlangen tauchen bis 250 ± 50 m
//        in die Killzone und ziehen sich auf 1600–1900 m zurück, ~3/min, höchstens 2 gleichzeitig); Kreiser und
//        Schlangen „atmen“ zwischen 900 und 1500 m (Periode 60 s).
// LIEFERT: erstelleZieldrohnen({ startwert }) → { ziele, schritt(dt, ereignisse) → { abschuesse[{ id, pos }] },
//          zuruecksetzen(), statistik } · DROHNEN (Flugwerte)
//          ziele[i] = { id, pos, vel, vorPos, r, hp, hpMax, aktiv, bahn, angriff, vorstoss } (Welt, m, m/s), feste Slots.
//          abschuesse: feste Vorrats-Objekte (je Slot eins), nur bis zum nächsten schritt() gültig.
// REGEL: Simulation — kein DOM, kein Math.random (eigener Zufall mit Startwert), fester Schritt. Ereignisse aus Schritt n
//        (Waffen) wirken am Anfang von Schritt n+1 (Schrittfolge Drohnen → Turm-KI → Waffen, Protokoll R6).
//        `vel` ist die echte Schrittgeschwindigkeit (pos − vorPos = vel·dt) — WARUM: die Turm-KI rechnet daraus den Vorhalt.
import { zufall } from '../zufall.js';
import { BATTERIE_MITTE as M } from '../waffen/lafetten.js';

export const DROHNEN = {
  anzahl: 10, r: 6, hpMax: 100,
  tempoMin: 80, tempoMax: 180,
  // WARUM 60 statt 40 m/s² (Frühwarnung): Wendekreis bei 170 m/s = 480 m statt 720 m — sonst schneidet der
  // Abdrehbogen des Angriffslaufs das Abstandsband (300 m) zur Batterie.
  beschl: 60,
  band: [200, 2000], bandWeich: [380, 1850],   // Abstand zu BATTERIE_MITTE: hart geklammert / weiche Rückstellkraft
  hoeheMin: 80, hoeheWeich: 150,               // Welt-y
  zWeich: 150,                                  // unter z = 150 m zieht es zurück in den +Z-Halbraum
  // WARUM 120 m: bei 180 m/s bleiben bei 60 m nur 0,3 s zum Ausweichen → Messung R6 ergab 8 m Engstabstand
  trenn: 120,                                   // Mindestabstand untereinander (weich)
  ausweichNah: 80, ausweichDauer: 2, ausweichPause: 3,
  neustart: 4,
  abdrehen: 650,      // Angriffslauf dreht ab, wenn näher als 650 m (Schirm 800 m ist dann durchflogen)
  ausholen: 1500,     // danach bis 1500 m Abstand weg, dann neuer Anlauf
  // Vorstoß (R7): Bahn tangential an einen Punkt im Abstand 205–300 m (engster Punkt ≈ dieser Abstand), y 120–160 m
  vorstoss: {
    abstand: [205, 300], hoehe: [120, 160], tempo: 150, rueckzug: [1600, 1900], ende: 1500,
    // WARUM globaler Takt 16–24 s statt nur „je Drohne alle 25–45 s“: mit 6 Teilnehmern wären das ~7/min;
    // gewünscht sind ~3/min. Die 25–45 s gelten als Pause je Drohne zwischen zwei eigenen Vorstößen.
    takt: [16, 24], pause: [25, 45], gleichzeitig: 2,
    // WARUM gepanzert: mit vollem Schaden starben im 5-min-Labor 15 von 15 Vorstößen bei ~360 m → der Nutzer sah nie
    // den Rückzug (Killzone aus, Leuchtspur aus). Schadensfaktor, solange vorstoss gilt (Hin- und Rückflug). Echte Flak,
    // 5 min: 0,3 → 0 von 14 überlebt; Rohschaden je Vorstoß 1200–3600 (Median 2100); 0,05 → 79 %; 0,065 → 7 von 14 (50 %).
    // R8 (Flächenschaden, Zielgranate 1,2 HP): Rohschaden je Vorstoß ohne Tod 300–500 (Sperr) bzw. 350–560 (Ziel);
    // eng verteilt → das Überleben kippt steil. 5 min bei 620/1000/1100: 0,22 → Sperr 100/86/93 %, Ziel 93/50/50 %;
    // 0,25 → Sperr 92/57/60 %, Ziel 43/21/7 %; 0,27 → Sperr 67/53/64 %, Ziel 27/14/7 %. Gewählt 0,25 (Standard 1000 m/s
    // trifft beide Ziele: Sperr 30–60 %, Ziel ≥ 20 %).
    // R9 (1100 m/s, neue Granaten-Zahlen): 0,28 → Sperr 5/14, Ziel 5/14 überleben (36 %); 620: 6/14 bzw. 9/14.
    // Das Überleben kippt steil (Rohschaden je Vorstoß eng verteilt) — einzelne Läufe streuen um ±1–3 Vorstöße.
    panzer: 0.28,
    weichMin: 230, hoeheWeich: 110,   // im Vorstoß: weiche Grenzen tiefer, harte Klammer bleibt 200 m / 80 m
  },
  atmen: { mitte: 1200, hub: 300, periode: 60 }, // Kreis-/Schlangen-Mitte pendelt 900 ↔ 1500 m
};
// 4 Angriffsläufer, 3 Kreiser, 3 Schlangen — feste Slots, damit die Mischung nach Neustarts gleich bleibt.
const GRUNDBAHN = ['angriff', 'kreisen', 'schlange', 'angriff', 'kreisen', 'schlange', 'angriff', 'kreisen', 'schlange', 'angriff'];

const laenge = (x, y, z) => Math.sqrt(x * x + y * y + z * z);

export function erstelleZieldrohnen({ startwert = 101 } = {}) {
  const D = DROHNEN;
  let rnd, naechsteId, zeit;
  const ziele = [], intern = [];
  const abschuesse = [];
  const ergebnis = { abschuesse };
  const statistik = { klammer: 0, ausweichen: 0, neustarts: 0, vorstoesse: 0 };
  const wunsch = { x: 0, y: 0, z: 0 }; // Arbeitsvektor (keine Objekte im Schritt)

  for (let i = 0; i < D.anzahl; i++) {
    ziele.push({ id: 0, pos: { x: 0, y: 0, z: 0 }, vel: { x: 0, y: 0, z: 0 }, vorPos: { x: 0, y: 0, z: 0 },
      r: D.r, hp: D.hpMax, hpMax: D.hpMax, aktiv: false, bahn: GRUNDBAHN[i], angriff: false, vorstoss: false });
    intern.push({ grund: GRUNDBAHN[i], tempo: 0, phase: 'anflug', seite: 1, tot: 0, weich: 0, weichPause: 0,
      wx: 0, wy: 0, wz: 0, warte: 0, c: { x: 0, y: 0, z: 0 }, R: 0, dreh: 1, zc: 0, yc: 0, ph: 0, punkt: { x: 0, y: 0, z: 0 },
      gc: 0, vs: 0, vsPause: 0, vp: { x: 0, y: 0, z: 0 }, rp: { x: 0, y: 0, z: 0 } });
  }
  // WARUM Vorrat: keine neuen Objekte im Schritt (Befund Prüfer R6); höchstens ein Abschuss je Slot und Schritt
  const abschussVorrat = Array.from({ length: D.anzahl }, () => ({ id: 0, pos: { x: 0, y: 0, z: 0 } }));
  let vsTakt = 0;

  /** Startpunkt eines Angriffslaufs: im Sektor vor der Batterie, ~1650 m. */
  function anlaufPunkt(s) {
    const g = (rnd() * 2 - 1) * 0.45, dh = 1550 + rnd() * 150;
    s.punkt.x = M.x + Math.sin(g) * dh; s.punkt.y = 350 + rnd() * 300; s.punkt.z = M.z + Math.cos(g) * dh;
    s.seite = rnd() < 0.5 ? -1 : 1;
    // WARUM Wartezeit: sonst laufen alle Angreifer im Gleichtakt an (Pulk, Zusammenstöße, alle gleichzeitig weg)
    s.warte = 1 + rnd() * 6;
  }

  function erscheine(i) {
    const z = ziele[i], s = intern[i];
    z.id = naechsteId++;
    const g = (rnd() * 2 - 1) * 0.6, dh = 1700 + rnd() * 120, y = 200 + rnd() * 400;
    z.pos.x = M.x + Math.sin(g) * dh; z.pos.y = y; z.pos.z = M.z + Math.cos(g) * dh;
    z.vorPos.x = z.pos.x; z.vorPos.y = z.pos.y; z.vorPos.z = z.pos.z;
    z.hp = z.hpMax; z.aktiv = true; s.tot = 0; s.weich = 0; s.weichPause = 0;
    s.ph = rnd() * Math.PI * 2;
    s.vs = 0; z.vorstoss = false; s.vsPause = D.vorstoss.pause[0] * rnd(); // erste Vorstöße bald möglich
    if (s.grund === 'kreisen') {
      // Mitte in Polarform (Gier gc, Abstand atmet) → c wird je Schritt aus der Zeit gerechnet
      s.gc = (rnd() * 2 - 1) * 0.4; s.c.y = 250 + rnd() * 350;
      s.R = 200 + rnd() * 150; s.dreh = rnd() < 0.5 ? -1 : 1; s.tempo = 100 + rnd() * 40;
    } else if (s.grund === 'schlange') {
      s.yc = 200 + rnd() * 350; s.dreh = rnd() < 0.5 ? -1 : 1; s.tempo = 120 + rnd() * 40;
    } else {
      s.tempo = 165 + rnd() * 15; s.phase = 'sammeln'; anlaufPunkt(s); s.warte *= 0.5; // erster Lauf früher
    }
    // Startgeschwindigkeit: grob zur Batterie hin, damit der erste Schritt nicht ruckt
    const dx = M.x - z.pos.x, dz = M.z - z.pos.z, l = Math.hypot(dx, dz) || 1;
    z.vel.x = dx / l * s.tempo; z.vel.y = 0; z.vel.z = dz / l * s.tempo;
    z.bahn = s.grund; z.angriff = false;
  }

  function ausweichen(i) {
    const z = ziele[i], s = intern[i];
    // WARUM nicht im ganzen Vorstoß: im Hinflug kam sie sonst nie näher als ~350 m, im Rückzug hakte sie in der Killzone
    // immer wieder (Messung R7: Nahbereich 43 % der Zeit statt ~15 %)
    // (Messung R7) — der Vorstoß ist ein entschlossener Durchbruch, damit die Killzone wirklich getestet wird.
    if (s.weichPause > 0 || !z.aktiv || s.vs !== 0) return;
    // Haken: Flugrichtung um 60–90° um die Hochachse drehen, leicht steigen/sinken
    const w = (Math.PI / 3 + rnd() * Math.PI / 6) * (rnd() < 0.5 ? -1 : 1);
    const c = Math.cos(w), sn = Math.sin(w);
    const l = Math.hypot(z.vel.x, z.vel.z) || 1, vx = z.vel.x / l, vz = z.vel.z / l;
    s.wx = vx * c + vz * sn; s.wz = -vx * sn + vz * c; s.wy = (rnd() * 2 - 1) * 0.3;
    s.weich = D.ausweichDauer; s.weichPause = D.ausweichPause;
    statistik.ausweichen++;
  }

  function zuruecksetzen() {
    rnd = zufall(startwert); naechsteId = 1; zeit = 0;
    statistik.klammer = 0; statistik.ausweichen = 0; statistik.neustarts = 0; statistik.vorstoesse = 0;
    vsTakt = 8 + rnd() * 8; // erster Vorstoß nach 8–16 s
    abschuesse.length = 0;
    for (let i = 0; i < D.anzahl; i++) erscheine(i);
  }

  /** Vorstoß beginnen: Punkt vp so, dass die Bahn von der Drohne aus TANGENTIAL daran vorbeiführt (Winkel ~70°
   *  zwischen Drohne und vp, von der Batterie aus) → engster Abstand ≈ |vp − M|, danach weg statt hindurch. */
  function starteVorstoss(i) {
    const z = ziele[i], s = intern[i], V = D.vorstoss;
    const g = Math.atan2(z.pos.x - M.x, z.pos.z - M.z);
    const seite = Math.abs(g) > 0.15 ? -Math.sign(g) : (rnd() < 0.5 ? -1 : 1); // zur Mitte hin → bleibt im +Z-Halbraum
    const gp = Math.max(-1.0, Math.min(1.0, g + seite * 1.22));
    const ds = V.abstand[0] + rnd() * (V.abstand[1] - V.abstand[0]), y = V.hoehe[0] + rnd() * (V.hoehe[1] - V.hoehe[0]);
    const h = Math.sqrt(Math.max(ds * ds - (y - M.y) * (y - M.y), 0));
    s.vp.x = M.x + Math.sin(gp) * h; s.vp.y = y; s.vp.z = M.z + Math.cos(gp) * h;
    const gr = Math.max(-0.9, Math.min(0.9, gp + seite * 0.4)), dr = V.rueckzug[0] + rnd() * (V.rueckzug[1] - V.rueckzug[0]);
    s.rp.x = M.x + Math.sin(gr) * dr; s.rp.y = 300 + rnd() * 300; s.rp.z = M.z + Math.cos(gr) * dr;
    // WARUM volle HP zu Beginn: Kreiser/Schlangen sind vorher oft schon angeschossen (Messung R7: Tod nach 41 Schaden)
    z.hp = z.hpMax;
    s.vs = 1; z.vorstoss = true; statistik.vorstoesse++;
  }

  /** Mustervorgabe → wunsch (Richtung, nicht normiert). */
  function muster(z, s, dt) {
    const p = z.pos;
    if (s.weich > 0) { wunsch.x = s.wx; wunsch.y = s.wy; wunsch.z = s.wz; return; }
    if (s.vs === 1) {
      const qx = s.vp.x - p.x, qy = s.vp.y - p.y, qz = s.vp.z - p.z;
      // vorbei (Punkt liegt hinter der Flugrichtung) oder angekommen → Rückzug
      // WARUM „< 400 m und hinter mir“: zu Beginn fliegt die Drohne oft noch weg vom Punkt → sonst sofort Rückzug
      const q = laenge(qx, qy, qz);
      if (q < 60 || (q < 400 && qx * z.vel.x + qy * z.vel.y + qz * z.vel.z < 0)) s.vs = 2;
      else { wunsch.x = qx; wunsch.y = qy; wunsch.z = qz; }
    }
    if (s.vs === 2) {
      if (laenge(p.x - M.x, p.y - M.y, p.z - M.z) > D.vorstoss.ende) {
        s.vs = 0; z.vorstoss = false; s.vsPause = D.vorstoss.pause[0] + rnd() * (D.vorstoss.pause[1] - D.vorstoss.pause[0]);
      } else { wunsch.x = s.rp.x - p.x; wunsch.y = s.rp.y - p.y; wunsch.z = s.rp.z - p.z; }
    }
    if (s.vs) { const l = laenge(wunsch.x, wunsch.y, wunsch.z) || 1; wunsch.x /= l; wunsch.y /= l; wunsch.z /= l; return; }
    const A = D.atmen, atem = A.mitte + A.hub * Math.sin(zeit * 2 * Math.PI / A.periode + s.ph);
    if (s.grund === 'kreisen') {
      s.c.x = M.x + Math.sin(s.gc) * atem; s.c.z = M.z + Math.cos(s.gc) * atem;
      // Punkt 0,35 rad voraus auf dem Kreis anpeilen → stabile Kreisbahn ohne Aufschaukeln
      const a = Math.atan2(p.z - s.c.z, p.x - s.c.x) + s.dreh * 0.35;
      wunsch.x = s.c.x + Math.cos(a) * s.R - p.x; wunsch.z = s.c.z + Math.sin(a) * s.R - p.z;
      wunsch.y = (s.c.y - p.y) * 0.5;
    } else if (s.grund === 'schlange') {
      if (p.x > 1000) s.dreh = -1; else if (p.x < -1000) s.dreh = 1;
      const zz = M.z + atem + 150 * Math.sin(zeit * Math.PI / 2 + s.ph); // Periode 4 s, Grundlinie atmet
      wunsch.x = s.dreh * 200; wunsch.z = zz - p.z; wunsch.y = (s.yc - p.y) * 0.5;
    } else {
      const d = laenge(p.x - M.x, p.y - M.y, p.z - M.z);
      if (s.phase === 'anflug' && d < D.abdrehen) s.phase = 'abdrehen';
      else if (s.phase === 'abdrehen' && d > D.ausholen) { s.phase = 'sammeln'; anlaufPunkt(s); }
      const nahPunkt = laenge(s.punkt.x - p.x, s.punkt.y - p.y, s.punkt.z - p.z) < 250;
      if (s.phase === 'sammeln' && nahPunkt) { s.warte -= dt; if (s.warte <= 0) s.phase = 'anflug'; }
      if (s.phase === 'anflug') {
        // Zielpunkt 300 m über und 250 m neben der Batterie: Bahn kreuzt den Schirm, rammt aber nicht den Prüfstand
        wunsch.x = M.x + s.seite * 250 - p.x; wunsch.y = M.y + 300 - p.y; wunsch.z = M.z - p.z;
      } else if (s.phase === 'abdrehen') {
        // weg von der Batterie, zur Versatzseite hin abkippen und steigen → Bogen öffnet sich nach außen
        const hx = p.x - M.x, hz = Math.max(p.z - M.z, 0), l = Math.hypot(hx, hz) || 1;
        wunsch.x = hx / l + s.seite * 0.8; wunsch.y = 0.5; wunsch.z = hz / l;
      } else if (nahPunkt) {
        // Warteschleife um den Anlaufpunkt (Kreis ~200 m), bis die Wartezeit um ist
        const a = Math.atan2(p.z - s.punkt.z, p.x - s.punkt.x) + s.seite * 0.6;
        wunsch.x = s.punkt.x + Math.cos(a) * 200 - p.x; wunsch.z = s.punkt.z + Math.sin(a) * 200 - p.z; wunsch.y = (s.punkt.y - p.y) * 0.5;
      } else {
        wunsch.x = s.punkt.x - p.x; wunsch.y = s.punkt.y - p.y; wunsch.z = s.punkt.z - p.z;
      }
    }
    const l = laenge(wunsch.x, wunsch.y, wunsch.z) || 1;
    wunsch.x /= l; wunsch.y /= l; wunsch.z /= l;
  }

  function schritt(dt, ereignisse) {
    abschuesse.length = 0;
    zeit += dt;
    // 1) Ereignisse des letzten Waffen-Schritts
    if (ereignisse) {
      const tr = ereignisse.treffer;
      if (tr) for (let k = 0; k < tr.length; k++) {
        const t = tr[k];
        for (let i = 0; i < ziele.length; i++) {
          const z = ziele[i];
          if (!z.aktiv || z.id !== t.zielId) continue;
          z.hp -= t.schaden * (intern[i].vs ? D.vorstoss.panzer : 1);
          if (z.hp <= 0) {
            // WARUM −dt: die Bewegungsschleife zählt diesen Takt gleich mit → Neustart genau 240 Takte (4 s) später
            z.hp = 0; z.aktiv = false; z.angriff = false; intern[i].tot = -dt;
            intern[i].vs = 0; z.vorstoss = false;
            const a = abschussVorrat[i]; a.id = z.id; a.pos.x = z.pos.x; a.pos.y = z.pos.y; a.pos.z = z.pos.z;
            abschuesse.push(a);
          } else ausweichen(i);
        }
      }
      const det = ereignisse.detonationen;
      if (det) for (let k = 0; k < det.length; k++) {
        const q = det[k].pos;
        for (let i = 0; i < ziele.length; i++) {
          const z = ziele[i];
          if (z.aktiv && laenge(z.pos.x - q.x, z.pos.y - q.y, z.pos.z - q.z) < D.ausweichNah) ausweichen(i);
        }
      }
    }
    // 2) Vorstoß-Takt: höchstens 2 gleichzeitig, nur Kreiser/Schlangen nach ihrer Pause
    const V = D.vorstoss;
    let laufend = 0;
    for (let i = 0; i < ziele.length; i++) { const s = intern[i]; if (s.vs) laufend++; if (s.vsPause > 0) s.vsPause -= dt; }
    vsTakt -= dt;
    if (vsTakt <= 0) {
      let wahl = 0;
      for (let i = 0; i < ziele.length; i++) if (frei(i)) wahl++;
      if (laufend < V.gleichzeitig && wahl > 0) {
        let k = Math.floor(rnd() * wahl);
        for (let i = 0; i < ziele.length; i++) if (frei(i) && k-- === 0) { starteVorstoss(i); break; }
        vsTakt = V.takt[0] + rnd() * (V.takt[1] - V.takt[0]);
      } else vsTakt = 1; // in 1 s erneut versuchen
    }
    // 3) Bewegung
    for (let i = 0; i < ziele.length; i++) {
      const z = ziele[i], s = intern[i], p = z.pos, v = z.vel;
      if (!z.aktiv) {
        s.tot += dt;
        // WARUM 1e-9: 240 × (1/60) summiert sich nicht exakt auf 4 → sonst ein Takt zu spät
        if (s.tot >= D.neustart - 1e-9) { erscheine(i); statistik.neustarts++; }
        else { z.vorPos.x = p.x; z.vorPos.y = p.y; z.vorPos.z = p.z; v.x = v.y = v.z = 0; }
        continue;
      }
      if (s.weich > 0) s.weich -= dt;
      if (s.weichPause > 0) s.weichPause -= dt;
      muster(z, s, dt);
      // Korrekturen: Abstandsband, Höhe, +Z-Halbraum, Trennung
      const rx = p.x - M.x, ry = p.y - M.y, rz = p.z - M.z, d = laenge(rx, ry, rz) || 1;
      const wMin = s.vs ? V.weichMin : D.bandWeich[0], hW = s.vs ? V.hoeheWeich : D.hoeheWeich;
      if (d < wMin) { const k = 2 * (wMin - d) / (wMin - D.band[0]); wunsch.x += rx / d * k; wunsch.y += ry / d * k; wunsch.z += rz / d * k; }
      else if (d > D.bandWeich[1]) { const k = 2 * (d - D.bandWeich[1]) / (D.band[1] - D.bandWeich[1]); wunsch.x -= rx / d * k; wunsch.y -= ry / d * k; wunsch.z -= rz / d * k; }
      if (p.y < hW) wunsch.y += 2 * (hW - p.y) / (hW - D.hoeheMin);
      if (rz < D.zWeich) wunsch.z += 1.5 * (D.zWeich - rz) / D.zWeich;
      for (let j = 0; j < ziele.length; j++) {
        if (j === i || !ziele[j].aktiv) continue;
        const q = ziele[j].pos, qv = ziele[j].vel, ax = p.x - q.x, ay = p.y - q.y, az = p.z - q.z, a = laenge(ax, ay, az);
        if (a < D.trenn && a > 1e-6) { const k = 3 * (D.trenn - a) / D.trenn; wunsch.x += ax / a * k; wunsch.y += ay / a * k; wunsch.z += az / a * k; }
        // Vorausschau: engster Abstand in den nächsten 3 s. WARUM: zwei Kreiser frontal schließen mit 250 m/s —
        // reine Abstandskraft reagiert zu spät (Messung R6: 0,7 m). Ausweichen entlang des Verfehl-Vektors.
        const wx = v.x - qv.x, wy = v.y - qv.y, wz = v.z - qv.z, ww = wx * wx + wy * wy + wz * wz;
        if (ww < 1 || a > 900) continue;
        const tc = -(ax * wx + ay * wy + az * wz) / ww;
        if (tc <= 0 || tc > 3) continue;
        let mx = ax + wx * tc, my = ay + wy * tc, mz = az + wz * tc, ml = laenge(mx, my, mz);
        if (ml >= D.trenn) continue;
        if (ml < 1) { mx = 0; my = i < j ? 1 : -1; mz = 0; ml = 1; } // genau frontal: einer steigt, einer sinkt
        const k = 4 * (D.trenn - ml) / D.trenn * (1 - tc / 3);
        wunsch.x += mx / ml * k; wunsch.y += my / ml * k; wunsch.z += mz / ml * k;
      }
      const tempo = s.vs === 1 ? V.tempo : s.weich > 0 || s.vs === 2 || s.phase === 'abdrehen' && s.grund === 'angriff' ? D.tempoMax : s.tempo;
      const wl = laenge(wunsch.x, wunsch.y, wunsch.z) || 1;
      // Lenken mit begrenzter Beschleunigung, Tempo im Band
      let dvx = wunsch.x / wl * tempo - v.x, dvy = wunsch.y / wl * tempo - v.y, dvz = wunsch.z / wl * tempo - v.z;
      const dl = laenge(dvx, dvy, dvz), dmax = D.beschl * dt;
      if (dl > dmax) { dvx *= dmax / dl; dvy *= dmax / dl; dvz *= dmax / dl; }
      v.x += dvx; v.y += dvy; v.z += dvz;
      const vl = laenge(v.x, v.y, v.z) || 1;
      if (vl < D.tempoMin) { v.x *= D.tempoMin / vl; v.y *= D.tempoMin / vl; v.z *= D.tempoMin / vl; }
      else if (vl > D.tempoMax) { v.x *= D.tempoMax / vl; v.y *= D.tempoMax / vl; v.z *= D.tempoMax / vl; }
      z.vorPos.x = p.x; z.vorPos.y = p.y; z.vorPos.z = p.z;
      p.x += v.x * dt; p.y += v.y * dt; p.z += v.z * dt;
      // harte Klammern (Sicherheitsnetz, sollte selten greifen → statistik.klammer)
      let geklammert = false;
      if (p.y < D.hoeheMin) { p.y = D.hoeheMin; geklammert = true; }
      const ex = p.x - M.x, ey = p.y - M.y, ez = p.z - M.z, e = laenge(ex, ey, ez) || 1;
      if (e < D.band[0] || e > D.band[1]) {
        const f = (e < D.band[0] ? D.band[0] : D.band[1]) / e;
        p.x = M.x + ex * f; p.y = M.y + ey * f; p.z = M.z + ez * f; geklammert = true;
      }
      if (geklammert) {
        statistik.klammer++;
        // vel wieder an die echte Bewegung angleichen (Vorhalt der Turm-KI)
        v.x = (p.x - z.vorPos.x) / dt; v.y = (p.y - z.vorPos.y) / dt; v.z = (p.z - z.vorPos.z) / dt;
      }
      z.bahn = s.weich > 0 ? 'ausweichen' : s.grund;
      z.angriff = s.grund === 'angriff' && s.phase === 'anflug';
    }
    return ergebnis;
  }

  function frei(i) { const s = intern[i]; return ziele[i].aktiv && !s.vs && s.grund !== 'angriff' && s.vsPause <= 0 && s.weich <= 0; }

  zuruecksetzen();
  return { ziele, schritt, zuruecksetzen, statistik };
}
