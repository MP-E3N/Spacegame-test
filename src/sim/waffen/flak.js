// ZWECK: Flak-Simulation der Prüfstand-Batterie: Türme richten (Grenzen, Richtgeschwindigkeit), Zwillingsrohre im
//        Wechsel feuern, Streuung mit festem Startwert, Streukugel je Granate (Runde 8), Geschoss-Pool, Zeitzünder
//        (Annäherungszünder abschaltbar), Flächenschaden + Splitterwolke an ALLEN Zielen im Wirkradius.
// LIEFERT: FLAK (Zahlen) · erstelleFlak({ startwert, lafetten }) → { tuerme, geschosse, splitter, ereignisse, schritt(dt, befehle, ziele),
//          zuruecksetzen(), pruefsumme() } — Felder siehe Protokoll Runde 6, Entscheidung 3.
// REGEL: fester Schritt 1/60 s, kein Math.random (zufall je Turm), keine neuen Objekte im Schritt (Pools, Ereignis-Vorrat).
//        Winkel wie turm.js: gier 0 = Rohr nach Welt +Z, gier > 0 zu +X; nick > 0 = nach oben (Turm-Rahmen = Welt-Rahmen).
//        Die HP zieht das Drohnen-Modul ab — hier entstehen nur Ereignisse. Neue Granaten fliegen mit turm.v0
//        (Seite/Labor schalten um), fliegende behalten ihr Tempo.
//        befehle[i].streuKugel (m, fehlt/0 = aus): jede Granate fliegt auf einen eigenen Punkt, gleichverteilt in der
//        Kugel um befehl.punkt, Zeitzünder auf genau diesen Punkt (Runde 8, Nutzer: „Luft sättigen statt treffen“).
import { zufall } from '../zufall.js';
import { LAFETTEN } from './lafetten.js';

export const FLAK = {
  v0: 1000,                   // m/s Standard (R8: 40-mm-Klasse); je Turm über turm.v0 umschaltbar, keine Schwerkraft
  reichweite: 2500,           // m
  schussAbstand: 6,           // Schritte zwischen zwei Schüssen eines Zwillings (10 Schuss/s je Turm)
  streuung: 0.25 * Math.PI / 180, // rad, größte Abweichung je Achse (Dreiecksverteilung); seit R8 streut v. a. die Streukugel
  zuenderMinStrecke: 60, zuenderMax: 4.0, // m bzw. s — WARUM Strecke: bei 1100 m/s wären 0,1 s schon 110 m
  zuenderStreu: 0.04,         // ±4 % Zielgranaten ohne Streukugel
  zuenderStreuKugel: 0.01,    // ±1 % mit Streukugel (die Kugel liefert die Tiefe, Entscheidung R8/2)
  zuenderStreuSperr: 0.08,    // ±8 % Sperrgranaten → Schirm ~120 m tief bei 800 m: einzelne Wolken davor/dahinter (Runde 7)
  streuKugelAnteil: 0.05,     // Kugelradius höchstens 0,05 · Entfernung — WARUM: nah läge die Granate sonst > 3° neben dem Rohr
  // Annäherungszünder (R8 aus, Code bleibt): er war der eigentliche „Direkttreffer“ — zündete bei r + 12 m an jedem Ziel.
  annaeherung: false,
  naheZuender: 12,            // m über dem Zielradius
  scharfStrecke: 60,          // m: WARUM: kein Annäherungszünder direkt vor dem Rohr
  // Zwei Granatsorten, gewählt nach dem Befehl, je eigener Hebel (Lehre R6: ein Hebel pro Modus):
  //   0 ZIELGRANATE (befehl.zielId gesetzt): Flächenschaden 1,2 / 30 m + Splitterwolke 30 m · 0,5 s · 5 HP/s (R8-Balance).
  //   1 SPERRGRANATE (zielId null): Flächenschaden 14 / 25 m + Splitterwolke 45 m · 0,9 s · 500 HP/s.
  // WARUM Splitter jetzt auch im Zielfeuer: ohne Annäherungszünder liegt die Detonation im Mittel ~16 m neben dem Ziel.
  // WARUM Sperr-Splitter stärker als R7 (40 m / 0,7 s / 350): die Werte waren MIT Annäherungszünder gemessen; ohne ihn
  //        fiel der Schirm-Durchflug von 75 auf 21 HP. Mit 45 / 0,9 / 500 → 46 HP (tests/waffen.mjs 7); Labor misst nach.
  // Splitter: Schaden/s im Radius, linear mit dem Alter abnehmend, am Rand halb. Dauer in Schritten.
  sorte: [
    // WARUM 1,2 HP / 5 HP/s statt 22 / 120 (Balance R8, KI): 6 Türme × 10 Schuss/s gegen 100-HP-Drohnen — mit 22/120
    // fielen im 5-min-Labor 240 Drohnen im Zielfeuer (Ziel 20–60), Granaten auf schon tote Ziele trieben den
    // Detonationsabstand auf 70 m. 1,2/5 → 41/71/76 Abschüsse (620/1000/1100), Abstand 38/27/26 m. Viele Granaten je
    // Abschuss = „Flak sättigt die Luft“. Wirk- und Splitter-Radius bleiben (sichtbare Wolke um das Ziel).
    { wirkRadius: 30, vollRadius: 4, schaden: 1.2, splitterRadius: 30, splitterDauer: 30, splitterDps: 5 },
    { wirkRadius: 25, vollRadius: 6, schaden: 14, splitterRadius: 45, splitterDauer: 54, splitterDps: 500 },
  ],
  poolSplitter: 96,
  // Nachbar-Sperre: Rohre dürfen nicht flach über den Nachbarturm schießen (Turmhülle ~3,7 m, Oberkante ~5,2 m)
  nachbarHuelle: 3.7, nachbarHoehe: 5.2,
  richtGeschw: [60 * Math.PI / 180, 50 * Math.PI / 180], // rad/s [gier, nick] (Nick 50°/s ab Runde 7)
  // Leuchtspur nur auf Befehl (Runde 7, Nutzer: bei BSG sieht man sie „so gut wie nie“). befehl.leuchtspur fehlt →
  // dieser Anteil, über einen Zähler je Turm. WARUM Zähler statt Zufall: die Zufallsfolge (Streuung/Zünder) bleibt gleich.
  leuchtAnteil: 0,
  poolGeschosse: 256,
  vorratEreignisse: 128,
};

const ZWEI_PI = Math.PI * 2;
const umbruch = (w) => w - ZWEI_PI * Math.floor((w + Math.PI) / ZWEI_PI); // → [−π, π)

/** Ereignisliste mit festem Objektvorrat: leeren() + neu() statt push({…}). */
function ereignisListe(n, bauer) {
  const liste = [];
  const vorrat = Array.from({ length: n }, bauer);
  liste.leeren = () => { liste.length = 0; };
  liste.neu = () => {
    if (liste.length >= vorrat.length) vorrat.push(bauer()); // Notfall: einmalig wachsen statt Ereignis verlieren
    const e = vorrat[liste.length]; liste.push(e); return e;
  };
  return liste;
}
const v3 = () => ({ x: 0, y: 0, z: 0 });

export function erstelleFlak({ startwert = 303, lafetten = LAFETTEN } = {}) {
  const N = FLAK.poolGeschosse;
  const geschosse = {
    max: N, anzahlAktiv: 0, verworfen: 0,
    aktiv: new Uint8Array(N), turm: new Uint8Array(N), sperr: new Uint8Array(N), // sperr 1 = Sperrgranate
    leucht: new Uint8Array(N), // 1 = Leuchtspur-Granate (beim Abschuss festgelegt)
    anzahlLeucht: 0,
    pos: new Float64Array(N * 3), vorPos: new Float64Array(N * 3), vel: new Float64Array(N * 3),
    alter: new Uint16Array(N),  // Schritte seit dem Abschuss (Grafik: Leuchtspur wächst aus der Mündung)
    rest: new Uint16Array(N),   // Schritte bis zum Zeitzünder
    // Anteil des letzten Schritts bis zum Zünden (0..1]. WARUM: ganze Schritte wären bei 1000 m/s ±8 m ungenau;
    // so bleibt der Zähler ganzzahlig (Gleichlauf) und der Detonationsort trotzdem genau.
    bruch: new Float64Array(N),
  };
  const ereignisse = {
    schuesse: ereignisListe(FLAK.vorratEreignisse, () => ({ turmId: 0, rohr: 0, pos: v3(), richtung: v3() })),
    detonationen: ereignisListe(FLAK.vorratEreignisse, () => ({ pos: v3(), radius: FLAK.sorte[1].wirkRadius, art: 'zeit' })),
    treffer: ereignisListe(FLAK.vorratEreignisse, () => ({ zielId: 0, schaden: 0, pos: v3() })),
  };
  const tuerme = lafetten.map((l) => ({
    id: l.id, lafette: l,
    gier: 0, nick: 0, vorGier: 0, vorNick: 0, sollGier: 0, sollNick: 0,
    imBereich: false, ausgerichtet: false, bereit: true, gesperrt: false,
    v0: FLAK.v0, reichweite: FLAK.reichweite, muendung: v3(),
    richtGeschw: FLAK.richtGeschw.slice(), streuung: FLAK.streuung, leuchtZaehler: 0,
    abklingen: 0, rohr: 0, schuesse: 0, rnd: null,
  }));
  let zeiger = 0, schrittNr = 0;
  const NS = FLAK.poolSplitter;
  const splitter = { max: NS, anzahlAktiv: 0, pos: new Float64Array(NS * 3), rest: new Uint16Array(NS), sorte: new Uint8Array(NS), zeiger: 0 };
  // Nachbar-Sperrzonen je Turm: { gier, halb, nickMin } aus der Lafetten-Tabelle (einmal berechnet)
  for (const t of tuerme) {
    t.sperrzonen = [];
    for (const n of lafetten) {
      if (n === t.lafette) continue;
      const dx = n.x - t.lafette.x, dz = n.z - t.lafette.z, d = Math.hypot(dx, dz);
      if (d > 40) continue;
      const frei = Math.max(1, d - t.lafette.zapfen.z - 2.7); // waagrecht vom Zapfen bis zur Hülle des Nachbarn
      t.sperrzonen.push({ gier: Math.atan2(dx, dz), halb: Math.atan2(FLAK.nachbarHuelle, d),
        nickMin: Math.atan2(FLAK.nachbarHoehe - t.lafette.zapfen.y, frei) });
    }
  }
  /** Mindest-Nick für Gier g (−∞ = keine Sperre). */
  function sperrNick(t, g) {
    let m = -Infinity;
    for (const z of t.sperrzonen) if (Math.abs(umbruch(g - z.gier)) < z.halb && z.nickMin > m) m = z.nickMin;
    return m;
  }
  const MITTE = []; // Mitte zwischen den Rohren je Lafette (einmal angelegt)

  function zuruecksetzen() {
    geschosse.aktiv.fill(0); geschosse.anzahlAktiv = 0; geschosse.verworfen = 0; geschosse.leucht.fill(0); geschosse.anzahlLeucht = 0;
    splitter.rest.fill(0); splitter.anzahlAktiv = 0; splitter.zeiger = 0;
    zeiger = 0; schrittNr = 0;
    for (const t of tuerme) {
      t.leuchtZaehler = 0; t.v0 = FLAK.v0; // Umschalter mit zurücksetzen (Befund Prüfer R8)
      t.gier = t.vorGier = t.sollGier = t.lafette.gier[0];
      t.nick = t.vorNick = t.sollNick = 0.2;
      t.imBereich = t.ausgerichtet = t.gesperrt = false; t.bereit = true;
      t.abklingen = 0; t.rohr = 0; t.schuesse = 0;
      t.rnd = zufall((startwert + t.id * 7919) >>> 0);
      muendungWelt(t, -1, t.muendung);
    }
    ereignisse.schuesse.leeren(); ereignisse.detonationen.leeren(); ereignisse.treffer.leeren();
  }

  /** Mündung in Welt-Koord. (rohr −1 = Mitte zwischen beiden Rohren). Kette wie bauteile.js turm(). */
  function muendungWelt(t, rohr, aus) {
    const l = t.lafette, sg = Math.sin(t.gier), cg = Math.cos(t.gier), sn = Math.sin(t.nick), cn = Math.cos(t.nick);
    const m = rohr < 0 ? MITTE[l.id] ??= { x: 0, z: l.muendungen[0].z } : l.muendungen[rohr];
    // Wiege: (m.x, mz·sin n, mz·cos n), dann Zapfen-Versatz, dann um Y gedreht (gier)
    const a = m.x, b = l.zapfen.y + m.z * sn, c = l.zapfen.z + m.z * cn;
    aus.x = l.x + a * cg + c * sg; aus.y = l.y + b; aus.z = l.z - a * sg + c * cg;
    return aus;
  }

  // ---------- Detonation: Schaden mit Abfall auf alle aktiven Ziele ----------
  function detoniere(x, y, z, art, ziele, sperr) {
    const S = FLAK.sorte[sperr], W = S.wirkRadius, V = S.vollRadius;
    const d = ereignisse.detonationen.neu();
    d.pos.x = x; d.pos.y = y; d.pos.z = z; d.radius = W; d.art = art;
    for (let k = 0; k < ziele.length; k++) {
      const ziel = ziele[k];
      if (!ziel.aktiv) continue;
      const ab = Math.max(0, Math.hypot(ziel.pos.x - x, ziel.pos.y - y, ziel.pos.z - z) - ziel.r);
      if (ab >= W) continue;
      const f = ab <= V ? 1 : (1 - (ab - V) / (W - V)) ** 2; // voll bis V, dann quadratisch auf 0 am Wirkradius
      treffe(ziel, S.schaden * f);
    }
    // Splitterwolke: Ring fester Größe, ist er voll, wird die älteste ersetzt (deterministisch)
    const i = splitter.zeiger; splitter.zeiger = (i + 1) % NS;
    if (splitter.rest[i] === 0) splitter.anzahlAktiv++;
    splitter.pos[i * 3] = x; splitter.pos[i * 3 + 1] = y; splitter.pos[i * 3 + 2] = z;
    splitter.sorte[i] = sperr; splitter.rest[i] = S.splitterDauer;
  }

  /** Höchstens EIN Treffer-Ereignis je Ziel und Schritt (Schaden summiert). */
  function treffe(ziel, schaden) {
    const liste = ereignisse.treffer;
    for (let k = 0; k < liste.length; k++) if (liste[k].zielId === ziel.id) { liste[k].schaden += schaden; return; }
    const tr = liste.neu();
    tr.zielId = ziel.id; tr.schaden = schaden; tr.pos.x = ziel.pos.x; tr.pos.y = ziel.pos.y; tr.pos.z = ziel.pos.z;
  }

  /** Splitterwolken wirken nach: Schaden/s im Radius, linear mit dem Alter abnehmend. Vor den neuen Detonationen. */
  function splitterSchritt(dt, ziele) {
    if (!splitter.anzahlAktiv) return;
    for (let i = 0; i < NS; i++) {
      if (!splitter.rest[i]) continue;
      const S = FLAK.sorte[splitter.sorte[i]], R = S.splitterRadius;
      const staerke = splitter.rest[i] / S.splitterDauer; // 1 → 0
      const sx = splitter.pos[i * 3], sy = splitter.pos[i * 3 + 1], sz = splitter.pos[i * 3 + 2];
      for (let k = 0; k < ziele.length; k++) {
        const ziel = ziele[k];
        if (!ziel.aktiv) continue;
        const ab = Math.hypot(ziel.pos.x - sx, ziel.pos.y - sy, ziel.pos.z - sz) - ziel.r;
        if (ab < R) treffe(ziel, S.splitterDps * staerke * dt * (1 - Math.max(0, ab) / R * 0.5));
      }
      if (--splitter.rest[i] === 0) splitter.anzahlAktiv--;
    }
  }

  // ---------- Geschosse bewegen, Zünder ----------
  function geschosseSchritt(dt, ziele) {
    const { aktiv, pos, vorPos, vel, alter, rest } = geschosse;
    for (let i = 0; i < N; i++) {
      if (!aktiv[i]) continue;
      const j = i * 3;
      const x0 = pos[j], y0 = pos[j + 1], z0 = pos[j + 2];
      vorPos[j] = x0; vorPos[j + 1] = y0; vorPos[j + 2] = z0;
      const dx = vel[j] * dt, dy = vel[j + 1] * dt, dz = vel[j + 2] * dt;
      pos[j] = x0 + dx; pos[j + 1] = y0 + dy; pos[j + 2] = z0 + dz;
      alter[i]++;
      // Annäherungszünder (nur mit FLAK.annaeherung): Strecke in RELATIVBEWEGUNG gegen Kugel r + 12
      // (WARUM: ~17 m/Schritt → Punkttest tunnelt)
      let bestS = 2, bestZiel = -1;
      if (FLAK.annaeherung && alter[i] * dt * Math.hypot(vel[j], vel[j + 1], vel[j + 2]) > FLAK.scharfStrecke) {
        for (let k = 0; k < ziele.length; k++) {
          const zl = ziele[k];
          if (!zl.aktiv) continue;
          const vp = zl.vorPos ?? zl.pos;
          const ax = x0 - vp.x, ay = y0 - vp.y, az = z0 - vp.z;               // relativ am Schrittanfang
          const ex = pos[j] - zl.pos.x, ey = pos[j + 1] - zl.pos.y, ez = pos[j + 2] - zl.pos.z; // am Ende
          const ux = ex - ax, uy = ey - ay, uz = ez - az;
          const uu = ux * ux + uy * uy + uz * uz;
          let s = uu > 1e-9 ? -(ax * ux + ay * uy + az * uz) / uu : 0;
          s = s < 0 ? 0 : s > 1 ? 1 : s;
          const cx = ax + ux * s, cy = ay + uy * s, cz = az + uz * s;
          const rr = zl.r + FLAK.naheZuender;
          if (cx * cx + cy * cy + cz * cz <= rr * rr && s < bestS) { bestS = s; bestZiel = k; }
        }
      }
      if (bestZiel >= 0) {
        aktiv[i] = 0; geschosse.anzahlAktiv--; geschosse.anzahlLeucht -= geschosse.leucht[i];
        detoniere(x0 + dx * bestS, y0 + dy * bestS, z0 + dz * bestS, 'nah', ziele, geschosse.sperr[i]);
      } else if (--rest[i] === 0) {
        aktiv[i] = 0; geschosse.anzahlAktiv--; geschosse.anzahlLeucht -= geschosse.leucht[i];
        const b = geschosse.bruch[i]; // genauer Zündort innerhalb des letzten Schritts
        detoniere(x0 + dx * b, y0 + dy * b, z0 + dz * b, 'zeit', ziele, geschosse.sperr[i]);
      }
    }
  }

  function freiesGeschoss() {
    for (let n = 0; n < N; n++) {
      const i = (zeiger + n) % N;
      if (!geschosse.aktiv[i]) { zeiger = (i + 1) % N; return i; }
    }
    return -1;
  }

  // ---------- Turm richten + feuern ----------
  const tmp = v3();
  function turmSchritt(t, dt, b) {
    const l = t.lafette;
    t.vorGier = t.gier; t.vorNick = t.nick;
    if (t.abklingen > 0) t.abklingen--;
    t.bereit = t.abklingen === 0;
    const p = b && b.punkt;
    if (!p) { t.imBereich = t.ausgerichtet = t.gesperrt = false; return; }

    // Sollwinkel vom Zapfen aus (Gier um die Kranzachse, Nick vom Wiegen-Drehpunkt)
    const dx = p.x - l.x, dz = p.z - l.z, dy = p.y - (l.y + l.zapfen.y);
    const h = Math.max(0.1, Math.hypot(dx, dz) - l.zapfen.z);
    const entf = Math.hypot(h, dy);
    let sollG = Math.atan2(dx, dz), sollN = Math.atan2(dy, h);
    const gMitte = l.gier[0], gHalb = l.gier[1], nMin = l.nick[0], nMax = l.nick[1];
    const volleDrehung = gHalb >= Math.PI - 1e-6;
    let relSoll = umbruch(sollG - gMitte);
    let gesperrt = false;
    if (!volleDrehung && Math.abs(relSoll) > gHalb) { relSoll = Math.sign(relSoll) * gHalb; gesperrt = true; }
    if (sollN < nMin) { sollN = nMin; gesperrt = true; } else if (sollN > nMax) { sollN = nMax; gesperrt = true; }
    // Nachbar-Sperre: Soll zeigt flach auf einen Nachbarturm → Nick klemmen, nicht feuern
    const nSperr = sperrNick(t, gMitte + relSoll);
    if (sollN < nSperr) { sollN = nSperr; gesperrt = true; }
    t.sollGier = gMitte + relSoll; t.sollNick = sollN; t.gesperrt = gesperrt;
    t.imBereich = !gesperrt && entf <= FLAK.reichweite;

    // Richten mit begrenzter Geschwindigkeit. WARUM ohne Umbruch bei Grenzen: der Turm darf nicht durch die Sperrzone drehen.
    const dG = volleDrehung ? umbruch(t.sollGier - t.gier) : relSoll - umbruch(t.gier - gMitte);
    const mg = t.richtGeschw[0] * dt, mn = t.richtGeschw[1] * dt;
    t.gier = umbruch(t.gier + Math.max(-mg, Math.min(mg, dG)));
    const dN = t.sollNick - t.nick;
    t.nick += Math.max(-mn, Math.min(mn, dN));

    const fehlG = umbruch(sollG - t.gier) * Math.cos(t.nick), fehlN = Math.atan2(dy, h) - t.nick;
    t.ausgerichtet = Math.hypot(fehlG, fehlN) <= (b.toleranz ?? 0.01);
    muendungWelt(t, -1, t.muendung);

    // WARUM auch die IST-Lage prüfen: beim Schwenken streicht das Rohr evtl. flach über den Nachbarn
    if (t.nick < sperrNick(t, t.gier)) { t.gesperrt = true; t.imBereich = false; }
    if (!(b.feuer && t.imBereich && t.ausgerichtet && t.bereit)) return;
    const i = freiesGeschoss();
    if (i < 0) { geschosse.verworfen++; return; }
    const rohr = t.rohr; t.rohr ^= 1; t.abklingen = FLAK.schussAbstand; t.bereit = false; t.schuesse++;
    muendungWelt(t, rohr, tmp);
    const v0 = t.v0;
    // Streukugel (R8): Punkt gleichverteilt in der Kugel um p — genau 3 Zufallszahlen (Richtung + Kubikwurzel-Radius).
    // WARUM Versatz als Winkeldifferenz auf die Rohrrichtung: der Turm richtet nur auf p (Richttempo), jede Granate
    // bekommt ihren eigenen Punkt, der Richtfehler des Turms bleibt erhalten.
    let kG = 0, kN = 0, zuender, zStreu;
    const qx0 = p.x - tmp.x, qy0 = p.y - tmp.y, qz0 = p.z - tmp.z, dp = Math.hypot(qx0, qy0, qz0);
    const kugel = Math.min(b.streuKugel || 0, FLAK.streuKugelAnteil * dp);
    if (kugel > 0) {
      const cz = 2 * t.rnd() - 1, phi = ZWEI_PI * t.rnd(), r = kugel * Math.cbrt(t.rnd()), sz = Math.sqrt(1 - cz * cz);
      const qx = qx0 + r * sz * Math.cos(phi), qy = qy0 + r * sz * Math.sin(phi), qz = qz0 + r * cz;
      kG = umbruch(Math.atan2(qx, qz) - Math.atan2(qx0, qz0));
      kN = Math.atan2(qy, Math.hypot(qx, qz)) - Math.atan2(qy0, Math.hypot(qx0, qz0));
      zuender = Math.hypot(qx, qy, qz) / v0; zStreu = FLAK.zuenderStreuKugel;
    } else {
      zuender = b.zuender ?? entf / v0; zStreu = b.zielId == null ? FLAK.zuenderStreuSperr : FLAK.zuenderStreu;
    }
    // Streuung: zwei Achsen, je Dreiecksverteilung (Summe zweier Zufallszahlen) → dichte Mitte, weicher Rand
    const g = t.gier + kG + (t.rnd() + t.rnd() - 1) * t.streuung / Math.max(0.2, Math.cos(t.nick));
    const n = t.nick + kN + (t.rnd() + t.rnd() - 1) * t.streuung;
    const cn = Math.cos(n), rx = Math.sin(g) * cn, ry = Math.sin(n), rz = Math.cos(g) * cn;
    zuender = Math.min(FLAK.zuenderMax, Math.max(FLAK.zuenderMinStrecke / v0, zuender)) * (1 + (t.rnd() + t.rnd() - 1) * zStreu);
    const j = i * 3;
    geschosse.aktiv[i] = 1; geschosse.anzahlAktiv++; geschosse.turm[i] = t.id;
    geschosse.sperr[i] = b.zielId == null ? 1 : 0;
    let leucht = b.leuchtspur;
    if (leucht == null) { t.leuchtZaehler += FLAK.leuchtAnteil; leucht = t.leuchtZaehler >= 1; if (leucht) t.leuchtZaehler -= 1; }
    geschosse.leucht[i] = leucht ? 1 : 0;
    if (leucht) geschosse.anzahlLeucht++;
    geschosse.pos[j] = geschosse.vorPos[j] = tmp.x;
    geschosse.pos[j + 1] = geschosse.vorPos[j + 1] = tmp.y;
    geschosse.pos[j + 2] = geschosse.vorPos[j + 2] = tmp.z;
    geschosse.vel[j] = rx * v0; geschosse.vel[j + 1] = ry * v0; geschosse.vel[j + 2] = rz * v0;
    geschosse.alter[i] = 0;
    // WARUM ganze Schritte + Bruch: Zähler ohne Zeitrundung (Gleichlauf), Zündort trotzdem auf den Meter genau
    const schritte = zuender / dt, rest = Math.max(1, Math.ceil(schritte - 1e-9));
    geschosse.rest[i] = rest; geschosse.bruch[i] = Math.min(1, Math.max(0, schritte - (rest - 1)));
    const s = ereignisse.schuesse.neu();
    s.turmId = t.id; s.rohr = rohr; s.pos.x = tmp.x; s.pos.y = tmp.y; s.pos.z = tmp.z;
    s.richtung.x = rx; s.richtung.y = ry; s.richtung.z = rz;
  }

  /** befehle[i] gehört zu tuerme[i] (Turm-Reihenfolge); fehlt er, hält der Turm still. */
  function schritt(dt, befehle, ziele) {
    schrittNr++;
    ereignisse.schuesse.leeren(); ereignisse.detonationen.leeren(); ereignisse.treffer.leeren();
    splitterSchritt(dt, ziele);           // Nachwirkung älterer Detonationen (die neue wirkt in diesem Schritt sofort)
    geschosseSchritt(dt, ziele);          // erst fliegen (neue Geschosse starten an der Mündung, sichtbar ab diesem Bild)
    for (let i = 0; i < tuerme.length; i++) turmSchritt(tuerme[i], dt, befehle ? befehle[i] : null);
  }

  /** FNV-1a über Turmwinkel, Geschosse und Ereigniszahlen (Gleichlauf-Prüfung). */
  function pruefsumme() {
    let h = 2166136261 >>> 0;
    const mische = (v) => { h ^= (Math.round(v * 1000) | 0); h = Math.imul(h, 16777619) >>> 0; };
    mische(schrittNr);
    for (const t of tuerme) { mische(t.gier); mische(t.nick); mische(t.schuesse); }
    for (let i = 0; i < N; i++) if (geschosse.aktiv[i]) { mische(i); mische(geschosse.pos[i * 3]); mische(geschosse.pos[i * 3 + 1]); mische(geschosse.pos[i * 3 + 2]); }
    mische(ereignisse.detonationen.length); mische(ereignisse.treffer.length); mische(splitter.anzahlAktiv);
    return h.toString(16);
  }

  zuruecksetzen();
  return { tuerme, geschosse, splitter, ereignisse, schritt, zuruecksetzen, pruefsumme, get schrittNr() { return schrittNr; } };
}
