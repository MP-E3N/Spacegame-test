// ZWECK: Flak-Simulation der Prüfstand-Batterie: Türme richten (Grenzen, Richtgeschwindigkeit), Zwillingsrohre im
//        Wechsel feuern, Streuung mit festem Startwert, Geschoss-Pool, Zeit- und Annäherungszünder, Detonationsschaden.
// LIEFERT: FLAK (Zahlen) · erstelleFlak({ startwert, lafetten }) → { tuerme, geschosse, splitter, ereignisse, schritt(dt, befehle, ziele),
//          zuruecksetzen(), pruefsumme() } — Felder siehe Protokoll Runde 6, Entscheidung 3.
// REGEL: fester Schritt 1/60 s, kein Math.random (zufall je Turm), keine neuen Objekte im Schritt (Pools, Ereignis-Vorrat).
//        Winkel wie turm.js: gier 0 = Rohr nach Welt +Z, gier > 0 zu +X; nick > 0 = nach oben (Turm-Rahmen = Welt-Rahmen).
//        Die HP zieht das Drohnen-Modul ab — hier entstehen nur Ereignisse.
import { zufall } from '../zufall.js';
import { LAFETTEN } from './lafetten.js';

export const FLAK = {
  v0: 620,                    // m/s, konstant, keine Schwerkraft
  reichweite: 2500,           // m
  schussAbstand: 6,           // Schritte zwischen zwei Schüssen eines Zwillings (10 Schuss/s je Turm)
  streuung: 0.5 * Math.PI / 180, // rad, größte Abweichung je Achse (Dreiecksverteilung)
  zuenderMin: 0.3, zuenderMax: 4.0, // s
  zuenderStreu: 0.04,         // ±4 % → Schirm ~60 m tief bei 800 m
  naheZuender: 12,            // m über dem Zielradius
  scharfNach: 6,              // Schritte (~60 m): WARUM: kein Annäherungszünder direkt vor dem Rohr
  // Zwei Granatsorten (Runde 6, Nachauftrag), gewählt nach dem Befehl:
  //   ZIELGRANATE (befehl.zielId gesetzt, Zielfeuer): nur Sofortschaden, kein Nachwirken.
  //   SPERRGRANATE (zielId null, Sperrfeuer): schwacher Sofortschaden + SPLITTERWOLKE, die ~0,7 s nachwirkt.
  // WARUM: Ohne Nachwirken quert ein Angreifer die ~60 m tiefe Wand in ~0,4 s fast unbeschadet (Messung: 0 Abschüsse);
  //        mit Splittern auch im Zielfeuer wurde das Zielfeuer zu tödlich (Prox-Detonation direkt am Ziel + Wolke).
  wirkRadius: 25, vollRadius: 6, schadenZiel: 11, schadenSperr: 14,
  // Splitter: Schaden/s im Radius, linear mit dem Alter abnehmend, am Rand halb (ganze Lebensdauer in der Mitte ≈ dps · dauer/60 / 2 ≈ 120 HP).
  splitterRadius: 40, splitterDauer: 42, splitterDps: 350, poolSplitter: 96,
  // Nachbar-Sperre: Rohre dürfen nicht flach über den Nachbarturm schießen (Turmhülle ~3,7 m, Oberkante ~5,2 m)
  nachbarHuelle: 3.7, nachbarHoehe: 5.2,
  richtGeschw: [60 * Math.PI / 180, 40 * Math.PI / 180], // rad/s [gier, nick]
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
    pos: new Float64Array(N * 3), vorPos: new Float64Array(N * 3), vel: new Float64Array(N * 3),
    alter: new Uint16Array(N),  // Schritte seit dem Abschuss (Grafik: Leuchtspur wächst aus der Mündung)
    rest: new Uint16Array(N),   // Schritte bis zum Zeitzünder
  };
  const ereignisse = {
    schuesse: ereignisListe(FLAK.vorratEreignisse, () => ({ turmId: 0, rohr: 0, pos: v3(), richtung: v3() })),
    detonationen: ereignisListe(FLAK.vorratEreignisse, () => ({ pos: v3(), radius: FLAK.wirkRadius, art: 'zeit' })),
    treffer: ereignisListe(FLAK.vorratEreignisse, () => ({ zielId: 0, schaden: 0, pos: v3() })),
  };
  const tuerme = lafetten.map((l) => ({
    id: l.id, lafette: l,
    gier: 0, nick: 0, vorGier: 0, vorNick: 0, sollGier: 0, sollNick: 0,
    imBereich: false, ausgerichtet: false, bereit: true, gesperrt: false,
    v0: FLAK.v0, reichweite: FLAK.reichweite, muendung: v3(),
    richtGeschw: FLAK.richtGeschw.slice(), streuung: FLAK.streuung,
    abklingen: 0, rohr: 0, schuesse: 0, rnd: null,
  }));
  let zeiger = 0, schrittNr = 0;
  const NS = FLAK.poolSplitter;
  const splitter = { max: NS, anzahlAktiv: 0, pos: new Float64Array(NS * 3), rest: new Uint16Array(NS), zeiger: 0 };
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
    geschosse.aktiv.fill(0); geschosse.anzahlAktiv = 0; geschosse.verworfen = 0;
    splitter.rest.fill(0); splitter.anzahlAktiv = 0; splitter.zeiger = 0;
    zeiger = 0; schrittNr = 0;
    for (const t of tuerme) {
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
    const schaden = sperr ? FLAK.schadenSperr : FLAK.schadenZiel;
    const d = ereignisse.detonationen.neu();
    d.pos.x = x; d.pos.y = y; d.pos.z = z; d.radius = FLAK.wirkRadius; d.art = art;
    for (let k = 0; k < ziele.length; k++) {
      const ziel = ziele[k];
      if (!ziel.aktiv) continue;
      const ab = Math.max(0, Math.hypot(ziel.pos.x - x, ziel.pos.y - y, ziel.pos.z - z) - ziel.r);
      if (ab >= FLAK.wirkRadius) continue;
      const f = ab <= FLAK.vollRadius ? 1 : (1 - (ab - FLAK.vollRadius) / (FLAK.wirkRadius - FLAK.vollRadius)) ** 2;
      treffe(ziel, schaden * f);
    }
    // Splitterwolke: Ring fester Größe, ist er voll, wird die älteste ersetzt (deterministisch)
    if (!sperr) return;
    const i = splitter.zeiger; splitter.zeiger = (i + 1) % NS;
    if (splitter.rest[i] === 0) splitter.anzahlAktiv++;
    splitter.pos[i * 3] = x; splitter.pos[i * 3 + 1] = y; splitter.pos[i * 3 + 2] = z; splitter.rest[i] = FLAK.splitterDauer;
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
    const R = FLAK.splitterRadius;
    for (let i = 0; i < NS; i++) {
      if (!splitter.rest[i]) continue;
      const staerke = splitter.rest[i] / FLAK.splitterDauer; // 1 → 0
      const sx = splitter.pos[i * 3], sy = splitter.pos[i * 3 + 1], sz = splitter.pos[i * 3 + 2];
      for (let k = 0; k < ziele.length; k++) {
        const ziel = ziele[k];
        if (!ziel.aktiv) continue;
        const ab = Math.hypot(ziel.pos.x - sx, ziel.pos.y - sy, ziel.pos.z - sz) - ziel.r;
        if (ab < R) treffe(ziel, FLAK.splitterDps * staerke * dt * (1 - Math.max(0, ab) / R * 0.5));
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
      // Annäherungszünder: Strecke in RELATIVBEWEGUNG gegen Kugel r + 12 (WARUM: ~10 m/Schritt → Punkttest tunnelt)
      let bestS = 2, bestZiel = -1;
      if (alter[i] > FLAK.scharfNach) {
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
        aktiv[i] = 0; geschosse.anzahlAktiv--;
        detoniere(x0 + dx * bestS, y0 + dy * bestS, z0 + dz * bestS, 'nah', ziele, geschosse.sperr[i]);
      } else if (--rest[i] === 0) {
        aktiv[i] = 0; geschosse.anzahlAktiv--;
        detoniere(pos[j], pos[j + 1], pos[j + 2], 'zeit', ziele, geschosse.sperr[i]);
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
    // Streuung: zwei Achsen, je Dreiecksverteilung (Summe zweier Zufallszahlen) → dichte Mitte, weicher Rand
    const g = t.gier + (t.rnd() + t.rnd() - 1) * t.streuung / Math.max(0.2, Math.cos(t.nick));
    const n = t.nick + (t.rnd() + t.rnd() - 1) * t.streuung;
    const cn = Math.cos(n), rx = Math.sin(g) * cn, ry = Math.sin(n), rz = Math.cos(g) * cn;
    let zuender = b.zuender ?? entf / FLAK.v0;
    zuender = Math.min(FLAK.zuenderMax, Math.max(FLAK.zuenderMin, zuender)) * (1 + (t.rnd() + t.rnd() - 1) * FLAK.zuenderStreu);
    const j = i * 3;
    geschosse.aktiv[i] = 1; geschosse.anzahlAktiv++; geschosse.turm[i] = t.id;
    geschosse.sperr[i] = b.zielId == null ? 1 : 0;
    geschosse.pos[j] = geschosse.vorPos[j] = tmp.x;
    geschosse.pos[j + 1] = geschosse.vorPos[j + 1] = tmp.y;
    geschosse.pos[j + 2] = geschosse.vorPos[j + 2] = tmp.z;
    geschosse.vel[j] = rx * FLAK.v0; geschosse.vel[j + 1] = ry * FLAK.v0; geschosse.vel[j + 2] = rz * FLAK.v0;
    geschosse.alter[i] = 0;
    geschosse.rest[i] = Math.max(1, Math.round(zuender / dt)); // WARUM ganze Schritte: Gleichlauf ohne Zeitrundung
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
