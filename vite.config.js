// ZWECK: Vite mit mehreren Seiten — Startmenü (index.html), Freiflug, Flak-Labor, Gefechtstest — plus Konfig-Ablage für das
//        Flak-Labor (Runde 12, Nutzer: „Konfig speichern mit Benennung, damit du sie direkt abrufen kannst“).
// WARUM eigene Konfiguration: im Entwicklungsmodus liefert Vite jede HTML-Datei aus, für `npm run build` muss die
// zweite Seite aber als Eingang genannt sein.
// KONFIG-ABLAGE (nur Dev-Server): GET /api/flak-konfig → Liste · GET /api/flak-konfig/<name> → JSON ·
//   POST /api/flak-konfig/<name> (JSON-Objekt, ≤ 64 KB) → schreibt konfig/flak/<name>.json.
//   WARUM Datei statt localStorage: der Browser des Nutzers ist für die KI nicht lesbar, eine Datei im Projekt schon.
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';

const ORDNER = resolve(import.meta.dirname, 'konfig', 'flak');
// Name: Buchstaben (auch Umlaute), Ziffern, Leerzeichen, - und _; 1–40 Zeichen. WARUM so streng: der Name wird zum
// Dateinamen — kein Punkt, kein Schrägstrich, also kein Ausbruch aus dem Ordner.
const NAME = /^[\p{L}\p{N} _-]{1,40}$/u;
// Windows-Gerätenamen (CON, NUL, COM1 …) sind als Dateiname tückisch → abweisen. „a b“ und „a_b“ ergeben dieselbe Datei (gewollt).
const GERAET = /^(con|prn|aux|nul|com\d|lpt\d)$/i;
const dateiname = (name) => name.trim().replace(/\s+/g, '_') + '.json';

function konfigAblage() {
  return {
    name: 'flak-konfig-ablage',
    configureServer(server) {
      server.middlewares.use('/api/flak-konfig', async (req, res) => {
        const antwort = (code, daten) => { res.statusCode = code; res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.end(JSON.stringify(daten)); };
        try {
          let name;
          try { name = decodeURIComponent((req.url || '/').replace(/^\/+/, '').split('?')[0]); } catch { return antwort(400, { fehler: 'Name ungültig kodiert' }); }
          if (!name) {
            if (req.method !== 'GET') return antwort(405, { fehler: 'nur GET' });
            await mkdir(ORDNER, { recursive: true });
            const dateien = (await readdir(ORDNER)).filter((d) => d.endsWith('.json')).sort();
            return antwort(200, dateien.map((d) => d.slice(0, -5).replace(/_/g, ' ')));
          }
          if (!NAME.test(name.trim()) || GERAET.test(name.trim())) return antwort(400, { fehler: 'Name: nur Buchstaben, Ziffern, Leerzeichen, - und _ (max. 40)' });
          const pfad = resolve(ORDNER, dateiname(name));
          if (req.method === 'GET') return antwort(200, JSON.parse(await readFile(pfad, 'utf8')));
          if (req.method !== 'POST') return antwort(405, { fehler: 'nur GET/POST' });
          // WARUM Puffer sammeln: Bytes zählen und Umlaute an Stückgrenzen nicht zerreißen
          const teile = []; let bytes = 0;
          for await (const stueck of req) { bytes += stueck.length; if (bytes > 65536) return antwort(413, { fehler: 'zu groß' }); teile.push(stueck); }
          const text = Buffer.concat(teile).toString('utf8');
          let daten;
          try { daten = JSON.parse(text); } catch { return antwort(400, { fehler: 'kein gültiges JSON' }); }
          if (!daten || typeof daten !== 'object' || Array.isArray(daten)) return antwort(400, { fehler: 'kein JSON-Objekt' });
          await mkdir(ORDNER, { recursive: true });
          await writeFile(pfad, JSON.stringify({ ...daten, name: name.trim(), gespeichert: new Date().toISOString() }, null, 2) + '\n', 'utf8');
          return antwort(200, { ok: true, datei: 'konfig/flak/' + dateiname(name) });
        } catch (f) {
          // WARUM keine Rohmeldung: sie enthielte den absoluten Pfad auf dem Rechner
          return f?.code === 'ENOENT' ? antwort(404, { fehler: 'Konfig nicht gefunden' }) : antwort(500, { fehler: 'Ablage-Fehler' });
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [konfigAblage()],
  build: {
    rollupOptions: {
      // Runde 14: index.html = Startmenü, Freiflug eigene Seite, Gefechtstest neu
      input: Object.fromEntries(['index', 'freiflug', 'flak', 'gefecht'].map((n) => [n, resolve(import.meta.dirname, n + '.html')])),
    },
  },
});
