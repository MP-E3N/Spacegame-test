// ZWECK: Startmenü (Runde 14) — Auswahl Gefechtstest / Flak-Labor / Freiflug / Werft (R15), Tastatur + Maus, ruhiges Sternenfeld.
// LIEFERT: nichts (Seitenskript). Die Unterseiten binden src/menue/zurueck.js ein (Esc = zurück zum Menü).
// REGEL: Kein three — das Menü soll sofort da sein. Sterne mit eigenem kleinen Zufall (Optik, keine Sim).

const leinwand = document.getElementById('sterne');
const ctx = leinwand.getContext('2d');
let w = 0, h = 0;
function groesse() { w = leinwand.width = innerWidth * devicePixelRatio; h = leinwand.height = innerHeight * devicePixelRatio; }
addEventListener('resize', groesse); groesse();

// Sterne: fester Startwert → jedes Mal derselbe Himmel
let s = 12345;
const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
const STERNE = Array.from({ length: 420 }, () => ({ x: rnd(), y: rnd(), z: 0.2 + rnd() * 0.8, h: 0.35 + rnd() * 0.65 }));

function zeichne(t) {
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, w, h);
  // schwacher Gasriesen-Schimmer unten rechts
  const g = ctx.createRadialGradient(w * 0.82, h * 1.05, 0, w * 0.82, h * 1.05, h * 0.75);
  g.addColorStop(0, 'rgba(120, 80, 40, 0.28)'); g.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  for (const st of STERNE) {
    const x = ((st.x + t * 0.000004 * st.z) % 1) * w, y = st.y * h, r = st.z * 1.4 * devicePixelRatio;
    ctx.fillStyle = `rgba(255, 240, 220, ${st.h * st.z})`;
    ctx.fillRect(x, y, r, r);
  }
  requestAnimationFrame(zeichne);
}
requestAnimationFrame(zeichne);

// Auswahl
const eintraege = [...document.querySelectorAll('#menue .eintrag')];
let wahl = 0;
function markiere(i) { wahl = (i + eintraege.length) % eintraege.length; eintraege.forEach((e, k) => e.classList.toggle('aktiv', k === wahl)); }
eintraege.forEach((e, k) => e.addEventListener('mouseenter', () => markiere(k)));
addEventListener('keydown', (e) => {
  if (e.key === 'ArrowDown') { markiere(wahl + 1); e.preventDefault(); }
  else if (e.key === 'ArrowUp') { markiere(wahl - 1); e.preventDefault(); }
  else if (e.key === 'Enter') eintraege[wahl].click();
  else { const k = eintraege.findIndex((x) => x.dataset.nr === e.key); if (k >= 0) eintraege[k].click(); }
});
markiere(0);
