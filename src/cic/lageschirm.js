// ZWECK: Lageschirm der Gefechtszentrale (R23, Nutzer: „zentral ein Lageplan“) — Draufsicht auf einem Röhrenschirm:
//        eigenes Schiff in der Mitte mit Bugrichtung, Entfernungsringe 500/1000/2000/3000 m, Kompassrose (Weltkurs),
//        Kontakte mit Typ-Symbol (Boot = Raute, Panzerboot = Vollquadrat mit Rahmen), Spur der letzten Sekunden,
//        Höhe über/unter, Flak-Räume (ki.lage.schirme), Navigator-Kurslinie, Sensorgrenze, Abtaststrahl.
// LIEFERT: erstelleLageschirm({ canvas, gefecht, zentrale, beiKlick }) → { zeichne(zeit), spurTakt(dt), massstab (get/set),
//          setzeKursWahl(bool), get kursWahl, auswahl (get/set: zielId | null), MASSSTAEBE }
//          beiKlick({ art: 'kontakt', zielId } | { art: 'kurs', peilung }) — die CIC macht daraus Befehle.
// REGEL: NORDEN OBEN = Welt +Z, rechts = Welt −X (Draufsicht von oben, Schiff lokal +X = Backbord = links).
//        Peilung im Uhrzeigersinn: peilung = atan2(−dx, dz) (wie stationsbefehle.js). Liest nur (keine Sim-Änderung).
//        Leistung: Aufrufer zeichnet ≤ 30 Hz; keine neuen Objekte je Bild (Spuren in festen Float32Arrays).
import { zuWelt } from '../sim/ki/schiffsrahmen.js';

export const MASSSTAEBE = [1200, 2200, 3500]; // m Radius des Schirms
const RINGE = [500, 1000, 2000, 3000];
const SPUR = { punkte: 24, takt: 0.25 };      // 24 × 0,25 s = 6 s Spur
const FARBE = {
  grund: '#040806', ring: 'rgba(110, 220, 140, 0.28)', ringText: 'rgba(130, 230, 160, 0.55)', rose: 'rgba(110, 220, 140, 0.45)',
  schiff: '#a8ffc0', kurs: 'rgba(240, 190, 90, 0.85)', feind: '#ff9a4a', panzer: '#ff5a3a', spur: 'rgb(255, 150, 70)',
  wahl: '#ffe08a', vorgabe: '#ff3a2a', schirm: 'rgba(120, 230, 150, 0.35)', sensor: 'rgba(255, 90, 60, 0.5)', strahl: 'rgb(120, 255, 160)',
};

export function erstelleLageschirm({ canvas, gefecht, zentrale, beiKlick }) {
  const ctx = canvas.getContext('2d');
  let massstab = MASSSTAEBE[2], kursWahl = false, auswahl = null;
  let breite = 0, hoehe = 0, dpr = 1, maus = null;
  // Spuren je Ziel-Platz (angreifer.ziele hat feste Plätze): Welt x/z im Ring
  const n = gefecht.angreifer.ziele.length;
  const spur = Array.from({ length: n }, () => ({ id: -1, anzahl: 0, kopf: 0, xz: new Float32Array(SPUR.punkte * 2) }));
  let spurUhr = 0, glanz = null, glanzFuer = -1;
  const tmp = { x: 0, y: 0, z: 0 }, bug = { x: 0, y: 0, z: 0 }, VOR = { x: 0, y: 0, z: 1 };

  // WARUM ResizeObserver: Größe nur bei Änderung lesen — ein clientWidth-Lesen je Bild erzwänge ein Layout
  new ResizeObserver(() => {
    dpr = Math.min(2, globalThis.devicePixelRatio || 1);
    breite = canvas.clientWidth; hoehe = canvas.clientHeight;
    canvas.width = Math.max(1, Math.round(breite * dpr)); canvas.height = Math.max(1, Math.round(hoehe * dpr));
  }).observe(canvas);

  const radius = () => Math.max(40, Math.min(breite, hoehe) / 2 - 26);
  const k = () => radius() / massstab;

  /** Spur-Abtastung (auch bei geschlossener Zentrale — WARUM: beim Öffnen ist die Spur schon da). */
  function spurTakt(dt) {
    if ((spurUhr += dt) < SPUR.takt) return;
    spurUhr = 0;
    const ziele = gefecht.angreifer.ziele;
    for (let i = 0; i < ziele.length; i++) {
      const g = ziele[i], s = spur[i];
      if (!g.aktiv) { s.anzahl = 0; s.id = -1; continue; }
      if (s.id !== g.id) { s.id = g.id; s.anzahl = 0; s.kopf = 0; }
      s.xz[s.kopf * 2] = g.pos.x; s.xz[s.kopf * 2 + 1] = g.pos.z;
      s.kopf = (s.kopf + 1) % SPUR.punkte; s.anzahl = Math.min(SPUR.punkte, s.anzahl + 1);
    }
  }

  function kontaktAm(px, py) {
    const z = gefecht.schiff.z, kk = k(), cx = breite / 2, cy = hoehe / 2, rs = zentrale.wirkung.sensorReichweite;
    let best = null, bestD = 16 * 16;
    for (const g of gefecht.angreifer.ziele) {
      if (!g.aktiv) continue;
      const dx = g.pos.x - z.pos.x, dz = g.pos.z - z.pos.z;
      if (Math.hypot(dx, g.pos.y - z.pos.y, dz) > rs) continue;
      const sx = cx - dx * kk, sy = cy - dz * kk, d = (sx - px) ** 2 + (sy - py) ** 2;
      if (d < bestD) { bestD = d; best = g.id; }
    }
    return best;
  }

  canvas.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    const r = canvas.getBoundingClientRect(), px = e.clientX - r.left, py = e.clientY - r.top;
    const id = kontaktAm(px, py);
    if (id !== null && !kursWahl) { auswahl = id; beiKlick({ art: 'kontakt', zielId: id }); return; }
    if (kursWahl) {
      // Bildschirm → Peilung (Uhrzeigersinn von oben); rechts = −X, oben = +Z
      const peilung = Math.atan2(px - breite / 2, -(py - hoehe / 2));
      kursWahl = false;
      beiKlick({ art: 'kurs', peilung: (peilung + 2 * Math.PI) % (2 * Math.PI) });
      return;
    }
    auswahl = null; beiKlick({ art: 'kontakt', zielId: null });
  });
  canvas.addEventListener('pointermove', (e) => { const r = canvas.getBoundingClientRect(); maus = { x: e.clientX - r.left, y: e.clientY - r.top }; });
  canvas.addEventListener('pointerleave', () => { maus = null; });

  const grad = (rad) => String(Math.round(((rad / Math.PI * 180) % 360 + 360) % 360)).padStart(3, '0');

  function zeichne(zeit) {
    if (!breite || !hoehe) return;
    const z = gefecht.schiff.z, kk = k(), R = radius(), cx = breite / 2, cy = hoehe / 2;
    const W = zentrale.wirkung, N = zentrale.zustand.navigator, vorgabe = zentrale.zustand.waffen.zielVorgabe;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = FARBE.grund; ctx.fillRect(0, 0, breite, hoehe);
    // Phosphor-Schimmer in der Mitte
    // WARUM gemerkt: der Verlauf hängt nur von der Größe ab — nicht jedes Bild neu anlegen
    if (glanzFuer !== breite * 10000 + hoehe) {
      glanzFuer = breite * 10000 + hoehe;
      glanz = ctx.createRadialGradient(cx, cy, R * 0.05, cx, cy, R * 1.05);
      glanz.addColorStop(0, 'rgba(40, 90, 55, 0.35)'); glanz.addColorStop(1, 'rgba(0, 0, 0, 0)');
    }
    ctx.fillStyle = glanz; ctx.fillRect(0, 0, breite, hoehe);
    ctx.font = '11px Consolas, "Courier New", monospace'; ctx.textBaseline = 'middle';

    // Abtaststrahl (1 Umlauf / 4 s) — Stimmung, keine Information
    const a0 = (zeit * Math.PI / 2) % (2 * Math.PI);
    ctx.fillStyle = FARBE.strahl;
    for (let j = 0; j < 6; j++) {
      ctx.beginPath(); ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, R, a0 - Math.PI / 2 - (j + 1) * 0.06, a0 - Math.PI / 2 - j * 0.06);
      ctx.closePath(); ctx.globalAlpha = 0.09 - j * 0.014; ctx.fill();
    }
    ctx.globalAlpha = 1;
    // Ringe
    ctx.lineWidth = 1; ctx.strokeStyle = FARBE.ring; ctx.fillStyle = FARBE.ringText; ctx.textAlign = 'left';
    for (const m of RINGE) {
      if (m > massstab) continue;
      ctx.beginPath(); ctx.arc(cx, cy, m * kk, 0, 2 * Math.PI); ctx.stroke();
      ctx.fillText(m >= 1000 ? m / 1000 + ' km' : m + ' m', cx + 3, cy - m * kk - 7);
    }
    ctx.beginPath(); ctx.moveTo(cx - R, cy); ctx.lineTo(cx + R, cy); ctx.moveTo(cx, cy - R); ctx.lineTo(cx, cy + R); ctx.stroke();
    // Kompassrose (Weltkurs)
    ctx.strokeStyle = FARBE.rose; ctx.fillStyle = FARBE.rose; ctx.textAlign = 'center';
    for (let g = 0; g < 360; g += 10) {
      const a = g * Math.PI / 180, s = Math.sin(a), c = -Math.cos(a), l = g % 30 === 0 ? 9 : 4;
      ctx.beginPath(); ctx.moveTo(cx + s * R, cy + c * R); ctx.lineTo(cx + s * (R + l), cy + c * (R + l)); ctx.stroke();
      if (g % 90 === 0) ctx.fillText(String(g).padStart(3, '0'), cx + s * (R + 18), cy + c * (R + 18));
    }
    // Sensorgrenze (Bugschaden)
    if (W.sensorReichweite < massstab) {
      ctx.setLineDash([4, 6]); ctx.strokeStyle = FARBE.sensor;
      ctx.beginPath(); ctx.arc(cx, cy, W.sensorReichweite * kk, 0, 2 * Math.PI); ctx.stroke(); ctx.setLineDash([]);
    }
    // Flak-Räume (Schiffsrahmen → Welt)
    const schirme = gefecht.ki.lage?.schirme ?? [];
    ctx.strokeStyle = FARBE.schirm; ctx.setLineDash([3, 4]);
    for (const s of schirme) {
      zuWelt(z, s.mitte, tmp);
      const sx = cx - tmp.x * kk, sy = cy - tmp.z * kk;
      ctx.beginPath(); ctx.arc(sx, sy, Math.max(4, (s.breite ?? 150) * kk), 0, 2 * Math.PI); ctx.stroke();
    }
    ctx.setLineDash([]);
    // Navigator-Kurs
    if (N.kursAktiv) {
      const s = Math.sin(N.peilung), c = -Math.cos(N.peilung);
      ctx.strokeStyle = FARBE.kurs; ctx.setLineDash([10, 6]); ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + s * R, cy + c * R); ctx.stroke(); ctx.setLineDash([]); ctx.lineWidth = 1;
      ctx.fillStyle = FARBE.kurs; ctx.textAlign = 'center';
      ctx.fillText('KURS ' + grad(N.peilung) + (N.hoehe ? (N.hoehe > 0 ? ' +' : ' ') + Math.round(N.hoehe * 180 / Math.PI) + '°' : ''), cx + s * R * 0.62 + 14, cy + c * R * 0.62 - 10);
    }
    if (kursWahl && maus) {
      ctx.strokeStyle = FARBE.kurs; ctx.globalAlpha = 0.5; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(maus.x, maus.y); ctx.stroke(); ctx.globalAlpha = 1;
      ctx.fillStyle = FARBE.kurs; ctx.textAlign = 'left';
      ctx.fillText('KURS ' + grad(Math.atan2(maus.x - cx, -(maus.y - cy))) + ' ?', maus.x + 10, maus.y - 10);
    }
    // Spuren + Kontakte
    const ziele = gefecht.angreifer.ziele;
    for (let i = 0; i < ziele.length; i++) {
      const g = ziele[i];
      if (!g.aktiv) continue;
      const dx = g.pos.x - z.pos.x, dy = g.pos.y - z.pos.y, dz = g.pos.z - z.pos.z;
      if (Math.hypot(dx, dy, dz) > W.sensorReichweite) continue;
      const s = spur[i];
      ctx.fillStyle = FARBE.spur;
      for (let j = 0; j < s.anzahl; j++) {
        const q = ((s.kopf - 1 - j) % SPUR.punkte + SPUR.punkte) % SPUR.punkte;
        const px = cx - (s.xz[q * 2] - z.pos.x) * kk, py = cy - (s.xz[q * 2 + 1] - z.pos.z) * kk;
        ctx.globalAlpha = 0.55 * (1 - j / SPUR.punkte);
        ctx.fillRect(px - 1, py - 1, 2, 2);
      }
      ctx.globalAlpha = 1;
      let sx = cx - dx * kk, sy = cy - dz * kk;
      const rr = Math.hypot(sx - cx, sy - cy), draussen = rr > R;
      if (draussen) { sx = cx + (sx - cx) * R / rr; sy = cy + (sy - cy) * R / rr; }
      const panzer = g.art === 'panzer' || (g.panzer ?? 0) >= 0.5;
      ctx.strokeStyle = ctx.fillStyle = panzer ? FARBE.panzer : FARBE.feind; ctx.lineWidth = 1.5;
      if (panzer) { ctx.fillRect(sx - 4, sy - 4, 8, 8); ctx.strokeRect(sx - 7, sy - 7, 14, 14); }
      else { ctx.beginPath(); ctx.moveTo(sx, sy - 6); ctx.lineTo(sx + 6, sy); ctx.lineTo(sx, sy + 6); ctx.lineTo(sx - 6, sy); ctx.closePath(); ctx.stroke(); }
      ctx.lineWidth = 1;
      ctx.textAlign = 'left';
      ctx.fillText(String(g.id).padStart(2, '0') + (dy >= 0 ? ' ▲' : ' ▼') + Math.abs(Math.round(dy)), sx + 10, sy - 2);
      if (g.id === auswahl) { ctx.strokeStyle = FARBE.wahl; ctx.strokeRect(sx - 11, sy - 11, 22, 22); }
      if (g.id === vorgabe) {
        ctx.strokeStyle = FARBE.vorgabe; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(sx, sy, 14, 0, 2 * Math.PI);
        ctx.moveTo(sx - 20, sy); ctx.lineTo(sx - 9, sy); ctx.moveTo(sx + 9, sy); ctx.lineTo(sx + 20, sy);
        ctx.moveTo(sx, sy - 20); ctx.lineTo(sx, sy - 9); ctx.moveTo(sx, sy + 9); ctx.lineTo(sx, sy + 20); ctx.stroke(); ctx.lineWidth = 1;
      }
    }
    // Eigenes Schiff: Rumpf-Umriss in Bugrichtung (mindestens 18 px lang — WARUM: 255 m sind bei 3,5 km nur 9 px)
    zuWelt(z, VOR, bug);
    const kurs = Math.atan2(-bug.x, bug.z), L = Math.max(18, 255 * kk), Bb = L * 0.22;
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(kurs);
    ctx.strokeStyle = FARBE.schiff; ctx.fillStyle = 'rgba(120, 255, 160, 0.2)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(0, -L / 2); ctx.lineTo(Bb, -L * 0.15); ctx.lineTo(Bb, L / 2); ctx.lineTo(-Bb, L / 2); ctx.lineTo(-Bb, -L * 0.15); ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, -L / 2); ctx.lineTo(0, -L / 2 - 26); ctx.stroke(); // Bugstrich
    ctx.restore(); ctx.lineWidth = 1;
    // Kopfzeile auf dem Schirm
    ctx.fillStyle = FARBE.ringText; ctx.textAlign = 'left';
    ctx.fillText('MASSSTAB ' + (massstab / 1000).toFixed(1) + ' km · BUG ' + grad(kurs) + ' · SENSOR ' + (W.sensorReichweite / 1000).toFixed(1) + ' km', 8, 12);
    if (kursWahl) { ctx.fillStyle = FARBE.kurs; ctx.fillText('KURSWAHL: Punkt auf dem Schirm anklicken', 8, hoehe - 12); }
  }

  return {
    zeichne, spurTakt, MASSSTAEBE,
    get massstab() { return massstab; }, set massstab(m) { massstab = m; },
    get kursWahl() { return kursWahl; }, setzeKursWahl(b) { kursWahl = !!b; },
    get auswahl() { return auswahl; }, set auswahl(id) { auswahl = id; },
  };
}
