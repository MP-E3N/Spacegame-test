// ZWECK: Sammelstelle der Schiffsdaten für Simulation (Kollision, Waffen) und Grafik.
// LIEFERT: SCHIFFSDATEN = { bollwerk, ambos } — je { name, kennung, laenge, teile, kugeln[{x,y,z,r}], tuerme[] }
//          dazu masse/oberkante/unterkante/fusspunkt und TURM (Proportionen).
// REGEL: ohne three, ohne grafik-Importe. Turm-Datensatz und Winkel-Vorzeichen: siehe turm.js.
import { BOLLWERK } from './bollwerk.js';
import { AMBOS } from './ambos.js';
export { masse, oberkante, unterkante, fusspunkt, alleTeile } from './rumpf.js';
export { TURM } from './turm.js';

export const SCHIFFSDATEN = { bollwerk: BOLLWERK, ambos: AMBOS };
