// ZWECK: Reglerfeld des Flak-Labors (Runde 11, Nutzer: „Schieberegler … mit Werten, damit wir diese als Konfig nehmen
//        können“). Baut Schieberegler aus einer Tabelle, schreibt die Werte live in Zielobjekte (befehl.streu → Sim,
//        grafik.regler → nur Grafik), merkt sie im Browser und gibt sie als JSON-Konfig aus.
// LIEFERT: erstelleReglerfeld({ wurzel, gruppen, schluessel, aenderung }) → { konfig(), setze(konfig), standard(), umschalten() }
//          gruppen = [{ titel, ziel: () => Objekt, eintraege: [{ feld, name, min, max, schritt, einheit?, hilfe? }] }]
//          Standardwert = Wert im Zielobjekt beim Aufbau (kommt aus TURMKI / Grafik-Vorgaben — eine Quelle).
// REGEL: Die Sim bekommt Werte NUR über das Befehlsobjekt (deterministisch, Gleichlauf) — nie direkt in Sim-Konstanten.

/** Zahl schön anzeigen: ganze Zahlen ohne Nachkomma, sonst 2 Stellen. */
const zeige = (v, schritt) => (schritt >= 1 ? String(Math.round(v)) : (Math.round(v * 100) / 100).toFixed(2));

export function erstelleReglerfeld({ wurzel, gruppen, schluessel = 'schwarmfront.flaklabor.konfig', aenderung = () => {} }) {
  const eintraege = []; // { gruppe, e, eingabe, wert }
  const standardWerte = {};

  for (const g of gruppen) {
    const ziel = g.ziel();
    const kasten = document.createElement('div');
    kasten.className = 'gruppe';
    const titel = document.createElement('span');
    titel.className = 'titel'; titel.textContent = g.titel;
    kasten.appendChild(titel);
    standardWerte[g.schluessel] = {};
    for (const e of g.eintraege) {
      standardWerte[g.schluessel][e.feld] = ziel[e.feld];
      const zeile = document.createElement('label');
      zeile.className = 'regler';
      if (e.hilfe) zeile.title = e.hilfe;
      const name = document.createElement('span'); name.className = 'name'; name.textContent = e.name;
      const wert = document.createElement('b'); wert.className = 'wert';
      const eingabe = document.createElement('input');
      eingabe.type = 'range'; eingabe.min = e.min; eingabe.max = e.max; eingabe.step = e.schritt;
      eingabe.value = ziel[e.feld];
      // WARUM keydown stoppen: sonst lösen Pfeiltasten/Leertaste im Regler zusätzlich die Labor-Tasten aus
      eingabe.addEventListener('keydown', (ev) => ev.stopPropagation());
      eingabe.addEventListener('input', () => { setzeWert(g, e, Number(eingabe.value)); merken(); aenderung(); });
      zeile.append(name, wert, eingabe);
      kasten.appendChild(zeile);
      const eintrag = { g, e, eingabe, wert };
      eintraege.push(eintrag);
      anzeigen(eintrag);
    }
    wurzel.appendChild(kasten);
  }

  function anzeigen({ g, e, wert }) { wert.textContent = zeige(g.ziel()[e.feld], e.schritt) + (e.einheit ? ' ' + e.einheit : ''); }
  function setzeWert(g, e, v) {
    g.ziel()[e.feld] = Math.max(e.min, Math.min(e.max, v));
    for (const x of eintraege) if (x.g === g && x.e === e) { x.eingabe.value = g.ziel()[e.feld]; anzeigen(x); }
  }

  /** Aktuelle Werte als Konfig-Objekt { gruppe: { feld: wert } }. */
  function konfig() {
    const k = {};
    for (const { g, e } of eintraege) (k[g.schluessel] ??= {})[e.feld] = g.ziel()[e.feld];
    return k;
  }
  /** Konfig übernehmen (unbekannte Felder werden ignoriert). */
  function setze(k) {
    for (const { g, e } of eintraege) {
      const v = k?.[g.schluessel]?.[e.feld];
      if (typeof v === 'number' && Number.isFinite(v)) setzeWert(g, e, v);
    }
    merken(); aenderung();
  }
  function standard() { setze(standardWerte); }
  function merken() { try { localStorage.setItem(schluessel, JSON.stringify(konfig())); } catch { /* privat/voll: egal */ } }

  // Gemerkte Werte vom letzten Besuch übernehmen
  try { const alt = JSON.parse(localStorage.getItem(schluessel) || 'null'); if (alt) setze(alt); } catch { /* kaputt: Standard */ }

  return { konfig, setze, standard, standardWerte };
}
