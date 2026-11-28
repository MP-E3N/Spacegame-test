// ZWECK: Turm-KI des Flak-Labors — entscheidet je Turm und Schritt, WOHIN gerichtet wird, WANN gefeuert wird, WANN die
//        Granate zündet und ob sie Leuchtspur trägt.
//        · sperrfeuer, folgen (Standard, R10 „Sättigungsräume“, Nutzer: „In Richtung der Gefahr wird einfach der Raum
//          gesättigt, es gibt recht wenig gezieltes Feuer“): die Drohnen werden in bis zu 3 Gruppen geteilt (Lücken in
//          Metern), je Gruppe ein Raum auf der vorausgesagten Lage, halbe Breite/Höhe = Streuung + 340 m (360–450 m),
//          gestaffelt in 3 TIEFENLAGEN längs der geglätteten Flugrichtung der Gruppe (vor / auf / hinter, Abstand
//          0,6·Tempo·Flugzeit, 80–150 m). Jedes Rohr hat eine feste Lage (vordere zuerst) und streicht sie im
//          Dreieck-Lissajous-Muster (Gier, Nick, Abstand); jede Granate fliegt in eine Sperr-Kugel 120 m quer / 80 m tief.
//          R12 (Nutzer: „Die Flak-Explosionen viel mehr verteilen, also die Area um die feindlichen Objekte größer
//          machen — gern auch als konfigurierbaren Slider“): Raum nur noch geometrisch begrenzt (0,8 / 0,45 rad);
//          größerer Raum → LANGSAMERES Muster (Periode wächst), nicht kleinerer Raum; Musterphase je Raum aufintegriert.
//        · sperrfeuer, folgen === false: fester Sektor + befehl.schirmAbstand. Der Sektor ist der beim Umschalten
//          gemerkte (Mitte + Breite des größten Schirms, „Wand bleibt, wo sie ist“), ohne Schirm STANDARD_SEKTOR;
//          befehl.sektor überschreibt ihn ausdrücklich. Abstand gleitet mit ≤ 150 m/s; Umschalten in beide
//          Richtungen ohne Sprung (Befund Prüfer R7).
//        · zielfeuer: Zielwahl mit Gewichten + Trägheit, höchstens 2 Türme je Ziel, Vorhalt aus der Abfang-Gleichung.
//        · Killzone (beide Betriebsarten): Drohne < 500 m → Eindringling (aus erst > 600 m); die 2–3 nächsten Türme
//          schießen Zielgranaten auf ihn; solange der Nahbereich aktiv ist (+0,5 s Nachlauf) → leuchtspur für ALLE Türme.
// LIEFERT: erstelleTurmKi({ startwert }) → { befehle, lage, schritt(dt, befehl, ziele, turmZustand) → befehle,
//          zuruecksetzen(), statistik } · TURMKI (Werte) · STREU_REGLER · streuWert(streu, feld) · waffeWert(waffe, feld) · abfangen(m, pos, vel, v0, aus) (für Tests)
//          befehle[i] = { turmId, zielId|null, punkt{x,y,z} (Welt bzw. Schiffsrahmen, mit Vorhalt), feuer, toleranz (rad), zuender (s), leuchtspur,
//          streuKugel (m, 0 = aus), streuTiefe (m), munition ('flak' | 'panzer', R23; Gatlings immer 'flak') }
//        · streuKugel / streuTiefe (R8/R10, Nutzer: „jedes Ziel hat eine unsichtbare Kugel um sich“, R10: „das Areal um
//          ein Ziel noch viel weiter gestreut sättigen“): Ellipsoid um `punkt` — streuKugel quer zur Schusslinie,
//          streuTiefe längs (über den Zünder). Die Waffe schießt jede Granate auf einen eigenen Punkt darin und deckelt
//          (quer 0,10·d mit / deckelQuer·d ohne Leuchtspur, längs deckelTiefe·d; Werte in FLAK/WAFFEN_REGLER).
//          Zielfeuer/Sperrraum nach STREU_REGLER (R14: T1 135 bzw. 200/200 m), Nahbereich min(35, 0,10·d), feste Wand/kein Ziel 0. Vorhalt immer mit dem AKTUELLEN turmZustand[i].v0.
//          lage = { nahbereich (bool), schirme: [{ mitte{x,y,z}, abstand, gierHalb, nickHalb, tuerme[], gier, nick,
//          sollGier, sollNick, sollAbstand, breite, hoehe, tiefeHalb (m, halbe Kastenmaße), laengs{x,y,z} (Einheit,
//          „vor“), lagenAbstand (m), lagen[{x,y,z}] (Mitten vor/auf/hinter, Welt) }], eindringlinge: [id] } — Objekte/Arrays werden wiederverwendet.
//        · befehl.streu (R11, Nutzer: „Schieberegler, mit denen ich anpassen kann, wie weit die Explosionen auseinander
//          sein sollen … mit Werten, damit wir diese als Konfig nehmen können“): { faktor, sperrQuer, sperrTiefe,
//          raumZuschlag, ziel, nahMax, lagenAnteil } — Bereiche/Standard in STREU_REGLER (eine Quelle für Seite und KI);
//          fehlt/NaN → Standard, sonst geklammert. Ohne streu = mit Standardwerten (bitgleich).
//          faktor (R12, Gesamtregler „Streuung ×“): multipliziert sperrQuer, sperrTiefe, raumZuschlag, ziel und die
//          Raum-Obergrenzen (quer 450 m, Tiefe 120 m); NICHT nahMax (Leuchtspur-Deckel 0,10·d) und lagenAnteil (Tempo ×
//          Flugzeit ist Physik, keine Streuung).
//        · R14 (Nutzer: „Schiff fliegen und von gegnerischen Schiffen angegriffen werden“): erstelleTurmKi({ startwert,
//          lafetten, mitte, sektor, killzone, erreichbar }) — ohne Angaben = Prüfstand (bitgleich R13). Am Schiff:
//          lafetten = Flaktürme des Schiffs (Schiffs-Lokal, Felder wie turmDaten()), mitte = Schiffsmitte, Ziele und
//          turmZustand[i].muendung im SCHIFFSRAHMEN (Momentaufnahme, s. schiffsrahmen.js), befehle[i].punkt ebenso.
//          Grenzen je Turm im TURM-RAHMEN (oben: Schiff = Turm, verschoben; unten: Turm (x,y,z) → Schiff (−x,−y,z),
//          turm.js): Zielwahl, Zenit-Bremse und Raumzuteilung prüfen die Erreichbarkeit; erreichbar(i, gier, nick) der
//          Waffe (Grenzen + Nachbar- + Rumpf-Sperre) ersetzt die eigene Grenzprüfung, sobald übergeben.
//        · R23 (Nutzer: „mach die Türme alle funktionsfähig“, „die großen Batteriegeschütze mit zwei Munitionstypen“, CIC
//          mit Waffenoffizier, Richtschützen; Schnittstelle E3 im Protokoll R23): lafetten enthalten auch `typ: 'schwer'`
//          (Hauptbatterie). Schwere Türme nehmen NICHT an Räumen/Killzone/Gatling-Zielwahl teil, sondern haben eine eigene
//          Zielwahl (schwerSchritt): Zielfeuer auf große/gepanzerte Ziele (r ≥ 12 oder panzer ≥ 0,5) bzw. die
//          zielVorgabe — gewichtet nach Bedrohung, Abstand, Erreichbarkeit, mit Trägheit; sonst Flak-Großgranaten in die
//          Sättigungsräume, eine Lagenbreite VOR der vorderen Lage („weiter draußen als die Gatlings“); ohne Räume
//          (Zielfeuer-Betrieb) Flak-Zielfeuer auf das beste erreichbare Ziel. befehle[i].munition: Ziel panzer ≥ 0,5 →
//          'panzer', sonst 'flak'; befehl.hauptMunition ('auto' | fehlt | 'flak' | 'panzer') überschreibt (bei
//          'panzer' jedes Ziel, kein Raumfeuer). Panzergranate: streuKugel 0, toleranz aus dem Zielradius.
//          befehl.manuell = Turm-Index unter Handsteuerung (−1/fehlt = keiner): feuer false, zielId null, nicht in
//          Raum-Zuteilung/Killzone (punkt bleibt — den setzt der Richtschütze). befehl.zielVorgabe = zielId (CIC):
//          Gatling-Zielfeuer (+1,0) und schwere Türme (+3,0) bevorzugen es, Wechsel sofort (ohne Haltezeit).
//          Gatlings bewerten gepanzerte Ziele schwächer (× (1 − 0,6·panzer)), in der Killzone kommen sie zuletzt dran.
//          Ohne schwere Türme, manuell und zielVorgabe: bitgleich R22 (alle neuen Zweige hängen an diesen Feldern).
// REGEL: Die KI ENTSCHEIDET, die Waffen (flak.js) FÜHREN AUS (Richten mit Grenzen, Feuern bei `ausgerichtet`).
//        Simulation: kein DOM, kein Math.random, fester Schritt; keine neuen Objekte im Schritt.
//        Abschuss-Zeitpunkt = aktuelle Drohnen-Lage (Schrittfolge Drohnen → Turm-KI → Waffen).
import { zufall } from '../zufall.js';
import { LAFETTEN, BATTERIE_MITTE, STANDARD_SEKTOR } from '../waffen/lafetten.js';
import { FLAK, WAFFEN_REGLER } from '../waffen/flak.js';

// Deckel der Waffe (R10, Entscheidung 1): die KI liest sie aus FLAK, statt sie doppelt zu führen (· Entfernung ab Mündung).
export const DECKEL = { querHell: FLAK.deckelQuerLeucht, querDunkel: FLAK.deckelQuer, laengs: FLAK.deckelTiefe };

export const TURMKI = {
  // Ersatzwerte, falls turmZustand fehlt. v0-Standard 1000 m/s (Entscheidung R8). Zünder: frühestens nach 60 m Flug
  // (als Strecke, R8: bei 1100 m/s wären 0,1 s schon 110 m), spätestens nach 4 s.
  v0: 1000, reichweite: 2500, zuender: [0.1, 4], zuenderStrecke: 60,
  nick: [-0.05, 1.45],
  // Streukugel quer / Streutiefe längs (m). R10 (Nutzer: „noch viel weiter gestreut“): Zielfeuer 60 → 140 m quer und
  // tief — Messung Frühwarnung: Kugel 130 mit Deckel 0,10 nur Median 73 m, mit 0,18 98 m. Nahbereich min(35, 0,10·d):
  // mit Leuchtspur deckelt die Waffe ohnehin auf 0,10·d (Spur verlässt das Rohr sonst sichtbar schief).
  // Sperr 70/40: die Kugel füllt das Volumen um den Musterpunkt, ohne das Richttempo zu belasten; 40 m = Lagendicke.
  // R12 (Nutzer: „viel mehr verteilen“): Zielfeuer 140 → 320, Sperr 70/40 → 120/80 m. Messung Frühwarnung (Labor,
  // unverwundbar, 1100 m/s, Deckel 0,6/0,8): Zielfeuer 320 → Median 234 m, Sperr 120/80 + Zuschlag 300 → 254 m (nach dem Bau mit 340: 261–269 m, 3 Startwerte).
  // WARUM Deckel 0,6 nötig: Zielfeuer 300 mit 0,18·d war zu 74 % gedeckelt (152 m), mit 0,6 zu 21 % (214 m).
  streuKugel: { ziel: 320, nahMax: 35, nahAnteil: 0.10, sperr: 120, sperrTiefe: 80 },
  // toleranz = min(max(Kugel, toleranzMin), Deckel·d) / d, mindestens toleranzRadMin. WARUM unter dem Deckel: die Waffe
  // deckelt den Querversatz (DECKEL.querHell/querDunkel) — ein größerer Feuer-Spielraum würde neben die Kugel schießen.
  toleranzMin: 8, toleranzRadMin: 0.008,
  // Sperrfeuer: Gier-Dreieck 4 s, Nick-Dreieck 4/1,5 s, Abstands-Dreieck 4/1,25 s (R9). Spitzentempo bei gierHalb 0,52:
  // 4·0,52/4 = 0,52 rad/s (30°/s) < 60°/s Gier; Nick 4·0,31/2,67 = 0,47 rad/s (27°/s) < 50°/s.
  // R12 Folgen: Periode je Achse = Grundperiode · max(1, halb / folgen.musterBezug) — s. dort.
  periodeGier: 4, verhaeltnis: 1.5, verhaeltnisTiefe: 1.25,
  toleranzSperr: 0.06,
  gewichte: { naehe: 1.0, annaeherung: 0.8, angriff: 0.5, winkel: 0.3 },
  tempoBezug: 180,        // m/s → Annäherung 1,0
  // WARUM 1,4 / 2 s statt 1,25 / 1 s (Frühwarnung R6): Messung ergab 8,4 freiwillige Wechsel je Turm und Minute
  // (Ziel ≤ 6), mit 1,3 / 2 s 5,0–5,8 (4 Startwerte). R7: Vorstöße bringen mehr schnelle Annäherer → 6,2–6,6;
  // mit 1,4 / 2 s 4,8–5,8. Angriffsläufer ziehen das Feuer trotzdem sofort auf sich.
  wechselFaktor: 1.4,     // neues Ziel muss 40 % besser sein …
  haltezeit: 2,           // … und das alte mindestens 2 s gehalten
  maxJeZiel: 2,
  takteJeBewertung: 6,    // Turm i bewertet neu, wenn takt % 6 == i % 6 (gestaffelt)
  gesperrtFrei: 0.5,      // s: so lange gesperrt (Nachbar-Sperre/Grenze) → Ziel freigeben
  // Folgen (R9 Sperrkästen). WARUM Kästen statt 1–2 Wände: Messung R8 (unverwundbar, 1100 m/s) — Detonation ↔ nächste
  // Drohne Median 260 m (quer 188, tief 127); die Drohnen standen radial 830–1800 m (σ 346 m), nur 11 % lagen im Schirm.
  folgen: {
    vorne: 0,                   // m: Kasten AUF dem vorausgesagten Schwerpunkt (R7 lag er 120 m davor)
    abstand: [450, 2000],
    // WARUM 0,3 s (R7: 1,5): Glättung hinkt einem bewegten Ziel um v·τ hinterher — bei 150 m/s und 0,7 s ≈ 105 m
    // (Messung R9: Median 131 m → 109 m mit 0,3 s); die Sprünge begrenzen maxDreh/maxAbstandTempo
    tau: 0.3,                   // s: Glättung der Kastenmitte und des Abstands
    tauGroesse: 1.0,            // s: Glättung der Kastengröße
    // WARUM 35°/s: Muster ≤ 4·0,35/4 = 20°/s Gier bzw. 4·0,15/2,67 = 13°/s Nick + Nachführen 35°/s < 60 / 50°/s Richttempo
    maxDreh: 35 * Math.PI / 180, // rad/s: Nachführtempo der Mitte, Gier
    // WARUM 25 (R10, vorher 30): die Lagen verschieben sich mit der Flugrichtung zusätzlich (≤ lagen.maxDreh·Abstand)
    maxDrehNick: 25 * Math.PI / 180, // rad/s: Nick (Muster ≤ 13°/s + 25 + Lagen < 50°/s)
    maxAbstandTempo: 300,       // m/s
    // WARUM σ + 100 (R10, vorher σ + 25, 50–200): Sättigung des Manöverraums statt Treffen. WARUM höchstens 250: nur
    // 60 Detonationen/s — ab ~210 Mio. m³ gesättigtem Raum (alle Gruppen) fällt die Abdeckung wieder (Frühwarnung R10)
    // R12: Zuschlag 100 → 340, Obergrenze 250 → 450 (× faktor). Die Untergrenze ist Zuschlag + 20 (R11, s. folgeSchirme).
    // WARUM 340 statt 300 (Messung nach dem Bau, Deckel 0,6/0,8): 300 → Sperr-Median 244 m, 360 → 278 m (Ziel ≥ 250).
    // WARUM die 210-Mio.-m³-Grenze (R10) nicht mehr gilt: der Nutzer will ausdrücklich weite Streuung statt Abdeckung;
    // Abdeckung (≥ 8 Det. in 150 m) fällt dabei von ~20 % auf ~5 % (Frühwarnung R12) — Ausgleich über Splitter/Schaden.
    quer: [340, 360, 450],      // m: [Zuschlag-Standard, (frei), Obergrenze] der halben Breite/Höhe
    // WARUM ohne Zuschlag: die Tiefe kommt jetzt aus den Lagen (längs) und der Sperr-Streutiefe; das Abstands-Muster
    // deckt nur noch die radiale Streuung der Gruppe
    tiefe: [0, 0, 120],         // m: halbe Tiefe des Abstands-Musters = radiale Streuung, höchstens 120 (× faktor, R12)
    // Tiefenlagen (R10, Recherche: Sperrfeuer „gestaffelt in die Tiefe … auf den wahrscheinlichen Anfluglinien“):
    // Lage 0 = vor der Gruppe (Flugrichtung), 1 = auf ihr, 2 = dahinter; Abstand = anteil · Tempo · Flugzeit.
    // Richtung = geglättete mittlere Geschwindigkeit (τ 1 s) + zuBatterie m/s zur Batterie hin (WARUM: Kreiser einer
    // Gruppe heben sich auf → ohne Zuschlag kippt die Richtung; so zeigt „vor“ dann zur Batterie = Richtung der Gefahr).
    // WARUM maxDreh 20°/s: die Lagenmitten schwenken mit a · Drehrate (150 m · 0,35 rad/s = 52 m/s ≈ 7°/s bei 450 m).
    // Abstimmung (Labor, unverwundbar, 1100 m/s, 5 min): min 80 / zuBatterie 20 / vorlauf 1 → Detonation ↔ Drohne
    // Median 140 m, 20 % vor / 24 % hinter der Drohne; min 120 / 60 / 2 → 163 m, 35 % vor / 17 % hinter.
    // WARUM min 120: 0,6·120 m/s·1,15 s ≈ 83 m — die vordere Lage lag kaum vor der Drohne (Ziel ≥ 25 % „vor“)
    // vorlauf 2 = Glättungsrückstand v·τ zurück + noch einmal v·τ (≈ 35 m) nach vorn, „in Richtung der Gefahr“.
    lagen: { anteil: 0.6, min: 120, max: 150, tau: 1.0, zuBatterie: 60, maxDreh: 20 * Math.PI / 180, vorlauf: 2 },
    nickMax: 1.2,               // rad: Kastenmitte höchstens so hoch
    // R12: nur noch GEOMETRISCHE Grenze (Raum bleibt im Sektor über der Batterie). WARUM nicht mehr 0,28 / 0,15 wie R9:
    // der Deckel fürs Richttempo schnitt den Raum bei 1200 m auf 340 × 180 m — das Muster wird jetzt stattdessen
    // langsamer (musterBezug), das Spitzentempo des Musters bleibt so wie mit dem alten Deckel.
    gierHalbMax: 0.8, nickHalbMax: 0.45, // rad
    // Bezugsgrößen der Musterperiode (R12): bis hierher läuft das Muster mit der Grundperiode (4 / 2,67 / 3,2 s), darüber
    // wächst die Periode im gleichen Verhältnis → Spitzentempo höchstens 4·0,28/4 = 16°/s Gier, 4·0,15/2,67 = 13°/s Nick,
    // 4·120/3,2 = 150 m/s Abstand wie R9/R10 (+ Nachführen 35/25°/s < 60/50°/s). Kehrseite: bei faktor 3 bestreicht
    // ein Rohr seine Fläche nur noch alle ~12 s (dafür streuen die Kugeln selbst mit).
    musterBezug: { gier: 0.28, nick: 0.15, tiefe: 120 },
    // m: Lücke quer (Bogen), hoch (Bogen) oder radial > 300 → neuer Kasten, < 220 → wieder zusammen (Hysterese).
    // WARUM in Metern und 3 Achsen statt Gier-Lücke 0,6 rad: bei 1500 m sind 0,6 rad 900 m — zwei Drohnen 500 m
    // auseinander teilten sich einen Kasten, nur 15 % der Drohnen lagen darin (Messung R9).
    luecke: [300, 220],
    // Kern-Gewichtung (m): der Kasten sitzt auf dem DICHTEN Teil der Gruppe (2 Schritte Mittelwert-Verschiebung mit
    // Gewicht exp(−(Abstand/kern)²)), statt zwischen Ausreißern
    kern: 200,
    maxKaesten: 3,
    umgruppieren: 2,            // s: frühestens so oft Kästen/Türme neu verteilen
    minTuerme: 2,
    // Übergang (Befund Prüfer R9): wechselt ein Rohr den Kasten (oder kommt aus Killzone/Zielfeuer), läuft sein
    // Befehlspunkt mit höchstens diesem Tempo (Winkel von der Mündung) zum neuen Muster, statt im Takt 22–38° zu springen.
    // WARUM 50/40°/s, 600 m/s: unter dem Richttempo 60/50°/s, damit der Turm dem Befehl folgen kann.
    uebergang: { gier: 50 * Math.PI / 180, nick: 40 * Math.PI / 180, abstand: 600 },
    // Tempobremse im Muster (R10): Befehl höchstens 57/47°/s von der Mündung (Rest bis 60/50°/s: Mündung wandert mit)
    bremse: { gier: 57 * Math.PI / 180, nick: 47 * Math.PI / 180, abstand: 1200 },
  },
  // Killzone (R7, Entscheidung 3): Hysterese ein < 500 m, aus > 600 m um BATTERIE_MITTE, Alarm-Nachlauf 0,5 s
  killzone: { ein: 500, aus: 600, nachlauf: 0.5, tuermeEiner: 3, tuermeJe: 2 },
  // R23 Hauptbatterie (typ 'schwer') und CIC-Vorgaben
  schwer: {
    grossR: 12, panzerAb: 0.5,           // m, 0..1: ab hier „groß“ bzw. „gepanzert“ (Zielfeuer, Panzergranate)
    // Gewichte zusätzlich zu `gewichte` (Nähe, Annäherung, Angriff). WARUM vorgabe 3: höher als alle anderen zusammen
    // (≤ 1 + 0,8 + 0,5 + 1,3 = 3,6 ohne Winkel) → der Waffenoffizier setzt sich durch, solange das Ziel erreichbar ist
    gewichte: { panzer: 1.0, gross: 0.3, vorgabe: 3.0 },
    flugMax: 6,                          // s: längste Flugzeit, auf die die Hauptbatterie Zielfeuer gibt
    // Panzergranate trifft nur direkt: Feuer-Spielraum = anteil · r / d (mind. min) — WARUM 0,5·r: die Rohrstreuung
    // (0,25° ≈ 4,4 mrad) kommt dazu; mit voller r läge jeder zweite Schuss am Rand vorbei
    apToleranz: 0.5, apToleranzMin: 0.0015,
    raumVorlauf: 1,                      // × lagenAbstand vor der vorderen Lage (Raumfeuer der Hauptbatterie)
    // CIC (zielVorgabe) für Gatling-Zielfeuer. WARUM nur +1: die Gatlings sollen Boote jagen, nicht alle aufs Vorgabeziel
    vorgabeGatling: 1.0,
    gatlingPanzer: 0.6,                  // Gatling-Bewertung × (1 − 0,6 · panzer): Flak wirkt dort nur × 0,15
    kzPanzer: 2000,                      // m Strafabstand je panzer in der Killzone-Reihenfolge (gepanzerte zuletzt)
  },
};

/** Regler der Streuung (R11): m bzw. Faktor; Standard = TURMKI (R10). Die Seite baut ihre Schieberegler hieraus. */
// R12: faktor (Gesamtregler „Streuung ×“) zuerst, Bereiche erweitert (Nutzer: „viel mehr verteilen … als Slider“).
// R14 (Nutzer: „Nimm die Konfig T1“): Standards = konfig/flak/T1.json (Feld streu). TURMKI behält die R12-Werte als
// Bezug (Raum-Obergrenzen, Lagen-Klammer skalieren damit) — WARUM nicht TURMKI ändern: lagenAnteil/anteil ist der Faktor
// der Lagen-Klammer (R11), ein geänderter Bezug verschöbe die Klammer mit. Messung T1 (Labor, 3 Startwerte, 5 min,
// v0 1100, Deckel 1,0/0,9): Sperr 32–36 Abschüsse → Sperr-splitterDps 90 → 115 (Waffentechniker) → 43–46, Vorstöße
// 40–60 % überlebt; Ziel 31–42, 36–67 %.
export const STREU_REGLER = {
  faktor: { min: 0.5, max: 3, standard: 1 },                                 // × sperrQuer/sperrTiefe/raumZuschlag/ziel/Raum-Obergrenzen
  sperrQuer: { min: 0, max: 400, standard: 200 },        // Sperr-Kugel quer zur Schusslinie (R12: 120)
  sperrTiefe: { min: 0, max: 400, standard: 200 },       // Lagendicke längs (R12: 80)
  raumZuschlag: { min: 0, max: 600, standard: 400 },     // halbe Raumbreite/-höhe = Streuung + Zuschlag (R12: 340)
  ziel: { min: 20, max: 700, standard: 135 },            // Zielfeuer quer = tief (R12: 320)
  nahMax: { min: 5, max: 60, standard: TURMKI.streuKugel.nahMax },           // Nahbereich min(nahMax, 0,10·d), ohne faktor (35)
  lagenAnteil: { min: 0.3, max: 1.2, standard: 0.75 },   // Lagenabstand = Anteil · Tempo · Flugzeit (R12: 0,6)
};
/** Wirksamer Reglerwert: fehlt/keine Zahl → Standard, sonst auf [min, max] geklammert. */
export function streuWert(streu, feld) {
  const R = STREU_REGLER[feld], v = streu?.[feld];
  return typeof v === 'number' && Number.isFinite(v) ? (v < R.min ? R.min : v > R.max ? R.max : v) : R.standard;
}

const L = (x, y, z) => Math.sqrt(x * x + y * y + z * z);
const dreieck = (u) => 1 - 4 * Math.abs(u - Math.floor(u) - 0.5); // −1 … 1 … −1, Periode 1
const klemme = (x, a, b) => (x < a ? a : x > b ? b : x);
/** Querdeckel der Waffe (Anteil der Entfernung): mit Leuchtspur 0,10, ohne der eingestellte (Standard 0,18; R10/R11). */
export const querDeckel = (leucht, dunkel = DECKEL.querDunkel) => (leucht ? DECKEL.querHell : dunkel);
/** Wirksamer Waffen-Regler wie flak.einstellen(): Zahl → in [min, max] aus WAFFEN_REGLER, sonst Standard. WARUM hier
 *  nachgebildet (Befund Prüfer R11): die Toleranz muss denselben Deckel nehmen wie die Waffe — mit festem 0,18 feuerte der
 *  Turm bei Regler 0,10 bis 140 m neben den Punkt, die Granate streute nur noch 100 m (bis ~240 m daneben). */
export function waffeWert(waffe, feld) {
  const R = WAFFEN_REGLER[feld], w = waffe ? waffe[feld] : undefined;
  return Number.isFinite(w) ? Math.min(R.max, Math.max(R.min, w)) : R.standard;
}
/** Feuer-Spielraum (rad) zur Streukugel in Entfernung d: min(max(Kugel, 8 m), Querdeckel·d) / d, mindestens 0,008 rad.
 *  WARUM auch das 8-m-Mindestmaß unter dem Deckel: sonst feuert der Turm unter 160 m weiter neben den Punkt, als die
 *  Kugel der Waffe reicht (Befund Prüfer R8: bei 60 m 7,6° statt höchstens 2,9°). */
const kugelToleranz = (kugel, d, leucht, dunkel) => Math.max(Math.min(Math.max(kugel, TURMKI.toleranzMin), querDeckel(leucht, dunkel) * d) / d, TURMKI.toleranzRadMin);
/** Querkugel mit Leuchtspur (R12): höchstens 0,98 · querHell · d. WARUM 0,98: die Waffe misst d von der Mündung im
 *  Schuss-Takt (Rohr hat sich weitergedreht) — ohne Rand zählte jede Rundung als „gedeckelt“. */
const spurKugel = (kugel, d) => Math.min(kugel, 0.98 * DECKEL.querHell * d);
const ZWEI_PI = 2 * Math.PI;
// Höchstzahl der Räume (Vorrat; TURMKI.folgen.maxKaesten wählt, wie viele genutzt werden)
const MAXK = 6;
const winkelDiff = (a, b) => { const d = a - b; return d - ZWEI_PI * Math.floor((d + Math.PI) / ZWEI_PI); }; // → [−π, π)

/**
 * Abfang-Gleichung |r + v·t| = v0·t (Geschoss gerade, konstant v0, erbt nichts). Kleinste Lösung t > 0.
 * Schreibt aus = { t, x, y, z } und liefert true; false, wenn unlösbar (Ziel schneller und flieht).
 */
export function abfangen(m, pos, vel, v0, aus) {
  const rx = pos.x - m.x, ry = pos.y - m.y, rz = pos.z - m.z;
  const a = vel.x * vel.x + vel.y * vel.y + vel.z * vel.z - v0 * v0;
  const b = 2 * (rx * vel.x + ry * vel.y + rz * vel.z);
  const c = rx * rx + ry * ry + rz * rz;
  let t;
  if (Math.abs(a) < 1e-9) { if (b >= 0) return false; t = -c / b; }
  else {
    const disk = b * b - 4 * a * c;
    if (disk < 0) return false;
    const w = Math.sqrt(disk), t1 = (-b - w) / (2 * a), t2 = (-b + w) / (2 * a);
    t = Math.min(t1, t2) > 0 ? Math.min(t1, t2) : Math.max(t1, t2);
    if (!(t > 0)) return false;
  }
  aus.t = t; aus.x = pos.x + vel.x * t; aus.y = pos.y + vel.y * t; aus.z = pos.z + vel.z * t;
  return true;
}

/** Vorzeichen des Turm-Rahmens (turm.js): oben 1 (Turm = Schiff, verschoben), unten −1 (Turm (x,y,z) → Schiff (−x,−y,z),
 *  Drehung um Z um π). Die Umkehrung ist dieselbe Abbildung. */
export const turmVorzeichen = (l) => (l.oben === false ? -1 : 1);

/** Eigene Grenzprüfung (R14) im Turm-Rahmen: Gier [Mitte ± Halbweite] (volle Drehung ab π), Nick [min, max].
 *  WARUM eigene Prüfung: bis erreichbar(i, gier, nick) der Waffe (mit Nachbar- und Rumpf-Sperre) übergeben wird. */
export function grenzenOk(l, gier, nick) {
  const lim = l.nick ?? TURMKI.nick;
  if (nick < lim[0] || nick > lim[1]) return false;
  const g = l.gier;
  return !g || g[1] >= Math.PI - 1e-6 || Math.abs(winkelDiff(gier, g[0])) <= g[1];
}

export function erstelleTurmKi({ startwert = 202, lafetten = LAFETTEN, mitte = BATTERIE_MITTE, sektor = STANDARD_SEKTOR,
  killzone: kzWerte = TURMKI.killzone, erreichbar = null } = {}) {
  // WARUM lokale Namen statt der Prüfstand-Importe: dieselbe KI läuft auf dem Prüfstand (Welt) und am Schiff (Schiffsrahmen)
  const LAF = lafetten, M = mitte, STANDARD = sektor;
  // WARUM kzWerte: die innere Funktion killzone() würde den gleichnamigen Parameter verdecken (Hoisting)
  const K = TURMKI, F = K.folgen, KZ = kzWerte, n = LAF.length;
  const sgn = LAF.map(turmVorzeichen);
  /** Richtung (dx, dy, dz) im Schiffsrahmen von Turm i aus erreichbar? (im Turm-Rahmen: x, y gespiegelt bei unten) */
  const reicht = (i, dx, dy, dz) => {
    const s = sgn[i], d = L(dx, dy, dz) || 1, g = Math.atan2(s * dx, dz), nk = Math.asin(klemme(s * dy / d, -1, 1));
    return erreichbar ? erreichbar(i, g, nk) : grenzenOk(LAF[i], g, nk);
  };
  const befehle = LAF.map((l) => ({ turmId: l.id, zielId: null, punkt: { x: 0, y: 0, z: 0 }, feuer: false, toleranz: K.toleranzSperr, zuender: 1, leuchtspur: false, streuKugel: 0, streuTiefe: 0, munition: 'flak' }));
  // R23: Hauptbatterie und Handsteuerung. teil[i] = 1 → Turm i nimmt an Räumen, Killzone und Gatling-Zielwahl teil
  // (Gatling, nicht manuell); nTeil = Anzahl. WARUM ein Merkfeld statt eigener Listen: ohne schwere/manuelle Türme
  // sind alle Schleifen und Zählungen exakt die alten (bitgleich R22).
  const KS = K.schwer;
  const istSchwer = Uint8Array.from(LAF, (l) => (l.typ === 'schwer' ? 1 : 0));
  const teil = new Uint8Array(n);
  let nTeil = n, manuellVor = -1, teilNeu = false, vorgabeVor = null, vorgabe = null;
  const vorgabeOffen = new Uint8Array(n); // Gatling darf beim nächsten Bewertungstakt sofort aufs neue Vorgabeziel
  const ersteFlak = Math.max(0, istSchwer.indexOf(0)); // Bezugs-v0 der Räume: erster Gatling-Turm (Prüfstand: 0)
  const schwerSlot = new Int32Array(n).fill(-1), schwerId = new Float64Array(n).fill(-1), schwerHalt = new Float64Array(n);
  /** teil/nTeil aus manuell neu bilden. */
  function setzeTeil(manuell) {
    nTeil = 0;
    for (let i = 0; i < n; i++) { teil[i] = !istSchwer[i] && i !== manuell ? 1 : 0; nTeil += teil[i]; }
  }
  // Ersatz-Mündung (Drehpunkt der Wiege), falls turmZustand noch keine liefert; unten montiert: Zapfen unter dem Fuß
  const ersatzM = LAF.map((l, i) => ({ x: l.x, y: l.y + sgn[i] * l.zapfen.y, z: l.z }));
  const halt = new Float64Array(n);           // Haltezeit des aktuellen Ziels je Turm
  const gesperrtZeit = new Float64Array(n);
  const zielSlot = new Int32Array(n).fill(-1); // Index in ziele[] (−1 = keins)
  const MAXZ = 64;
  const zaehl = new Int32Array(MAXZ);          // Türme je Ziel-Slot
  const nahSlot = new Uint8Array(MAXZ), nahId = new Float64Array(MAXZ).fill(-1); // Killzone-Hysterese je Ziel-Slot
  const nahTurm = new Int32Array(n);           // −1 = frei, sonst Ziel-Slot des Eindringlings
  const statistik = { wechsel: new Int32Array(n), zwang: new Int32Array(n), flackern: 0, maxJeZiel: 0, unloesbar: 0, alarmAn: 0, gruppenWechsel: 0 };
  const vorZiel = new Float64Array(n).fill(-1), wechselZeit = new Float64Array(n).fill(-1e9); // Flackern: A → B → A in < 5 s
  const ab = { t: 0, x: 0, y: 0, z: 0 }, abBest = { t: 0, x: 0, y: 0, z: 0 };

  // Räume (Vorrat MAXK Stück, lage.schirme zeigt 1–maxKaesten davon; Name „schirme“ bleibt für Seite/Tests)
  const schirmVorrat = Array.from({ length: MAXK }, () => ({ mitte: { x: 0, y: 0, z: 0 }, tuerme: [],
    laengs: { x: 0, y: 0, z: 0 }, lagen: [{ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }] }));
  /** Grundzustand eines Raums (Erzeugen UND zuruecksetzen). WARUM eine Stelle für beides (Befund Prüfer R10): festerSchirm
   *  setzt schirmeBereit, dann überspringt folgeSchirme seinen Startblock — nach zuruecksetzen() → fest → folgen liefen
   *  sonst alte Raumfelder (v*, tempo, laengs, lagenAbstand) weiter und die KI wich von einer frischen Instanz ab. */
  function grundRaum(s) {
    s.mitte.x = s.mitte.y = s.mitte.z = 0; s.abstand = 800; s.gierHalb = 0.3; s.nickHalb = 0.15; s.tuerme.length = 0;
    s.gier = 0; s.nick = 0.4; s.sollGier = 0; s.sollNick = 0.4; s.sollAbstand = 800;
    s.breite = 150; s.hoehe = 80; s.tiefeHalb = 0; s.sollBreite = 150; s.sollHoehe = 80; s.sollTiefe = 0; s.gewicht = 0;
    s.phG = s.phN = s.phR = 0; // R12: aufintegrierte Musterphasen (Perioden)
    // R10 Tiefenlagen: geglättete Gruppengeschwindigkeit (v*, Soll sv*), mittleres Tempo, Einheitsrichtung „vor“
    s.vx = s.vy = s.vz = s.svx = s.svy = s.svz = 0; s.tempo = s.sollTempo = 130;
    s.laengs.x = 0; s.laengs.y = 0; s.laengs.z = -1; s.lagenAbstand = 100;
    for (const l of s.lagen) l.x = l.y = l.z = 0;
  }
  const lage = { nahbereich: false, schirme: [], eindringlinge: [] };
  // Arbeitsfelder Folgen
  const bG = new Float64Array(MAXZ), bN = new Float64Array(MAXZ), bD = new Float64Array(MAXZ), bW = new Float64Array(MAXZ);
  const bVx = new Float64Array(MAXZ), bVy = new Float64Array(MAXZ), bVz = new Float64Array(MAXZ);
  const bE = new Float64Array(MAXZ), bQ = new Float64Array(MAXZ), bH = new Float64Array(MAXZ), bK = new Float64Array(MAXZ), bX = new Float64Array(MAXZ), bY = new Float64Array(MAXZ), bZ = new Float64Array(MAXZ), grp = new Int32Array(MAXZ);
  const gmX = new Float64Array(MAXK), gmY = new Float64Array(MAXK), gmZ = new Float64Array(MAXK);
  const kOrd = new Int32Array(MAXK), kAnz = new Int32Array(MAXK), kBel = new Int32Array(MAXK);
  // Übergang je Rohr: Kasten im letzten Takt (−1 = kein Muster, −2 = Start), laufender Übergang + Punkt (Gier, Nick, R um M)
  const kastenVor = new Int32Array(n).fill(-2), ueb = new Uint8Array(n), uOk = new Uint8Array(n), lageVor = new Int32Array(n).fill(-1);
  const uG = new Float64Array(n), uN = new Float64Array(n), uR = new Float64Array(n);
  const ord = new Int32Array(MAXZ), gruppeTurm = new Int32Array(n), turmNachX = LAF.map((l, i) => i).sort((a, b) => LAF[a].x - LAF[b].x || a - b);
  let takt, zeit, phase0, letzterModus, alarmRest, anzahlGruppen, seitUmgruppiert, schirmeBereit, warFest;
  const fest = { gierMitte: 0, gierHalb: 0, nickMin: 0, nickMax: 0 }; // gemerkter fester Sektor
  // Wirksame Regler (R11), je Takt aus befehl.streu gelesen — festes Objekt, keine neuen Objekte im Takt
  // querMax/tiefeMax (R12) = Raum-Obergrenzen × faktor; sperrQuer/sperrTiefe/raumZuschlag/ziel stehen hier schon × faktor
  const W = { faktor: 1, sperrQuer: 0, sperrTiefe: 0, raumZuschlag: 0, ziel: 0, nahMax: 0, lagenAnteil: 0, querMax: 0, tiefeMax: 0 };
  function leseStreu(streu) {
    for (const f in STREU_REGLER) W[f] = streuWert(streu, f);
    const a = W.faktor;
    W.sperrQuer *= a; W.sperrTiefe *= a; W.raumZuschlag *= a; W.ziel *= a;
    W.querMax = TURMKI.folgen.quer[2] * a; W.tiefeMax = TURMKI.folgen.tiefe[2] * a;
  }
  // Befehlsrichtung je Ziel-Rohr (R12 Zenit-Bremse): Gier, Nick von der Mündung; nOk 0 frisch, 1 frei, 2 bremst
  const nG = new Float64Array(n), nN = new Float64Array(n), nOk = new Uint8Array(n);
  let nahDt = 1 / 60; // Schrittweite für die Zenit-Bremse (R12), je Takt gesetzt
  let deckelDunkel = DECKEL.querDunkel; // wirksamer Querdeckel ohne Leuchtspur (befehl.waffe, R11), je Takt gelesen

  function zuruecksetzen() {
    const rnd = zufall(startwert);
    phase0 = rnd(); // gemeinsamer Phasenversatz des Musters (nur Optik, deterministisch)
    takt = 0; zeit = 0; letzterModus = null; alarmRest = 0; anzahlGruppen = 1; seitUmgruppiert = 1e9; schirmeBereit = false; warFest = false;
    Object.assign(fest, STANDARD);
    for (const s of schirmVorrat) grundRaum(s);
    uG.fill(0); uN.fill(0); uR.fill(0); nG.fill(0); nN.fill(0); nOk.fill(0);
    kastenVor.fill(-2); ueb.fill(0); uOk.fill(0); lageVor.fill(-1);
    halt.fill(0); zielSlot.fill(-1); gesperrtZeit.fill(0); nahSlot.fill(0); nahId.fill(-1); nahTurm.fill(-1); gruppeTurm.fill(0);
    statistik.wechsel.fill(0); statistik.zwang.fill(0); statistik.flackern = 0; vorZiel.fill(-1); wechselZeit.fill(-1e9);
    statistik.maxJeZiel = 0; statistik.unloesbar = 0; statistik.alarmAn = 0; statistik.gruppenWechsel = 0;
    setzeTeil(-1); manuellVor = -1; teilNeu = false; vorgabeVor = null; vorgabe = null; vorgabeOffen.fill(0);
    schwerSlot.fill(-1); schwerId.fill(-1); schwerHalt.fill(0);
    for (const b of befehle) {
      b.zielId = null; b.feuer = false; b.leuchtspur = false; b.streuKugel = 0; b.streuTiefe = 0; b.munition = 'flak';
      // R22 (Pflege): Punkt, Toleranz, Zünder wie beim Erzeugen — Neustart = frische Instanz (Prüfer-Befund R21)
      b.punkt.x = b.punkt.y = b.punkt.z = 0; b.toleranz = K.toleranzSperr; b.zuender = 1;
    }
    lage.nahbereich = false; lage.schirme.length = 0; lage.eindringlinge.length = 0;
    // Arbeitsfelder und je Takt gelesene Werte: werden vor dem Lesen neu geschrieben, aber ein Neustart soll keinen Rest
    // tragen (Zustandsvergleich frisch ↔ Neustart, R22)
    for (const a of [zaehl, bG, bN, bD, bW, bVx, bVy, bVz, bE, bQ, bH, bK, bX, bY, bZ, grp, gmX, gmY, gmZ, kOrd, kAnz, kBel, ord]) a.fill(0);
    ab.t = ab.x = ab.y = ab.z = 0; abBest.t = abBest.x = abBest.y = abBest.z = 0;
    for (const k in W) W[k] = 0;
    W.faktor = 1; nahDt = 1 / 60; deckelDunkel = DECKEL.querDunkel;
  }

  /** Bewertung von Ziel z für Turm i; −1 = ungültig. Schreibt den Abfangpunkt nach `aus`. */
  function bewerte(i, z, m, v0, rw, rx, ry, rz, aus) {
    if (!z.aktiv) return -1;
    if (!abfangen(m, z.pos, z.vel, v0, aus)) { statistik.unloesbar++; return -1; }
    if (aus.t * v0 < K.zuenderStrecke || aus.t > K.zuender[1] || aus.t * v0 > rw) return -1;
    const dx = aus.x - m.x, dy = aus.y - m.y, dz = aus.z - m.z, d = L(dx, dy, dz);
    // R14: Grenzen im Turm-Rahmen (Gier + Nick; R13 nur Nick über Welt-y — unten montierte Türme wählten Ziele über
    // dem Schiff, Türme mit Gier-Grenze Ziele hinter dem Rumpf und warteten 0,5 s auf `gesperrt`)
    if (!reicht(i, dx, dy, dz)) return -1;
    const G = K.gewichte;
    const ex = z.pos.x - M.x, ey = z.pos.y - M.y, ez = z.pos.z - M.z, e = L(ex, ey, ez) || 1;
    const nah = -(z.vel.x * ex + z.vel.y * ey + z.vel.z * ez) / e / K.tempoBezug;
    const cosw = (dx * rx + dy * ry + dz * rz) / d;
    let w = G.naehe * (1 - L(z.pos.x - m.x, z.pos.y - m.y, z.pos.z - m.z) / rw)
      + G.annaeherung * Math.min(Math.max(nah, 0), 1)
      + G.angriff * (z.angriff ? 1 : 0)
      + G.winkel * (1 - Math.acos(Math.min(Math.max(cosw, -1), 1)) / Math.PI);
    // R23 (nur mit den neuen Feldern — sonst bitgleich): Gatling-Flak wirkt auf Panzer × (1 − panzer) → schwächer
    // bewerten (die Hauptbatterie übernimmt); CIC-Vorgabe bevorzugen
    if (z.panzer > 0) w *= 1 - KS.gatlingPanzer * Math.min(z.panzer, 1);
    if (vorgabe !== null && z.id === vorgabe) w += KS.vorgabeGatling;
    return w;
  }

  /** R23: Bewertung von Ziel z für den SCHWEREN Turm i; −1 = ungültig. alle = auch kleine, ungepanzerte Ziele
   *  (Zielfeuer-Betrieb ohne Räume bzw. hauptMunition 'panzer'). Schreibt den Abfangpunkt (mit v0 des Turms) nach aus. */
  function bewerteSchwer(i, z, m, v0, rw, alle, aus) {
    if (!z.aktiv) return -1;
    const vorg = vorgabe !== null && z.id === vorgabe, pz = z.panzer > 0 ? Math.min(z.panzer, 1) : 0, gross = (z.r ?? 0) >= KS.grossR;
    if (!alle && !vorg && pz < KS.panzerAb && !gross) return -1;
    if (!abfangen(m, z.pos, z.vel, v0, aus)) return -1;
    if (aus.t * v0 < K.zuenderStrecke || aus.t > KS.flugMax || aus.t * v0 > rw) return -1;
    const dx = aus.x - m.x, dy = aus.y - m.y, dz = aus.z - m.z;
    if (!reicht(i, dx, dy, dz)) return -1;
    const G = K.gewichte, H = KS.gewichte;
    const ex = z.pos.x - M.x, ey = z.pos.y - M.y, ez = z.pos.z - M.z, e = L(ex, ey, ez) || 1;
    const nah = -(z.vel.x * ex + z.vel.y * ey + z.vel.z * ez) / e / K.tempoBezug;
    return G.naehe * (1 - L(z.pos.x - m.x, z.pos.y - m.y, z.pos.z - m.z) / rw)
      + G.annaeherung * klemme(nah, 0, 1) + G.angriff * (z.angriff ? 1 : 0)
      + H.panzer * pz + (gross ? H.gross : 0) + (vorg ? H.vorgabe : 0);
  }

  function setzeAufSchale(b, m, v0, gier, nick, R) {
    const cn = Math.cos(nick);
    b.punkt.x = M.x + Math.sin(gier) * cn * R; b.punkt.y = M.y + Math.sin(nick) * R; b.punkt.z = M.z + Math.cos(gier) * cn * R;
    const t = L(b.punkt.x - m.x, b.punkt.y - m.y, b.punkt.z - m.z) / v0;
    b.zuender = Math.min(Math.max(t, K.zuenderStrecke / v0), K.zuender[1]);
  }

  /** Musterphasen des Raums s um dt weiterzählen (R12). dehnen (Folgen): Periode = Grundperiode · max(1, halb / Bezug),
   *  d. h. ein größerer Raum wird langsamer gestrichen statt kleiner gekappt; feste Wand: Grundperiode wie R9 (der
   *  Sektor ist vorgegeben und mit 0,52 rad gemessen). */
  function musterTakt(s, dt, dehnen) {
    const B = F.musterBezug, Tg = K.periodeGier;
    const fg = dehnen ? Math.max(1, s.gierHalb / B.gier) : 1, fn = dehnen ? Math.max(1, s.nickHalb / B.nick) : 1;
    const fr = dehnen ? Math.max(1, s.tiefeHalb / B.tiefe) : 1;
    s.phG += dt / (Tg * fg); s.phN += dt * K.verhaeltnis / (Tg * fn); s.phR += dt * K.verhaeltnisTiefe / (Tg * fr);
    // WARUM auf [0, 1) zurückführen: dreieck() ist periodisch 1; so bleibt die Genauigkeit über Stunden gleich
    s.phG -= Math.floor(s.phG); s.phN -= Math.floor(s.phN); s.phR -= Math.floor(s.phR);
  }

  /** Lissajous-Punkt für Turm k in Lage j des Raums s (Gier ± gierHalb, Nick ± nickHalb, Abstand ± tiefeHalb um die
   *  Lagenmitte). */
  function streiche(b, m, v0, k, s, j, dt) {
    const c = s.lagen[j], cx = c.x - M.x, cy = c.y - M.y, cz = c.z - M.z, cr = L(cx, cy, cz) || 1;
    const lg = Math.atan2(cx, cz), ln = klemme(Math.asin(klemme(cy / cr, -1, 1)), -F.nickMax, F.nickMax);
    // WARUM eigene Phasen je Achse: sonst laufen alle Türme zeitversetzt dieselbe geschlossene Kurve ab → Linie statt
    // Fläche. Gier-Phase k·0,382 (goldener Schnitt, R9): je zwei Türme eines Kastens liegen weit auseinander.
    // R12: Phasen je Raum aufintegriert (musterTakt) statt zeit / Periode — WARUM: die Periode wächst mit der Raumgröße;
    // zeit / T(t) spränge bei jeder Größenänderung (bei zeit 600 s und 1 % Periodenänderung um 1,5 Perioden, Lehre R7)
    const gier = lg + s.gierHalb * dreieck(s.phG + k * 0.381966 + phase0);
    const nick = ln + s.nickHalb * dreieck(s.phN + (k * 5 % 12) / 12 + phase0 * 0.37);
    const R = cr + s.tiefeHalb * dreieck(s.phR + (k * 7 % 11) / 11 + phase0 * 0.71);
    setzeAufSchale(b, m, v0, gier, nick, R);
    // Übergang (ueb) bzw. Tempobremse: vom letzten Befehl mit begrenztem Tempo zum Musterpunkt, gerechnet in Winkeln
    // VON DER MÜNDUNG aus. WARUM von der Mündung (nicht von BATTERIE_MITTE): steil über der Batterie dreht die Gier eines
    // Turms neben M vielfach schneller als die Gier um M (Messung R9: 132°/s bei 66 m waagrecht). Achsen einzeln.
    // WARUM die Bremse auch ohne Übergang (R10): Raum-Nachführen + Muster + Lagen-Schwenk summieren sich bei steilen,
    // nahen Lagen (400 m, Nick 50°) auf bis 78°/s Gier — der Turm (60°/s) hinge dann hinter dem Befehl.
    const px = b.punkt.x - m.x, py = b.punkt.y - m.y, pz = b.punkt.z - m.z, pr = L(px, py, pz) || 1;
    const pg = Math.atan2(px, pz), pn = Math.asin(klemme(py / pr, -1, 1));
    if (!uOk[k]) { uOk[k] = 1; uG[k] = pg; uN[k] = pn; uR[k] = pr; return; }
    const U = ueb[k] ? F.uebergang : F.bremse;
    const dg = winkelDiff(pg, uG[k]), dn = pn - uN[k], dr = pr - uR[k];
    const mg = U.gier * dt, mn = U.nick * dt, mr = U.abstand * dt;
    if (Math.abs(dg) <= mg && Math.abs(dn) <= mn && Math.abs(dr) <= mr) { ueb[k] = 0; uG[k] = pg; uN[k] = pn; uR[k] = pr; return; } // angekommen → Muster
    uG[k] = winkelDiff(uG[k] + klemme(dg, -mg, mg), 0); uN[k] += klemme(dn, -mn, mn); uR[k] += klemme(dr, -mr, mr);
    const cn = Math.cos(uN[k]);
    b.punkt.x = m.x + Math.sin(uG[k]) * cn * uR[k]; b.punkt.y = m.y + Math.sin(uN[k]) * uR[k]; b.punkt.z = m.z + Math.cos(uG[k]) * cn * uR[k];
    b.zuender = Math.min(Math.max(uR[k] / v0, K.zuenderStrecke / v0), K.zuender[1]);
  }

  // ---------- Killzone ----------
  function killzone(dt, ziele, turmZustand) {
    const E = lage.eindringlinge;
    E.length = 0;
    for (let j = 0; j < ziele.length && j < MAXZ; j++) {
      const z = ziele[j];
      if (!z.aktiv || z.id !== nahId[j]) { nahSlot[j] = 0; nahId[j] = z.id; }
      if (!z.aktiv) continue;
      const d = L(z.pos.x - M.x, z.pos.y - M.y, z.pos.z - M.z);
      if (nahSlot[j]) { if (d > KZ.aus) nahSlot[j] = 0; } else if (d < KZ.ein) nahSlot[j] = 1;
      if (nahSlot[j]) E.push(z.id);
    }
    const warAn = lage.nahbereich;
    if (E.length) alarmRest = KZ.nachlauf; else alarmRest -= dt;
    lage.nahbereich = E.length > 0 || alarmRest > 1e-9;
    if (lage.nahbereich && !warAn) statistik.alarmAn++;
    // Türme zuteilen: Eindringlinge nach Entfernung, je 2 (einer allein: 3) nächste freie, nicht gesperrte Türme
    nahTurm.fill(-1);
    if (!E.length) return;
    const je = E.length === 1 ? KZ.tuermeEiner : KZ.tuermeJe;
    let frei = nTeil; // R23: nur Gatlings, die nicht von Hand gesteuert werden
    for (let r = 0; r < E.length && frei > 0; r++) {
      // r-nächster Eindringling (kleine Liste → Auswahl ohne Sortier-Objekte)
      let best = -1, bestD = Infinity;
      for (let j = 0; j < ziele.length && j < MAXZ; j++) {
        if (!nahSlot[j] || !ziele[j].aktiv || zaehl[j] === -1) continue;
        const z = ziele[j];
        let d = L(z.pos.x - M.x, z.pos.y - M.y, z.pos.z - M.z);
        if (z.panzer > 0) d += KS.kzPanzer * z.panzer; // R23: gepanzerte zuletzt (Gatling-Flak wirkt dort kaum)
        if (d < bestD) { bestD = d; best = j; }
      }
      if (best < 0) break;
      zaehl[best] = -1; // als „vergeben“ markieren (wird unten zurückgesetzt)
      for (let k = 0; k < je && frei > 0; k++) {
        let bt = -1, btD = Infinity;
        for (let i = 0; i < n; i++) {
          if (nahTurm[i] >= 0 || !teil[i]) continue;
          const tz = turmZustand?.[i], m = tz?.muendung ?? ersatzM[i];
          // gesperrt (Nachbar-Sperre) zählt als 400 m weiter weg → anderer Turm übernimmt, wenn es einen gibt.
          // R14: außerhalb der Grenzen (Turm-Rahmen) gar nicht — WARUM: am Schiff sieht die Hälfte der Türme (oben/unten)
          // den Eindringling nie; zugeteilt richtete er sich nur gegen den Anschlag.
          const p = ziele[best].pos;
          if (!reicht(i, p.x - m.x, p.y - m.y, p.z - m.z)) continue;
          const d = L(p.x - m.x, p.y - m.y, p.z - m.z) + (tz?.gesperrt ? 400 : 0);
          if (d < btD) { btD = d; bt = i; }
        }
        if (bt < 0) break;
        nahTurm[bt] = best; frei--;
      }
    }
    for (let j = 0; j < MAXZ; j++) if (zaehl[j] === -1) zaehl[j] = 0;
  }

  function richteNah(i, ziele, m, v0, frei) {
    const b = befehle[i], z = ziele[nahTurm[i]];
    b.zielId = z.id;
    if (abfangen(m, z.pos, z.vel, v0, ab) && ab.t <= K.zuender[1]) {
      b.punkt.x = ab.x; b.punkt.y = ab.y; b.punkt.z = ab.z; b.zuender = Math.max(ab.t, K.zuenderStrecke / v0);
    } else { b.punkt.x = z.pos.x; b.punkt.y = z.pos.y; b.punkt.z = z.pos.z; b.zuender = K.zuenderStrecke / v0; }
    const px = b.punkt.x - m.x, py = b.punkt.y - m.y, pz = b.punkt.z - m.z, d = L(px, py, pz) || 1;
    b.streuKugel = b.streuTiefe = Math.min(W.nahMax, K.streuKugel.nahAnteil * d);
    b.toleranz = kugelToleranz(b.streuKugel, d, b.leuchtspur, deckelDunkel);
    b.feuer = frei;
    zenitBremse(i, b, m);
  }

  /** Zenit-Bremse für Ziel-Befehle (Nahbereich UND Zielfeuer, R12; Ausreißer 552°/s Gier): eine Drohne fast senkrecht
   *  über der Batterie (Nick 88°) dreht die Gier-Achse beliebig schnell (Großkreis / cos Nick). Der Turm schafft
   *  60/50°/s — der Befehl läuft deshalb mit höchstens folgen.bremse von der Mündung aus; solange er hinterherläuft,
   *  zeigt er neben die Drohne → kein Feuer. WARUM auch im Zielfeuer (Messung R12, faktor 2: 7205°/s): verlässt die
   *  Drohne die Killzone, während der Befehl gebremst hinterherläuft, übernimmt das Zielfeuer dasselbe Ziel — ohne
   *  Bremse spränge der Befehl im selben Takt aufs Ziel. Zustand frei bei Sperr-/Ruhe-Befehl (Ende von schritt). */
  function zenitBremse(i, b, m) {
    const px = b.punkt.x - m.x, py = b.punkt.y - m.y, pz = b.punkt.z - m.z, d = L(px, py, pz) || 1;
    // Nur am Zenit (Nick > folgen.nickMax 69°) bzw. bis der gebremste Befehl wieder aufs Ziel aufgeholt hat (nOk 2).
    // WARUM nicht immer: der Vorhalt soll im v0-Umschalt-Takt sofort stimmen (Test I) — darunter ist die Gier-Rate
    // ≤ Großkreis / cos 69° (Drohne 150 m/s in 500 m → ≤ 48°/s) und der Turm folgt.
    // Frisch zugeteilt (nOk 0): Befehl direkt aufs Ziel (das Einschwenken übernimmt das Richten des Turms wie R7).
    // R14: im Turm-Rahmen (unten montiert liegt der Zenit unter dem Schiff) — s = 1 oben, −1 unten
    const s = sgn[i], pg = Math.atan2(s * px, pz), pn = Math.asin(klemme(s * py / d, -1, 1));
    if (nOk[i] === 0 || (nOk[i] === 1 && pn <= F.nickMax && nN[i] <= F.nickMax)) { nOk[i] = 1; nG[i] = pg; nN[i] = pn; return; }
    const U = F.bremse, mg = U.gier * nahDt, mn = U.nick * nahDt, dg = winkelDiff(pg, nG[i]), dn = pn - nN[i];
    if (Math.abs(dg) <= mg && Math.abs(dn) <= mn) { nOk[i] = 1; nG[i] = pg; nN[i] = pn; return; }
    nOk[i] = 2; nG[i] = winkelDiff(nG[i] + klemme(dg, -mg, mg), 0); nN[i] += klemme(dn, -mn, mn);
    const cn = Math.cos(nN[i]);
    b.punkt.x = m.x + s * Math.sin(nG[i]) * cn * d; b.punkt.y = m.y + s * Math.sin(nN[i]) * d; b.punkt.z = m.z + Math.cos(nG[i]) * cn * d;
    b.feuer = false;
  }

  // ---------- Folgen: Sperrkästen auf der Bedrohung (R9) ----------
  /** Gruppen bilden: gierige Teilung an der größten Lücke quer/hoch/radial (> schwelle m), bis maxN
   *  Gruppen. Schreibt grp[0..nb) und liefert die Anzahl. WARUM gierig statt Cluster-Verfahren: ≤ 10 Drohnen, fester
   *  Rechenweg (Gleichlauf), keine Objekte; die Lücken-Schwellen sind dieselben Größen, die der Nutzer sieht. */
  function teile(nb, schwelle, maxN) {
    for (let a = 0; a < nb; a++) grp[a] = 0;
    let ng = nb > 0 ? 1 : 0;
    while (ng < maxN) {
      let bestS = 1, bestG = -1, bestAchse = 0, bestWert = 0;
      for (let g = 0; g < ng; g++) {
        for (let achse = 0; achse < 3; achse++) {
          const A = achse === 0 ? bQ : achse === 1 ? bH : bD;
          let m = 0;
          for (let a = 0; a < nb; a++) if (grp[a] === g) ord[m++] = a;
          if (m < 2) continue;
          for (let a = 1; a < m; a++) { const v = ord[a]; let c = a - 1; while (c >= 0 && A[ord[c]] > A[v]) { ord[c + 1] = ord[c]; c--; } ord[c + 1] = v; }
          for (let a = 0; a + 1 < m; a++) {
            const s = (A[ord[a + 1]] - A[ord[a]]) / schwelle;
            if (s > bestS) { bestS = s; bestG = g; bestAchse = achse; bestWert = (A[ord[a + 1]] + A[ord[a]]) / 2; }
          }
        }
      }
      if (bestG < 0) break;
      const A = bestAchse === 0 ? bQ : bestAchse === 1 ? bH : bD;
      for (let a = 0; a < nb; a++) if (grp[a] === bestG && A[a] > bestWert) grp[a] = ng;
      ng++;
    }
    return ng;
  }

  /** Sollwerte eines Kastens aus Gruppe g (Schwerpunkt der vorausgesagten Lagen, Größe aus der Streuung). */
  function sollAusGruppe(s, g, nb) {
    let sx = 0, sy = 0, sz = 0, sw = 0, sd = 0;
    for (let a = 0; a < nb; a++) bK[a] = grp[a] === g ? bW[a] : 0;
    for (let schritt = 0; schritt < 3; schritt++) {
      sx = sy = sz = sw = sd = 0;
      for (let a = 0; a < nb; a++) { const w = bK[a]; if (!w) continue; sx += w * bX[a]; sy += w * bY[a]; sz += w * bZ[a]; sw += w; }
      if (schritt === 2) break;
      const cx = sx / sw, cy = sy / sw, cz = sz / sw;
      for (let a = 0; a < nb; a++) if (grp[a] === g) { const e = L(bX[a] - cx, bY[a] - cy, bZ[a] - cz) / F.kern; bK[a] = bW[a] * Math.exp(-e * e) + 1e-9 * bW[a]; }
    }
    for (let a = 0; a < nb; a++) sd += bK[a] * bD[a];
    const l = L(sx, sy, sz) || 1;
    // WARUM |Nick| ≤ 1,2 rad (69°): nahe am Zenit dreht die Gier-Achse eines Turms, der neben der Mitte steht, beliebig
    // schnell (Messung R9: Kasten bei 81° Nick → Befehle bis 150°/s Gier); R14: ebenso am Nadir (Zenit der unten montierten)
    s.sollGier = Math.atan2(sx, sz); s.sollNick = klemme(Math.asin(klemme(sy / l, -1, 1)), -F.nickMax, F.nickMax);
    const mD = sd / sw;
    s.sollAbstand = klemme(mD - F.vorne, F.abstand[0], F.abstand[1]);
    let vg = 0, vn = 0, vr = 0;
    for (let a = 0; a < nb; a++) {
      if (!bK[a]) continue;
      const dg = winkelDiff(bG[a], s.sollGier) * Math.cos(bN[a]) * bD[a], dn = (bN[a] - s.sollNick) * bD[a], dr = bD[a] - mD;
      vg += bK[a] * dg * dg; vn += bK[a] * dn * dn; vr += bK[a] * dr * dr;
    }
    const A = s.sollAbstand, T = F.tiefe;
    // Regler raumZuschlag (R11): Untergrenze max(20, Zuschlag + 20) — WARUM gekoppelt: die feste Klammer 120 m verschluckte
    // kleine Zuschläge; Standard 100 → 120–250 wie R10. Obergrenze wächst mit, falls der Zuschlag sie überholt.
    // R12: Obergrenze = quer[2] · faktor (W.querMax)
    const Z = W.raumZuschlag, qMin = Math.max(20, Z + 20), qMax = Math.max(W.querMax, qMin);
    // Deckel in rad zusätzlich (R12 nur noch geometrisch, das Tempo regelt musterTakt)
    s.sollBreite = Math.min(klemme(Math.sqrt(vg / sw) + Z, qMin, qMax), F.gierHalbMax * A);
    s.sollHoehe = Math.min(klemme(Math.sqrt(vn / sw) + Z, qMin, qMax), F.nickHalbMax * A);
    s.sollTiefe = klemme(Math.sqrt(vr / sw) + T[0], T[1], W.tiefeMax);
    let gw = 0; for (let a = 0; a < nb; a++) if (grp[a] === g) gw += bW[a];
    s.gewicht = gw;
    // Tiefenlagen (R10): mittlere Geschwindigkeit (Richtung) und mittleres Tempo (Lagenabstand), kern-gewichtet
    let vx = 0, vy = 0, vz = 0, vt = 0;
    for (let a = 0; a < nb; a++) { const w = bK[a]; if (!w) continue; vx += w * bVx[a]; vy += w * bVy[a]; vz += w * bVz[a]; vt += w * L(bVx[a], bVy[a], bVz[a]); }
    s.svx = vx / sw; s.svy = vy / sw; s.svz = vz / sw; s.sollTempo = vt / sw;
  }

  /** Kasten b übernimmt den Zustand von Kasten a (neuer Kasten entsteht aus dem alten → kein Sprung). */
  function kopiereKasten(b, a) {
    b.gier = a.gier; b.nick = a.nick; b.abstand = a.abstand; b.breite = a.breite; b.hoehe = a.hoehe; b.tiefeHalb = a.tiefeHalb;
    b.sollGier = a.sollGier; b.sollNick = a.sollNick; b.sollAbstand = a.sollAbstand;
    b.sollBreite = a.breite; b.sollHoehe = a.hoehe; b.sollTiefe = a.tiefeHalb; b.gewicht = 0;
    b.phG = a.phG; b.phN = a.phN; b.phR = a.phR; // R12: Muster läuft ohne Sprung weiter
    b.vx = a.vx; b.vy = a.vy; b.vz = a.vz; b.svx = a.svx; b.svy = a.svy; b.svz = a.svz; b.tempo = a.tempo; b.sollTempo = a.sollTempo;
    b.laengs.x = a.laengs.x; b.laengs.y = a.laengs.y; b.laengs.z = a.laengs.z; b.lagenAbstand = a.lagenAbstand;
  }
  /** Abstand (m) zwischen der Mitte von Kasten s und der Soll-Mitte von Gruppe g (über die vorher berechneten gm*). */
  function kastenZuGruppe(s, g) {
    const c = Math.cos(s.nick), x = Math.sin(s.gier) * c * s.abstand, y = Math.sin(s.nick) * s.abstand, z = Math.cos(s.gier) * c * s.abstand;
    return L(x - gmX[g], y - gmY[g], z - gmZ[g]);
  }

  function folgeSchirme(dt, ziele, v0) {
    // 1) Bedrohung: vorausgesagte Lage (pos + vel · Flugzeit), Gewicht 1 + Angriff + 0,5·Annäherung
    let nb = 0;
    for (let j = 0; j < ziele.length && j < MAXZ; j++) {
      const z = ziele[j];
      if (!z.aktiv || nahSlot[j]) continue; // Eindringlinge bekommen Direktbeschuss, keinen Kasten
      const d0 = L(z.pos.x - M.x, z.pos.y - M.y, z.pos.z - M.z), tf = d0 / v0;
      const qx = z.pos.x + z.vel.x * tf - M.x, qy = z.pos.y + z.vel.y * tf - M.y, qz = z.pos.z + z.vel.z * tf - M.z, d = L(qx, qy, qz) || 1;
      const an = -((z.pos.x - M.x) * z.vel.x + (z.pos.y - M.y) * z.vel.y + (z.pos.z - M.z) * z.vel.z) / (d0 || 1) / K.tempoBezug;
      bX[nb] = qx; bY[nb] = qy; bZ[nb] = qz; bVx[nb] = z.vel.x; bVy[nb] = z.vel.y; bVz[nb] = z.vel.z;
      bG[nb] = Math.atan2(qx, qz); bN[nb] = Math.asin(klemme(qy / d, -1, 1)); bD[nb] = d;
      bQ[nb] = bG[nb] * Math.cos(bN[nb]) * d; bH[nb] = bN[nb] * d; // Bogenlängen für die Lücken
      bW[nb] = 1 + (z.angriff ? 1 : 0) + 0.5 * klemme(an, 0, 1);
      nb++;
    }
    if (!schirmeBereit) {
      // Start: Standard-Sektor, damit die erste Bewegung weich aus der Mitte kommt
      for (const s of schirmVorrat) {
        s.gier = s.sollGier = STANDARD.gierMitte; s.nick = s.sollNick = (STANDARD.nickMin + STANDARD.nickMax) / 2;
        s.abstand = s.sollAbstand = 800; s.breite = s.sollBreite = 150; s.hoehe = s.sollHoehe = 80; s.tiefeHalb = s.sollTiefe = 100;
        s.vx = s.vy = s.vz = s.svx = s.svy = s.svz = 0; s.tempo = s.sollTempo = 130; s.lagenAbstand = 100;
        richtungZurBatterie(s, s.laengs);
      }
      schirmeBereit = true;
    }
    seitUmgruppiert += dt;
    if (nb > 0) {
      // 2) Anzahl der Kästen mit Hysterese: mehr erst über den hohen, weniger erst unter den tiefen Lücken; ≤ alle 2 s
      const LG = F.luecke, maxK = Math.min(F.maxKaesten, MAXK, Math.floor(nTeil / F.minTuerme));
      const nHoch = teile(nb, LG[0], maxK), nTief = teile(nb, LG[1], maxK);
      const wunsch = nHoch > anzahlGruppen ? nHoch : nTief < anzahlGruppen ? Math.max(1, nTief) : anzahlGruppen;
      if (wunsch !== anzahlGruppen && seitUmgruppiert >= F.umgruppieren) {
        const alt = anzahlGruppen;
        anzahlGruppen = wunsch; seitUmgruppiert = 0; statistik.gruppenWechsel++;
        if (wunsch > alt) {
          // neue Kästen entstehen aus dem alten, der der am schlechtesten bedienten Gruppe am nächsten ist
          const ng = teile(nb, LG[1], wunsch);
          gruppenMitten(ng, nb);
          for (let j = alt; j < wunsch; j++) {
            let schlechtG = 0, schlechtD = -1;
            for (let g = 0; g < ng; g++) {
              let dmin = Infinity;
              for (let k = 0; k < j; k++) dmin = Math.min(dmin, kastenZuGruppe(schirmVorrat[k], g));
              if (dmin > schlechtD) { schlechtD = dmin; schlechtG = g; }
            }
            let quelle = 0, qd = Infinity;
            for (let k = 0; k < j; k++) { const d = kastenZuGruppe(schirmVorrat[k], schlechtG); if (d < qd) { qd = d; quelle = k; } }
            kopiereKasten(schirmVorrat[j], schirmVorrat[quelle]);
          }
        }
      }
      // 3) Zuordnung mit Gedächtnis (ein k-Mittel-Schritt): jede Drohne zum Kasten mit der nächsten Soll-Mitte des
      //    letzten Takts. WARUM nicht jeden Takt neu teilen: die Gruppen kippten zwischen Nachbarn, die Soll-Mitte sprang
      //    und der Kasten hing im Mittel 125 m neben den Drohnen (Messung R9; die Soll-Mitte selbst lag 38 m daneben).
      for (let k = 0; k < anzahlGruppen; k++) {
        const q = schirmVorrat[k], c = Math.cos(q.sollNick);
        gmX[k] = Math.sin(q.sollGier) * c * q.sollAbstand; gmY[k] = Math.sin(q.sollNick) * q.sollAbstand; gmZ[k] = Math.cos(q.sollGier) * c * q.sollAbstand;
        kAnz[k] = 0;
      }
      for (let j = 0; j < nb; j++) {
        let best = 0, bd = Infinity;
        for (let k = 0; k < anzahlGruppen; k++) { const d = L(bX[j] - gmX[k], bY[j] - gmY[k], bZ[j] - gmZ[k]); if (d < bd) { bd = d; best = k; } }
        grp[j] = best; bE[j] = bd; kAnz[best]++;
      }
      // leerer Kasten holt sich die am schlechtesten bediente Drohne (größter Abstand, ihr Kasten behält mind. eine)
      for (let k = 0; k < anzahlGruppen; k++) {
        if (kAnz[k]) continue;
        let w = -1, wd = -1;
        for (let j = 0; j < nb; j++) if (kAnz[grp[j]] > 1 && bE[j] > wd) { wd = bE[j]; w = j; }
        if (w >= 0) { kAnz[grp[w]]--; grp[w] = k; kAnz[k]++; }
      }
      for (let k = 0; k < anzahlGruppen; k++) {
        if (kAnz[k]) sollAusGruppe(schirmVorrat[k], k, nb); else schirmVorrat[k].gewicht = 0; // ohne Drohne: Soll bleibt
      }
      // 4) Türme verteilen (beim Umgruppieren bzw. alle 2 s): je Kasten mind. 2, Rest nach Gewicht; Kästen nach Gier,
      //    Türme nach x (−X-Türme → Kasten mit kleinerer Gier)
      //    WARUM nicht mehr alle 2 s (Befund Prüfer R9): jeder Wechsel eines Rohrs ließ seinen Befehl springen — nur noch
      //    beim Umgruppieren oder wenn ein Kasten weniger als minTuerme Rohre hat; bestehende Zuordnung bleibt bevorzugt
      // R14: zusätzlich alle 0,5 s, wenn ein Turm seinen Raum nicht mehr erreicht (am Prüfstand nie)
      // R23: auch sofort, wenn ein Turm in Handsteuerung geht oder zurückkommt (teilNeu)
      if (teilNeu || seitUmgruppiert === 0 || zuWenigTuerme() || (takt % 30 === 0 && falschZugeteilt())) verteileTuerme();
    }
    // 5) träge nachführen: Glättung τ, Drehtempo ≤ maxDreh, Abstand ≤ maxAbstandTempo, Größe τ 1 s
    const al = 1 - Math.exp(-dt / F.tau), a1 = 1 - Math.exp(-dt / F.tauGroesse);
    lage.schirme.length = 0;
    for (let g = 0; g < anzahlGruppen; g++) {
      const s = schirmVorrat[g];
      let dg = winkelDiff(s.sollGier, s.gier) * al, dn = (s.sollNick - s.nick) * al;
      // WARUM je Achse (Gier um die Hochachse, Nick) statt Großkreis: die Türme richten je Achse; bei hohem Nick ist
      // die Gier-Rate = Großkreis / cos(Nick) — Messung R9: Befehle bis 181°/s Gier. Richtung bleibt (gemeinsamer Faktor).
      const f = Math.max(Math.abs(dg) / (F.maxDreh * dt), Math.abs(dn) / (F.maxDrehNick * dt));
      if (f > 1) { dg /= f; dn /= f; }
      s.gier = winkelDiff(s.gier + dg, 0); s.nick += dn;
      s.abstand += klemme((s.sollAbstand - s.abstand) * al, -F.maxAbstandTempo * dt, F.maxAbstandTempo * dt);
      s.breite += (s.sollBreite - s.breite) * a1; s.hoehe += (s.sollHoehe - s.hoehe) * a1; s.tiefeHalb += (s.sollTiefe - s.tiefeHalb) * a1;
      s.gierHalb = Math.min(s.breite / s.abstand, F.gierHalbMax); s.nickHalb = Math.min(s.hoehe / s.abstand, F.nickHalbMax);
      const c2 = Math.cos(s.nick);
      s.mitte.x = M.x + Math.sin(s.gier) * c2 * s.abstand; s.mitte.y = M.y + Math.sin(s.nick) * s.abstand; s.mitte.z = M.z + Math.cos(s.gier) * c2 * s.abstand;
      lagenNachfuehren(s, dt, v0);
      s.tuerme.length = 0;
      lage.schirme.push(s);
    }
    for (let i = 0; i < n; i++) {
      if (!teil[i]) continue; // R23: schwere und manuelle Türme stehen in keinem Raum
      // WARUM < 0 → 0: ein Turm, der ohne Bedrohung (nb 0) aus der Handsteuerung kommt, hat noch keinen Raum
      if (gruppeTurm[i] >= anzahlGruppen) gruppeTurm[i] = anzahlGruppen - 1; else if (gruppeTurm[i] < 0) gruppeTurm[i] = 0;
      schirmVorrat[gruppeTurm[i]].tuerme.push(i);
    }
  }

  /** Einheitsrichtung von der Raummitte (s.gier, s.nick) zur Batterie nach `aus`. */
  function richtungZurBatterie(s, aus) {
    const c = Math.cos(s.nick);
    aus.x = -Math.sin(s.gier) * c; aus.y = -Math.sin(s.nick); aus.z = -Math.cos(s.gier) * c;
  }

  /** Tiefenlagen (R10): Flugrichtung glätten (τ lagen.tau), Richtung „vor“ mit ≤ lagen.maxDreh schwenken, Lagenabstand
   *  aus Tempo × Flugzeit, Lagenmitten vor / auf / hinter der Raummitte. */
  const tmpR = { x: 0, y: 0, z: 0 };
  function lagenNachfuehren(s, dt, v0) {
    const LA = F.lagen, a = 1 - Math.exp(-dt / LA.tau);
    s.vx += (s.svx - s.vx) * a; s.vy += (s.svy - s.vy) * a; s.vz += (s.svz - s.vz) * a; s.tempo += (s.sollTempo - s.tempo) * a;
    richtungZurBatterie(s, tmpR);
    let tx = s.vx + tmpR.x * LA.zuBatterie, ty = s.vy + tmpR.y * LA.zuBatterie, tz = s.vz + tmpR.z * LA.zuBatterie;
    const tl = L(tx, ty, tz);
    if (tl > 1e-6) {
      tx /= tl; ty /= tl; tz /= tl;
      const e = s.laengs, w = Math.acos(klemme(e.x * tx + e.y * ty + e.z * tz, -1, 1)), mw = LA.maxDreh * dt;
      // WARUM Mischen mit Faktor statt Drehmatrix: bei ≤ 0,006 rad je Takt ist der Fehler vernachlässigbar; Länge neu
      const f = w > mw ? mw / w : 1;
      let ex = e.x + (tx - e.x) * f, ey = e.y + (ty - e.y) * f, ez = e.z + (tz - e.z) * f;
      const el = L(ex, ey, ez) || 1; e.x = ex / el; e.y = ey / el; e.z = ez / el;
    }
    // Regler lagenAnteil (R11): die Klammer 120–150 m skaliert mit — WARUM: sonst bliebe der Abstand fast immer an der
    // Klammer (0,6 · 120 m/s · 1,15 s ≈ 83 → 120 m) und der Regler wirkte nicht. Standard 0,6 → Faktor 1 wie R10.
    const fa = W.lagenAnteil / LA.anteil;
    s.lagenAbstand = klemme(W.lagenAnteil * s.tempo * s.abstand / v0, LA.min * fa, LA.max * fa);
    const e = s.laengs, d = s.lagenAbstand;
    // WARUM + vorlauf·v·τ: die Glättung der Mitte (τ) hinkt einer bewegten Gruppe um v·τ hinterher (Messung R10: 30 %
    // der Detonationen hinter, 15 % vor der Drohne) — die Lagen bekommen diesen Rückstand zurück und etwas Vorlauf
    const px = s.mitte.x + s.vx * F.tau * F.lagen.vorlauf, py = s.mitte.y + s.vy * F.tau * F.lagen.vorlauf, pz = s.mitte.z + s.vz * F.tau * F.lagen.vorlauf;
    for (let j = 0; j < 3; j++) {
      const o = (1 - j) * d; // Lage 0 vor (+d), 1 auf, 2 hinter (−d)
      s.lagen[j].x = px + e.x * o; s.lagen[j].y = py + e.y * o; s.lagen[j].z = pz + e.z * o;
    }
  }

  /** Lage des k-ten Rohrs (Platz in s.tuerme) bei T Rohren im Raum: vor, auf, hinter, vor, … — WARUM die vordere zuerst:
   *  „in Richtung der Gefahr“; bei 2 Rohren (3 Gruppen) vor + auf, bei 1 Rohr nur vor. */
  const lageVon = (k) => k % 3;

  /** Soll-Mitten (kartesisch, relativ zu M) der Gruppen 0..ng nach gmX/gmY/gmZ. */
  function gruppenMitten(ng, nb) {
    for (let g = 0; g < ng; g++) {
      let sx = 0, sy = 0, sz = 0, sw = 0, sd = 0;
      for (let a = 0; a < nb; a++) if (grp[a] === g) { const w = bW[a]; sx += w * bX[a]; sy += w * bY[a]; sz += w * bZ[a]; sw += w; sd += w * bD[a]; }
      const l = L(sx, sy, sz) || 1, d = sd / (sw || 1);
      gmX[g] = sx / l * d; gmY[g] = sy / l * d; gmZ[g] = sz / l * d;
    }
  }

  /** R14: Soll-Mitte von Raum k von Turm i aus erreichbar (Turm-Rahmen, über die Ersatz-Mündung)? */
  function raumReicht(i, k) {
    const s = schirmVorrat[k], c = Math.cos(s.sollNick), A = s.sollAbstand, m = ersatzM[i];
    return reicht(i, M.x + Math.sin(s.sollGier) * c * A - m.x, M.y + Math.sin(s.sollNick) * A - m.y, M.z + Math.cos(s.sollGier) * c * A - m.z);
  }
  /** Anzahl der Türme, die Raum k erreichen (R14). */
  function reichAnzahl(k) { let a = 0; for (let i = 0; i < n; i++) if (teil[i] && raumReicht(i, k)) a++; return a; }

  function zuWenigTuerme() {
    if (anzahlGruppen < 2) return false;
    kBel.fill(0);
    for (let i = 0; i < n; i++) if (teil[i] && gruppeTurm[i] >= 0 && gruppeTurm[i] < anzahlGruppen) kBel[gruppeTurm[i]]++;
    // R14: ein Raum, den weniger als minTuerme Türme erreichen, gilt mit allen erreichenden als voll — WARUM: sonst
    // verteilte die KI am Schiff jeden Takt neu (unter dem Schiff sieht nur die untere Hälfte hin)
    for (let k = 0; k < anzahlGruppen; k++) if (kBel[k] < F.minTuerme && kBel[k] < reichAnzahl(k)) return true;
    return false;
  }
  /** R14: sitzt ein Turm in einem Raum, den er nicht erreicht (Raum gewandert, Schiff gedreht)? */
  function falschZugeteilt() {
    for (let i = 0; i < n; i++) { const g = gruppeTurm[i]; if (teil[i] && g >= 0 && g < anzahlGruppen && !raumReicht(i, g)) return true; }
    return false;
  }

  function verteileTuerme() {
    // R23: nur die teilnehmenden Gatlings (nTeil statt n; ohne schwere/manuelle Türme identisch)
    teilNeu = false;
    const nK = anzahlGruppen;
    for (let k = 0; k < nK; k++) { kOrd[k] = k; kAnz[k] = nK > 1 ? F.minTuerme : nTeil; }
    if (nK > 1) {
      let rest = nTeil - nK * F.minTuerme, W = 0;
      for (let k = 0; k < nK; k++) W += schirmVorrat[k].gewicht;
      // Rest nach Gewicht (größter Anteil zuerst, gleich → kleinere Nummer), deterministisch
      while (rest > 0) {
        let best = 0, bestV = -Infinity;
        for (let k = 0; k < nK; k++) { const v = (W > 0 ? schirmVorrat[k].gewicht / W * nTeil : 1) - kAnz[k]; if (v > bestV) { bestV = v; best = k; } }
        kAnz[best]++; rest--;
      }
      // Kästen nach Gier sortieren (Einfügen)
      for (let a = 1; a < nK; a++) { const v = kOrd[a]; let c = a - 1; while (c >= 0 && schirmVorrat[kOrd[c]].gier > schirmVorrat[v].gier) { kOrd[c + 1] = kOrd[c]; c--; } kOrd[c + 1] = v; }
    }
    // bestehende Zuordnung bevorzugen (in x-Reihenfolge, bis der Kasten voll ist), Rest an Kästen nach Gier
    kBel.fill(0);
    for (let a = 0; a < n; a++) {
      const i = turmNachX[a], g = gruppeTurm[i];
      if (!teil[i]) { gruppeTurm[i] = -1; continue; }
      if (g >= 0 && g < nK && kBel[g] < kAnz[g] && raumReicht(i, g)) kBel[g]++; else gruppeTurm[i] = -1;
    }
    // R14: nur in Räume, die der Turm erreicht (Prüfstand: alle → wie R13)
    for (let q = 0; q < nK; q++) {
      const k = kOrd[q];
      for (let a = 0; a < n && kBel[k] < kAnz[k]; a++) { const i = turmNachX[a]; if (teil[i] && gruppeTurm[i] === -1 && raumReicht(i, k)) { gruppeTurm[i] = k; kBel[k]++; } }
    }
    // Rest (Kontingent voll oder kein erreichbarer Raum mit Platz): erreichbarer Raum mit dem größten Gewicht je Turm,
    // sonst der schwerste Raum (der Turm wartet am Anschlag, bis sich die Lage dreht)
    for (let a = 0; a < n; a++) {
      const i = turmNachX[a];
      if (!teil[i] || gruppeTurm[i] !== -1) continue;
      let best = -1, bestV = -Infinity, schwer = 0;
      for (let k = 0; k < nK; k++) {
        const w = schirmVorrat[k].gewicht;
        if (w > schirmVorrat[schwer].gewicht) schwer = k;
        const v = w / (kBel[k] + 1);
        if (raumReicht(i, k) && v > bestV) { bestV = v; best = k; }
      }
      gruppeTurm[i] = best >= 0 ? best : schwer; kBel[gruppeTurm[i]]++;
    }
  }

  function festerSchirm(dt, R, Sbefehl) {
    const s = schirmVorrat[0];
    if (!warFest) {
      // Umschalten auf fest: die Wand bleibt, wo sie ist → größten aktuellen Kasten (meiste Türme) als Sektor merken
      if (schirmeBereit && lage.schirme.length) {
        let q = lage.schirme[0];
        for (let g = 1; g < lage.schirme.length; g++) if (lage.schirme[g].tuerme.length > q.tuerme.length) q = lage.schirme[g];
        fest.gierMitte = q.gier; fest.gierHalb = q.gierHalb; fest.nickMin = q.nick - q.nickHalb; fest.nickMax = q.nick + q.nickHalb;
        if (q !== s) { s.abstand = q.abstand; s.tiefeHalb = q.tiefeHalb; }
      } else if (!schirmeBereit) { s.abstand = R; s.tiefeHalb = 0; } // Start im festen Modus: sofort auf dem befohlenen Abstand
      warFest = true;
    }
    const S = Sbefehl ?? fest;
    s.gier = s.sollGier = S.gierMitte; s.nick = s.sollNick = (S.nickMin + S.nickMax) / 2;
    s.gierHalb = S.gierHalb; s.nickHalb = (S.nickMax - S.nickMin) / 2;
    // WARUM gleiten: +/− und das Umschalten sollen die Wand nicht springen lassen (gleiches Tempo wie beim Folgen)
    s.sollAbstand = R; s.abstand += klemme(R - s.abstand, -F.maxAbstandTempo * dt, F.maxAbstandTempo * dt);
    // Feste Wand = Kugelschale: die Tiefe des Kastens klingt weich ab (τ 1 s), statt im Umschalt-Takt zu springen
    s.tiefeHalb += (0 - s.tiefeHalb) * (1 - Math.exp(-dt / F.tauGroesse));
    s.breite = s.sollBreite = s.gierHalb * s.abstand; s.hoehe = s.sollHoehe = s.nickHalb * s.abstand; s.sollTiefe = s.tiefeHalb;
    const c = Math.cos(s.nick), A = s.abstand;
    s.mitte.x = M.x + Math.sin(s.gier) * c * A; s.mitte.y = M.y + Math.sin(s.nick) * A; s.mitte.z = M.z + Math.cos(s.gier) * c * A;
    // feste Wand = eine Lage (die mittlere) auf der Schale; beim Zurückschalten führt lagenNachfuehren weiter
    s.lagen[1].x = s.mitte.x; s.lagen[1].y = s.mitte.y; s.lagen[1].z = s.mitte.z;
    s.tuerme.length = 0; for (let i = 0; i < n; i++) if (teil[i]) s.tuerme.push(i);
    lage.schirme.length = 0; lage.schirme.push(s);
    // Kasten 0 bleibt gültig → beim Zurückschalten auf Folgen gleitet er von hier aus weiter (kein Rücksprung)
    schirmeBereit = true; anzahlGruppen = 1; gruppeTurm.fill(0);
  }

  // ---------- R23: Handsteuerung und Hauptbatterie ----------
  /** Turm unter Handsteuerung: KI schweigt (kein Feuer, kein Ziel); punkt bleibt, damit die Rückkehr mit einem
   *  Übergang vom zuletzt befohlenen Punkt beginnt (kastenVor −1 → Übergang wie aus Killzone/Zielfeuer). */
  function manuellBefehl(i) {
    const b = befehle[i];
    b.feuer = false; b.zielId = null;
    if (kastenVor[i] !== -2) kastenVor[i] = -1;
    zielSlot[i] = -1; halt[i] = 0; schwerSlot[i] = -1; schwerId[i] = -1; schwerHalt[i] = 0;
  }

  /** Munition für ein Ziel nach hauptMunition (R23, E3): 'flak' | 'panzer' fest, sonst panzer ≥ 0,5 → 'panzer'. */
  const waehleMunition = (haupt, z) => (haupt === 'flak' || haupt === 'panzer' ? haupt
    : (z && z.panzer >= KS.panzerAb ? 'panzer' : 'flak'));

  /** Schwerer Turm i (Hauptbatterie): Zielwahl mit Trägheit, Munition, sonst Raumfeuer bzw. Ruhe. */
  function schwerSchritt(i, ziele, turmZustand, frei, leucht, haupt, vorgabeNeu, S, R, folgen) {
    const b = befehle[i], tz = turmZustand?.[i], m = tz?.muendung ?? ersatzM[i];
    const v0 = tz?.v0 ?? K.v0, rw = tz?.reichweite ?? K.reichweite;
    b.leuchtspur = leucht;
    // Zielfeuer auf jedes Ziel, wenn kein Raum da ist (Zielfeuer-Betrieb) oder nur Panzergranaten erlaubt sind
    const alle = haupt === 'panzer' || lage.schirme.length === 0;
    gesperrtZeit[i] = tz?.gesperrt ? gesperrtZeit[i] + nahDt : 0;
    let cur = schwerSlot[i], curWert = -1;
    if (cur >= 0 && (cur >= ziele.length || ziele[cur].id !== schwerId[i])) cur = -1;
    if (cur >= 0) curWert = gesperrtZeit[i] > K.gesperrtFrei ? -1 : bewerteSchwer(i, ziele[cur], m, v0, rw, alle, ab);
    if (curWert < 0) { cur = -1; gesperrtZeit[i] = 0; }
    schwerHalt[i] += nahDt;
    const dran = cur < 0 || vorgabeNeu || (takt % K.takteJeBewertung === i % K.takteJeBewertung && schwerHalt[i] >= K.haltezeit);
    if (dran) {
      let best = -1, bestWert = -1;
      for (let j = 0; j < ziele.length; j++) {
        if (j === cur) continue;
        const w = bewerteSchwer(i, ziele[j], m, v0, rw, alle, abBest);
        if (w > bestWert) { bestWert = w; best = j; }
      }
      // WARUM ohne Trägheit bei neuer Vorgabe: der Waffenoffizier soll sofort sehen, dass die Batterie umschwenkt
      const vorgabeBest = vorgabeNeu && best >= 0 && ziele[best].id === vorgabe;
      if (best >= 0 && (cur < 0 || vorgabeBest || bestWert > curWert * K.wechselFaktor)) {
        cur = best; schwerHalt[i] = 0;
        curWert = bewerteSchwer(i, ziele[cur], m, v0, rw, alle, ab);
      }
    }
    schwerSlot[i] = cur; schwerId[i] = cur >= 0 ? ziele[cur].id : -1;
    if (cur >= 0) {
      const z = ziele[cur], d = ab.t * v0;
      b.zielId = z.id; b.munition = waehleMunition(haupt, z);
      b.punkt.x = ab.x; b.punkt.y = ab.y; b.punkt.z = ab.z; b.zuender = Math.max(ab.t, K.zuenderStrecke / v0);
      if (b.munition === 'panzer') {
        // Panzergranate: kein Zünder, Treffer nur direkt → keine Streukugel, Spielraum aus dem Zielradius
        b.streuKugel = 0; b.streuTiefe = 0;
        b.toleranz = Math.max(KS.apToleranz * (z.r ?? 6) / d, KS.apToleranzMin);
      } else {
        b.streuKugel = leucht ? spurKugel(W.ziel, d) : W.ziel; b.streuTiefe = W.ziel;
        b.toleranz = kugelToleranz(b.streuKugel, d, leucht, deckelDunkel);
      }
      b.feuer = frei;
      return;
    }
    b.zielId = null;
    // Raumfeuer (Flak-Großgranate): Raum mit dem größten Gewicht, den der Turm erreicht; Punkt eine Lagenbreite vor
    // der vorderen Lage — WARUM: die Gatlings bestreichen vor/auf/hinter, die Hauptbatterie fängt die Gruppe davor ab
    let q = null;
    for (let g = 0; g < lage.schirme.length; g++) {
      const s = lage.schirme[g];
      if ((q === null || s.gewicht > q.gewicht) && raumReicht(i, schirmVorrat.indexOf(s))) q = s;
    }
    if (q !== null && haupt !== 'panzer') {
      const folgt = folgen; // feste Wand: nur die mittlere Lage ist gültig (festerSchirm)
      const c = folgt ? q.lagen[0] : q.mitte, vor = folgt ? KS.raumVorlauf * q.lagenAbstand : 0;
      b.punkt.x = c.x + q.laengs.x * vor; b.punkt.y = c.y + q.laengs.y * vor; b.punkt.z = c.z + q.laengs.z * vor;
      const px = b.punkt.x - m.x, py = b.punkt.y - m.y, pz = b.punkt.z - m.z, d = L(px, py, pz) || 1;
      b.zuender = Math.min(Math.max(d / v0, K.zuenderStrecke / v0), K.zuender[1]);
      b.munition = 'flak';
      b.streuKugel = leucht ? spurKugel(W.sperrQuer, d) : W.sperrQuer; b.streuTiefe = W.sperrTiefe;
      b.toleranz = klemme(0.5 * Math.min(q.breite, q.hoehe) / q.abstand, 0.015, K.toleranzSperr);
      b.feuer = frei && reicht(i, px, py, pz);
      return;
    }
    // Ruhe: Sektormitte, Munition bleibt geladen (kein unnötiges Nachladen)
    b.feuer = false; b.toleranz = K.toleranzSperr; b.streuKugel = 0; b.streuTiefe = 0;
    setzeAufSchale(b, m, v0, S.gierMitte, (S.nickMin + S.nickMax) / 2, R);
  }

  function schritt(dt, befehl, ziele, turmZustand) {
    const modus = befehl?.modus ?? 'sperrfeuer', frei = !!befehl?.feuerFrei;
    // R23: Handsteuerung, CIC-Vorgabe, Hauptbatterie-Munition (fehlen → bitgleich R22)
    const manuell = Number.isInteger(befehl?.manuell) && befehl.manuell >= 0 && befehl.manuell < n ? befehl.manuell : -1;
    if (manuell !== manuellVor) { setzeTeil(manuell); manuellVor = manuell; teilNeu = true; }
    vorgabe = befehl?.zielVorgabe ?? null;
    const vorgabeNeu = vorgabe !== vorgabeVor && vorgabe !== null;
    // Gatlings: beim nächsten eigenen Bewertungstakt sofort wechseln dürfen (ohne Haltezeit und ohne 1,4-fach-Hürde)
    if (vorgabeNeu) for (let i = 0; i < n; i++) vorgabeOffen[i] = 1;
    vorgabeVor = vorgabe;
    const haupt = befehl?.hauptMunition ?? 'auto';
    const R = befehl?.schirmAbstand ?? 800, folgen = befehl?.folgen !== false, S = befehl?.sektor ?? fest;
    if (modus !== letzterModus) { zielSlot.fill(-1); halt.fill(0); letzterModus = modus; }
    const v0Std = turmZustand?.[ersteFlak]?.v0 ?? K.v0; // R23: v0 eines Gatling-Turms (Prüfstand: Turm 0)
    leseStreu(befehl?.streu); deckelDunkel = waffeWert(befehl?.waffe, 'deckelQuer'); nahDt = dt;

    zaehl.fill(0);
    killzone(dt, ziele, turmZustand);
    const leucht = lage.nahbereich;

    if (modus === 'sperrfeuer') {
      if (folgen) { warFest = false; folgeSchirme(dt, ziele, v0Std); } else festerSchirm(dt, R, befehl?.sektor);
      for (let g = 0; g < lage.schirme.length; g++) musterTakt(lage.schirme[g], dt, folgen);
      for (let g = 0; g < lage.schirme.length; g++) {
        const s = lage.schirme[g], T = s.tuerme;
        for (let k = 0; k < T.length; k++) {
          const i = T[k], b = befehle[i], tz = turmZustand?.[i], m = tz?.muendung ?? ersatzM[i], v0 = tz?.v0 ?? K.v0;
          b.leuchtspur = leucht;
          if (nahTurm[i] >= 0) { richteNah(i, ziele, m, v0, frei); kastenVor[i] = -1; continue; }
          // Lage fest je Rohr: Platz im Raum (Türme in fester Reihenfolge) → vor / auf / hinter; feste Wand: nur „auf“.
          // WARUM Platz inkl. Rohren in der Killzone: sonst wechselten die übrigen Rohre die Lage, sobald eines abgezogen
          // wird (Übergang = Feuerpause)
          const j = folgen ? lageVon(k) : 1;
          // Neuer Raum, neue Lage (oder zurück aus Killzone/Zielfeuer): Übergang vom letzten Befehl aus (Befund Prüfer R9)
          if ((kastenVor[i] !== g || lageVor[i] !== j) && kastenVor[i] !== -2) {
            const dx = b.punkt.x - m.x, dy = b.punkt.y - m.y, dz = b.punkt.z - m.z, r = L(dx, dy, dz) || 1; // von der Mündung
            ueb[i] = 1; uOk[i] = 1; uG[i] = Math.atan2(dx, dz); uN[i] = Math.asin(klemme(dy / r, -1, 1)); uR[i] = r;
          }
          kastenVor[i] = g; lageVor[i] = j;
          // WARUM Phase nach fester Turmnummer (nicht Platz im Schirm): sonst springt das Muster, wenn ein Turm in die
          // Killzone wechselt oder zurückkommt (Messung R7: Befehls-Sprünge bis 5900°/s)
          streiche(b, m, v0, i, s, j, dt);
          // Raum: Feuer-Spielraum ≤ halbe kleinste Raumseite (sonst fliegen die Granaten neben den Raum);
          // feste Wand: unverändert toleranzSperr
          b.toleranz = folgen ? klemme(0.5 * Math.min(s.breite, s.hoehe) / s.abstand, 0.015, K.toleranzSperr) : K.toleranzSperr;
          // WARUM kein Feuer im Übergang: der Punkt liegt dann zwischen den Räumen — Granaten dort treffen nichts
          b.zielId = null; b.feuer = frei && !ueb[i];
          // Sättigungsraum: Sperr-Kugel quer + Lagendicke längs (R10); feste Wand bleibt eine Schale (R7, Test B)
          b.streuKugel = folgen ? (leucht ? spurKugel(W.sperrQuer, L(b.punkt.x - m.x, b.punkt.y - m.y, b.punkt.z - m.z)) : W.sperrQuer) : 0;
          b.streuTiefe = folgen ? W.sperrTiefe : 0;
        }
      }
    } else {
      lage.schirme.length = 0;
      for (let i = 0; i < n; i++) if (kastenVor[i] !== -2) kastenVor[i] = -1;
      for (let i = 0; i < n; i++) {
        if (nahTurm[i] >= 0 || !teil[i]) { zielSlot[i] = -1; continue; } // Killzone hat Vorrang; R23: schwer/manuell eigene Wege
        const s = zielSlot[i];
        if (s >= 0 && (s >= ziele.length || !ziele[s].aktiv || ziele[s].id !== befehle[i].zielId || nahSlot[s])) zielSlot[i] = -1; // aktiv=false → sofort frei
        if (zielSlot[i] >= 0) zaehl[zielSlot[i]]++;
      }
      for (let i = 0; i < n; i++) {
        if (!teil[i]) continue;
        const b = befehle[i], tz = turmZustand?.[i], m = tz?.muendung ?? ersatzM[i];
        const v0 = tz?.v0 ?? K.v0, rw = tz?.reichweite ?? K.reichweite;
        b.leuchtspur = leucht;
        if (nahTurm[i] >= 0) { richteNah(i, ziele, m, v0, frei); continue; }
        // Nachbar-Sperre/Grenze: länger als 0,5 s gesperrt → Ziel freigeben, ein anderer Turm darf übernehmen
        gesperrtZeit[i] = tz?.gesperrt ? gesperrtZeit[i] + dt : 0;
        // aktuelle Rohrrichtung (für das Winkel-Gewicht)
        let rx, ry, rz;
        if (tz && tz.gier !== undefined) { const cn = Math.cos(tz.nick); rx = sgn[i] * Math.sin(tz.gier) * cn; ry = sgn[i] * Math.sin(tz.nick); rz = Math.cos(tz.gier) * cn; }
        else { const qx = b.punkt.x - m.x, qy = b.punkt.y - m.y, qz = b.punkt.z - m.z, q = L(qx, qy, qz) || 1; rx = qx / q; ry = qy / q; rz = qz / q; }

        let cur = zielSlot[i], curWert = -1;
        if (cur >= 0) {
          curWert = gesperrtZeit[i] > K.gesperrtFrei ? -1 : bewerte(i, ziele[cur], m, v0, rw, rx, ry, rz, ab);
          if (curWert < 0) { zaehl[cur]--; cur = -1; zielSlot[i] = -1; gesperrtZeit[i] = 0; }
        }
        halt[i] += dt;
        const eigenerTakt = takt % K.takteJeBewertung === i % K.takteJeBewertung;
        const dran = cur < 0 || (eigenerTakt && (halt[i] >= K.haltezeit || vorgabeOffen[i]));
        if (dran) {
          const offen = vorgabeOffen[i]; vorgabeOffen[i] = 0;
          let best = -1, bestWert = -1;
          for (let j = 0; j < ziele.length; j++) {
            if (j === cur || (j < MAXZ && (zaehl[j] >= K.maxJeZiel || nahSlot[j]))) continue;
            const w = bewerte(i, ziele[j], m, v0, rw, rx, ry, rz, abBest);
            if (w > bestWert) { bestWert = w; best = j; }
          }
          if (best >= 0 && (cur < 0 || bestWert > curWert * K.wechselFaktor || (offen && ziele[best].id === vorgabe))) {
            if (cur >= 0) { zaehl[cur]--; statistik.wechsel[i]++; } else if (b.zielId !== null) statistik.zwang[i]++;
            if (ziele[best].id === vorZiel[i] && zeit - wechselZeit[i] < 5) statistik.flackern++;
            vorZiel[i] = b.zielId ?? -1; wechselZeit[i] = zeit;
            cur = best; zielSlot[i] = best; zaehl[best]++; halt[i] = 0;
            curWert = bewerte(i, ziele[cur], m, v0, rw, rx, ry, rz, ab);
          }
        }
        if (cur >= 0) {
          b.zielId = ziele[cur].id;
          b.punkt.x = ab.x; b.punkt.y = ab.y; b.punkt.z = ab.z;
          b.zuender = ab.t;
          // R11: Regler „ziel“ gilt quer und tief. R12 (Befund Waffentechniker): mit Leuchtspur quer selbst auf
          // spurKugel begrenzen — sonst kürzt die Waffe 21 % der Zielfeuer-Schüsse stumm (Nahbereich: alle Türme mit Spur)
          b.streuKugel = b.leuchtspur ? spurKugel(W.ziel, ab.t * v0) : W.ziel; b.streuTiefe = W.ziel;
          b.toleranz = kugelToleranz(b.streuKugel, ab.t * v0, b.leuchtspur, deckelDunkel);
          b.feuer = frei;
          zenitBremse(i, b, m);
          if (zaehl[cur] > statistik.maxJeZiel) statistik.maxJeZiel = zaehl[cur];
        } else {
          // kein Ziel: Ruhestellung Sektormitte auf dem Schirm, nicht feuern
          if (b.zielId !== null) statistik.zwang[i]++;
          b.zielId = null; b.feuer = false; b.toleranz = K.toleranzSperr; b.streuKugel = 0; b.streuTiefe = 0;
          setzeAufSchale(b, m, v0, S.gierMitte, (S.nickMin + S.nickMax) / 2, R);
        }
      }
    }
    // R23: Handsteuerung und Hauptbatterie (beide Betriebsarten; Räume dieses Takts stehen in lage.schirme)
    if (nTeil < n) for (let i = 0; i < n; i++) {
      if (teil[i]) continue;
      if (i === manuell) manuellBefehl(i); else schwerSchritt(i, ziele, turmZustand, frei, leucht, haupt, vorgabeNeu, S, R, modus === 'sperrfeuer' && folgen);
    }
    // Zenit-Bremse frei, sobald ein Rohr kein Ziel mehr hat (Sperr/Ruhe) → nächstes Ziel beginnt frisch
    for (let i = 0; i < n; i++) if (befehle[i].zielId === null) nOk[i] = 0;
    takt++; zeit += dt;
    return befehle;
  }

  zuruecksetzen();
  return { befehle, lage, schritt, zuruecksetzen, statistik };
}
