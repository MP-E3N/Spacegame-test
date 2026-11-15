// ZWECK: Rumpf-Texturen aus Code (Canvas): Panzerplatten, Fugen, Nieten, Ruß, Warnstreifen, Schablonen-Ziffern;
//        dazu die Rumpf-Beschriftung als Abziehbild.
// LIEFERT: rumpfTexturen() → { farbe, rauheit, relief, KACHEL } · beschriftung(text, klein) → CanvasTexture
// REGEL: eine Kachel = KACHEL Meter Rumpf (Box-Projektion in modell.js). Gleiche Aufteilung in allen drei Karten.
// WARUM Relief statt Normalmap: bumpMap braucht keine Tangenten — die Box-Projektion liefert keine.
import * as THREE from 'three';
import { zufall } from '../zufall.js';

const PX = 1024;
export const KACHEL = 16; // m

function leinwand() { const c = document.createElement('canvas'); c.width = c.height = PX; return [c, c.getContext('2d')]; }

/** Rechteck rekursiv in Platten zerlegen. */
function platten(rnd, x, y, w, h, tiefe, aus) {
  const teile = tiefe > 0 && (w > 70 || h > 70) && rnd() < 0.85;
  if (!teile) { aus.push({ x, y, w, h }); return; }
  if (w > h * (0.7 + rnd() * 0.6)) {
    const s = Math.round(w * (0.3 + rnd() * 0.4) / 8) * 8;
    platten(rnd, x, y, s, h, tiefe - 1, aus); platten(rnd, x + s, y, w - s, h, tiefe - 1, aus);
  } else {
    const s = Math.round(h * (0.3 + rnd() * 0.4) / 8) * 8;
    platten(rnd, x, y, w, s, tiefe - 1, aus); platten(rnd, x, y + s, w, h - s, tiefe - 1, aus);
  }
}

export function rumpfTexturen() {
  const rnd = zufall(707);
  const [cf, f] = leinwand(), [cr, r] = leinwand(), [cb, b] = leinwand();
  const liste = [];
  const ZELLE = PX / 4; // 4 m Grundraster
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) platten(rnd, i * ZELLE, j * ZELLE, ZELLE, ZELLE, 4, liste);

  // ---------- Platten ----------
  for (const p of liste) {
    const t = rnd();
    const dunkel = t < 0.07, warm = t > 0.95;
    const g = dunkel ? 84 + rnd() * 10 : 110 + rnd() * 14; // WARUM wenig Streuung: aus 100 m wirkt mehr wie Mosaik
    const k = (rnd() - 0.5) * 6;
    f.fillStyle = warm ? `rgb(${g + 10},${g + 4},${g - 4})` : `rgb(${g + k},${g + 2 + k},${g + 5})`;
    f.fillRect(p.x, p.y, p.w, p.h);
    const ra = dunkel ? 170 : 120 + rnd() * 70; r.fillStyle = `rgb(${ra},${ra},${ra})`; r.fillRect(p.x, p.y, p.w, p.h);
    const hb = 120 + rnd() * 30; b.fillStyle = `rgb(${hb},${hb},${hb})`; b.fillRect(p.x, p.y, p.w, p.h);
    // feine Walzspuren
    f.globalAlpha = 0.05;
    for (let s = 0; s < 6; s++) { f.fillStyle = rnd() < 0.5 ? '#000' : '#fff'; f.fillRect(p.x, p.y + rnd() * p.h, p.w, 1 + rnd() * 2); }
    f.globalAlpha = 1;
  }
  // ---------- Fugen, Kantenabrieb, Nieten ----------
  for (const p of liste) {
    f.strokeStyle = 'rgb(38,39,41)'; f.lineWidth = 2.5; f.strokeRect(p.x + 0.5, p.y + 0.5, p.w, p.h);
    f.strokeStyle = 'rgba(190,192,195,0.35)'; f.lineWidth = 1;
    f.beginPath(); f.moveTo(p.x + 2, p.y + 2.5); f.lineTo(p.x + p.w - 2, p.y + 2.5); f.moveTo(p.x + 2.5, p.y + 2); f.lineTo(p.x + 2.5, p.y + p.h - 2); f.stroke();
    b.strokeStyle = 'rgb(0,0,0)'; b.lineWidth = 3; b.strokeRect(p.x + 0.5, p.y + 0.5, p.w, p.h);
    r.strokeStyle = 'rgb(235,235,235)'; r.lineWidth = 3; r.strokeRect(p.x + 0.5, p.y + 0.5, p.w, p.h);
    if (rnd() < 0.45) {
      const abstand = 10;
      const reihe = (x0, y0, x1, y1) => {
        const n = Math.floor(Math.hypot(x1 - x0, y1 - y0) / abstand);
        for (let s = 1; s < n; s++) {
          const x = x0 + (x1 - x0) * s / n, y = y0 + (y1 - y0) * s / n;
          f.fillStyle = 'rgba(60,60,62,0.9)'; f.beginPath(); f.arc(x, y, 1.6, 0, 7); f.fill();
          f.fillStyle = 'rgba(200,200,200,0.35)'; f.fillRect(x - 1, y - 1.2, 1, 1);
          b.fillStyle = 'rgb(220,220,220)'; b.beginPath(); b.arc(x, y, 1.8, 0, 7); b.fill();
        }
      };
      reihe(p.x + 6, p.y + 6, p.x + p.w - 6, p.y + 6);
      reihe(p.x + 6, p.y + p.h - 6, p.x + p.w - 6, p.y + p.h - 6);
    }
  }
  // ---------- Luken und Wartungsklappen ----------
  for (let i = 0; i < 26; i++) {
    const p = liste[Math.floor(rnd() * liste.length)];
    if (p.w < 40 || p.h < 40) continue;
    const w = Math.min(p.w - 16, 24 + rnd() * 50), h = Math.min(p.h - 16, 24 + rnd() * 50);
    const x = p.x + 8 + rnd() * (p.w - 16 - w), y = p.y + 8 + rnd() * (p.h - 16 - h);
    f.fillStyle = 'rgba(0,0,0,0.12)'; f.fillRect(x, y, w, h);
    f.strokeStyle = 'rgb(45,46,48)'; f.lineWidth = 1.5; f.strokeRect(x, y, w, h);
    b.strokeStyle = 'rgb(40,40,40)'; b.lineWidth = 2; b.strokeRect(x, y, w, h);
    if (rnd() < 0.5) { // Lüftungsschlitze
      for (let s = y + 5; s < y + h - 4; s += 5) {
        f.fillStyle = 'rgb(30,31,33)'; f.fillRect(x + 4, s, w - 8, 2);
        b.fillStyle = 'rgb(20,20,20)'; b.fillRect(x + 4, s, w - 8, 2);
      }
    }
  }
  // ---------- Warnstreifen und Schablonen-Ziffern ----------
  for (let i = 0; i < 3; i++) {
    const p = liste[Math.floor(rnd() * liste.length)];
    const h = 14, y = p.y + p.h - h - 6, x = p.x + 6, w = p.w - 12;
    if (w < 30) continue;
    f.save(); f.beginPath(); f.rect(x, y, w, h); f.clip();
    f.fillStyle = 'rgb(150,120,40)'; f.fillRect(x, y, w, h);
    f.fillStyle = 'rgb(35,33,30)';
    for (let s = -h; s < w + h; s += 16) { f.beginPath(); f.moveTo(x + s, y + h); f.lineTo(x + s + 8, y + h); f.lineTo(x + s + 8 + h, y); f.lineTo(x + s + h, y); f.fill(); }
    f.restore();
  }
  f.font = 'bold 22px monospace'; f.textBaseline = 'top';
  const ZEICHEN = ['07', 'A-12', 'B4', 'KÜHL', 'DRUCK', 'C-3', '17', 'NOT', 'E9', 'H-2'];
  for (let i = 0; i < 18; i++) {
    const p = liste[Math.floor(rnd() * liste.length)];
    if (p.w < 60 || p.h < 36) continue;
    f.fillStyle = rnd() < 0.7 ? 'rgba(215,215,205,0.55)' : 'rgba(190,150,60,0.6)';
    f.fillText(ZEICHEN[Math.floor(rnd() * ZEICHEN.length)], p.x + 8, p.y + 8);
  }
  // ---------- Ruß und Schmutzfahnen ----------
  for (let i = 0; i < 140; i++) {
    const x = rnd() * PX, y = rnd() * PX, l = 20 + rnd() * 120, w = 2 + rnd() * 10;
    const g = f.createLinearGradient(x, y, x, y + l);
    g.addColorStop(0, `rgba(25,24,22,${0.15 + rnd() * 0.25})`); g.addColorStop(1, 'rgba(25,24,22,0)');
    f.fillStyle = g; f.fillRect(x, y, w, l);
    r.fillStyle = 'rgba(230,230,230,0.25)'; r.fillRect(x, y, w, l * 0.6);
  }
  for (let i = 0; i < 40; i++) {
    const x = rnd() * PX, y = rnd() * PX, rr = 15 + rnd() * 70;
    const g = f.createRadialGradient(x, y, 0, x, y, rr);
    g.addColorStop(0, `rgba(20,19,18,${0.12 + rnd() * 0.2})`); g.addColorStop(1, 'rgba(20,19,18,0)');
    f.fillStyle = g; f.fillRect(x - rr, y - rr, rr * 2, rr * 2);
  }
  // Kratzer (hell, metallisch)
  for (let i = 0; i < 260; i++) {
    const x = rnd() * PX, y = rnd() * PX, w = rnd() * 2 * Math.PI, l = 3 + rnd() * 18;
    f.strokeStyle = `rgba(185,188,190,${0.1 + rnd() * 0.25})`; f.lineWidth = 0.8;
    f.beginPath(); f.moveTo(x, y); f.lineTo(x + Math.cos(w) * l, y + Math.sin(w) * l); f.stroke();
  }

  const tex = (c, srgb) => {
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.anisotropy = 8;
    return t;
  };
  return { farbe: tex(cf, true), rauheit: tex(cr, false), relief: tex(cb, false), KACHEL };
}

/** Schablonen-Schrift mit Abrieb auf durchsichtigem Grund (Seitenverhältnis 6:1). */
export function beschriftung(text, unter = '') {
  const c = document.createElement('canvas'); c.width = 1536; c.height = 256;
  const k = c.getContext('2d');
  const rnd = zufall(text.length * 31 + 5);
  k.fillStyle = 'rgb(205,203,192)';
  k.font = 'bold 170px Impact, "Arial Black", sans-serif';
  k.textBaseline = 'middle';
  k.fillText(text, 30, unter ? 110 : 128);
  if (unter) { k.font = 'bold 54px monospace'; k.fillStyle = 'rgb(180,150,60)'; k.fillText(unter, 36, 215); }
  // Schablonen-Stege und Abrieb: Löcher ausstanzen
  k.globalCompositeOperation = 'destination-out';
  for (let x = 30; x < 1536; x += 105) k.fillRect(x + rnd() * 30, 0, 6, 256);
  for (let i = 0; i < 2600; i++) { k.globalAlpha = 0.3 + rnd() * 0.7; k.beginPath(); k.arc(rnd() * 1536, rnd() * 256, rnd() * 4, 0, 7); k.fill(); }
  k.globalAlpha = 1; k.globalCompositeOperation = 'source-over';
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}
