// ZWECK: Tastatur + Maus → ein Befehl für die Steuer-Station und Kamera-/Bedien-Einmaltasten.
// LIEFERT: leseEingabe() → { befehl: {hebel, stopp, gieren, nicken, rollen, quer, hoch, nachbrenner, daempferUmschalten},
//          kamera, hilfe, neustart, maus: {dx, dy, rad} }
// REGEL: `befehl` hat genau die Form, die sim/schiff.js erwartet — später kommt er von der Steuer-Station über das Netz.

const gedrueckt = new Set();
const einmal = new Set();
let mausDx = 0, mausDy = 0, rad = 0, ziehen = false;

addEventListener('keydown', (e) => {
  if (!gedrueckt.has(e.code)) einmal.add(e.code);
  gedrueckt.add(e.code);
  if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault();
});
addEventListener('keyup', (e) => gedrueckt.delete(e.code));
addEventListener('blur', () => { gedrueckt.clear(); ziehen = false; });
addEventListener('pointerdown', (e) => {
  if (e.button !== 0 || e.target?.id !== 'leinwand') return;
  ziehen = true; e.target.setPointerCapture?.(e.pointerId); document.body.classList.add('zieht');
});
addEventListener('pointerup', () => { ziehen = false; document.body.classList.remove('zieht'); });
addEventListener('pointercancel', () => { ziehen = false; document.body.classList.remove('zieht'); });
addEventListener('pointermove', (e) => { if (ziehen) { mausDx += e.movementX; mausDy += e.movementY; } });
addEventListener('wheel', (e) => { if (e.target?.id === 'leinwand') rad += Math.sign(e.deltaY); }, { passive: true });

export function leseEingabe() {
  const hat = (...c) => c.some((k) => gedrueckt.has(k));
  const achse = (plus, minus) => (hat(...plus) ? 1 : 0) - (hat(...minus) ? 1 : 0);
  const e = {
    befehl: {
      hebel: achse(['KeyW'], ['KeyS']),
      stopp: einmal.has('KeyX'),
      gieren: achse(['KeyA'], ['KeyD']),
      nicken: achse(['ArrowUp'], ['ArrowDown']),      // ↑ = Nase hoch
      rollen: achse(['KeyE'], ['KeyQ']),               // E = Rolle rechts
      quer: achse(['ArrowLeft'], ['ArrowRight']),      // ← = seitlich nach links
      hoch: achse(['KeyR'], ['KeyF']),
      nachbrenner: hat('ShiftLeft', 'ShiftRight'),
      daempferUmschalten: einmal.has('KeyT'),
    },
    kamera: einmal.has('KeyC'),
    hilfe: einmal.has('KeyH'),
    neustart: einmal.has('KeyN'),
    maus: { dx: mausDx, dy: mausDy, rad },
  };
  einmal.clear();
  mausDx = 0; mausDy = 0; rad = 0;
  return e;
}
