// ZWECK: Datei-Ablage für den Dev-Server (Vite-Middleware) — benannte JSON-Dateien in einem Projektordner, damit die KI
//        sie direkt lesen kann (Runde 12: Flak-Konfigs; Runde 15: Schiffsentwürfe der Werft).
// LIEFERT: ablage({ ordner, max }) → async handler(req, res) für server.middlewares.use(pfad, handler)
//          · gueltigerName(name) · dateiname(name)
//   GET  /            → Liste der Namen
//   GET  /<name>      → JSON
//   POST /<name>      → JSON-Objekt (≤ max Bytes) → schreibt <ordner>/<name>.json, ergänzt { name, gespeichert }
// REGEL: Nur Node (kein Browser-Code). WARUM eigene Datei: verallgemeinert statt kopiert, ohne Vite testbar (Prüfer R15).
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, relative } from 'node:path';

// Name: Buchstaben (auch Umlaute), Ziffern, Leerzeichen, - und _; 1–40 Zeichen. WARUM so streng: der Name wird zum
// Dateinamen — kein Punkt, kein Schrägstrich, also kein Ausbruch aus dem Ordner.
const NAME = /^[\p{L}\p{N} _-]{1,40}$/u;
// Windows-Gerätenamen (CON, NUL, COM1 …) sind als Dateiname tückisch → abweisen. „a b“ und „a_b“ ergeben dieselbe Datei (gewollt).
const GERAET = /^(con|prn|aux|nul|com\d|lpt\d)$/i;
export const gueltigerName = (name) => typeof name === 'string' && NAME.test(name.trim()) && !GERAET.test(name.trim());
export const dateiname = (name) => name.trim().replace(/\s+/g, '_') + '.json';

export function ablage({ ordner, max = 65536, wurzel = process.cwd() }) {
  const anzeige = relative(wurzel, ordner).replace(/\\/g, '/');
  return async function handler(req, res) {
    const antwort = (code, daten) => { res.statusCode = code; res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.end(JSON.stringify(daten)); };
    try {
      let name;
      try { name = decodeURIComponent((req.url || '/').replace(/^\/+/, '').split('?')[0]); } catch { return antwort(400, { fehler: 'Name ungültig kodiert' }); }
      if (!name) {
        if (req.method !== 'GET') return antwort(405, { fehler: 'nur GET' });
        await mkdir(ordner, { recursive: true });
        const dateien = (await readdir(ordner)).filter((d) => d.endsWith('.json')).sort();
        return antwort(200, dateien.map((d) => d.slice(0, -5).replace(/_/g, ' ')));
      }
      if (!gueltigerName(name)) return antwort(400, { fehler: 'Name: nur Buchstaben, Ziffern, Leerzeichen, - und _ (max. 40)' });
      const pfad = resolve(ordner, dateiname(name));
      if (req.method === 'GET') {
        let text;
        try { text = await readFile(pfad, 'utf8'); } catch (f) { if (f?.code === 'ENOENT') return antwort(404, { fehler: 'nicht gefunden' }); throw f; }
        try { return antwort(200, JSON.parse(text)); } catch { return antwort(422, { fehler: 'Datei ist kein gültiges JSON' }); }
      }
      if (req.method !== 'POST') return antwort(405, { fehler: 'nur GET/POST' });
      // WARUM Puffer sammeln: Bytes zählen und Umlaute an Stückgrenzen nicht zerreißen
      const teile = []; let bytes = 0;
      for await (const stueck of req) { bytes += stueck.length; if (bytes > max) return antwort(413, { fehler: 'zu groß' }); teile.push(stueck); }
      let daten;
      try { daten = JSON.parse(Buffer.concat(teile).toString('utf8')); } catch { return antwort(400, { fehler: 'kein gültiges JSON' }); }
      if (!daten || typeof daten !== 'object' || Array.isArray(daten)) return antwort(400, { fehler: 'kein JSON-Objekt' });
      await mkdir(ordner, { recursive: true });
      await writeFile(pfad, JSON.stringify({ ...daten, name: name.trim(), gespeichert: new Date().toISOString() }, null, 2) + '\n', 'utf8');
      return antwort(200, { ok: true, datei: anzeige + '/' + dateiname(name) });
    } catch {
      // WARUM keine Rohmeldung: sie enthielte den absoluten Pfad auf dem Rechner
      return antwort(500, { fehler: 'Ablage-Fehler' });
    }
  };
}
