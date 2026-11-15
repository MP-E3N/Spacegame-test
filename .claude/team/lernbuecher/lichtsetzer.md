# Lernbuch lichtsetzer

## Regeln
(noch keine — werden jede 3. Runde verdichtet)

## Einträge
- 2026-11-15 Runde 2 — Beobachtung: Sterne/Sonne sichtbar durch das Schiff. Ursache: `transparent: true` → Transparent-
  Liste wird NACH dem Opaken gezeichnet, `depthTest: false` → übermalt den Rumpf. Änderung: `transparent: false` (additive
  Mischung bleibt). Lehre: Hintergrund nie in die Transparent-Liste; renderOrder wirkt nur innerhalb einer Liste.
- 2026-11-15 Runde 4 (Bestandsaufnahme) — Schatten-Einrasten rundet Welt-x/y/z; Texelraster liegt aber im Licht-Raum.
  Lehre: Einrasten im Licht-Raum (über shadow.camera.matrixWorldInverse). Lichtanzahl bei V bleibt 1 — von der
  Projektleitung gemessen (info.programs 33 → 33). Waffen-Effekte: Vorrat + Instanzen, depthTest an, keine Lichter pro Treffer.
- 2026-11-15 Runde 6 (Frühwarnung Flak) — Dunkler Rauch vor dunklem All braucht Fake-Beleuchtung (Kugelnormale, Sonnenrichtung,
  Silberrand bei Gegenlicht); Kern additiv, Orange übertreiben (AgX). Labor: near 3 bei 2 km Kampfentfernung. Bildprüfer bestätigt:
  Wolken heben sich gut ab, 0 % Pixel über 245.
