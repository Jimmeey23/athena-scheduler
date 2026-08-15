import { build } from "vite";
import { pathToFileURL } from "node:url";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = process.cwd();
const tmp = await mkdtemp(join(tmpdir(), "athena-audit-"));
const entry = join(tmp, "entry.ts");
const outdir = join(tmp, "out");

await writeFile(
  entry,
  `
    import { DAYS, LOCATIONS } from "${root}/src/data.ts";
    import { DEFAULT_SETTINGS } from "${root}/src/settings.ts";
    import { generateSchedule } from "${root}/src/engine.ts";
    import { loadSnapshotCsv, setPerformanceRows } from "${root}/src/performance.ts";

    const rows = await loadSnapshotCsv();
    setPerformanceRows(rows);
    const seeds = [20260810, 20260811, 20260812, 20260813, 20260814];
    const toMin = (t) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };

    // Reports every house, not just Kwality: an audit scoped to one location is exactly how the
    // starved Supreme/Courtside/Copper weeks stayed invisible.
    for (const seed of seeds) {
      const { sessions, report } = generateSchedule(DEFAULT_SETTINGS, seed, true);
      console.log("=== seed", seed, "-", sessions.length, "classes");
      for (const loc of LOCATIONS) {
        const list = sessions.filter((s) => s.locationId === loc.id);
        const r = report.locations.find((l) => l.id === loc.id);
        const byDay = DAYS.map((d) => d.label + ":" + list.filter((s) => s.day === d.key).length).join(" ");
        const byFormat = Object.fromEntries(
          [...new Set(list.map((s) => s.name))].sort().map((name) => [name, list.filter((s) => s.name === name).length])
        );
        console.log(" ", loc.id.padEnd(10), "n=" + String(list.length).padStart(3), "floor=" + r?.floor, r?.floorMet ? "OK" : "BELOW FLOOR");
        console.log("     days ", byDay);
        console.log("     mix  ", JSON.stringify(byFormat));
        if (r?.violations.length) console.log("     viol ", r.violations.join(" | "));
      }
      // Hard invariants: no trainer or room double-booked, no dedicated room used by a foreign format.
      const clashes = new Set();
      for (let i = 0; i < sessions.length; i++) {
        for (let j = i + 1; j < sessions.length; j++) {
          const a = sessions[i];
          const b = sessions[j];
          if (a.day !== b.day) continue;
          if (toMin(a.time) >= toMin(b.time) + b.duration || toMin(a.time) + a.duration <= toMin(b.time)) continue;
          if (a.trainerId === b.trainerId) clashes.add("trainer " + a.trainerId + " d" + a.day + " " + a.time + "/" + b.time);
          if (a.locationId === b.locationId && a.studio === b.studio) clashes.add("room " + a.locationId + " " + a.studio + " d" + a.day);
        }
      }
      for (const s of sessions) {
        if (s.studio === "PowerCycle Studio" && !s.name.includes("PowerCycle")) clashes.add("specialty room " + s.locationId + " " + s.studio + " <- " + s.name);
        if (s.studio === "Strength Lab" && s.name !== "Strength Lab") clashes.add("specialty room " + s.locationId + " " + s.studio + " <- " + s.name);
      }
      console.log("  invariants:", clashes.size ? [...clashes].join(" | ") : "clean");
    }
  `
);

await build({
  root,
  logLevel: "silent",
  configFile: false,
  build: {
    target: "node20",
    platform: "node",
    ssr: entry,
    outDir: outdir,
    emptyOutDir: true,
    rollupOptions: {
      output: { format: "es" },
    },
  },
});

await import(pathToFileURL(join(outdir, "entry.js")).href);
await rm(tmp, { recursive: true, force: true });
