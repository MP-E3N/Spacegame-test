// ZWECK: Beispielschiff der Werft „WS-01“ (Runde 15) — Startentwurf im Editor und Testvorlage für den Zusammenbau.
// LIEFERT: BEISPIEL = Entwurf { name, kennung, version, teile: [{ nr, modul, an?: { nr, punkt }, punkt?, dreh? }] }
// REGEL: Wurzel nr 0 (Kommando) im Ursprung. Aufbau von vorn nach hinten: Bug M · Rumpf M lang (Panzergürtel) ·
//        Kommando · Rumpf M kurz · Übergang · Rumpf L mit zwei Hangars · Heck L. 25 Module.
// WARUM die Turm-Lagen so: der schwere Turm auf dem Kommando schaut nach hinten (vorn steht die Brücke), darum bleibt
//        die Lafette oben auf dem kurzen Rumpf frei (sonst stieße sein Rohr an den Turm dort). Heckturm schaut nach hinten.
const A = (nr, punkt) => ({ nr, punkt });

export const BEISPIEL = {
  name: 'Beispiel', kennung: 'WS-01', version: 1,
  teile: [
    { nr: 0, modul: 'kommando_m' },
    { nr: 1, modul: 'rumpf_m_lang', an: A(0, 'vorn'), punkt: 'hinten', dreh: 0 },
    { nr: 2, modul: 'bug_m', an: A(1, 'vorn'), punkt: 'hinten', dreh: 0 },
    { nr: 3, modul: 'rumpf_m_kurz', an: A(0, 'hinten'), punkt: 'vorn', dreh: 0 },
    { nr: 4, modul: 'uebergang_ml', an: A(3, 'hinten'), punkt: 'vorn', dreh: 0 },
    { nr: 5, modul: 'rumpf_l', an: A(4, 'hinten'), punkt: 'vorn', dreh: 0 },
    { nr: 6, modul: 'heck_l', an: A(5, 'hinten'), punkt: 'vorn', dreh: 0 },
    // Hangars: an den vorderen Seitenpunkten, der hintere Innenpunkt schließt den Ring (E3)
    { nr: 7, modul: 'hangar_s_bb', an: A(5, 'bb_vorn'), punkt: 'innen_vorn', dreh: 0 },
    { nr: 8, modul: 'hangar_s_sb', an: A(5, 'sb_vorn'), punkt: 'innen_vorn', dreh: 0 },
    // Panzergürtel am langen Rumpf
    { nr: 9, modul: 'panzerplatte', an: A(1, 'bb_vorn'), punkt: 'innen', dreh: 0 },
    { nr: 10, modul: 'panzerplatte', an: A(1, 'bb_hinten'), punkt: 'innen', dreh: 0 },
    { nr: 11, modul: 'panzerplatte', an: A(1, 'sb_vorn'), punkt: 'innen', dreh: 0 },
    { nr: 12, modul: 'panzerplatte', an: A(1, 'sb_hinten'), punkt: 'innen', dreh: 0 },
    // Türme oben (dreh: Vierteldrehungen um +Y; 0 = Rohre nach vorn, 2 = nach hinten)
    { nr: 13, modul: 'turm_schwer', an: A(2, 'oben'), punkt: 'fuss', dreh: 0 },
    { nr: 14, modul: 'turm_schwer', an: A(1, 'oben_vorn'), punkt: 'fuss', dreh: 0 },
    { nr: 15, modul: 'turm_flak', an: A(1, 'oben_hinten'), punkt: 'fuss', dreh: 0 },
    { nr: 16, modul: 'turm_schwer', an: A(0, 'oben'), punkt: 'fuss', dreh: 2 },
    { nr: 17, modul: 'sensormast', an: A(4, 'oben'), punkt: 'fuss', dreh: 0 },
    { nr: 18, modul: 'turm_flak', an: A(7, 'oben'), punkt: 'fuss', dreh: 0 },
    { nr: 19, modul: 'turm_flak', an: A(8, 'oben'), punkt: 'fuss', dreh: 0 },
    { nr: 20, modul: 'turm_schwer', an: A(6, 'oben'), punkt: 'fuss', dreh: 2 },
    // Türme unten
    { nr: 21, modul: 'turm_flak', an: A(2, 'unten'), punkt: 'fuss', dreh: 0 },
    { nr: 22, modul: 'turm_flak', an: A(1, 'unten_hinten'), punkt: 'fuss', dreh: 0 },
    { nr: 23, modul: 'turm_flak', an: A(3, 'unten'), punkt: 'fuss', dreh: 2 },
    { nr: 24, modul: 'turm_flak', an: A(5, 'unten_hinten'), punkt: 'fuss', dreh: 2 },
  ],
};
