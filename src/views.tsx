import { useState } from "react";
import { Area, AreaChart, Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { DAYS, LOCATIONS, TIMES, locationById, trainerById, trainerLoad } from "./data";
import type { Session } from "./types";
import { ClassCard, EmptySlot, FillBar, Panel, ScoreRing, TagChip, trainerWeekHours, type CardActions } from "./ui";

function Tip({ active, payload, label }: { active?: boolean; payload?: Array<{ name: string; value: number; color: string }>; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-line bg-white px-3 py-2 text-xs text-ivory shadow-2xl">
      <p className="mb-1 font-medium">{label}</p>
      {payload.map((p) => (
        <p key={p.name} style={{ color: p.color }}>
          {p.name}: {p.value}
        </p>
      ))}
    </div>
  );
}

export function GridView({
  sessions,
  all,
  locationId,
  pinned,
  focusTrainer,
  query,
  actions,
  onAdd,
  onOpenCreate,
  onDropSession,
  onDayClick,
  onTimeClick,
}: {
  sessions: Session[];
  all: Session[];
  locationId: string;
  pinned: string[];
  focusTrainer: string | null;
  query: string;
  actions: CardActions;
  onAdd?: (opt: { day: number; time: string; name: string; trainerId: string }) => void;
  onOpenCreate?: (day: number, time: string) => void;
  onDropSession?: (sessionId: string, day: number, time: string) => void;
  onDayClick?: (day: number) => void;
  onTimeClick?: (time: string) => void;
}) {
  const q = query.toLowerCase();
  const matches = (s: Session) => {
    if (focusTrainer && s.trainerId !== focusTrainer) return false;
    if (!q) return true;
    const t = trainerById(s.trainerId);
    return [s.name, s.studio, t.name, s.time].join(" ").toLowerCase().includes(q);
  };

  return (
    <div className="overflow-auto pb-8">
      <div className="min-w-[1180px]">
        <div className="grid grid-cols-[72px_repeat(7,minmax(0,1fr))] gap-2 pb-2">
          <div />
          {DAYS.map((d) => {
            const count = sessions.filter((s) => s.day === d.key).length;
            return (
              <button key={d.key} onClick={() => onDayClick?.(d.key)} className={`rounded-2xl px-3 py-2.5 text-center ${d.today ? "bg-[#005eed]/10 ring-1 ring-[#005eed]/30" : "bg-white ring-1 ring-line"}`}>
                <p className="text-[10px] uppercase tracking-[0.2em] text-mist">{d.label}</p>
                <p className="font-serif text-lg text-ivory">{d.date}</p>
                <p className="text-[10px] text-[#005eed]">{count} classes</p>
              </button>
            );
          })}
        </div>
        <div className="space-y-2">
          {TIMES.map((time) => {
            const any = sessions.some((s) => s.time === time);
            if (!any) return null;
            return (
              <div key={time} className="grid grid-cols-[72px_repeat(7,minmax(0,1fr))] gap-2">
                <div className="sticky left-0 flex flex-col items-center pt-3">
                  <button className="font-serif text-sm text-[#005eed]" onClick={() => onTimeClick?.(time)}>
                    {time}
                  </button>
                </div>
                {DAYS.map((d) => {
                  const cells = sessions.filter((s) => s.day === d.key && s.time === time);
                  return (
                    <div
                      key={d.key}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        e.preventDefault();
                        const id = e.dataTransfer.getData("text/session-id");
                        if (id) onDropSession?.(id, d.key, time);
                      }}
                      className={`min-h-[72px] space-y-2 rounded-2xl p-1 ${d.today ? "bg-[#005eed]/[0.06]" : "bg-[#efefef]/70"}`}
                    >
                      {cells.map((s) => (
                        <ClassCard key={s.id} session={s} pinned={pinned.includes(s.id)} dimmed={!matches(s)} weekHours={trainerWeekHours(all, s.trainerId)} actions={actions} />
                      ))}
                      {cells.length === 0 && (
                        <EmptySlot locationId={locationId} day={d.key} time={time} onAdd={(opt) => onAdd?.({ day: d.key, time, ...opt })} onOpenCreate={() => onOpenCreate?.(d.key, time)} />
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function TimelineView({ sessions, onSelect }: { sessions: Session[]; onSelect: (s: Session) => void }) {
  const rows = [...sessions].sort((a, b) => a.day - b.day || a.time.localeCompare(b.time));
  const byDay = DAYS.map((d) => ({ day: d, items: rows.filter((s) => s.day === d.key) })).filter((g) => g.items.length);
  return (
    <div className="mx-auto max-w-3xl space-y-8 pb-10">
      {byDay.map(({ day, items }) => (
        <div key={day.key}>
          <div className="sticky top-0 z-10 -mx-2 mb-3 bg-[#f7f7f5]/95 px-2 py-2 backdrop-blur">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#005eed]">{day.full}</p>
            <p className="text-xs text-mist">{items.length} classes</p>
          </div>
          <div className="relative pl-8">
            <div className="absolute bottom-2 left-[18px] top-2 w-px bg-line" />
            {items.map((s) => {
              const t = trainerById(s.trainerId);
              return (
                <button key={s.id} onClick={() => onSelect(s)} className="relative mb-4 flex w-full gap-4 text-left">
                  <span className="absolute -left-8 top-3 h-3 w-3 rounded-full bg-[#005eed] ring-4 ring-white" />
                  <div className="ticket w-full rounded-2xl p-4 ring-1 ring-line">
                    <p className="text-[11px] font-semibold text-[#005eed]">{s.time}</p>
                    <p className="mt-1 text-lg font-medium">{s.name}</p>
                    <p className="text-sm text-mist">
                      {locationById(s.locationId).name} · {s.studio} · {t.name}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

export function ListView({ sessions, pinned, onSelect }: { sessions: Session[]; pinned: string[]; onSelect: (s: Session) => void }) {
  const rows = [...sessions].sort((a, b) => a.day - b.day || a.time.localeCompare(b.time));
  return (
    <Panel className="overflow-hidden">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-line text-[10px] uppercase tracking-wider text-mist">
            <th className="px-4 py-3">When</th>
            <th>Class</th>
            <th>Trainer</th>
            <th>Fill</th>
            <th>Score</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((s) => {
            const t = trainerById(s.trainerId);
            return (
              <tr key={s.id} onClick={() => onSelect(s)} className="cursor-pointer hover:bg-ink">
                <td className="px-4 py-3">
                  {DAYS[s.day].label} {s.time}
                </td>
                <td>
                  {s.name} {pinned.includes(s.id) && <span className="text-[10px] text-[#005eed]">Pinned</span>}
                </td>
                <td>{t.name}</td>
                <td className="w-36">
                  <FillBar fill={s.fill} />
                </td>
                <td>
                  <ScoreRing score={s.score} size={30} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Panel>
  );
}

const TIER_TONE: Record<number, string> = {
  1: "bg-[#005eed] text-white",
  2: "bg-[#0e1729] text-white",
  3: "bg-mist/30 text-ivory",
  4: "bg-mist/20 text-mist",
};

export function TrainerView({ sessions, onSelect }: { sessions: Session[]; onSelect: (s: Session) => void }) {
  const people = trainerLoad(sessions);
  return (
    <div className="grid gap-5 overflow-auto pb-8 xl:grid-cols-2">
      {people.map((t) => {
        const mine = sessions.filter((s) => s.trainerId === t.id);
        const locCount = new Set(mine.map((s) => s.locationId)).size;
        const avgFill = mine.length ? Math.round(mine.reduce((a, s) => a + s.fill, 0) / mine.length) : 0;
        // Reference weekly-hour cap for the load bar — the real per-org cap lives in settings.limits,
        // not passed down to this view; 15h is the app-wide default weeklyCap.
        const utilization = Math.min(100, Math.round((t.hours / 15) * 100));
        const byFamily = new Map<string, { count: number; accent: string }>();
        for (const s of mine) {
          const row = byFamily.get(s.name) ?? { count: 0, accent: s.accent };
          row.count += 1;
          byFamily.set(s.name, row);
        }
        const mix = [...byFamily.entries()].sort((a, b) => b[1].count - a[1].count);
        return (
          <Panel key={t.id} className="overflow-hidden p-0">
            <div className="flex items-center gap-4 bg-gradient-to-br from-[#0e1729] to-[#1c2c4a] p-5 text-white">
              <img src={t.photo} alt="" className="h-16 w-16 rounded-2xl object-cover ring-2 ring-white/20" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="truncate text-lg font-semibold">{t.name}</p>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${TIER_TONE[t.tier] ?? TIER_TONE[4]}`}>T{t.tier}</span>
                </div>
                <p className="mt-0.5 truncate text-[11px] text-white/60">{t.specialty}</p>
              </div>
            </div>
            <div className="grid grid-cols-4 gap-px bg-line">
              {[
                { label: "Classes", value: String(t.classes) },
                { label: "Hours", value: `${t.hours}h` },
                { label: "Avg fill", value: `${avgFill}%` },
                { label: "Houses", value: String(locCount) },
              ].map((stat) => (
                <div key={stat.label} className="bg-white p-3 text-center">
                  <p className="text-lg font-semibold tabular-nums text-[#0e1729]">{stat.value}</p>
                  <p className="text-[9px] uppercase tracking-wider text-mist">{stat.label}</p>
                </div>
              ))}
            </div>
            <div className="p-4">
              <div className="mb-1 flex items-center justify-between text-[10px] uppercase tracking-wide text-mist">
                <span>Week load</span>
                <span>{utilization}%</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-ink">
                <div
                  className="h-full rounded-full"
                  style={{ width: `${utilization}%`, background: utilization > 90 ? "#e05a3c" : "#005eed" }}
                />
              </div>
              {mix.length > 0 && (
                <>
                  <div className="mt-3 flex h-2 overflow-hidden rounded-full">
                    {mix.map(([name, row]) => (
                      <div key={name} title={`${name} · ${row.count}`} style={{ width: `${(row.count / t.classes) * 100}%`, background: row.accent }} />
                    ))}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-mist">
                    {mix.map(([name, row]) => (
                      <span key={name} className="inline-flex items-center gap-1">
                        <span className="h-1.5 w-1.5 rounded-full" style={{ background: row.accent }} />
                        {name} · {row.count}
                      </span>
                    ))}
                  </div>
                </>
              )}
            </div>
            <div className="overflow-x-auto border-t border-line p-4">
              <table className="w-full min-w-[560px] text-left text-xs">
                <thead>
                  <tr className="text-[10px] uppercase tracking-wider text-mist">
                    <th className="w-10 py-1">Day</th>
                    {LOCATIONS.map((l) => (
                      <th key={l.id} className="py-1">
                        {l.name.split(" ")[0]}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {DAYS.map((d) => (
                    <tr key={d.key} className="border-t border-line align-top">
                      <td className="py-1.5 font-medium text-mist">{d.label}</td>
                      {LOCATIONS.map((l) => (
                        <td key={l.id} className="py-1.5 pr-2">
                          <div className="flex flex-col gap-1">
                            {sessions
                              .filter((s) => s.trainerId === t.id && s.day === d.key && s.locationId === l.id)
                              .map((s) => (
                                <button
                                  key={s.id}
                                  onClick={() => onSelect(s)}
                                  className="flex items-center gap-1.5 rounded-lg bg-ink px-2 py-1 text-left text-[11px] hover:bg-[#005eed]/10"
                                >
                                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: s.accent }} />
                                  <span className="truncate">
                                    {s.time} {s.name}
                                  </span>
                                </button>
                              ))}
                          </div>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        );
      })}
    </div>
  );
}

const LOC_CODE: Record<string, { code: string; city: string }> = {
  copper: { code: "CC", city: "MUMBAI" },
  courtside: { code: "CS", city: "MUMBAI" },
  kenkere: { code: "KE", city: "MUMBAI" },
  kwality: { code: "KW", city: "MUMBAI" },
  supreme: { code: "SU", city: "MUMBAI" },
};

export function MultiView({ all, actions, onOpenCreate }: { all: Session[]; actions: CardActions; onOpenCreate?: (locationId: string, day: number, time: string) => void }) {
  const times = [...new Set([...TIMES, ...all.map((s) => s.time)])].sort();
  const [visibleLocationIds, setVisibleLocationIds] = useState(() => LOCATIONS.map((l) => l.id));
  const visibleLocations = LOCATIONS.filter((l) => visibleLocationIds.includes(l.id));
  const locationCount = Math.max(visibleLocations.length, 1);
  const laneWidth = 190;
  const gridTemplateColumns = `88px repeat(${DAYS.length * locationCount}, minmax(${laneWidth}px, ${laneWidth}px))`;
  const minWidth = 88 + DAYS.length * locationCount * laneWidth;
  const toggleLocation = (id: string) => {
    setVisibleLocationIds((ids) => {
      if (ids.includes(id)) return ids.length === 1 ? ids : ids.filter((x) => x !== id);
      return [...ids, id];
    });
  };
  return (
    <div className="overflow-auto pb-8">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-2xl font-semibold tracking-tight">Multi-Location Schedule</h2>
        <div className="flex flex-wrap gap-1.5 rounded-2xl bg-white p-1 ring-1 ring-line">
          {LOCATIONS.map((l) => {
            const active = visibleLocationIds.includes(l.id);
            return (
              <button
                key={l.id}
                onClick={() => toggleLocation(l.id)}
                className={`rounded-xl px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] transition ${
                  active ? "bg-[#005eed] text-white shadow-sm" : "text-mist hover:bg-ink hover:text-[#0e1729]"
                }`}
              >
                {LOC_CODE[l.id]?.code || l.id.slice(0, 2)}
              </button>
            );
          })}
        </div>
      </div>
      <div className="rounded-3xl border border-line bg-white" style={{ minWidth }}>
        <div className="grid" style={{ gridTemplateColumns }}>
          <div className="sticky left-0 top-0 z-40 row-span-2 border-b border-r border-line bg-white px-2 py-3 text-[11px] font-semibold uppercase text-mist">Time</div>
          {DAYS.map((d) => (
            <div key={d.key} className="sticky top-0 z-30 border-b border-l border-line bg-white px-3 py-3" style={{ gridColumn: `span ${locationCount}` }}>
              <div className="flex items-baseline gap-2">
                <span className="text-sm font-bold">{d.label}</span>
                <span className="text-xs text-mist">{d.full}</span>
                <span className="rounded-full bg-[#eef4ff] px-2 text-[11px] font-semibold text-[#005eed]">{all.filter((s) => s.day === d.key).length}</span>
              </div>
            </div>
          ))}
          {DAYS.flatMap((d) =>
            visibleLocations.map((l) => (
              <div key={`${d.key}-${l.id}`} className="sticky top-[45px] z-30 border-b border-l border-line bg-[#fafafa] px-2 py-2 text-center text-[9px] font-semibold uppercase text-mist">
                <div>{LOC_CODE[l.id]?.city || "CITY"}</div>
                <div className="text-[#0e1729]">
                  {LOC_CODE[l.id]?.code || l.id.slice(0, 2).toUpperCase()} ({all.filter((s) => s.day === d.key && s.locationId === l.id).length})
                </div>
              </div>
            ))
          )}
          {times.map((time) => (
            <div key={time} className="contents">
              <div className="sticky left-0 z-20 border-t border-r border-line bg-white py-4 pr-2 text-right">
                <div className="text-sm font-bold text-[#c2410c]">{time}</div>
                <div className="text-[9px] uppercase text-mist">{time < "12:00" ? "Prime" : time < "17:00" ? "Mid" : "Eve"}</div>
              </div>
              {DAYS.flatMap((d) =>
                visibleLocations.map((l) => {
                    const cards = all.filter((s) => s.day === d.key && s.time === time && s.locationId === l.id);
                    return (
                      <div key={`${time}-${d.key}-${l.id}`} className="min-w-0 space-y-2 border-l border-t border-line bg-[#fafafa] p-2">
                        {cards.map((s) => (
                          <ClassCard key={s.id} session={s} compact weekHours={trainerWeekHours(all, s.trainerId)} actions={actions} />
                        ))}
                        {!cards.length && (
                          <button
                            onClick={() => onOpenCreate?.(l.id, d.key, time)}
                            className="flex min-h-[72px] w-full items-center justify-center rounded-xl text-base text-mist/30 hover:bg-white hover:text-[#005eed] hover:ring-1 hover:ring-line"
                          >
                            +
                          </button>
                        )}
                      </div>
                    );
                  })
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function CityView({ all, onJump, actions }: { all: Session[]; onJump: (id: string) => void; actions?: CardActions }) {
  const times = [...new Set(all.map((s) => s.time))].sort();
  return (
    <div className="space-y-4 overflow-auto pb-8">
      <p className="text-sm text-mist">Intra-city board — same start time across houses. Click a house name to open its week grid.</p>
      <div className="min-w-[1100px]">
        <div className="grid grid-cols-[80px_repeat(5,minmax(160px,1fr))] gap-2">
          <div />
          {LOCATIONS.map((loc) => (
            <button key={loc.id} onClick={() => onJump(loc.id)} className="rounded-2xl bg-white px-2 py-2 text-left ring-1 ring-line">
              <p className="text-[10px] uppercase text-mist">{loc.area}</p>
              <p className="font-serif text-lg">{loc.name}</p>
              <p className="text-[10px] text-[#005eed]">{all.filter((s) => s.locationId === loc.id).length}</p>
            </button>
          ))}
          {times.map((t) => (
            <div key={t} className="contents">
              <div className="pt-3 text-right font-serif text-sm text-[#005eed]">{t}</div>
              {LOCATIONS.map((loc) => {
                const cards = all.filter((s) => s.time === t && s.locationId === loc.id);
                return (
                  <div key={loc.id + t} className="min-h-[56px] space-y-2 rounded-2xl bg-[#efefef]/70 p-1">
                    {cards.map((s) =>
                      actions ? (
                        <ClassCard key={s.id} session={s} weekHours={trainerWeekHours(all, s.trainerId)} actions={actions} />
                      ) : (
                        <p key={s.id} className="text-[11px]">
                          {DAYS[s.day].label} {s.name}
                        </p>
                      )
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function HeatmapView({ sessions }: { sessions: Session[] }) {
  const max = Math.max(1, ...TIMES.flatMap((t) => DAYS.map((d) => sessions.filter((s) => s.day === d.key && s.time === t).reduce((a, s) => a + s.fill, 0))));
  return (
    <Panel className="overflow-x-auto p-5">
      <h2 className="font-serif text-2xl">Fill heat</h2>
      <div className="mt-5 min-w-[720px] grid grid-cols-[72px_repeat(7,minmax(0,1fr))] gap-1.5">
        <div />
        {DAYS.map((d) => (
          <div key={d.key} className="text-center text-[11px] uppercase text-mist">
            {d.label}
          </div>
        ))}
        {TIMES.map((t) => (
          <div key={t} className="contents">
            <div className="py-2 text-right text-[11px] text-[#005eed]">{t}</div>
            {DAYS.map((d) => {
              const cell = sessions.filter((s) => s.day === d.key && s.time === t);
              const fill = cell.reduce((a, s) => a + s.fill, 0);
              const intensity = fill / max;
              return (
                <div
                  key={d.key}
                  className="flex h-12 items-center justify-center rounded-xl text-[11px]"
                  style={{ background: `rgba(0,94,237,${0.06 + intensity * 0.72})`, color: intensity > 0.45 ? "#fff" : "#0e1729" }}
                >
                  {cell.length ? `${Math.round(fill / cell.length)}%` : "—"}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </Panel>
  );
}

export function RoomsView({ sessions, actions, all }: { sessions: Session[]; actions: CardActions; all: Session[] }) {
  const rooms = [...new Set(sessions.map((s) => s.studio))];
  return (
    <div className="overflow-x-auto pb-8">
      <div className="grid min-w-[1100px] gap-3" style={{ gridTemplateColumns: `repeat(${Math.max(rooms.length, 1)}, minmax(220px, 1fr))` }}>
        {rooms.map((room) => {
          const list = sessions.filter((s) => s.studio === room).sort((a, b) => a.day - b.day || a.time.localeCompare(b.time));
          return (
            <div key={room} className="space-y-2">
              <div className="rounded-2xl bg-white px-3 py-3 ring-1 ring-line">
                <p className="text-[10px] uppercase text-mist">Room</p>
                <p className="font-serif text-xl">{room}</p>
                <p className="text-[11px] text-[#005eed]">{list.length} classes</p>
              </div>
              {DAYS.map((d) => (
                <div key={d.key}>
                  <p className="mb-1 text-[10px] uppercase text-mist">{d.label}</p>
                  <div className="space-y-2">
                    {list
                      .filter((s) => s.day === d.key)
                      .map((s) => (
                        <ClassCard key={s.id} session={s} weekHours={trainerWeekHours(all, s.trainerId)} actions={actions} />
                      ))}
                  </div>
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function AnalyticsView({ sessions, all }: { sessions: Session[]; all: Session[] }) {
  const [tab, setTab] = useState("fill");
  const byDay = DAYS.map((d) => ({
    name: d.label,
    Fill: Math.round(sessions.filter((s) => s.day === d.key).reduce((a, s, _, arr) => a + s.fill / arr.length, 0) || 0),
    Classes: sessions.filter((s) => s.day === d.key).length,
  }));
  const loads = trainerLoad(all);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {["fill", "trainers", "table"].map((id) => (
          <button key={id} onClick={() => setTab(id)} className={`rounded-full px-3 py-1.5 text-xs ${tab === id ? "bg-[#005eed] text-white" : "bg-ink"}`}>
            {id}
          </button>
        ))}
      </div>
      {tab === "fill" && (
        <Panel className="p-5">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={byDay}>
                <XAxis dataKey="name" tickLine={false} axisLine={false} />
                <YAxis tickLine={false} axisLine={false} />
                <Tooltip content={<Tip />} />
                <Area type="monotone" dataKey="Fill" stroke="#005eed" fill="#005eed22" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      )}
      {tab === "trainers" && (
        <Panel className="p-5">
          {loads.map((t) => (
            <div key={t.id} className="flex justify-between border-b border-line py-2 text-sm">
              <span>{t.name}</span>
              <span>{t.hours}h</span>
            </div>
          ))}
        </Panel>
      )}
      {tab === "table" && (
        <Panel className="overflow-x-auto p-5">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="uppercase text-mist">
                <th className="py-2">When</th>
                <th>Class</th>
                <th>Trainer</th>
                <th>Fill</th>
                <th>Score</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((s) => (
                <tr key={s.id} className="border-t border-line">
                  <td className="py-1.5">
                    {DAYS[s.day].label} {s.time}
                  </td>
                  <td>{s.name}</td>
                  <td>{trainerById(s.trainerId).name}</td>
                  <td>{s.fill}%</td>
                  <td>{s.score}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      )}
    </div>
  );
}

export function ControlView({
  sessions,
  onSelect,
  report,
}: {
  sessions: Session[];
  onSelect: (s: Session) => void;
  report?: import("./types").GenReport | null;
}) {
  return (
    <div className="space-y-3">
      {report && (
        <Panel className="p-5">
          <h3 className="font-serif text-3xl">Draft {report.hash}</h3>
          <div className="mt-4 grid gap-2 md:grid-cols-5">
            {report.locations.map((l) => (
              <div key={l.id} className="rounded-2xl bg-ink p-3">
                <p className="text-[11px] uppercase text-mist">{l.id}</p>
                <p className="font-serif text-2xl">{l.count}</p>
              </div>
            ))}
          </div>
        </Panel>
      )}
      <Panel className="p-5">
        {sessions.slice(0, 12).map((s) => (
          <button key={s.id} onClick={() => onSelect(s)} className="mb-2 flex w-full justify-between rounded-xl bg-ink px-3 py-2 text-sm">
            <span>
              {s.name} · {DAYS[s.day].label} {s.time}
            </span>
            <span>{s.score}</span>
          </button>
        ))}
      </Panel>
    </div>
  );
}

export function ReportView({ sessions, locationName, all }: { sessions: Session[]; locationName: string; all: Session[] }) {
  const fill = sessions.reduce((a, s) => a + s.fill, 0) / (sessions.length || 1);
  return (
    <Panel className="overflow-x-auto p-6">
      <p className="text-[10px] uppercase text-[#005eed]">Weekly intelligence</p>
      <h2 className="font-serif text-4xl">{locationName}</h2>
      <p className="mt-2 font-serif text-5xl text-[#005eed]">{Math.round(fill)}%</p>
      <table className="mt-6 w-full text-left text-xs">
        <thead>
          <tr className="uppercase text-mist">
            <th className="py-2">House</th>
            <th>Day</th>
            <th>Time</th>
            <th>Class</th>
            <th>Trainer</th>
            <th>Fill</th>
            <th>Score</th>
          </tr>
        </thead>
        <tbody>
          {all.map((s) => (
            <tr key={s.id} className="border-t border-line">
              <td className="py-1.5">{locationById(s.locationId).name}</td>
              <td>{DAYS[s.day].label}</td>
              <td>{s.time}</td>
              <td>{s.name}</td>
              <td>{trainerById(s.trainerId).name}</td>
              <td>{s.fill}%</td>
              <td>{s.score}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Panel>
  );
}
