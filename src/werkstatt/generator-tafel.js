// ZWECK: Bedienung des Schiffsgenerators in der Form-Werkstatt (Runde 20, Nutzer: „Seed-Feld + wenige Regler, Knopf
//        Würfeln, Favoriten; Ergebnis eine ganz normale Werkstatt-Form, voll editierbar, sofort flugtauglich“).
// LIEFERT: erstelleGeneratorTafel({ uebernimm, meldung }) → { offen(), wuerfeln(), einstellung() }
// REGEL: Rechnung NUR in src/sim/form/generator.js (Schiffbauer); hier nur Felder, Regler (generisch aus GENERATOR_REGLER,
//        Lehre R11: eine Quelle) und Favoriten (localStorage). Jede Erzeugung geht über uebernimm(form, merken) → Strg+Z
//        holt die vorige Form zurück. Beim Regler-Ziehen nur EIN Rückgängig-Schritt (merken nur beim ersten „input“).
import { KLASSEN, GENERATOR_REGLER, GENERATOR_VERSION, standardEinstellung, generiere } from '../sim/form/generator.js';

const $ = (id) => document.getElementById(id);
const FAV = 'schwarmfront-werkstatt-favoriten';
const LETZTE = 'schwarmfront-werkstatt-generator';
const neuerSeed = () => 1 + Math.floor(Math.random() * 99999); // WARUM Math.random erlaubt: Seite, nicht Sim — der Seed selbst macht das Ergebnis reproduzierbar

export function erstelleGeneratorTafel({ uebernimm, meldung }) {
  let einst = ladeLetzte() ?? standardEinstellung('fregatte');
  let zugLaeuft = false;      // Regler wird gerade gezogen → nur der erste Schritt kommt ins Rückgängig
  let favorit = null;         // Name des zuletzt geladenen Favoriten (für „löschen“)
  let uhr = 0;

  $('g-klasse').innerHTML = Object.entries(KLASSEN).map(([k, v]) => `<option value="${k}">${v.name}</option>`).join('');
  const regler = $('g-regler');
  for (const [feld, r] of Object.entries(GENERATOR_REGLER)) {
    const zeile = document.createElement('label'); zeile.className = 'regler'; zeile.title = r.tipp ?? '';
    zeile.innerHTML = `<span>${r.name}</span><input type="range" min="${r.min}" max="${r.max}" step="${r.schritt}" data-feld="${feld}" /><b></b>`;
    regler.append(zeile);
    const ein = zeile.querySelector('input');
    ein.addEventListener('input', () => { einst = { ...einst, [feld]: +ein.value }; zeigeWerte(); bald(!zugLaeuft); zugLaeuft = true; });
    ein.addEventListener('change', () => { zugLaeuft = false; });
  }

  function zeigeWerte() {
    $('g-klasse').value = einst.klasse; $('g-seed').value = einst.seed;
    for (const ein of regler.querySelectorAll('input')) {
      const r = GENERATOR_REGLER[ein.dataset.feld], v = einst[ein.dataset.feld] ?? r.standard;
      ein.value = v; ein.nextElementSibling.textContent = r.text ? r.text(v, einst) : String(v);
    }
  }
  /** Erzeugen kurz verzögert (Regler-Ziehen soll nicht jeden Pixel neu verschweißen) — merken gilt für diesen Schritt. */
  // WARUM Merker statt Parameter: das Verzögern verwirft frühere Aufrufe — sonst ginge ausgerechnet der erste Schritt
  // (der einzige mit merken) verloren und Strg+Z fände die Form vor dem Regler-Ziehen nicht mehr
  let merkenOffen = false;
  function bald(merken) {
    clearTimeout(uhr);
    if (merken) merkenOffen = true;
    uhr = setTimeout(() => { const m = merkenOffen; merkenOffen = false; erzeuge(m); }, 60);
  }
  function erzeuge(merken = true) {
    const t0 = performance.now();
    let form;
    try { form = generiere(einst); } catch (f) { meldung('Generator-Fehler: ' + f.message); console.error(f); return; }
    const ms = performance.now() - t0;
    try { localStorage.setItem(LETZTE, JSON.stringify(einst)); } catch { /* egal */ }
    const info = uebernimm(form, merken);
    $('g-info').textContent = `${form.koerper.length} Körper · ${form.bauteile.length} Bauteile · ${ms.toFixed(1)} ms` + (info ? ' · ' + info : '');
  }

  $('g-auf').addEventListener('click', () => {
    const auf = $('generator').classList.toggle('versteckt') === false;
    $('g-auf').classList.toggle('an', auf);
    if (auf) { zeigeWerte(); meldung('Generator: Klasse wählen, Regler ziehen oder 🎲 Würfeln — Strg+Z holt die vorige Form zurück'); }
  });
  $('g-klasse').addEventListener('change', (e) => {
    // WARUM Standard der neuen Klasse: Länge/Breite einer Korvette passen nicht zum Träger
    einst = { ...standardEinstellung(e.target.value), seed: einst.seed }; zeigeWerte(); erzeuge();
  });
  $('g-seed').addEventListener('change', (e) => { const s = Math.max(1, Math.round(+e.target.value) || 1); einst = { ...einst, seed: s }; zeigeWerte(); erzeuge(); });
  $('g-wuerfel').addEventListener('click', () => wuerfeln());
  $('g-standard').addEventListener('click', () => { einst = { ...standardEinstellung(einst.klasse), seed: einst.seed }; zeigeWerte(); erzeuge(); });

  // ---------------- Favoriten ----------------
  const favoriten = () => { try { return JSON.parse(localStorage.getItem(FAV)) ?? []; } catch { return []; } };
  const schreibe = (l) => { try { localStorage.setItem(FAV, JSON.stringify(l)); } catch { meldung('Favoriten konnten nicht gespeichert werden'); } };
  function zeigeFavoriten() {
    $('g-favoriten').innerHTML = '<option value="">★ Favoriten …</option>' +
      favoriten().map((f, i) => `<option value="${i}">${f.name.replace(/</g, '&lt;')}</option>`).join('');
  }
  $('g-merken').addEventListener('click', () => {
    const name = `${KLASSEN[einst.klasse]?.name ?? einst.klasse} ${einst.seed}`;
    const l = favoriten().filter((f) => f.name !== name);
    l.unshift({ name, einst, version: GENERATOR_VERSION }); schreibe(l.slice(0, 40)); zeigeFavoriten(); favorit = name;
    meldung(`★ „${name}“ gemerkt — unter Favoriten wieder abrufbar`);
  });
  $('g-favoriten').addEventListener('change', (e) => {
    const i = e.target.value; e.target.value = ''; if (i === '') return;
    const f = favoriten()[+i]; if (!f) return;
    einst = { ...standardEinstellung(f.einst.klasse), ...f.einst }; favorit = f.name; zeigeWerte(); erzeuge();
    // WARUM Hinweis: Favoriten speichern nur die Einstellung — ändert sich der Generator, sieht das Schiff anders aus
    meldung(f.version === GENERATOR_VERSION ? `★ „${f.name}“ geladen` : `★ „${f.name}“ geladen — von einem älteren Generator, kann anders aussehen (Speichern hält eine Form fest)`);
  });
  $('g-vergessen').addEventListener('click', () => {
    if (!favorit) { meldung('Erst einen Favoriten laden — dann lässt er sich hier löschen'); return; }
    schreibe(favoriten().filter((f) => f.name !== favorit)); zeigeFavoriten(); meldung(`Favorit „${favorit}“ gelöscht`); favorit = null;
  });
  zeigeFavoriten();

  function wuerfeln() {
    einst = { ...einst, seed: neuerSeed() }; favorit = null; zeigeWerte(); erzeuge();
  }
  function ladeLetzte() {
    try { const e = JSON.parse(localStorage.getItem(LETZTE)); return e && KLASSEN[e.klasse] ? { ...standardEinstellung(e.klasse), ...e } : null; } catch { return null; }
  }
  return { offen: () => !$('generator').classList.contains('versteckt'), wuerfeln, einstellung: () => ({ ...einst }) };
}
