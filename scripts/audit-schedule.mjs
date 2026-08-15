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
    import { DAYS } from "${root}/src/data.ts";
    import { DEFAULT_SETTINGS } from "${root}/src/settings.ts";
    import { generateSchedule } from "${root}/src/engine.ts";
    import { loadSnapshotCsv, setPerformanceRows } from "${root}/src/performance.ts";

    const rows = await loadSnapshotCsv();
    setPerformanceRows(rows);
    const seeds = [20260810, 20260811, 20260812, 20260813, 20260814];

    for (const seed of seeds) {
      const { sessions, report } = generateSchedule(DEFAULT_SETTINGS, seed, true);
      const kw = sessions.filter((s) => s.locationId === "kwality");
      const byDay = DAYS.map((d) => [d.label, kw.filter((s) => s.day === d.key).length]);
      const byFormat = Object.fromEntries(
        [...new Set(kw.map((s) => s.name))].sort().map((name) => [name, kw.filter((s) => s.name === name).length])
      );
      const loc = report.locations.find((l) => l.id === "kwality");
      console.log(JSON.stringify({ seed, kwality: { count: kw.length, floor: loc?.floor, floorMet: loc?.floorMet, byDay, byFormat, violations: loc?.violations } }));
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
