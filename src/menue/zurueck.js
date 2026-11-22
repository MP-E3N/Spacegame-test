// ZWECK: Rückweg ins Startmenü für jede Unterseite (Runde 14): Knopf unten rechts + Taste Esc.
// LIEFERT: nichts (Seitenskript, per <script type="module" src="/src/menue/zurueck.js"> eingebunden).
// REGEL: Esc nur, wenn nicht gerade in einem Eingabefeld getippt wird.
const knopf = document.createElement('a');
knopf.id = 'zum-menue'; knopf.href = '/'; knopf.innerHTML = '<b>Esc</b>Menü';
(document.getElementById('hud') ?? document.body).appendChild(knopf);
addEventListener('keydown', (e) => {
  // WARUM defaultPrevented: eine Seite darf Esc vorher selbst nutzen (Werft R15: erst Auswahl aufheben)
  if (e.key !== 'Escape' || e.defaultPrevented) return;
  const ziel = e.target;
  if (ziel instanceof HTMLInputElement || ziel instanceof HTMLTextAreaElement || ziel instanceof HTMLSelectElement) { ziel.blur(); return; }
  location.href = '/';
});
