// ZWECK: Knopf „Hintergrund: Weltall ↔ Studio“ für die Editoren (Runde 21, Nutzer: „gib mir eine Option, den Hintergrund
//        zu wechseln — mal Weltall, mal Designstudio mit weiß-grauem Hintergrund“).
// LIEFERT: stimmungsKnopf(knopf, bild, nachher?) → { name, setze(name) } — merkt die Wahl für Werkstatt UND Werft.
// REGEL: Licht/Hintergrund stellt allein bild.setzeStimmung (Lichtsetzer, renderer.js) — nur per Klick, nie je Bild
//        (das erste „studio“ backt die Umgebung einmal). nachher(name) = Seite passt eigene Hilfen an (Raster-Farben).
const SCHLUESSEL = 'schwarmfront-editor-stimmung';
const NAMEN = { weltall: 'Weltall', studio: 'Studio' };

export function stimmungsKnopf(knopf, bild, nachher) {
  let name = 'weltall';
  try { if (localStorage.getItem(SCHLUESSEL) === 'studio') name = 'studio'; } catch { /* ohne Speicher */ }
  function setze(n) {
    name = n === 'studio' ? 'studio' : 'weltall';
    bild.setzeStimmung(name);
    document.body.classList.toggle('studio', name === 'studio'); // Seiten können Hilfen im Studio dunkler zeichnen
    nachher?.(name);
    knopf.textContent = '◐ Hintergrund: ' + NAMEN[name];
    knopf.title = name === 'studio' ? 'Zurück zum Weltall' : 'Designstudio: weiß-grauer Hintergrund, neutrales Licht';
    try { localStorage.setItem(SCHLUESSEL, name); } catch { /* egal */ }
  }
  knopf.addEventListener('click', () => setze(name === 'studio' ? 'weltall' : 'studio'));
  setze(name);
  return { get name() { return name; }, setze };
}
