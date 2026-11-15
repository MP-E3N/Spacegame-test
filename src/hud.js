// ZWECK: Schlichte Anzeige der Steuer-Station: Fahrt, Schubhebel, Dämpfer, Nachbrenner, Meldungen, Hilfe.
// LIEFERT: zeigeHud(z, vLokal) · zeigeMeldung(text) · zeigeSchiff(text) · hilfeUmschalten() · ladenFertig()
// REGEL: liest nur; DOM-Elemente einmal suchen, nur bei Änderung schreiben.

const $ = (id) => document.getElementById(id);
const el = { fahrt: $('fahrt'), hebel: $('hebel-balken'), hebelWert: $('hebel-wert'), daempfer: $('daempfer'), nb: $('nachbrenner'), drift: $('drift'), meldung: $('meldung'), hilfe: $('hilfe') };
const alt = {};
const setze = (k, text) => { if (alt[k] !== text) { el[k].textContent = text; alt[k] = text; } };
let meldungBis = 0;

export function zeigeHud(z, vl) {
  setze('fahrt', Math.round(vl.z).toString());
  const h = z.hebel;
  // Balken: 0 liegt bei 20 % Höhe (Rückwärtsbereich darunter)
  const unten = h >= 0 ? 20 : 20 + h / 0.25 * 20, hoehe = Math.abs(h >= 0 ? h * 80 : h / 0.25 * 20);
  el.hebel.style.bottom = unten + '%'; el.hebel.style.height = hoehe + '%';
  el.hebel.classList.toggle('rueck', h < 0);
  setze('hebelWert', h >= 0 ? Math.round(h * 100) + ' %' : 'RÜCK ' + Math.round(-h / 0.25 * 100) + ' %');
  setze('daempfer', z.daempfer ? 'DÄMPFER EIN' : 'DÄMPFER AUS');
  el.daempfer.classList.toggle('aus', !z.daempfer);
  el.nb.classList.toggle('an', z.nachbrenner > 0.05);
  const quer = Math.hypot(vl.x, vl.y);
  setze('drift', quer > 1 ? 'DRIFT ' + Math.round(quer) + ' m/s' : '');
  if (meldungBis && performance.now() > meldungBis) { el.meldung.classList.remove('sichtbar'); meldungBis = 0; }
}

export function zeigeMeldung(text) {
  el.meldung.textContent = text; el.meldung.classList.add('sichtbar');
  meldungBis = performance.now() + 2200;
}
export function hilfeUmschalten() { el.hilfe.classList.toggle('versteckt'); }
export function zeigeSchiff(text) { const k = document.querySelector('#station .kopf'); if (k) k.textContent = 'STEUER · ' + text; }
export function ladenFertig() { $('laden')?.remove(); }
