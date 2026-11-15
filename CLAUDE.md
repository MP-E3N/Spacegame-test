# Schwarmfront — Arbeitsregeln für KI-Agenten

Überblick: `PROJEKT.md` · Stand: `HANDOFF.md` · Idee: `docs/IDEE.md` · Entscheidungen: `docs/ENTSCHEIDUNGEN.md`.
**Zu Beginn jeder Sitzung `HANDOFF.md` lesen, am Ende aktualisieren.** Seit Runde 4 arbeitet ein **Entwicklerteam**
(`.claude/team/TEAM.md`); jede Runde läuft nach `.claude/skills/schwarmfront-team/SKILL.md`.

## Technik
- JavaScript (ES-Module), Vite. Bibliothek nur `three` (Zusätze aus `three/addons/…` erlaubt). Neue Bibliothek nur mit
  Eintrag in `docs/ENTSCHEIDUNGEN.md` und Zustimmung des Nutzers.
- Start: `npm run dev` (Port 5180, Vorschau „schwarmfront“). Tests: `npm test`.
- Grafik entsteht im Code (Geometrie, Canvas-Texturen, Shader). Bild-Downloads nur nach ausdrücklicher Freigabe.

## Harte Regeln
1. `src/sim/` = Simulation: kein DOM, kein Renderer, kein `Math.random`, fester Schritt 1/60 s (Koop/Host später).
2. Grafik liest den Sim-Zustand nur und interpoliert (`sim.lage(alpha, …)`).
3. Koordinaten: Meter, +Y oben. Schiff lokal: +Z vorne (Bug), +X links (Backbord).
4. Leistung: 60 FPS auf normalem Laptop. Viele gleiche Objekte → `InstancedMesh`; Rumpfteile je Material zusammenfügen;
   keine neuen Objekte pro Bild in heißen Schleifen.
5. Lichtanzahl fest (sonst Shader-Neukompilierung). HDR-Werte deckeln (`min(…, 30)`), `pow()` nur mit `max(basis, 0)`.
6. `window.spiel` bleibt als Debug-Zugang (`ansicht`, `takt`, `bildzeit`, `befehlErsatz`).
7. Stil: industriell, abgenutzt, militärisch — **eigene Entwürfe**, keine Nachbauten bekannter Schiffe.

## Kommentare
Deutsch. Dateikopf mit ZWECK / LIEFERT / REGEL. Nicht Offensichtliches mit **WARUM**.

## Git
Deutsch, Präsens. Commit/Push nur auf Wunsch des Nutzers.
