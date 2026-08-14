import { useState } from "react";
import { DAYS, FORMATS, LOCATIONS, TRAINERS } from "./data";
import type { CustomRule, Settings } from "./types";
import { Panel } from "./ui";

const NAV = [
  {
    group: "People",
    items: [
      { id: "trainers", label: "Trainers" },
      { id: "certs", label: "Certifications" },
      { id: "leave", label: "Leave & Off" },
    ],
  },
  {
    group: "Schedule",
    items: [
      { id: "targets", label: "Daily Targets" },
      { id: "mix", label: "Class Mix" },
      { id: "formats", label: "Formats" },
    ],
  },
  {
    group: "Rules",
    items: [
      { id: "rules", label: "Custom Rules" },
      { id: "pins", label: "Pinned Classes" },
    ],
  },
  {
    group: "System",
    items: [
      { id: "ai", label: "AI & Generation" },
      { id: "quality", label: "Quality Gates" },
      { id: "locations", label: "Locations" },
    ],
  },
];

const CERTS = ["barre", "mat", "cycle", "strength", "fit", "cardio", "amped", "hiit", "recovery", "bbb"] as const;

export function SettingsView({
  settings,
  setSettings,
  onSave,
}: {
  settings: Settings;
  setSettings: (s: Settings) => void;
  onSave: () => void;
}) {
  const [section, setSection] = useState("trainers");
  const [q, setQ] = useState("");
  const patch = (partial: Partial<Settings>) => setSettings({ ...settings, ...partial });
  const roster = settings.trainers?.length ? settings.trainers : TRAINERS;
  const trainers = roster.filter((t) => t.name.toLowerCase().includes(q.toLowerCase()));
  const updateTrainer = (id: string, next: (typeof roster)[number]) => patch({ trainers: roster.map((t) => (t.id === id ? next : t)) });

  return (
    <div className="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
      <aside className="panel h-fit rounded-3xl p-3">
        {NAV.map((g) => (
          <div key={g.group} className="mb-3">
            <p className="px-2 pb-1 text-[10px] uppercase tracking-[0.18em] text-mist">{g.group}</p>
            {g.items.map((item) => (
              <button
                key={item.id}
                onClick={() => setSection(item.id)}
                className={`mb-1 w-full rounded-xl px-3 py-2 text-left text-sm ${
                  section === item.id ? "bg-[#005eed] text-white" : "text-ivory hover:bg-ink"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        ))}
        <button onClick={onSave} className="mt-2 w-full rounded-xl bg-[#0e1729] py-2.5 text-sm font-medium text-white">
          Save all changes
        </button>
      </aside>

      <div className="space-y-4">
        {section === "trainers" && (
          <Panel className="overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-5 py-4">
              <div>
                <h2 className="font-serif text-2xl">Trainers</h2>
                <p className="text-sm text-mist">Tier, activation, and house access drive generation.</p>
              </div>
                <div className="flex gap-2">
                  <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…" className="rounded-xl border border-line bg-ink px-3 py-2 text-sm" />
                  <button
                    className="rounded-xl bg-[#005eed] px-3 py-2 text-xs text-white"
                    onClick={() => {
                      const id = `tr-${Date.now()}`;
                      const houses = settings.locations?.length ? settings.locations : LOCATIONS;
                      patch({
                        trainers: [
                          ...roster,
                          {
                            id,
                            name: "New trainer",
                            photo: "",
                            specialty: "General",
                            tier: 2,
                            active: true,
                            certs: { barre: true, mat: false, cycle: false, strength: false, fit: false, cardio: false, amped: false, hiit: false, recovery: false, bbb: false },
                            access: Object.fromEntries(houses.map((h) => [h.id, { days: [0, 1, 2, 3, 4, 5, 6], weekOff: [6], start: "07:00", end: "21:00", maxPerDay: 3, avgCheckin: 4 }])),
                          },
                        ],
                      });
                    }}
                  >
                    + Trainer
                  </button>
                </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="text-[10px] uppercase tracking-wider text-mist">
                    <th className="px-4 py-3">Trainer</th>
                    <th>Tier</th>
                    <th>Active</th>
                    <th>Houses</th>
                    <th></th>
                    <th>Week off</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {trainers.map((t) => {
                    const inactive = settings.inactiveTrainers.includes(t.id) || !t.active;
                    return (
                      <tr key={t.id}>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <img src={t.photo} alt="" className="h-8 w-8 rounded-full object-cover" />
                            <div>
                              <input
                                value={t.name}
                                onChange={(e) => updateTrainer(t.id, { ...t, name: e.target.value })}
                                className="w-40 rounded-lg border border-line bg-white px-2 py-1 text-sm"
                              />
                              <input
                                value={t.specialty}
                                onChange={(e) => updateTrainer(t.id, { ...t, specialty: e.target.value })}
                                className="mt-1 w-40 rounded-lg border border-line bg-white px-2 py-1 text-[11px]"
                              />
                            </div>
                          </div>
                        </td>
                        <td>
                          <select
                            value={t.tier}
                            onChange={(e) => updateTrainer(t.id, { ...t, tier: Number(e.target.value) as 1 | 2 | 3 | 4 })}
                            className="rounded-lg border border-line bg-white px-2 py-1 text-sm"
                          >
                            {[1, 2, 3, 4].map((n) => (
                              <option key={n} value={n}>
                                T{n}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td>
                          <button
                            onClick={() => {
                              patch({
                                trainers: roster.map((row) => (row.id === t.id ? { ...row, active: inactive } : row)),
                                inactiveTrainers: inactive
                                  ? settings.inactiveTrainers.filter((id) => id !== t.id)
                                  : [...settings.inactiveTrainers, t.id],
                              });
                            }}
                            className={`h-6 w-10 rounded-full ${inactive ? "bg-line" : "bg-[#005eed]"}`}
                          >
                            <span className={`block h-5 w-5 rounded-full bg-white shadow transition ${inactive ? "ml-0.5" : "ml-4"}`} />
                          </button>
                        </td>
                        <td>
                          <div className="flex flex-wrap gap-1">
                            {(settings.locations?.length ? settings.locations : LOCATIONS).map((h) => {
                              const on = Boolean(t.access[h.id]);
                              return (
                                <button
                                  key={h.id}
                                  onClick={() => {
                                    const access = { ...t.access };
                                    if (on) delete access[h.id];
                                    else access[h.id] = { days: [0, 1, 2, 3, 4, 5], weekOff: [6], start: "07:00", end: "21:00", maxPerDay: 3, avgCheckin: 4 };
                                    updateTrainer(t.id, { ...t, access });
                                  }}
                                  className={`rounded px-1.5 py-0.5 text-[10px] ${on ? "bg-[#005eed] text-white" : "bg-ink"}`}
                                >
                                  {h.name.split(" ")[0]}
                                </button>
                              );
                            })}
                          </div>
                        </td>
                        <td>
                          <button className="text-xs text-rose-700" onClick={() => patch({ trainers: roster.filter((x) => x.id !== t.id) })}>
                            Delete
                          </button>
                        </td>
                        <td className="max-w-[180px]">
                          <div className="flex flex-wrap gap-1">
                            {DAYS.map((d) => {
                              const off = Object.values(t.access).some((a) => a.weekOff.includes(d.key));
                              return (
                                <button
                                  key={d.key}
                                  onClick={() =>
                                    updateTrainer(t.id, {
                                      ...t,
                                      access: Object.fromEntries(
                                        Object.entries(t.access).map(([k, a]) => [
                                          k,
                                          { ...a, weekOff: off ? a.weekOff.filter((x) => x !== d.key) : [...a.weekOff, d.key] },
                                        ])
                                      ),
                                    })
                                  }
                                  className={`rounded px-1.5 py-0.5 text-[10px] ${off ? "bg-[#0e1729] text-white" : "bg-ink"}`}
                                >
                                  {d.label}
                                </button>
                              );
                            })}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Panel>
        )}

        {section === "certs" && (
          <Panel className="overflow-x-auto p-5">
            <h2 className="font-serif text-2xl">Certifications</h2>
            <p className="mb-4 text-sm text-mist">Specialist formats require a matching cert. Uncertified trainers are never auto-assigned.</p>
            <table className="w-full text-left text-[11px]">
              <thead>
                <tr className="text-mist">
                  <th className="py-2">Trainer</th>
                  {CERTS.map((c) => (
                    <th key={c} className="px-1 uppercase">
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {roster.map((t) => (
                  <tr key={t.id} className="border-t border-line">
                    <td className="py-2 pr-3">{t.name}</td>
                    {CERTS.map((c) => (
                      <td key={c} className="text-center">
                        <button
                          onClick={() => updateTrainer(t.id, { ...t, certs: { ...t.certs, [c]: !t.certs[c] } })}
                          className={t.certs[c] ? "text-[#005eed]" : "text-line"}
                        >
                          {t.certs[c] ? "●" : "○"}
                        </button>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>
        )}

        {section === "leave" && (
          <Panel className="p-5">
            <h2 className="font-serif text-2xl">Leave & off days</h2>
            <p className="mb-4 text-sm text-mist">Binding for this week. Off days stack on top of historic week-off.</p>
            <div className="space-y-3">
              {TRAINERS.map((t) => {
                const row = settings.offDays.find((o) => o.trainerId === t.id);
                return (
                  <div key={t.id} className="flex flex-wrap items-center gap-2 rounded-2xl bg-ink px-3 py-2">
                    <span className="w-40 truncate text-sm">{t.name}</span>
                    {DAYS.map((d) => {
                      const on = row?.days.includes(d.key);
                      return (
                        <button
                          key={d.key}
                          onClick={() => {
                            const next = settings.offDays.filter((o) => o.trainerId !== t.id);
                            const days = on ? (row?.days ?? []).filter((x) => x !== d.key) : [...(row?.days ?? []), d.key];
                            if (days.length) next.push({ trainerId: t.id, days });
                            patch({ offDays: next });
                          }}
                          className={`rounded-lg px-2 py-1 text-[11px] ${on ? "bg-[#005eed] text-white" : "bg-white ring-1 ring-line"}`}
                        >
                          {d.label}
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </Panel>
        )}

        {section === "targets" && (
          <Panel className="overflow-x-auto p-5">
            <h2 className="font-serif text-2xl">Daily targets</h2>
            <p className="mb-4 text-sm text-mist">Exact daily targets with a max cap. Generator never exceeds max and repairs underfilled days.</p>
            {LOCATIONS.map((loc) => (
              <div key={loc.id} className="mb-5">
                <p className="mb-2 text-sm font-medium">
                  {loc.name} <span className="text-mist">floor {loc.weeklyFloor}</span>
                </p>
                <div className="grid grid-cols-7 gap-2">
                  {DAYS.map((d) => {
                    const cell = settings.targets[loc.id]?.[d.key] ?? { target: 0, max: 0 };
                    return (
                      <label key={d.key} className="rounded-2xl bg-ink p-2 text-[11px]">
                        <span className="block text-mist">{d.label}</span>
                        <input
                          type="number"
                          min={0}
                          max={20}
                          value={cell.target}
                          onChange={(e) =>
                            patch({
                              targets: {
                                ...settings.targets,
                                [loc.id]: { ...settings.targets[loc.id], [d.key]: { ...cell, target: Number(e.target.value) } },
                              },
                            })
                          }
                          className="mt-1 w-full rounded-lg border border-line bg-white px-2 py-1"
                        />
                        <span className="mt-1 block text-[10px] text-mist">max</span>
                        <input
                          type="number"
                          min={0}
                          max={24}
                          value={cell.max}
                          onChange={(e) =>
                            patch({
                              targets: {
                                ...settings.targets,
                                [loc.id]: { ...settings.targets[loc.id], [d.key]: { ...cell, max: Number(e.target.value) } },
                              },
                            })
                          }
                          className="w-full rounded-lg border border-line bg-white px-2 py-1"
                        />
                      </label>
                    );
                  })}
                </div>
              </div>
            ))}
          </Panel>
        )}

        {section === "formats" && (
          <Panel className="p-5">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="font-serif text-2xl">Formats</h2>
                <p className="text-sm text-mist">Add, rename, or delete class formats. Hosted / Foundations / SWEAT stay banned.</p>
              </div>
              <button
                className="rounded-xl bg-[#005eed] px-3 py-2 text-xs text-white"
                onClick={() =>
                  patch({
                    formats: [
                      ...(settings.formats?.length ? settings.formats : FORMATS),
                      { name: "New Format", studio: "Studio 1", duration: 50, accent: "#005eed", cert: "barre", family: "special" },
                    ],
                  })
                }
              >
                + Format
              </button>
            </div>
            <div className="space-y-2">
              {(settings.formats?.length ? settings.formats : FORMATS).map((f, i) => (
                <div key={f.name + i} className="grid grid-cols-2 gap-2 rounded-2xl bg-ink p-3 md:grid-cols-5">
                  <input value={f.name} onChange={(e) => patch({ formats: (settings.formats || FORMATS).map((x, idx) => (idx === i ? { ...x, name: e.target.value } : x)) })} className="rounded-lg border border-line bg-white px-2 py-1 text-sm" />
                  <input value={f.studio} onChange={(e) => patch({ formats: (settings.formats || FORMATS).map((x, idx) => (idx === i ? { ...x, studio: e.target.value } : x)) })} className="rounded-lg border border-line bg-white px-2 py-1 text-sm" />
                  <input type="number" value={f.duration} onChange={(e) => patch({ formats: (settings.formats || FORMATS).map((x, idx) => (idx === i ? { ...x, duration: Number(e.target.value) } : x)) })} className="rounded-lg border border-line bg-white px-2 py-1 text-sm" />
                  <select value={f.cert} onChange={(e) => patch({ formats: (settings.formats || FORMATS).map((x, idx) => (idx === i ? { ...x, cert: e.target.value as typeof f.cert } : x)) })} className="rounded-lg border border-line bg-white px-2 py-1 text-sm">
                    {CERTS.map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                  <button className="text-xs text-rose-700" onClick={() => patch({ formats: (settings.formats || FORMATS).filter((_, idx) => idx !== i) })}>
                    Delete
                  </button>
                </div>
              ))}
            </div>
          </Panel>
        )}

        {section === "mix" && (
          <Panel className="p-5">
            <h2 className="font-serif text-2xl">Class mix</h2>
            <p className="mb-4 text-sm text-mist">Weekly min / max per format. Barre family must still stay ≥ 25% universally.</p>
            {LOCATIONS.map((loc) => (
              <div key={loc.id} className="mb-5">
                <p className="mb-2 text-sm font-medium">{loc.name}</p>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {Object.entries(settings.mix[loc.id] ?? {}).map(([name, band]) => (
                    <div key={name} className="rounded-2xl bg-ink p-3 text-sm">
                      <p className="mb-2">{name}</p>
                      <div className="flex gap-2">
                        <label className="flex-1 text-[11px] text-mist">
                          min
                          <input
                            type="number"
                            value={band.min}
                            onChange={(e) =>
                              patch({
                                mix: {
                                  ...settings.mix,
                                  [loc.id]: { ...settings.mix[loc.id], [name]: { ...band, min: Number(e.target.value) } },
                                },
                              })
                            }
                            className="mt-1 w-full rounded-lg border border-line bg-white px-2 py-1 text-ivory"
                          />
                        </label>
                        <label className="flex-1 text-[11px] text-mist">
                          max
                          <input
                            type="number"
                            value={band.max}
                            onChange={(e) =>
                              patch({
                                mix: {
                                  ...settings.mix,
                                  [loc.id]: { ...settings.mix[loc.id], [name]: { ...band, max: Number(e.target.value) } },
                                },
                              })
                            }
                            className="mt-1 w-full rounded-lg border border-line bg-white px-2 py-1 text-ivory"
                          />
                        </label>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </Panel>
        )}

        {section === "rules" && (
          <RulesPanel settings={settings} patch={patch} />
        )}

        {section === "pins" && (
          <Panel className="p-5">
            <h2 className="font-serif text-2xl">Pinned classes</h2>
            <p className="mb-4 text-sm text-mist">Pins are placed first and bypass quality gates. They still respect leave and hour caps.</p>
            <div className="space-y-2">
              {settings.pins.map((p) => (
                <div key={p.id} className="flex flex-wrap items-center gap-3 rounded-2xl bg-ink px-3 py-2 text-sm">
                  <button
                    onClick={() => patch({ pins: settings.pins.map((x) => (x.id === p.id ? { ...x, enabled: !x.enabled } : x)) })}
                    className={`h-6 w-10 rounded-full ${p.enabled ? "bg-[#005eed]" : "bg-line"}`}
                  >
                    <span className={`block h-5 w-5 rounded-full bg-white transition ${p.enabled ? "ml-4" : "ml-0.5"}`} />
                  </button>
                  <span className="font-medium">{p.className}</span>
                  <span className="text-mist">
                    {LOCATIONS.find((l) => l.id === p.locationId)?.name} · {DAYS[p.day].label} {p.time}
                  </span>
                  <span className="text-mist">{TRAINERS.find((t) => t.id === p.trainerId)?.name}</span>
                  <button className="ml-auto text-xs text-rose-700" onClick={() => patch({ pins: settings.pins.filter((x) => x.id !== p.id) })}>
                    Remove
                  </button>
                </div>
              ))}
            </div>
          </Panel>
        )}

        {section === "ai" && (
          <Panel className="p-5">
            <h2 className="font-serif text-2xl">AI & generation</h2>
            <p className="mb-4 text-sm text-mist">Weights are normalised. Attendance and fill dominate. Each Generate runs unique trials and keeps the most accurate compliant draft. Hosted, Foundations, and SWEAT In 30 are never scheduled.</p>
            <div className="mb-4 grid gap-3 md:grid-cols-2">
              <label className="rounded-2xl bg-ink p-3 text-sm">
                OpenAI API key
                <input
                  type="password"
                  value={settings.ai.openaiKey}
                  onChange={(e) => patch({ ai: { ...settings.ai, openaiKey: e.target.value } })}
                  placeholder="sk-…"
                  className="mt-2 w-full rounded-xl border border-line bg-white px-3 py-2"
                />
              </label>
              <label className="rounded-2xl bg-ink p-3 text-sm md:col-span-2">
                Google OAuth client ID
                <input
                  value={settings.ai.googleClientId}
                  onChange={(e) => patch({ ai: { ...settings.ai, googleClientId: e.target.value } })}
                  placeholder="xxxx.apps.googleusercontent.com"
                  className="mt-2 w-full rounded-xl border border-line bg-white px-3 py-2"
                />
              </label>
              <label className="rounded-2xl bg-ink p-3 text-sm md:col-span-2">
                Spreadsheet ID
                <input
                  value={settings.ai.spreadsheetId}
                  onChange={(e) => patch({ ai: { ...settings.ai, spreadsheetId: e.target.value } })}
                  className="mt-2 w-full rounded-xl border border-line bg-white px-3 py-2"
                />
              </label>
              <p className="text-xs text-mist md:col-span-2">
                Share the Sessions sheet with your Google user. After save, use Connect Google on the next load. Until OAuth succeeds, Athena scores from the published Sessions Performance snapshot in the source repo — never invented fills.
              </p>
              <label className="rounded-2xl bg-ink p-3 text-sm">
                Model
                <select
                  value={settings.ai.openaiModel}
                  onChange={(e) => patch({ ai: { ...settings.ai, openaiModel: e.target.value } })}
                  className="mt-2 w-full rounded-xl border border-line bg-white px-3 py-2"
                >
                  <option value="gpt-4.1-mini">gpt-4.1-mini</option>
                  <option value="gpt-4.1">gpt-4.1</option>
                  <option value="gpt-4o-mini">gpt-4o-mini</option>
                  <option value="gpt-4o">gpt-4o</option>
                </select>
              </label>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              {(
                [
                  ["weightCheckin", "Avg check-in"],
                  ["weightFill", "Fill rate"],
                  ["weightTrend", "Trend / recency"],
                  ["weightTier", "Trainer tier"],
                ] as const
              ).map(([key, label]) => (
                <label key={key} className="rounded-2xl bg-ink p-3 text-sm">
                  <div className="mb-2 flex justify-between">
                    <span>{label}</span>
                    <span className="text-[#005eed]">{Math.round(settings.ai[key] * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.01}
                    value={settings.ai[key]}
                    onChange={(e) => patch({ ai: { ...settings.ai, [key]: Number(e.target.value) } })}
                    className="w-full"
                  />
                </label>
              ))}
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {(
                [
                  ["preferTier1", "Push Tier 1 toward 15h"],
                  ["enforceAmPm", "No AM+PM same day"],
                  ["allowParallel", "Allow parallel rooms"],
                  ["autoPinHigh", "Respect high-performer pins"],
                  ["useAiPass", "Multi-trial selection"],
                  ["clusterTrainers", "Few trainers per shift (2–3)"],
                  ["fillSparseHouses", "Force Supreme daily minimums"],
                  ["noConsecutiveFormat", "No consecutive same format"],
                  ["boutiqueSameShiftOnly", "Courtside/Copper same-shift only"],
                ] as const
              ).map(([key, label]) => (
                <label key={key} className="flex items-center justify-between rounded-2xl bg-ink px-3 py-3 text-sm">
                  {label}
                  <input type="checkbox" checked={settings.ai[key]} onChange={(e) => patch({ ai: { ...settings.ai, [key]: e.target.checked } })} />
                </label>
              ))}
            </div>
            <label className="mt-4 block rounded-2xl bg-ink p-3 text-sm">
              Max trainers per location/day/shift
              <input
                type="number"
                min={1}
                max={8}
                value={settings.ai.maxTrainersPerShift ?? 3}
                onChange={(e) => patch({ ai: { ...settings.ai, maxTrainersPerShift: Number(e.target.value) } })}
                className="mt-2 w-full rounded-xl border border-line bg-white px-3 py-2"
              />
            </label>
          </Panel>
        )}

        {section === "quality" && (
          <Panel className="p-5">
            <h2 className="font-serif text-2xl">Quality gates</h2>
            <p className="mb-4 text-sm text-mist">Repeated-history options below either floor are excluded unless pinned. Non-pinned rows under the accept score are rejected.</p>
            <div className="grid gap-4 md:grid-cols-3">
              <Num label="Avg check-in floor" value={settings.quality.checkinFloor} step={0.5} onChange={(v) => patch({ quality: { ...settings.quality, checkinFloor: v } })} />
              <Num label="Fill rate floor %" value={settings.quality.fillFloor} onChange={(v) => patch({ quality: { ...settings.quality, fillFloor: v } })} />
              <Num label="Min accept score" value={settings.quality.minAcceptScore} onChange={(v) => patch({ quality: { ...settings.quality, minAcceptScore: v } })} />
            </div>
          </Panel>
        )}

        {section === "locations" && (
          <div className="grid gap-3 md:grid-cols-2">
            {LOCATIONS.map((l) => (
              <Panel key={l.id} className="p-5">
                <p className="text-[10px] uppercase tracking-[0.16em] text-mist">{l.area}</p>
                <h3 className="font-serif text-2xl">{l.name}</h3>
                <label className="mt-2 block text-sm text-mist">
                  Weekly floor
                  <input
                    type="number"
                    value={settings.floors?.[l.id] ?? l.weeklyFloor}
                    onChange={(e) => patch({ floors: { ...settings.floors, [l.id]: Number(e.target.value) } })}
                    className="mt-1 w-full rounded-xl border border-line bg-white px-3 py-2 text-ivory"
                  />
                </label>
                <label className="mt-2 block text-sm text-mist">
                  Rooms (comma separated)
                  <input
                    value={l.rooms.join(", ")}
                    onChange={(e) =>
                      patch({
                        locations: (settings.locations || LOCATIONS).map((x) =>
                          x.id === l.id ? { ...x, rooms: e.target.value.split(",").map((r) => r.trim()).filter(Boolean) } : x
                        ),
                      })
                    }
                    className="mt-1 w-full rounded-xl border border-line bg-white px-3 py-2 text-ivory"
                  />
                </label>
                <p className="mt-3 text-xs text-mist">
                  {l.id === "kenkere" ? "PowerCycle is never scheduled here." : l.id === "kwality" ? "Only house allowed to run Strength Lab." : l.id === "supreme" || l.id === "kwality" ? "Mumbai PowerCycle eligible." : "Boutique lane — limited rooms."}
                </p>
              </Panel>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Num({ label, value, onChange, step = 1 }: { label: string; value: number; onChange: (v: number) => void; step?: number }) {
  return (
    <label className="rounded-2xl bg-ink p-4 text-sm">
      <span className="text-mist">{label}</span>
      <input type="number" step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="mt-2 w-full rounded-xl border border-line bg-white px-3 py-2" />
    </label>
  );
}

function RulesPanel({ settings, patch }: { settings: Settings; patch: (p: Partial<Settings>) => void }) {
  const [draft, setDraft] = useState<Partial<CustomRule>>({
    ruleType: "weekly_class_mix",
    operator: "max",
    priority: "hard",
    value: 1,
  });
  return (
    <Panel className="p-5">
      <h2 className="font-serif text-2xl">Custom rules</h2>
      <p className="mb-4 text-sm text-mist">Hard rules are binding. Soft rules only nudge scoring.</p>
      <div className="grid gap-2 md:grid-cols-3">
        <select className="rounded-xl border border-line bg-ink px-3 py-2 text-sm" value={draft.ruleType} onChange={(e) => setDraft({ ...draft, ruleType: e.target.value as CustomRule["ruleType"] })}>
          <option value="trainer_availability">Trainer availability</option>
          <option value="daily_target">Daily target</option>
          <option value="weekly_class_mix">Weekly class mix</option>
          <option value="class_time_restriction">Class time restriction</option>
          <option value="class_location_restriction">Class location restriction</option>
        </select>
        <select className="rounded-xl border border-line bg-ink px-3 py-2 text-sm" value={draft.trainer ?? ""} onChange={(e) => setDraft({ ...draft, trainer: e.target.value || undefined })}>
          <option value="">Any trainer</option>
          {TRAINERS.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <select className="rounded-xl border border-line bg-ink px-3 py-2 text-sm" value={draft.location ?? ""} onChange={(e) => setDraft({ ...draft, location: e.target.value || undefined })}>
          <option value="">All houses</option>
          {LOCATIONS.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
        <select className="rounded-xl border border-line bg-ink px-3 py-2 text-sm" value={draft.className ?? ""} onChange={(e) => setDraft({ ...draft, className: e.target.value || undefined })}>
          <option value="">Any class</option>
          {FORMATS.map((f) => (
            <option key={f.name} value={f.name}>
              {f.name}
            </option>
          ))}
        </select>
        <select className="rounded-xl border border-line bg-ink px-3 py-2 text-sm" value={draft.operator} onChange={(e) => setDraft({ ...draft, operator: e.target.value as CustomRule["operator"] })}>
          {["exactly", "max", "min", "only", "never", "at_least"].map((o) => (
            <option key={o}>{o}</option>
          ))}
        </select>
        <select className="rounded-xl border border-line bg-ink px-3 py-2 text-sm" value={draft.priority} onChange={(e) => setDraft({ ...draft, priority: e.target.value as CustomRule["priority"] })}>
          <option value="hard">Hard — binding</option>
          <option value="soft">Soft — scoring</option>
        </select>
      </div>
      <button
        className="mt-3 rounded-xl bg-[#005eed] px-4 py-2 text-sm text-white"
        onClick={() =>
          patch({
            customRules: [
              ...settings.customRules,
              {
                id: `rule-${Date.now()}`,
                ruleType: draft.ruleType ?? "weekly_class_mix",
                trainer: draft.trainer,
                location: draft.location,
                className: draft.className,
                operator: draft.operator ?? "max",
                value: draft.value ?? 1,
                priority: draft.priority ?? "hard",
                enabled: true,
              },
            ],
          })
        }
      >
        Add rule
      </button>
      <div className="mt-4 space-y-2">
        {settings.customRules.map((r) => (
          <div key={r.id} className="flex items-center gap-3 rounded-2xl bg-ink px-3 py-2 text-sm">
            <span className={`rounded-full px-2 py-0.5 text-[10px] uppercase ${r.priority === "hard" ? "bg-rose-100 text-rose-700" : "bg-sky-100 text-sky-800"}`}>{r.priority}</span>
            <span>
              {r.ruleType.replace(/_/g, " ")} · {r.operator} {r.className || r.trainer || r.location || "global"}
            </span>
            <button className="ml-auto text-xs text-rose-700" onClick={() => patch({ customRules: settings.customRules.filter((x) => x.id !== r.id) })}>
              Remove
            </button>
          </div>
        ))}
      </div>
    </Panel>
  );
}

