const m = await import('file:///C:/Users/maria/Documents/Projekte/Schwarmfront-wt/r12-fix/src/sim/waffen/flak.js');
const f = m.erstelleFlak();
for (const t of f.tuerme) console.log(t.id, JSON.stringify(t.sperrzonen.map(z => [+z.gier.toFixed(3), +z.halb.toFixed(3), +z.nickMin.toFixed(3)])), JSON.stringify(t.lafette.gier), JSON.stringify(t.lafette.nick));
