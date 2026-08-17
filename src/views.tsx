import { Fragment, useMemo, useState } from "react";
import { Area, AreaChart, Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CheckCircle2, CircleDashed, Plus, Search } from "lucide-react";
import { DAYS, LOCATIONS, TIMES, daysWithDates, locationById, trainerById, trainerLoad } from "./data";
import { weekOffDays } from "./engine";
import { cleanClass, getPerformanceHeaders, getPerformanceRows, type PerfRow } from "./performance";
import type { Session, Settings } from "./types";
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
  focusFormats,
  discontinued,
  query,
  actions,
  weekStart,
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
  focusFormats: string[];
  discontinued?: Session[];
  query: string;
  actions: CardActions;
  weekStart: Date;
  onAdd?: (opt: { day: number; time: string; name: string; trainerId: string }) => void;
  onOpenCreate?: (day: number, time: string) => void;
  onDropSession?: (sessionId: string, day: number, time: string) => void;
  onDayClick?: (day: number) => void;
  onTimeClick?: (time: string) => void;
}) {
  const days = daysWithDates(weekStart);
  const [afternoonsOpen, setAfternoonsOpen] = useState(false);
  const displaySessions = useMemo(() => [...sessions, ...(discontinued ?? [])], [sessions, discontinued]);
  const afternoonTimes = ["12:00", "12:15", "12:30", "12:45", "13:00", "13:15", "13:30", "13:45", "14:00", "14:15", "14:30", "14:45", "15:00", "15:15", "15:30", "15:45", "16:00", "16:15", "16:30", "16:45"];
  const times = useMemo(() => [...new Set([...TIMES, ...afternoonTimes, ...displaySessions.map((s) => s.time)])].sort(), [displaySessions]);
  const q = query.toLowerCase();
  const filterActive = Boolean(focusTrainer || focusFormats.length || q);
  const matches = (s: Session) => {
    if (focusTrainer && s.trainerId !== focusTrainer) return false;
    if (focusFormats.length && !focusFormats.includes(s.name)) return false;
    if (!q) return true;
    const t = trainerById(s.trainerId);
    return [s.name, s.studio, t.name, s.time].join(" ").toLowerCase().includes(q);
  };

  return (
    <div className="overflow-auto pb-8">
      <div className="min-w-[1180px]">
        <div className="grid grid-cols-[76px_repeat(7,minmax(0,1fr))] gap-2 pb-2">
          <div />
          {days.map((d) => {
            const count = displaySessions.filter((s) => s.day === d.key && !s.id.startsWith("disc-")).length;
            return (
              <button key={d.key} onClick={() => onDayClick?.(d.key)} className={`schedule-day-header ${d.today ? "schedule-day-header-today" : ""}`}>
                <p className="schedule-day-label">{d.label}</p>
                <p className="schedule-day-date">{d.date}</p>
                <p className="schedule-day-count">{count} classes</p>
              </button>
            );
          })}
        </div>
        <div className="space-y-2">
          {!afternoonsOpen && !displaySessions.some((s) => s.time >= "12:00" && s.time < "17:00") && (
            <button
              type="button"
              onClick={() => setAfternoonsOpen(true)}
              className="grid w-full grid-cols-[76px_1fr] gap-2 rounded-2xl border border-dashed border-line bg-white/70 px-2 py-2 text-left text-xs text-mist hover:border-[#005eed]/30 hover:text-ivory"
            >
              <span className="schedule-time-pill text-center">12-5</span>
              <span className="self-center">Afternoon slots collapsed · expand to schedule private, hosted, or manual classes</span>
            </button>
          )}
          {afternoonsOpen && (
            <button
              type="button"
              onClick={() => setAfternoonsOpen(false)}
              className="rounded-xl bg-white px-3 py-1.5 text-xs text-mist ring-1 ring-line hover:text-ivory"
            >
              Collapse empty afternoon slots
            </button>
          )}
          {times.map((time) => {
            const any = displaySessions.some((s) => s.time === time);
            const afternoon = time >= "12:00" && time < "17:00";
            if (!any && (!afternoon || !afternoonsOpen)) return null;
            return (
              <div key={time} className="grid grid-cols-[76px_repeat(7,minmax(0,1fr))] gap-2">
                <div className="schedule-time-rail sticky left-0 flex flex-col items-center pt-2">
                  <button className="schedule-time-pill" onClick={() => onTimeClick?.(time)}>
                    {time}
                  </button>
                </div>
                {days.map((d) => {
                  const cells = displaySessions.filter((s) => s.day === d.key && s.time === time);
                  const visibleCells = filterActive ? cells.filter((s) => matches(s) && !s.id.startsWith("disc-")) : cells;
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
                      {visibleCells.map((s) => (
                        <ClassCard key={s.id} session={s} pinned={pinned.includes(s.id)} dimmed={s.id.startsWith("disc-")} discontinued={s.id.startsWith("disc-")} actions={actions} />
                      ))}
                      {cells.length > 0 && (
                        <button
                          type="button"
                          onClick={() => onOpenCreate?.(d.key, time)}
                          className="slot-add-button flex w-full items-center justify-center gap-1 rounded-xl border border-dashed border-line bg-white/70 px-2 py-1.5 text-[10px] font-medium text-mist transition hover:border-[#005eed]/30 hover:bg-white hover:text-[#005eed]"
                          title={`Create another class at ${time}`}
                        >
                          <Plus className="h-3 w-3" />
                          Add class
                        </button>
                      )}
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

// Colors the load bar by how booked the trainer's week already is — calm green when light, blue at
// a healthy clip, amber approaching the cap, red once they're effectively maxed out.
function loadColor(utilization: number) {
  if (utilization > 100) return "#ef4444";
  if (utilization >= 90) return "#f59e0b";
  if (utilization >= 72) return "#005eed";
  if (utilization >= 45) return "#10b981";
  return "#8b5cf6";
}

const TIER_TONE: Record<number, string> = {
  1: "bg-[#005eed] text-white",
  2: "bg-[#0e1729] text-white",
  3: "bg-mist/30 text-ivory",
  4: "bg-mist/20 text-mist",
};

export function TrainerView({ sessions, onSelect, settings }: { sessions: Session[]; onSelect: (s: Session) => void; settings: Settings }) {
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
                <span style={{ color: loadColor(utilization) }} className="font-semibold">
                  {utilization}%
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-ink">
                <div className="h-full rounded-full transition-[width]" style={{ width: `${utilization}%`, background: loadColor(utilization) }} />
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
                  {(() => {
                    const off = new Set(weekOffDays(settings, t.id));
                    return DAYS.map((d) => {
                      const isOff = off.has(d.key);
                      return (
                        <tr key={d.key} className={`border-t border-line align-top ${isOff ? "bg-red-50" : ""}`}>
                          <td className={`py-1.5 font-medium ${isOff ? "text-red-600" : "text-mist"}`}>
                            {d.label}
                            {isOff && <span className="ml-1 rounded-full bg-red-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-red-600">Off</span>}
                          </td>
                          {LOCATIONS.map((l) => (
                            <td key={l.id} className={`py-1.5 pr-2 ${isOff ? "bg-red-50" : ""}`}>
                              <div className="flex flex-col gap-1">
                                {sessions
                                  .filter((s) => s.trainerId === t.id && s.day === d.key && s.locationId === l.id)
                                  .sort((a, b) => a.time.localeCompare(b.time))
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
                      );
                    });
                  })()}
                </tbody>
              </table>
            </div>
          </Panel>
        );
      })}
    </div>
  );
}

const LOC_CODE_ONLY: Record<string, string> = {
  copper: "CC",
  courtside: "CS",
  kenkere: "KE",
  kwality: "KH",
  supreme: "SU",
};

// City is read from each location's own `area` field (its last comma-separated segment) rather than
// a second hardcoded map — Kenkere/Copper are Bengaluru, not Mumbai, and a separate static table
// went stale the moment that stopped being true for every house.
function cityOf(locationId: string) {
  const area = locationById(locationId).area;
  const last = area.split(",").pop()?.trim();
  return (last || area).toUpperCase();
}

const LOC_CODE: Record<string, { code: string; city: string }> = Object.fromEntries(
  Object.entries(LOC_CODE_ONLY).map(([id, code]) => [id, { code, city: cityOf(id) }])
);

// Locations grouped by city rather than the flat authoring order in data.ts, which interleaves them
// (Kwality/Mumbai, Supreme/Mumbai, Kenkere/Bengaluru, Courtside/Mumbai, Copper/Bengaluru) — every
// house sharing a city now sits together, both in the toggle row and the grid's columns.
const CITY_PRIORITY = ["MUMBAI", "BENGALURU"];

// Distinct identity per city header band so Mumbai and Bengaluru read apart at a glance in the
// multi-location grid — falls back to the neutral blue for any city outside the known two.
const CITY_TONE: Record<string, { bg: string; text: string }> = {
  MUMBAI: { bg: "var(--city-mumbai-bg)", text: "var(--city-mumbai-text)" },
  BENGALURU: { bg: "var(--city-bengaluru-bg)", text: "var(--city-bengaluru-text)" },
};
const DEFAULT_CITY_TONE = { bg: "var(--city-default-bg)", text: "var(--city-default-text)" };
const LOCATIONS_BY_CITY = [...LOCATIONS].sort((a, b) => {
  const pa = CITY_PRIORITY.indexOf(cityOf(a.id));
  const pb = CITY_PRIORITY.indexOf(cityOf(b.id));
  return (pa < 0 ? 99 : pa) - (pb < 0 ? 99 : pb);
});
const DEFAULT_MULTI_LOCATION_IDS = ["kwality", "supreme", "kenkere"];

export function MultiView({
  all,
  actions,
  onOpenCreate,
  onAdd,
  focusTrainer,
  focusFormats,
}: {
  all: Session[];
  actions: CardActions;
  onOpenCreate?: (locationId: string, day: number, time: string) => void;
  onAdd?: (locationId: string, opt: { day: number; time: string; name: string; trainerId: string }) => void;
  focusTrainer?: string | null;
  focusFormats?: string[];
}) {
  const filteredAll = focusTrainer ? all.filter((s) => s.trainerId === focusTrainer) : all;
  const displayAll = focusFormats?.length ? filteredAll.filter((s) => focusFormats.includes(s.name)) : filteredAll;
  const filterActive = Boolean(focusTrainer || focusFormats?.length);
  const times = [...new Set(filterActive ? displayAll.map((s) => s.time) : [...TIMES, ...displayAll.map((s) => s.time)])].sort();
  const [visibleLocationIds, setVisibleLocationIds] = useState(() => DEFAULT_MULTI_LOCATION_IDS.filter((id) => LOCATIONS_BY_CITY.some((l) => l.id === id)));
  const visibleLocations = LOCATIONS_BY_CITY.filter((l) => visibleLocationIds.includes(l.id));
  const locationCount = Math.max(visibleLocations.length, 1);
  // Runs of consecutive same-city locations within the visible set, for the city header row —
  // consecutive because LOCATIONS_BY_CITY is already grouped, so a city only ever appears as one run.
  const cityGroups = visibleLocations.reduce<Array<{ city: string; count: number }>>((groups, l) => {
    const city = LOC_CODE[l.id]?.city ?? "—";
    const last = groups[groups.length - 1];
    if (last && last.city === city) last.count += 1;
    else groups.push({ city, count: 1 });
    return groups;
  }, []);
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
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Multi-Location Schedule</h2>
          <p className="mt-1 text-xs text-mist">{visibleLocations.length} houses visible · {displayAll.length} scheduled classes</p>
        </div>
        <div className="flex flex-wrap gap-1.5 rounded-2xl bg-white p-1 ring-1 ring-line">
          {LOCATIONS_BY_CITY.map((l) => {
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
      <div className="multi-board overflow-hidden rounded-3xl border border-line bg-white" style={{ minWidth }}>
        <div className="grid" style={{ gridTemplateColumns }}>
          <div className="multi-header sticky left-0 top-0 z-40 row-span-3 border-b border-r border-line px-2 py-3 text-[11px] font-semibold uppercase text-mist">Time</div>
          {DAYS.map((d) => (
            <div key={d.key} className="multi-day-header sticky top-0 z-30 border-b border-l border-line px-3 py-3" style={{ gridColumn: `span ${locationCount}` }}>
              <div className="flex items-baseline gap-2">
                <span className="text-sm font-bold">{d.label}</span>
                <span className="text-xs text-mist">{d.full}</span>
                <span className="rounded-full bg-[#eef4ff] px-2 text-[11px] font-semibold text-[#005eed]">{displayAll.filter((s) => s.day === d.key).length}</span>
              </div>
            </div>
          ))}
          {/* Cities grouped as spanning header bands — locations are pre-sorted by city, so each
              city forms exactly one contiguous run of columns per day block. */}
          {DAYS.flatMap((d) =>
            cityGroups.map((g, gi) => {
              const tone = CITY_TONE[g.city] ?? DEFAULT_CITY_TONE;
              return (
	                <div
	                  key={`${d.key}-city-${gi}`}
	                  className="sticky top-[45px] z-30 border-b border-l border-line px-2 py-1.5 text-center text-[9px] font-bold uppercase tracking-wider"
	                  style={{ gridColumn: `span ${g.count}`, background: tone.bg, color: tone.text }}
	                >
                  {g.city}
                </div>
              );
            })
          )}
	          {DAYS.flatMap((d) =>
	            visibleLocations.map((l) => (
	              <div
	                key={`${d.key}-${l.id}`}
	                className="multi-loc-header sticky top-[73px] z-30 border-b border-l border-line px-2 py-2 text-center text-[9px] font-semibold uppercase text-[#0e1729]"
	              >
		                {LOC_CODE[l.id]?.code || l.id.slice(0, 2).toUpperCase()} ({displayAll.filter((s) => s.day === d.key && s.locationId === l.id).length})
	              </div>
	            ))
	          )}
          {times.map((time) => (
            <div key={time} className="contents">
              <div className="multi-time-cell sticky left-0 z-20 border-t border-r border-line py-4 pr-2 text-right">
                <div className="text-sm font-bold text-[#005eed]">{time}</div>
                <div className="text-[9px] uppercase text-mist">{time < "12:00" ? "Prime" : time < "17:00" ? "Mid" : "Eve"}</div>
              </div>
              {DAYS.flatMap((d) =>
                visibleLocations.map((l) => {
                    const cards = displayAll.filter((s) => s.day === d.key && s.time === time && s.locationId === l.id);
                    return (
	                      <div
	                        key={`${time}-${d.key}-${l.id}`}
	                        className="multi-slot-cell min-w-0 space-y-2 border-l border-t border-line p-2"
	                      >
                        {cards.map((s) => (
                          <ClassCard
                            key={s.id}
                            session={s}
                            compact
                            actions={actions}
                          />
                        ))}
                        {!cards.length && <EmptySlot locationId={l.id} day={d.key} time={time} onAdd={(opt) => onAdd?.(l.id, { day: d.key, time, ...opt })} onOpenCreate={() => onOpenCreate?.(l.id, d.key, time)} />}
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

export function CityView({ all, onJump, actions, focusTrainer, focusFormats }: { all: Session[]; onJump: (id: string) => void; actions?: CardActions; focusTrainer?: string | null; focusFormats?: string[] }) {
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
                        <ClassCard
                          key={s.id}
                          session={s}
                          actions={actions}
                          dimmed={Boolean((focusTrainer && s.trainerId !== focusTrainer) || (focusFormats?.length && !focusFormats.includes(s.name)))}
                        />
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
  const [day, setDay] = useState(() => {
    const today = new Date().getDay();
    return today === 0 ? 6 : today - 1; // Sunday (0) maps to DAYS index 6, Mon=0..Sat=5
  });
  const rooms = [...new Set(sessions.map((s) => s.studio))].sort();
  const dayItems = sessions.filter((s) => s.day === day);
  const times = TIMES.filter((t) => dayItems.some((s) => s.time === t));
  const laneWidth = Math.max(220, Math.floor(900 / Math.max(rooms.length, 1)));
  return (
    <div className="space-y-4 overflow-x-auto pb-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-2xl font-semibold tracking-tight">Studio Timetable</h2>
        <div className="flex flex-wrap gap-1.5 rounded-2xl bg-white p-1 ring-1 ring-line">
          {DAYS.map((d) => (
            <button
              key={d.key}
              onClick={() => setDay(d.key)}
              className={`rounded-xl px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] transition ${
                day === d.key ? "bg-[#005eed] text-white shadow-sm" : "text-mist hover:bg-ink hover:text-[#0e1729]"
              }`}
            >
              {d.label}
              <span className="ml-1 opacity-70">{sessions.filter((s) => s.day === d.key).length}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="rounded-3xl border border-line bg-white" style={{ minWidth: 100 + rooms.length * laneWidth }}>
        <div className="grid" style={{ gridTemplateColumns: `88px repeat(${Math.max(rooms.length, 1)}, minmax(${laneWidth}px, 1fr))` }}>
          <div className="sticky left-0 top-0 z-20 border-b border-r border-line bg-white px-2 py-3 text-[11px] font-semibold uppercase text-mist">Time</div>
          {rooms.map((room) => {
            const count = dayItems.filter((s) => s.studio === room).length;
            return (
              <div key={room} className="sticky top-0 z-10 border-b border-l border-line bg-white px-3 py-3">
                <p className="text-[10px] uppercase text-mist">Studio</p>
                <p className="font-serif text-lg leading-tight">{room}</p>
                <p className="text-[11px] text-[#005eed]">{count} classes</p>
              </div>
            );
          })}
          {times.length === 0 && (
            <div className="col-span-full px-4 py-10 text-center text-sm text-mist">No classes scheduled on {DAYS[day].full}.</div>
          )}
          {times.map((time) => (
            <div key={time} className="contents">
              <div className="sticky left-0 z-10 flex flex-col items-center justify-center border-t border-r border-line bg-white py-4">
                <span className="font-serif text-sm text-[#005eed]">{time}</span>
              </div>
              {rooms.map((room) => {
                const cell = dayItems.filter((s) => s.studio === room && s.time === time);
                return (
                  <div key={room + time} className="min-h-[80px] space-y-2 border-l border-t border-line bg-[#fafafa] p-2">
                    {cell.map((s) => (
                      <ClassCard key={s.id} session={s} compact actions={actions} />
                    ))}
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

function avg(xs: number[]) {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}
function sum(xs: number[]) {
  return xs.reduce((a, b) => a + b, 0);
}
function timeBucket(time: string) {
  return time < "12:00" ? "Prime" : time < "17:00" ? "Mid" : "Eve";
}

type DashboardMetric = {
  key: string;
  label: string;
  value: string | number;
  hint?: string;
  tone?: "good" | "warn" | "bad" | string;
};

function metricToneClass(tone?: DashboardMetric["tone"]) {
  if (tone === "good") return "text-emerald-700";
  if (tone === "warn") return "text-amber-700";
  if (tone === "bad") return "text-rose-700";
  return "text-ivory";
}

function KpiCard({
  label,
  value,
  hint,
  tone,
  toneClass,
  onClick,
}: {
  label: string;
  value: string | number;
  hint?: string;
  tone?: string;
  toneClass?: string;
  onClick?: () => void;
}) {
  const body = (
    <>
      <p className="text-[10px] uppercase tracking-wider text-mist">{label}</p>
      <p className={`mt-1 font-serif text-2xl ${toneClass ?? ""}`} style={tone ? { color: tone } : undefined}>
        {value}
      </p>
      {hint && <p className="mt-0.5 text-[11px] text-mist">{hint}</p>}
    </>
  );
  if (onClick) {
    return (
      <button onClick={onClick} className="panel rounded-2xl p-4 text-left transition hover:-translate-y-0.5 hover:ring-[#005eed]/30">
        {body}
      </button>
    );
  }
  return (
    <div className="rounded-2xl bg-white p-4 ring-1 ring-line">
      {body}
    </div>
  );
}

const ANALYTICS_TABS = [
  { id: "overview", label: "Overview" },
  { id: "trends", label: "Trends" },
  { id: "mix", label: "Format Mix" },
  { id: "locations", label: "Locations" },
  { id: "trainers", label: "Trainers" },
  { id: "table", label: "Full Table" },
] as const;

export function AnalyticsView({
  sessions,
  all,
  metrics,
  onMetricSelect,
}: {
  sessions: Session[];
  all: Session[];
  metrics?: DashboardMetric[];
  onMetricSelect?: (key: string) => void;
}) {
  const [tab, setTab] = useState<(typeof ANALYTICS_TABS)[number]["id"]>("overview");

  const totalClasses = sessions.length;
  const avgFill = Math.round(avg(sessions.map((s) => s.fill)));
  const avgScore = Math.round(avg(sessions.map((s) => s.score)));
  const projected = Math.round(sum(sessions.map((s) => (s.fill / 100) * s.capacity)));
  const totalCapacity = sum(sessions.map((s) => s.capacity));
  const historicPct = totalClasses ? Math.round((sessions.filter((s) => s.tags.includes("historic")).length / totalClasses) * 100) : 0;
  const oneOffCount = sessions.filter((s) => s.oneOff).length;
  const trainerCount = new Set(sessions.map((s) => s.trainerId)).size;
  const trainerHours = sum([...new Set(sessions.map((s) => s.trainerId))].map((id) => trainerWeekHours(sessions, id)));

  const byDay = DAYS.map((d) => {
    const rows = sessions.filter((s) => s.day === d.key);
    return { name: d.label, Fill: Math.round(avg(rows.map((s) => s.fill))), Score: Math.round(avg(rows.map((s) => s.score))), Classes: rows.length };
  });

  const byBucket = ["Prime", "Mid", "Eve"].map((b) => {
    const rows = sessions.filter((s) => timeBucket(s.time) === b);
    return { name: b, Classes: rows.length, Fill: Math.round(avg(rows.map((s) => s.fill))) };
  });

  const formatMap = new Map<string, { count: number; fill: number[]; score: number[]; accent: string }>();
  for (const s of sessions) {
    const row = formatMap.get(s.name) ?? { count: 0, fill: [], score: [], accent: s.accent };
    row.count += 1;
    row.fill.push(s.fill);
    row.score.push(s.score);
    formatMap.set(s.name, row);
  }
  const byFormat = [...formatMap.entries()]
    .map(([name, row]) => ({ name, count: row.count, fill: Math.round(avg(row.fill)), score: Math.round(avg(row.score)), accent: row.accent }))
    .sort((a, b) => b.count - a.count);

  const byLocation = LOCATIONS.map((l) => {
    const rows = all.filter((s) => s.locationId === l.id);
    return { id: l.id, name: l.name.split(",")[0], count: rows.length, fill: Math.round(avg(rows.map((s) => s.fill))), score: Math.round(avg(rows.map((s) => s.score))) };
  });

  const atRisk = [...sessions].filter((s) => s.score < 60 || s.fill < 45).sort((a, b) => a.score - b.score).slice(0, 8);
  const bestCombos = [...sessions].filter((s) => s.score >= 85).sort((a, b) => b.score - a.score).slice(0, 8);

  const loads = trainerLoad(all).map((t) => {
    const rows = all.filter((s) => s.trainerId === t.id);
    return { ...t, fill: Math.round(avg(rows.map((s) => s.fill))), score: Math.round(avg(rows.map((s) => s.score))), utilization: Math.min(100, Math.round((t.hours / 15) * 100)) };
  });

  return (
    <div className="space-y-5 overflow-auto pb-8">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        {(metrics?.length
          ? metrics.map((m) => (
              <KpiCard
                key={m.key}
                label={m.label}
                value={m.value}
                hint={m.hint}
                toneClass={metricToneClass(m.tone)}
                onClick={onMetricSelect ? () => onMetricSelect(m.key) : undefined}
              />
            ))
          : [
              <KpiCard key="classes" label="Classes" value={String(totalClasses)} hint={`${trainerCount} trainers`} />,
              <KpiCard key="fill" label="Avg fill" value={`${avgFill}%`} tone={loadColor(avgFill)} />,
              <KpiCard key="score" label="Avg score" value={String(avgScore)} tone="#005eed" />,
              <KpiCard key="projected" label="Projected / capacity" value={`${projected}/${totalCapacity}`} hint="attendees this week" />,
              <KpiCard key="historic" label="Historic-backed" value={`${historicPct}%`} hint={`${oneOffCount} one-off`} />,
              <KpiCard key="hours" label="Trainer hours" value={`${trainerHours.toFixed(0)}h`} hint="booked this location" />,
            ])}
      </div>

      <div className="flex flex-wrap gap-2">
        {ANALYTICS_TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)} className={`rounded-full px-3 py-1.5 text-xs font-medium ${tab === t.id ? "bg-[#005eed] text-white" : "bg-ink text-mist hover:text-ivory"}`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <div className="grid gap-4 xl:grid-cols-2">
          <Panel className="p-5">
            <p className="mb-3 text-[10px] uppercase tracking-wider text-mist">Fill by day</p>
            <div className="h-56">
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
          <Panel className="p-5">
            <p className="mb-3 text-[10px] uppercase tracking-wider text-mist">Classes by format</p>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={byFormat.slice(0, 8)}>
                  <XAxis dataKey="name" tickLine={false} axisLine={false} tick={{ fontSize: 10 }} interval={0} angle={-20} textAnchor="end" height={50} />
                  <YAxis tickLine={false} axisLine={false} />
                  <Tooltip content={<Tip />} />
                  <Bar dataKey="count" name="Classes" radius={[6, 6, 0, 0]}>
                    {byFormat.slice(0, 8).map((f) => (
                      <Cell key={f.name} fill={f.accent} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Panel>
          <Panel className="p-5">
            <p className="mb-3 text-[10px] uppercase tracking-wider text-mist">At-risk classes (low score or fill)</p>
            {atRisk.length === 0 && <p className="text-sm text-mist">Nothing under the floor this week.</p>}
            <div className="space-y-2">
              {atRisk.map((s) => (
                <div key={s.id} className="flex items-center justify-between rounded-xl bg-ink px-3 py-2 text-sm">
                  <span className="min-w-0 truncate">
                    {DAYS[s.day].label} {s.time} · {s.name} · {trainerById(s.trainerId).name}
                  </span>
                  <span className="shrink-0 font-semibold text-[#dc2626]">
                    {s.score} · {s.fill}%
                  </span>
                </div>
              ))}
            </div>
          </Panel>
          <Panel className="p-5">
            <p className="mb-3 text-[10px] uppercase tracking-wider text-mist">Best proven combos</p>
            {bestCombos.length === 0 && <p className="text-sm text-mist">No standout combos yet.</p>}
            <div className="space-y-2">
              {bestCombos.map((s) => (
                <div key={s.id} className="flex items-center justify-between rounded-xl bg-ink px-3 py-2 text-sm">
                  <span className="min-w-0 truncate">
                    {DAYS[s.day].label} {s.time} · {s.name} · {trainerById(s.trainerId).name}
                  </span>
                  <span className="shrink-0 font-semibold text-[#16a34a]">
                    {s.score} · {s.fill}%
                  </span>
                </div>
              ))}
            </div>
          </Panel>
        </div>
      )}

      {tab === "trends" && (
        <div className="grid gap-4 xl:grid-cols-2">
          <Panel className="p-5">
            <p className="mb-3 text-[10px] uppercase tracking-wider text-mist">Fill & score by day</p>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={byDay}>
                  <XAxis dataKey="name" tickLine={false} axisLine={false} />
                  <YAxis tickLine={false} axisLine={false} />
                  <Tooltip content={<Tip />} />
                  <Area type="monotone" dataKey="Fill" stroke="#005eed" fill="#005eed22" />
                  <Area type="monotone" dataKey="Score" stroke="#7c3aed" fill="#7c3aed15" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Panel>
          <Panel className="p-5">
            <p className="mb-3 text-[10px] uppercase tracking-wider text-mist">Classes by time of day</p>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={byBucket}>
                  <XAxis dataKey="name" tickLine={false} axisLine={false} />
                  <YAxis tickLine={false} axisLine={false} />
                  <Tooltip content={<Tip />} />
                  <Bar dataKey="Classes" fill="#005eed" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Panel>
        </div>
      )}

      {tab === "mix" && (
        <Panel className="overflow-x-auto p-5">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-line text-[10px] uppercase tracking-wider text-mist">
                <th className="py-2">Format</th>
                <th>Classes</th>
                <th>Avg fill</th>
                <th>Avg score</th>
                <th>Share</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {byFormat.map((f) => (
                <tr key={f.name}>
                  <td className="py-2">
                    <span className="mr-2 inline-block h-2 w-2 rounded-full align-middle" style={{ background: f.accent }} />
                    {f.name}
                  </td>
                  <td>{f.count}</td>
                  <td>
                    <FillBar fill={f.fill} />
                  </td>
                  <td>{f.score}</td>
                  <td className="w-28 text-mist">{totalClasses ? Math.round((f.count / totalClasses) * 100) : 0}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      )}

      {tab === "locations" && (
        <div className="grid gap-4 xl:grid-cols-2">
          <Panel className="p-5">
            <p className="mb-3 text-[10px] uppercase tracking-wider text-mist">Avg fill by house</p>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={byLocation}>
                  <XAxis dataKey="name" tickLine={false} axisLine={false} tick={{ fontSize: 10 }} />
                  <YAxis tickLine={false} axisLine={false} />
                  <Tooltip content={<Tip />} />
                  <Bar dataKey="fill" name="Fill %" fill="#005eed" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Panel>
          <Panel className="overflow-x-auto p-5">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-line text-[10px] uppercase tracking-wider text-mist">
                  <th className="py-2">House</th>
                  <th>Classes</th>
                  <th>Avg fill</th>
                  <th>Avg score</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {byLocation.map((l) => (
                  <tr key={l.id}>
                    <td className="py-2">{l.name}</td>
                    <td>{l.count}</td>
                    <td>{l.fill}%</td>
                    <td>{l.score}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>
        </div>
      )}

      {tab === "trainers" && (
        <Panel className="overflow-x-auto p-5">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-line text-[10px] uppercase tracking-wider text-mist">
                <th className="py-2">Trainer</th>
                <th>Classes</th>
                <th>Hours</th>
                <th>Avg fill</th>
                <th>Avg score</th>
                <th className="w-40">Week load</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {loads.map((t) => (
                <tr key={t.id}>
                  <td className="py-2">{t.name}</td>
                  <td>{t.classes}</td>
                  <td>{t.hours}h</td>
                  <td>{t.fill}%</td>
                  <td>{t.score}</td>
                  <td>
                    <div className="h-1.5 overflow-hidden rounded-full bg-ink">
                      <div className="h-full rounded-full" style={{ width: `${t.utilization}%`, background: loadColor(t.utilization) }} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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

const SOURCE_PAGE_SIZE = 50;
const MIN_SESSIONS_DEFAULT = 1;
const MIN_CHECKINS_DEFAULT = 0;

type SortDir = "asc" | "desc";
type SortState = { key: string; dir: SortDir } | null;

function isNumericStr(s: string) {
  return /^-?\d+(\.\d+)?$/.test(s.trim());
}

// Numeric-aware so columns like Revenue/Sessions sort by value, not lexicographically — but plain
// text (trainer names, ISO dates) still gets a sensible string compare.
function compareValues(a: unknown, b: unknown): number {
  if (typeof a === "number" && typeof b === "number") return a - b;
  const as = String(a ?? "");
  const bs = String(b ?? "");
  if (isNumericStr(as) && isNumericStr(bs)) return parseFloat(as) - parseFloat(bs);
  return as.localeCompare(bs);
}

function sortByState<T extends Record<string, unknown>>(rows: T[], sort: SortState): T[] {
  if (!sort) return rows;
  const factor = sort.dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => compareValues(a[sort.key], b[sort.key]) * factor);
}

// Click to sort ascending, click again to flip — third click on a different column just restarts at
// descending for that column, matching how every other sortable table behaves.
function SortTh({
  label,
  sortKey,
  sort,
  onSort,
  className = "",
}: {
  label: string;
  sortKey: string;
  sort: SortState;
  onSort: (key: string) => void;
  className?: string;
}) {
  const active = sort?.key === sortKey;
  return (
    <th
      className={`cursor-pointer select-none whitespace-nowrap hover:text-ivory ${className}`}
      onClick={() => onSort(sortKey)}
    >
      {label}
      <span className="ml-0.5 inline-block w-2.5 text-[8px]">{active ? (sort!.dir === "desc" ? "▾" : "▴") : ""}</span>
    </th>
  );
}

function nextSortState(prev: SortState, key: string): SortState {
  if (prev?.key === key) return { key, dir: prev.dir === "desc" ? "asc" : "desc" };
  return { key, dir: "desc" };
}

type GroupMetrics = {
  key: string;
  label: string;
  rows: PerfRow[];
  sessions: number;
  emptyClasses: number;
  nonEmptyClasses: number;
  avgInclEmpty: number;
  avgExclEmpty: number;
  medianCheckin: number;
  peakCheckin: number;
  fill: number;
  avgBooked: number;
  revenue: number;
  revenuePerSession: number;
  revenuePerCheckin: number;
  lateCancelled: number;
  checkedInTotal: number;
  bookedTotal: number;
};

function median(xs: number[]) {
  if (!xs.length) return 0;
  const sorted = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function extendedMetrics(rows: PerfRow[]): Omit<GroupMetrics, "key" | "label" | "rows"> {
  const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
  const avg = (xs: number[]) => (xs.length ? sum(xs) / xs.length : 0);
  const sessions = rows.length;
  const nonEmpty = rows.filter((r) => r.checkedIn > 0);
  const revenue = sum(rows.map((r) => r.revenue));
  const checkedInTotal = sum(rows.map((r) => r.checkedIn));
  const fill = sessions ? avg(rows.map((r) => (r.capacity ? r.checkedIn / r.capacity : 0))) * 100 : 0;
  return {
    sessions,
    emptyClasses: sessions - nonEmpty.length,
    nonEmptyClasses: nonEmpty.length,
    avgInclEmpty: Number(avg(rows.map((r) => r.checkedIn)).toFixed(2)),
    avgExclEmpty: Number(avg(nonEmpty.map((r) => r.checkedIn)).toFixed(2)),
    medianCheckin: Number(median(rows.map((r) => r.checkedIn)).toFixed(1)),
    peakCheckin: rows.length ? Math.max(...rows.map((r) => r.checkedIn)) : 0,
    fill: Math.round(fill),
    avgBooked: Number(avg(rows.map((r) => r.booked)).toFixed(2)),
    revenue: Math.round(revenue),
    revenuePerSession: sessions ? Math.round(revenue / sessions) : 0,
    revenuePerCheckin: checkedInTotal ? Math.round(revenue / checkedInTotal) : 0,
    lateCancelled: sum(rows.map((r) => r.lateCancelled)),
    checkedInTotal,
    bookedTotal: sum(rows.map((r) => r.booked)),
  };
}

function overviewMetrics(rows: PerfRow[]) {
  const base = extendedMetrics(rows);
  const uniqueTrainers = new Set(rows.map((r) => r.trainer)).size;
  const uniqueClasses = new Set(rows.map((r) => cleanClass(r.className))).size;
  const uniqueLocations = new Set(rows.map((r) => r.locationId)).size;
  const weeks = new Set(
    rows
      .filter((r) => r.date)
      .map((r) => {
        const d = new Date(r.date);
        const onejan = new Date(d.getFullYear(), 0, 1);
        return `${d.getFullYear()}-${Math.ceil(((d.getTime() - onejan.getTime()) / 86400000 + onejan.getDay() + 1) / 7)}`;
      })
  ).size;
  return { ...base, uniqueTrainers, uniqueClasses, uniqueLocations, avgSessionsPerWeek: weeks ? Number((base.sessions / weeks).toFixed(1)) : base.sessions };
}

function groupRows(rows: PerfRow[], keyFn: (r: PerfRow) => string, labelFn: (r: PerfRow) => string): GroupMetrics[] {
  const map = new Map<string, PerfRow[]>();
  for (const r of rows) {
    const k = keyFn(r);
    const list = map.get(k);
    if (list) list.push(r);
    else map.set(k, [r]);
  }
  return [...map.entries()].map(([key, group]) => ({ key, label: labelFn(group[0]), rows: group, ...extendedMetrics(group) }));
}

// A composite score lets "top/bottom" ranking reflect both how full a slot runs and how many people
// actually show up, rather than either alone — min-max normalised across the current group set so it
// stays meaningful whether you're looking at 5 slots or 500.
function withComposite<T extends { avgInclEmpty: number; fill: number }>(groups: T[]): Array<T & { composite: number }> {
  if (!groups.length) return [];
  const checkins = groups.map((g) => g.avgInclEmpty);
  const fills = groups.map((g) => g.fill);
  const minC = Math.min(...checkins);
  const maxC = Math.max(...checkins);
  const minF = Math.min(...fills);
  const maxF = Math.max(...fills);
  const norm = (v: number, lo: number, hi: number) => (hi > lo ? ((v - lo) / (hi - lo)) * 100 : 100);
  return groups.map((g) => ({ ...g, composite: Math.round(0.5 * norm(g.avgInclEmpty, minC, maxC) + 0.5 * norm(g.fill, minF, maxF)) }));
}

function toneClass(score: number) {
  if (score >= 75) return "text-emerald-700";
  if (score >= 50) return "text-amber-700";
  return "text-rose-700";
}

function toneBg(score: number) {
  if (score >= 75) return "bg-emerald-500";
  if (score >= 50) return "bg-amber-500";
  return "bg-rose-500";
}

function monthKey(dateStr: string) {
  return dateStr.slice(0, 7) || "unknown";
}

function isCurrentlyScheduled(sample: PerfRow, scheduled: Session[], matchTrainer: boolean) {
  return scheduled.some((s) => {
    if (s.locationId !== sample.locationId) return false;
    if (s.day !== sample.dayKey) return false;
    if (s.time !== sample.time) return false;
    if (cleanClass(s.name).toLowerCase() !== cleanClass(sample.className).toLowerCase()) return false;
    if (matchTrainer && trainerById(s.trainerId).name.toLowerCase() !== sample.trainer.toLowerCase()) return false;
    return true;
  });
}

const ROW_COUNT_OPTIONS = [10, 20, 50, 100, 500, 1000] as const;
const MEDALS = ["🥇", "🥈", "🥉"];

function ScoreBar({ value }: { value: number }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className={`w-7 text-right font-semibold ${toneClass(value)}`}>{value}</span>
      <div className="h-1.5 w-14 overflow-hidden rounded-full bg-line">
        <div className={`h-full rounded-full ${toneBg(value)}`} style={{ width: `${Math.max(4, value)}%` }} />
      </div>
    </div>
  );
}

function RawRowsDrilldown({ rows }: { rows: PerfRow[] }) {
  return (
    <div className="max-h-64 overflow-auto rounded-xl bg-white p-2 ring-1 ring-line">
      <table className="w-full text-left text-[11px]">
        <thead className="sticky top-0 bg-white">
          <tr className="text-mist">
            <th className="py-1 pr-2">Date</th>
            <th className="pr-2">Location</th>
            <th className="pr-2">Day</th>
            <th className="pr-2">Time</th>
            <th className="pr-2">Class</th>
            <th className="pr-2">Trainer</th>
            <th className="pr-2">Cap</th>
            <th className="pr-2">Checked in</th>
            <th className="pr-2">Late cancel</th>
            <th className="pr-2">Booked</th>
            <th>Revenue</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((r, i) => (
            <tr key={`${r.uniqueId2}-${i}`} className="even:bg-ink/40">
              <td className="py-1 pr-2">{r.date}</td>
              <td className="pr-2">{r.location}</td>
              <td className="pr-2">{r.day}</td>
              <td className="pr-2">{r.time}</td>
              <td className="pr-2">{cleanClass(r.className)}</td>
              <td className="pr-2">{r.trainer}</td>
              <td className="pr-2">{r.capacity}</td>
              <td className="pr-2">{r.checkedIn}</td>
              <td className="pr-2">{r.lateCancelled}</td>
              <td className="pr-2">{r.booked}</td>
              <td>₹{Math.round(r.revenue).toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function GroupedMetricsTable({ groups, title }: { groups: GroupMetrics[]; title: string }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [sort, setSort] = useState<SortState>(null);
  const onSort = (key: string) => setSort((prev) => nextSortState(prev, key));
  const sorted = sortByState(groups, sort);
  const toggle = (key: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  return (
    <Panel className="p-5">
      <h3 className="mb-3 font-serif text-xl">{title}</h3>
      <div className="max-h-[560px] overflow-auto rounded-xl ring-1 ring-line">
        <table className="w-full text-left text-xs">
          <thead className="sticky top-0 z-10 bg-white">
            <tr className="text-[10px] uppercase tracking-wider text-mist">
              <th className="py-2 pl-3 pr-2"></th>
              <SortTh label="Group" sortKey="label" sort={sort} onSort={onSort} className="pr-2" />
              <SortTh label="Sessions" sortKey="sessions" sort={sort} onSort={onSort} className="pr-2" />
              <SortTh label="Empty" sortKey="emptyClasses" sort={sort} onSort={onSort} className="pr-2" />
              <SortTh label="Non-empty" sortKey="nonEmptyClasses" sort={sort} onSort={onSort} className="pr-2" />
              <SortTh label="Avg (incl.)" sortKey="avgInclEmpty" sort={sort} onSort={onSort} className="pr-2" />
              <SortTh label="Avg (excl.)" sortKey="avgExclEmpty" sort={sort} onSort={onSort} className="pr-2" />
              <SortTh label="Median" sortKey="medianCheckin" sort={sort} onSort={onSort} className="pr-2" />
              <SortTh label="Peak" sortKey="peakCheckin" sort={sort} onSort={onSort} className="pr-2" />
              <SortTh label="Fill" sortKey="fill" sort={sort} onSort={onSort} className="pr-2" />
              <SortTh label="Booked" sortKey="avgBooked" sort={sort} onSort={onSort} className="pr-2" />
              <SortTh label="Late cancel" sortKey="lateCancelled" sort={sort} onSort={onSort} className="pr-2" />
              <SortTh label="Revenue" sortKey="revenue" sort={sort} onSort={onSort} className="pr-2" />
              <SortTh label="₹/session" sortKey="revenuePerSession" sort={sort} onSort={onSort} className="pr-2" />
              <SortTh label="₹/check-in" sortKey="revenuePerCheckin" sort={sort} onSort={onSort} className="pr-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {sorted.map((g) => (
              <Fragment key={g.key}>
                <tr className="cursor-pointer even:bg-ink/40 hover:bg-ink" onClick={() => toggle(g.key)}>
                  <td className="py-1.5 pl-3 pr-2 text-mist">{expanded.has(g.key) ? "▾" : "▸"}</td>
                  <td className="pr-2 font-medium">{g.label}</td>
                  <td className="pr-2">{g.sessions}</td>
                  <td className="pr-2">{g.emptyClasses}</td>
                  <td className="pr-2">{g.nonEmptyClasses}</td>
                  <td className="pr-2">{g.avgInclEmpty}</td>
                  <td className="pr-2">{g.avgExclEmpty}</td>
                  <td className="pr-2">{g.medianCheckin}</td>
                  <td className="pr-2">{g.peakCheckin}</td>
                  <td className={`pr-2 font-medium ${toneClass(g.fill)}`}>{g.fill}%</td>
                  <td className="pr-2">{g.avgBooked}</td>
                  <td className="pr-2">{g.lateCancelled}</td>
                  <td className="pr-2">₹{g.revenue.toLocaleString()}</td>
                  <td className="pr-2">₹{g.revenuePerSession.toLocaleString()}</td>
                  <td className="pr-3">₹{g.revenuePerCheckin.toLocaleString()}</td>
                </tr>
                {expanded.has(g.key) && (
                  <tr>
                    <td colSpan={15} className="p-2">
                      <RawRowsDrilldown rows={g.rows} />
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
            {!groups.length && (
              <tr>
                <td colSpan={15} className="py-6 text-center text-mist">
                  No groups match the current filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

function RankingTable({
  title,
  allGroups,
  matchTrainer,
  scheduledSessions,
}: {
  title: string;
  allGroups: Array<GroupMetrics & { composite: number }>;
  matchTrainer: boolean;
  scheduledSessions: Session[];
}) {
  const [n, setN] = useState<(typeof ROW_COUNT_OPTIONS)[number]>(10);
  const [side, setSide] = useState<"top" | "bottom">("top");
  const [sortKey, setSortKey] = useState("composite");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggle = (key: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  // Top/bottom already gives both directions on whichever column is picked — descending here, then
  // Top takes the front and Bottom takes (and reverses) the back, same as the default composite sort.
  const sorted = sortByState(allGroups, { key: sortKey, dir: "desc" });
  const list = side === "top" ? sorted.slice(0, n) : sorted.slice(-n).reverse();
  const rankOf = (i: number) => (side === "top" ? i + 1 : sorted.length - i);
  const sortProps = (key: string) => ({ sortKey: key, sort: { key: sortKey, dir: "desc" as const }, onSort: setSortKey });

  return (
    <Panel className="p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-serif text-xl">{title}</h3>
        <div className="flex items-center gap-2">
          <div className="flex rounded-full bg-ink p-0.5 text-xs">
            <button
              onClick={() => setSide("top")}
              className={`rounded-full px-3 py-1 transition ${side === "top" ? "bg-emerald-600 text-white" : "text-mist hover:text-ivory"}`}
            >
              Top
            </button>
            <button
              onClick={() => setSide("bottom")}
              className={`rounded-full px-3 py-1 transition ${side === "bottom" ? "bg-rose-600 text-white" : "text-mist hover:text-ivory"}`}
            >
              Bottom
            </button>
          </div>
          <select
            value={n}
            onChange={(e) => setN(Number(e.target.value) as (typeof ROW_COUNT_OPTIONS)[number])}
            className="rounded-lg border border-line bg-white px-2 py-1 text-xs text-ivory"
          >
            {ROW_COUNT_OPTIONS.map((opt) => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>
        </div>
      </div>
      <p className="mb-2 text-[10px] uppercase tracking-wider text-mist">
        {side === "top" ? "Top" : "Bottom"} {Math.min(n, list.length)} of {sorted.length} · ranked by composite (avg check-in + fill, normalised)
      </p>
      <div className="max-h-[560px] overflow-auto rounded-xl ring-1 ring-line">
        <table className="w-full text-left text-xs">
          <thead className="sticky top-0 z-10 bg-white">
            <tr className="text-[10px] uppercase tracking-wider text-mist">
              <th className="py-2 pl-3 pr-2">#</th>
              <th className="pr-2"></th>
              <th className="pr-2">Live</th>
              <SortTh label="Slot" {...sortProps("label")} className="pr-2" />
              <SortTh label="Score" {...sortProps("composite")} className="pr-2" />
              <SortTh label="Sessions" {...sortProps("sessions")} className="pr-2" />
              <SortTh label="Avg (incl.)" {...sortProps("avgInclEmpty")} className="pr-2" />
              <SortTh label="Avg (excl.)" {...sortProps("avgExclEmpty")} className="pr-2" />
              <SortTh label="Median" {...sortProps("medianCheckin")} className="pr-2" />
              <SortTh label="Peak" {...sortProps("peakCheckin")} className="pr-2" />
              <SortTh label="Fill" {...sortProps("fill")} className="pr-2" />
              <SortTh label="Empty" {...sortProps("emptyClasses")} className="pr-2" />
              <SortTh label="Revenue" {...sortProps("revenue")} className="pr-2" />
              <SortTh label="₹/session" {...sortProps("revenuePerSession")} className="pr-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {list.map((g, i) => {
              const live = isCurrentlyScheduled(g.rows[0], scheduledSessions, matchTrainer);
              const rank = rankOf(i);
              return (
                <Fragment key={g.key}>
                  <tr className="cursor-pointer even:bg-ink/40 hover:bg-ink" onClick={() => toggle(g.key)}>
                    <td className="py-1.5 pl-3 pr-2 text-mist">{side === "top" && rank <= 3 ? MEDALS[rank - 1] : rank}</td>
                    <td className="pr-2 text-mist">{expanded.has(g.key) ? "▾" : "▸"}</td>
                    <td className="pr-2" title={live ? "Currently in the live schedule" : "Not currently scheduled"}>
                      {live ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> : <CircleDashed className="h-3.5 w-3.5 text-mist" />}
                    </td>
                    <td className="pr-2 font-medium">{g.label}</td>
                    <td className="pr-2"><ScoreBar value={g.composite} /></td>
                    <td className="pr-2">{g.sessions}</td>
                    <td className="pr-2">{g.avgInclEmpty}</td>
                    <td className="pr-2">{g.avgExclEmpty}</td>
                    <td className="pr-2">{g.medianCheckin}</td>
                    <td className="pr-2">{g.peakCheckin}</td>
                    <td className={`pr-2 ${toneClass(g.fill)}`}>{g.fill}%</td>
                    <td className="pr-2">{g.emptyClasses}</td>
                    <td className="pr-2">₹{g.revenue.toLocaleString()}</td>
                    <td className="pr-3">₹{g.revenuePerSession.toLocaleString()}</td>
                  </tr>
                  {expanded.has(g.key) && (
                    <tr>
                      <td colSpan={14} className="p-2">
                        <RawRowsDrilldown rows={g.rows} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
            {!list.length && (
              <tr>
                <td colSpan={14} className="py-4 text-center text-mist">
                  No slots qualify with the current min-sessions / min-check-ins criteria.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

function MonthlyTable({ rows }: { rows: PerfRow[] }) {
  const months = useMemo(() => {
    const grouped = groupRows(rows, (r) => monthKey(r.date), (r) => monthKey(r.date));
    return grouped
      .filter((m) => m.key !== "unknown")
      .sort((a, b) => a.key.localeCompare(b.key))
      .map((m, i, arr) => {
        const prev = arr[i - 1];
        const pctChange = (curr: number, before?: number) => (before ? Math.round(((curr - before) / before) * 100) : null);
        return {
          ...m,
          sessionsDelta: pctChange(m.sessions, prev?.sessions),
          revenueDelta: pctChange(m.revenue, prev?.revenue),
          checkinDelta: pctChange(m.avgInclEmpty, prev?.avgInclEmpty),
        };
      });
  }, [rows]);

  const Delta = ({ v }: { v: number | null }) => {
    if (v == null) return <span className="text-mist">—</span>;
    const cls = v > 0 ? "text-emerald-700" : v < 0 ? "text-rose-700" : "text-mist";
    const arrow = v > 0 ? "▲" : v < 0 ? "▼" : "•";
    return <span className={cls}>{arrow} {Math.abs(v)}%</span>;
  };

  const latest = months[months.length - 1];
  const [sort, setSort] = useState<SortState>(null);
  const onSort = (key: string) => setSort((prev) => nextSortState(prev, key));
  const sortedMonths = sortByState(months, sort);

  return (
    <Panel className="p-5">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-serif text-xl">Month on month</h3>
        {latest && (
          <p className="text-[11px] text-mist">
            Most recent month with data: <span className="font-medium text-ivory">{latest.key}</span> — if you expect newer months, the source data itself hasn't been refreshed past this point.
          </p>
        )}
      </div>
      <div className="max-h-[560px] overflow-auto rounded-xl ring-1 ring-line">
        <table className="w-full text-left text-xs">
          <thead className="sticky top-0 z-10 bg-white">
            <tr className="text-[10px] uppercase tracking-wider text-mist">
              <SortTh label="Month" sortKey="key" sort={sort} onSort={onSort} className="py-2 pl-3 pr-2" />
              <SortTh label="Sessions" sortKey="sessions" sort={sort} onSort={onSort} className="pr-2" />
              <th className="pr-2">vs prior</th>
              <SortTh label="Empty" sortKey="emptyClasses" sort={sort} onSort={onSort} className="pr-2" />
              <SortTh label="Non-empty" sortKey="nonEmptyClasses" sort={sort} onSort={onSort} className="pr-2" />
              <SortTh label="Avg (incl.)" sortKey="avgInclEmpty" sort={sort} onSort={onSort} className="pr-2" />
              <th className="pr-2">vs prior</th>
              <SortTh label="Avg (excl.)" sortKey="avgExclEmpty" sort={sort} onSort={onSort} className="pr-2" />
              <SortTh label="Median" sortKey="medianCheckin" sort={sort} onSort={onSort} className="pr-2" />
              <SortTh label="Fill" sortKey="fill" sort={sort} onSort={onSort} className="pr-2" />
              <SortTh label="Booked" sortKey="avgBooked" sort={sort} onSort={onSort} className="pr-2" />
              <SortTh label="Late cancel" sortKey="lateCancelled" sort={sort} onSort={onSort} className="pr-2" />
              <SortTh label="Revenue" sortKey="revenue" sort={sort} onSort={onSort} className="pr-2" />
              <th className="pr-2">vs prior</th>
              <SortTh label="₹/session" sortKey="revenuePerSession" sort={sort} onSort={onSort} className="pr-2" />
              <SortTh label="₹/check-in" sortKey="revenuePerCheckin" sort={sort} onSort={onSort} className="pr-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {sortedMonths.map((m) => (
              <tr key={m.key} className="even:bg-ink/40">
                <td className="py-1.5 pl-3 pr-2 font-medium">{m.key}</td>
                <td className="pr-2">{m.sessions}</td>
                <td className="pr-2"><Delta v={m.sessionsDelta} /></td>
                <td className="pr-2">{m.emptyClasses}</td>
                <td className="pr-2">{m.nonEmptyClasses}</td>
                <td className="pr-2">{m.avgInclEmpty}</td>
                <td className="pr-2"><Delta v={m.checkinDelta} /></td>
                <td className="pr-2">{m.avgExclEmpty}</td>
                <td className="pr-2">{m.medianCheckin}</td>
                <td className={`pr-2 ${toneClass(m.fill)}`}>{m.fill}%</td>
                <td className="pr-2">{m.avgBooked}</td>
                <td className="pr-2">{m.lateCancelled}</td>
                <td className="pr-2">₹{m.revenue.toLocaleString()}</td>
                <td className="pr-2"><Delta v={m.revenueDelta} /></td>
                <td className="pr-2">₹{m.revenuePerSession.toLocaleString()}</td>
                <td className="pr-3">₹{m.revenuePerCheckin.toLocaleString()}</td>
              </tr>
            ))}
            {!months.length && (
              <tr>
                <td colSpan={16} className="py-6 text-center text-mist">
                  No dated rows match the current filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

const GROUP_BY_OPTIONS = ["none", "location", "class", "trainer", "day", "time"] as const;
type GroupBy = (typeof GROUP_BY_OPTIONS)[number];

const SOURCE_TABS = [
  { id: "overview", label: "Overview" },
  { id: "raw", label: "Raw Data" },
  { id: "grouped", label: "Grouped" },
  { id: "monthly", label: "Month on Month" },
  { id: "rankings", label: "Rankings" },
] as const;
type SourceTab = (typeof SOURCE_TABS)[number]["id"];

export function SourceDataView({ allowedLocationIds, scheduledSessions }: { allowedLocationIds: string[]; scheduledSessions: Session[] }) {
  const currentYear = String(new Date().getFullYear());
  const [tab, setTab] = useState<SourceTab>("overview");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(0);
  const [locFilter, setLocFilter] = useState("");
  const [dayFilter, setDayFilter] = useState("");
  const [trainerFilter, setTrainerFilter] = useState("");
  const [classFilter, setClassFilter] = useState("");
  const [yearFilter, setYearFilter] = useState(currentYear);
  const [groupBy, setGroupBy] = useState<GroupBy>("location");
  const [minSessions, setMinSessions] = useState(MIN_SESSIONS_DEFAULT);
  const [minCheckins, setMinCheckins] = useState(MIN_CHECKINS_DEFAULT);

  // Hosted/Foundations/SWEAT rows never even enter the performance store — excluded at parse time
  // in performance.ts — so nothing here needs to filter them out again.
  const scopedRows = useMemo(() => getPerformanceRows().filter((r) => allowedLocationIds.includes(r.locationId)), [allowedLocationIds]);

  const yearOptions = useMemo(() => [...new Set(scopedRows.map((r) => r.date.slice(0, 4)).filter(Boolean))].sort().reverse(), [scopedRows]);
  const locationOptions = useMemo(() => LOCATIONS.filter((l) => allowedLocationIds.includes(l.id)), [allowedLocationIds]);
  const trainerOptions = useMemo(() => [...new Set(scopedRows.map((r) => r.trainer))].sort(), [scopedRows]);
  const classOptions = useMemo(() => [...new Set(scopedRows.map((r) => cleanClass(r.className)))].sort(), [scopedRows]);
  const headers = useMemo(() => getPerformanceHeaders(), [scopedRows]);
  const latestDataMonth = useMemo(() => scopedRows.reduce((max, r) => (r.date > max ? r.date : max), "").slice(0, 7), [scopedRows]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return scopedRows.filter((r) => {
      if (yearFilter !== "all" && !r.date.startsWith(yearFilter)) return false;
      if (locFilter && r.locationId !== locFilter) return false;
      if (dayFilter && String(r.dayKey) !== dayFilter) return false;
      if (trainerFilter && r.trainer !== trainerFilter) return false;
      if (classFilter && cleanClass(r.className) !== classFilter) return false;
      if (needle) {
        const hit =
          r.trainer.toLowerCase().includes(needle) ||
          cleanClass(r.className).toLowerCase().includes(needle) ||
          r.location.toLowerCase().includes(needle);
        if (!hit) return false;
      }
      return true;
    });
  }, [scopedRows, q, locFilter, dayFilter, trainerFilter, classFilter, yearFilter]);

  const summary = useMemo(() => overviewMetrics(filtered), [filtered]);

  const groups = useMemo(() => {
    switch (groupBy) {
      case "location":
        return groupRows(filtered, (r) => r.locationId, (r) => r.location);
      case "class":
        return groupRows(filtered, (r) => cleanClass(r.className), (r) => cleanClass(r.className));
      case "trainer":
        return groupRows(filtered, (r) => r.trainer, (r) => r.trainer);
      case "day":
        return groupRows(filtered, (r) => String(r.dayKey), (r) => r.day);
      case "time":
        return groupRows(filtered, (r) => r.time, (r) => r.time);
      default:
        return [];
    }
  }, [filtered, groupBy]);

  const [rawSort, setRawSort] = useState<SortState>(null);
  const onRawSort = (key: string) => setRawSort((prev) => nextSortState(prev, key));
  const sortedFiltered = useMemo(() => {
    if (!rawSort) return filtered;
    const factor = rawSort.dir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => compareValues(a.raw[rawSort.key], b.raw[rawSort.key]) * factor);
  }, [filtered, rawSort]);

  const pageCount = Math.max(1, Math.ceil(sortedFiltered.length / SOURCE_PAGE_SIZE));
  const clampedPage = Math.min(page, pageCount - 1);
  const paged = sortedFiltered.slice(clampedPage * SOURCE_PAGE_SIZE, (clampedPage + 1) * SOURCE_PAGE_SIZE);

  const qualifies = (g: GroupMetrics) => g.sessions >= minSessions && g.avgInclEmpty >= minCheckins;

  const bySlot = useMemo(
    () =>
      withComposite(
        groupRows(filtered, (r) => r.uniqueId1, (r) => `${r.location} · ${r.day} ${r.time} · ${cleanClass(r.className)}`).filter(qualifies)
      ),
    [filtered, minSessions, minCheckins]
  );
  const bySlotTrainer = useMemo(
    () =>
      withComposite(
        groupRows(
          filtered,
          (r) => r.uniqueId2,
          (r) => `${r.location} · ${r.day} ${r.time} · ${cleanClass(r.className)} · ${r.trainer}`
        ).filter(qualifies)
      ),
    [filtered, minSessions, minCheckins]
  );

  const metrics = [
    { label: "Sessions", value: summary.sessions.toLocaleString() },
    { label: "Empty classes", value: summary.emptyClasses.toLocaleString() },
    { label: "Non-empty classes", value: summary.nonEmptyClasses.toLocaleString() },
    { label: "Avg (incl. empty)", value: summary.avgInclEmpty },
    { label: "Avg (excl. empty)", value: summary.avgExclEmpty },
    { label: "Median check-in", value: summary.medianCheckin },
    { label: "Peak check-in", value: summary.peakCheckin },
    { label: "Avg fill", value: `${summary.fill}%` },
    { label: "Total checked in", value: summary.checkedInTotal.toLocaleString() },
    { label: "Total booked", value: summary.bookedTotal.toLocaleString() },
    { label: "Avg booked/session", value: summary.avgBooked },
    { label: "Late cancellations", value: summary.lateCancelled.toLocaleString() },
    { label: "Total revenue", value: `₹${summary.revenue.toLocaleString()}` },
    { label: "Revenue/session", value: `₹${summary.revenuePerSession.toLocaleString()}` },
    { label: "Revenue/check-in", value: `₹${summary.revenuePerCheckin.toLocaleString()}` },
    { label: "Unique classes", value: summary.uniqueClasses },
    { label: "Unique trainers", value: summary.uniqueTrainers },
    { label: "Avg sessions/week", value: summary.avgSessionsPerWeek },
  ];

  const filterBar = (
    <Panel className="p-4">
      <div className="flex flex-wrap items-center gap-2">
        <select value={yearFilter} onChange={(e) => { setYearFilter(e.target.value); setPage(0); }} className="rounded-lg border border-line bg-white px-2 py-1.5 text-xs text-ivory">
          <option value="all">All years</option>
          {(yearOptions.includes(currentYear) ? yearOptions : [currentYear, ...yearOptions]).map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
        <select value={locFilter} onChange={(e) => { setLocFilter(e.target.value); setPage(0); }} className="rounded-lg border border-line bg-white px-2 py-1.5 text-xs text-ivory">
          <option value="">All locations</option>
          {locationOptions.map((l) => (
            <option key={l.id} value={l.id}>{l.name}</option>
          ))}
        </select>
        <select value={dayFilter} onChange={(e) => { setDayFilter(e.target.value); setPage(0); }} className="rounded-lg border border-line bg-white px-2 py-1.5 text-xs text-ivory">
          <option value="">All days</option>
          {DAYS.map((d) => (
            <option key={d.key} value={d.key}>{d.label}</option>
          ))}
        </select>
        <select value={trainerFilter} onChange={(e) => { setTrainerFilter(e.target.value); setPage(0); }} className="rounded-lg border border-line bg-white px-2 py-1.5 text-xs text-ivory">
          <option value="">All trainers</option>
          {trainerOptions.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
        <select value={classFilter} onChange={(e) => { setClassFilter(e.target.value); setPage(0); }} className="rounded-lg border border-line bg-white px-2 py-1.5 text-xs text-ivory">
          <option value="">All classes</option>
          {classOptions.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <div className="flex items-center gap-1.5 rounded-xl border border-line px-2 py-1.5">
          <Search className="h-3.5 w-3.5 text-mist" />
          <input
            value={q}
            onChange={(e) => { setQ(e.target.value); setPage(0); }}
            placeholder="Search trainer, class, location…"
            className="w-40 bg-transparent text-xs outline-none"
          />
        </div>
        {(locFilter || dayFilter || trainerFilter || classFilter || q || yearFilter !== currentYear) && (
          <button
            onClick={() => { setLocFilter(""); setDayFilter(""); setTrainerFilter(""); setClassFilter(""); setQ(""); setYearFilter(currentYear); setPage(0); }}
            className="rounded-lg border border-line px-2.5 py-1.5 text-xs text-mist hover:text-ivory"
          >
            Reset filters
          </button>
        )}
        <p className="ml-auto text-[11px] text-mist">
          {filtered.length.toLocaleString()} rows{latestDataMonth ? ` · latest data: ${latestDataMonth}` : ""}
        </p>
      </div>
    </Panel>
  );

  return (
    <div className="space-y-4 overflow-auto pb-8">
      <Panel className="p-5">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <h2 className="font-serif text-2xl">Source data</h2>
            <p className="text-sm text-mist">
              Raw sessions from the source performance sheet — reference only, not editable here. Hosted/Foundations/SWEAT are excluded
              throughout, same as scheduling.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {SOURCE_TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`rounded-full px-3.5 py-1.5 text-sm transition ${
                tab === t.id ? "bg-gold text-white" : "bg-white text-mist ring-1 ring-line hover:text-ivory"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </Panel>

      {filterBar}

      {tab === "overview" && (
        <Panel className="p-5">
          <h3 className="mb-3 font-serif text-xl">Metrics</h3>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            {metrics.map((m) => (
              <div key={m.label} className="rounded-2xl bg-ink p-3 text-center ring-1 ring-line">
                <p className="font-serif text-xl">{m.value}</p>
                <p className="mt-0.5 text-[10px] uppercase tracking-wider text-mist">{m.label}</p>
              </div>
            ))}
          </div>
        </Panel>
      )}

      {tab === "raw" && (
        <Panel className="p-5">
          <h3 className="mb-3 font-serif text-xl">Raw sessions</h3>
          <div className="max-h-[600px] overflow-auto rounded-xl ring-1 ring-line">
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 z-10 bg-white">
                <tr className="text-[10px] uppercase tracking-wider text-mist">
                  {headers.map((h) => (
                    <SortTh key={h} label={h} sortKey={h} sort={rawSort} onSort={onRawSort} className="py-2 pl-3 pr-4 first:pl-3" />
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {paged.map((r, i) => (
                  <tr key={`${r.uniqueId2}-${i}`} className="even:bg-ink/40">
                    {headers.map((h) => (
                      <td key={h} className="whitespace-nowrap py-1.5 pl-3 pr-4 first:pl-3">{r.raw[h] ?? ""}</td>
                    ))}
                  </tr>
                ))}
                {!paged.length && (
                  <tr>
                    <td colSpan={headers.length || 1} className="py-6 text-center text-mist">
                      No rows match the current filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="mt-3 flex items-center justify-between text-xs text-mist">
            <span>
              {filtered.length.toLocaleString()} rows · page {clampedPage + 1} of {pageCount}
            </span>
            <div className="flex gap-2">
              <button disabled={clampedPage === 0} onClick={() => setPage((p) => Math.max(0, p - 1))} className="rounded-lg border border-line px-2.5 py-1 disabled:opacity-40">
                Prev
              </button>
              <button disabled={clampedPage >= pageCount - 1} onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))} className="rounded-lg border border-line px-2.5 py-1 disabled:opacity-40">
                Next
              </button>
            </div>
          </div>
        </Panel>
      )}

      {tab === "grouped" && (
        <>
          <Panel className="p-4">
            <label className="flex items-center gap-2 text-xs text-mist">
              Group by
              <select value={groupBy} onChange={(e) => setGroupBy(e.target.value as GroupBy)} className="rounded-lg border border-line bg-white px-2 py-1.5 text-xs text-ivory">
                {GROUP_BY_OPTIONS.filter((g) => g !== "none").map((g) => (
                  <option key={g} value={g}>{g[0].toUpperCase() + g.slice(1)}</option>
                ))}
              </select>
            </label>
          </Panel>
          <GroupedMetricsTable groups={[...groups].sort((a, b) => b.sessions - a.sessions)} title={`Grouped by ${groupBy}`} />
        </>
      )}

      {tab === "monthly" && <MonthlyTable rows={filtered} />}

      {tab === "rankings" && (
        <>
          <Panel className="p-4">
            <div className="flex flex-wrap items-center gap-4">
              <p className="text-xs font-medium uppercase tracking-wider text-mist">Ranking qualification</p>
              <label className="flex items-center gap-2 text-xs text-mist">
                Min sessions
                <input
                  type="number"
                  min={0}
                  value={minSessions}
                  onChange={(e) => setMinSessions(Math.max(0, Number(e.target.value)))}
                  className="w-16 rounded-lg border border-line bg-white px-2 py-1 text-xs text-ivory"
                />
              </label>
              <label className="flex items-center gap-2 text-xs text-mist">
                Min avg check-ins
                <input
                  type="number"
                  min={0}
                  step={0.5}
                  value={minCheckins}
                  onChange={(e) => setMinCheckins(Math.max(0, Number(e.target.value)))}
                  className="w-16 rounded-lg border border-line bg-white px-2 py-1 text-xs text-ivory"
                />
              </label>
              <p className="text-[11px] text-mist">Applies to both tables below — slots below either threshold are excluded entirely.</p>
            </div>
          </Panel>
          <RankingTable title="By slot (house · day · time · class)" allGroups={bySlot} matchTrainer={false} scheduledSessions={scheduledSessions} />
          <RankingTable title="By slot + trainer (house · day · time · class · trainer)" allGroups={bySlotTrainer} matchTrainer scheduledSessions={scheduledSessions} />
        </>
      )}
    </div>
  );
}
