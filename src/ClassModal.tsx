import { useEffect, useState, type ReactNode } from "react";
import { Award, Ban, Clock3, Pin, ShieldCheck, X } from "lucide-react";
import { DAYS, FORMATS, locationById, trainerById, trainerLoad } from "./data";
import { historicFor, slotHistory } from "./engine";
import { aggregate, getPerformanceHeaders, lookupExactAgg, lookupExactRows, lookupSlotFormatAgg, lookupSlotFormatRows } from "./performance";
import type { PerfRow } from "./performance";
import type { Session } from "./types";
import { FillBar, Panel, ScoreRing, TagChip, trainerWeekHours } from "./ui";

const TABS = ["Overview", "Score", "History", "Trainer", "Alternatives", "Rules"] as const;

export function ClassModal({ session, all, onClose }: { session: Session; all: Session[]; onClose: () => void }) {
  const [tab, setTab] = useState<(typeof TABS)[number]>("Overview");
  const trainer = trainerById(session.trainerId);
  const loc = locationById(session.locationId);
  const hours = trainerWeekHours(all, session.trainerId);
  const format = FORMATS.find((f) => f.name === session.name);
  const booked = Math.round((session.fill / 100) * (session.capacity || 18));
  const b = session.breakdown || { attendance: 0, fill: 0, proven: 0, tier: 0, combo: 0 };
  const week = trainerLoad(all).find((t) => t.id === trainer.id);
  const hist = slotHistory(session.locationId, session.day, session.time);
  const sameClass = all.filter((s) => s.name === session.name);
  const loadByHouse = locHours(all, trainer.id);
  const exactCombo = lookupExactAgg(session.locationId, session.day, session.time, session.name, trainer.name);
  const exactSlotFormat = lookupSlotFormatAgg(session.locationId, session.day, session.time, session.name);
  const slotFormatRows = [...lookupSlotFormatRows(session.locationId, session.day, session.time, session.name)].sort((a, b) => b.date.localeCompare(a.date));
  const trainerSlotRows = [...lookupExactRows(session.locationId, session.day, session.time, session.name, trainer.name)].sort((a, b) => b.date.localeCompare(a.date));
  const rawHeaders = getPerformanceHeaders();
  const slotByTrainer = [...slotFormatRows.reduce((map, row) => {
    const rows = map.get(row.trainer) || [];
    rows.push(row);
    map.set(row.trainer, rows);
    return map;
  }, new Map<string, typeof slotFormatRows>())].map(([name, rows]) => ({ name, agg: aggregate(rows) })).sort((a, b) => b.agg.checkin - a.agg.checkin || b.agg.fill - a.agg.fill);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={onClose}>
      <aside className="h-full w-full max-w-2xl overflow-y-auto bg-[#f7f8fb] shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 z-10 border-b border-line bg-white/95 px-6 pt-5 backdrop-blur">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[10px] uppercase tracking-[0.2em] text-mist">
                {session.studio} · {loc.name}
              </p>
              <h2 className="font-serif text-3xl">{session.name}</h2>
              <p className="mt-1 text-sm text-mist">
                {DAYS[session.day].full} {session.time} · {trainer.name} · {session.duration} min
              </p>
            </div>
            <button onClick={onClose} className="rounded-xl p-2 hover:bg-ink">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="mt-4 flex gap-1 overflow-x-auto pb-3">
            {TABS.map((t) => (
              <button key={t} onClick={() => setTab(t)} className={`rounded-full px-3 py-1.5 text-xs ${tab === t ? "bg-[#005eed] text-white" : "bg-ink text-mist"}`}>
                {t}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-4 p-6">
          {tab === "Overview" && (
            <>
              <div className="flex items-center gap-4">
                <ScoreRing score={session.score} size={80} />
                <div className="flex-1">
                  <FillBar fill={session.fill} />
                  <p className="mt-2 text-sm text-mist">
                    {booked}/{session.capacity} projected · {session.sessions} historic sessions
                    {session.oneOff ? " · one-off penalized" : " · proven combo"}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {session.tags.map((t) => (
                  <TagChip key={t} tag={t} />
                ))}
              </div>
              <Panel className="p-4">
                <p className="text-[10px] uppercase tracking-wider text-mist">Assignment reason</p>
                <p className="mt-2 text-sm leading-relaxed">{session.reason}</p>
              </Panel>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                <Stat k="Avg attended" v={session.avg.toFixed(1)} />
                <Stat k="Fill" v={`${session.fill}%`} />
                <Stat k="Sessions" v={String(session.sessions)} />
                <Stat k="Projected" v={String(booked)} />
                <Stat k="Capacity" v={String(session.capacity)} />
                <Stat k="Family" v={format?.family ?? "—"} />
              </div>
            </>
          )}

          {tab === "Score" && (
            <Panel className="p-4">
              <p className="text-sm leading-relaxed text-mist">
                Think of the score as a 100-point report card. Most points come from how many people usually show up (attendance) and how full the room gets (fill). Extra points only if this class has run many times before — a one-off experiment cannot beat a proven weekly class. A little credit goes to senior trainers and known best pairings.
              </p>
              {[
                ["Avg attended", b.attendance, 55],
                ["Fill rate", b.fill, 30],
                ["Proven sessions", b.proven, 12],
                ["Trainer tier", b.tier, 3],
                ["Priority combo", b.combo, 6],
              ].map(([label, pts, max]) => (
                <div key={String(label)} className="mt-3">
                  <div className="flex justify-between text-sm">
                    <span>{label}</span>
                    <span>
                      {pts} / {max}
                    </span>
                  </div>
                  <div className="mt-1 h-2 overflow-hidden rounded-full bg-ink">
                    <div className="h-full bg-[#005eed]" style={{ width: `${(Number(pts) / Number(max)) * 100}%` }} />
                  </div>
                </div>
              ))}
              <p className="mt-4 font-serif text-4xl">{session.score}</p>
            </Panel>
          )}

          {tab === "History" && (
            <div className="space-y-2">
              <p className="text-sm text-mist">
                Matches for Class + Day + Time + Location. Trainer-specific rows are shown separately when Trainer also matches.
              </p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Stat k="This Trainer Avg" v={exactCombo.sessions ? exactCombo.checkin.toFixed(1) : "—"} />
                <Stat k="This Trainer Fill" v={exactCombo.sessions ? `${exactCombo.fill}%` : "—"} />
                <Stat k="This Trainer Runs" v={String(exactCombo.sessions)} />
                <Stat k="Slot Format Runs" v={String(exactSlotFormat.sessions)} />
                <Stat k="Slot Avg" v={exactSlotFormat.sessions ? exactSlotFormat.checkin.toFixed(1) : "—"} />
                <Stat k="Slot Fill" v={exactSlotFormat.sessions ? `${exactSlotFormat.fill}%` : "—"} />
                <Stat k="Slot Booked" v={exactSlotFormat.sessions ? exactSlotFormat.booked.toFixed(1) : "—"} />
                <Stat k="Slot Revenue" v={exactSlotFormat.sessions ? `₹${Math.round(exactSlotFormat.revenue).toLocaleString("en-IN")}` : "—"} />
              </div>
              {!!slotByTrainer.length && (
                <div className="space-y-1">
                  <p className="pt-2 text-[10px] uppercase text-mist">All trainers in this exact slot</p>
                  {slotByTrainer.map((row) => (
                    <div key={row.name} className="flex items-center justify-between rounded-2xl bg-ink px-3 py-2 text-sm">
                      <span>{row.name}</span>
                      <span className="text-mist">{row.agg.checkin} avg · {row.agg.fill}% fill · {row.agg.sessions} sessions</span>
                    </div>
                  ))}
                </div>
              )}
              <p className="pt-2 text-[10px] uppercase text-mist">Class + Day + Time + Location Rows</p>
              <RawRowsTable rows={slotFormatRows} headers={rawHeaders} empty="No rows found for this class/day/time/location combination after normalization." />
              <p className="pt-2 text-[10px] uppercase text-mist">Trainer + Class + Day + Time + Location Rows</p>
              <RawRowsTable rows={trainerSlotRows} headers={rawHeaders} empty="No trainer-specific rows found for this exact class slot." />
              <p className="text-sm text-mist">Same class this generated week:</p>
              {sameClass.map((s) => (
                <div key={s.id} className="flex justify-between rounded-2xl bg-ink px-3 py-2 text-sm">
                  <span>
                    {locationById(s.locationId).name} · {DAYS[s.day].label} {s.time}
                  </span>
                  <span>
                    {s.fill}% · {s.avg} avg
                  </span>
                </div>
              ))}
              <p className="pt-2 text-[10px] uppercase text-mist">Historic options at this slot</p>
              {hist.slice(0, 6).map((h) => (
                <div key={h.name + h.trainerId} className="flex justify-between rounded-2xl border border-line px-3 py-2 text-sm">
                  <span>
                    {h.name} · {trainerById(h.trainerId).name}
                  </span>
                  <span className="text-mist">
                    {h.sessions} sess · {h.fill}%
                  </span>
                </div>
              ))}
            </div>
          )}

          {tab === "Trainer" && (
            <Panel className="p-4">
              <div className="flex items-center gap-3">
                <img src={trainer.photo} alt="" className="h-16 w-16 rounded-2xl object-cover" />
                <div>
                  <p className="font-medium">{trainer.name}</p>
                  <p className="text-sm text-mist">T{trainer.tier} · {trainer.specialty}</p>
                  <p className="text-[#005eed]">{hours}h this week · {week?.classes ?? 0} classes</p>
                </div>
              </div>
              <p className="mt-4 text-[10px] uppercase text-mist">Hours by house</p>
              {Object.entries(loadByHouse).map(([id, h]) => (
                <div key={id} className="mt-2 flex justify-between text-sm">
                  <span>{locationById(id).name}</span>
                  <span>{h.toFixed(1)}h</span>
                </div>
              ))}
            </Panel>
          )}

          {tab === "Alternatives" && (
            <div className="space-y-2">
              {hist
                .filter((h) => h.trainerId !== session.trainerId)
                .slice(0, 8)
                .map((h) => {
                  const hh = historicFor(session.locationId, session.day, session.time, h.name, h.trainerId);
                  return (
                    <div key={h.trainerId + h.name} className="rounded-2xl bg-ink px-3 py-2 text-sm">
                      <p className="font-medium">
                        {h.name} · {trainerById(h.trainerId).name}
                      </p>
                      <p className="text-mist">
                        score {h.score} · {hh.checkin} avg · {hh.fill}% · {hh.sessions} sessions
                      </p>
                    </div>
                  );
                })}
            </div>
          )}

          {tab === "Rules" && (
            <div className="space-y-3">
              <Panel className="overflow-hidden p-0">
                <div className="border-b border-line bg-white px-4 py-3">
                  <p className="text-[10px] uppercase tracking-[0.18em] text-mist">Scheduling Controls</p>
                  <p className="mt-1 text-sm text-ink/75">Rules applied to this class assignment.</p>
                </div>
                <div className="grid gap-2 p-3 sm:grid-cols-2">
                  <RuleCard
                    icon={<Award className="h-4 w-4" />}
                    label="Certification"
                    value={`Requires ${format?.cert ?? "format"} certification`}
                    detail="Uncertified instructors are blocked before scoring."
                    tone="blue"
                  />
                  <RuleCard
                    icon={<Clock3 className="h-4 w-4" />}
                    label="Workload"
                    value={`${hours}h scheduled this week`}
                    detail="Daily cap is 4h and weekly cap is 15h."
                    tone={hours >= 14 ? "amber" : "green"}
                  />
                  <RuleCard
                    icon={<ShieldCheck className="h-4 w-4" />}
                    label="Shift Policy"
                    value="AM/PM and location rules active"
                    detail="Split targets and one-location-per-shift constraints are enforced when enabled."
                    tone="slate"
                  />
                  <RuleCard
                    icon={<Ban className="h-4 w-4" />}
                    label="Blocked Formats"
                    value="Hosted, Foundations, SWEAT"
                    detail="These formats are excluded from generated schedules."
                    tone="rose"
                  />
                </div>
              </Panel>
              <RuleCard
                icon={<Pin className="h-4 w-4" />}
                label="Quality Gate"
                value={session.pinned ? "Pinned slot" : "Standard quality gate"}
                detail={session.pinned ? "Pinned classes can bypass quality thresholds." : "Attendance, fill, and evidence thresholds apply."}
                tone={session.pinned ? "amber" : "green"}
              />
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}

function Stat({ k, v }: { k: string; v: string }) {
  return (
    <div className="rounded-2xl bg-ink px-3 py-3">
      <p className="text-[10px] uppercase text-mist">{k}</p>
      <p className="text-lg font-medium">{v}</p>
    </div>
  );
}

function RawRowsTable({ rows, headers, empty }: { rows: PerfRow[]; headers: string[]; empty: string }) {
  const cols = headers.length ? headers : Object.keys(rows[0]?.raw || {});
  return (
    <div className="max-h-[440px] overflow-auto rounded-2xl ring-1 ring-line">
      <table className="w-full text-left text-[11px]">
        <thead className="sticky top-0">
          <tr className="bg-ink uppercase text-mist">
            {cols.map((h) => (
              <th key={h} className="whitespace-nowrap px-2 py-2">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-line">
              {cols.map((h) => (
                <td key={h} className="max-w-[220px] truncate whitespace-nowrap px-2 py-1.5" title={r.raw[h] || ""}>
                  {r.raw[h] || "—"}
                </td>
              ))}
            </tr>
          ))}
          {!rows.length && (
            <tr>
              <td colSpan={Math.max(cols.length, 1)} className="px-2 py-3 text-mist">{empty}</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function RuleCard({ icon, label, value, detail, tone }: { icon: ReactNode; label: string; value: string; detail: string; tone: "blue" | "green" | "amber" | "rose" | "slate" }) {
  const tones = {
    blue: "bg-[#005eed]/10 text-[#005eed] ring-[#005eed]/20",
    green: "bg-emerald-50 text-emerald-700 ring-emerald-100",
    amber: "bg-amber-50 text-amber-700 ring-amber-100",
    rose: "bg-rose-50 text-rose-700 ring-rose-100",
    slate: "bg-slate-100 text-slate-700 ring-slate-200",
  };
  return (
    <div className="rounded-2xl bg-white p-3 ring-1 ring-line">
      <div className="flex items-start gap-3">
        <span className={`mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ring-1 ${tones[tone]}`}>{icon}</span>
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-[0.16em] text-mist">{label}</p>
          <p className="mt-1 text-sm font-medium text-[#0e1729]">{value}</p>
          <p className="mt-1 text-xs leading-relaxed text-mist">{detail}</p>
        </div>
      </div>
    </div>
  );
}

function locHours(all: Session[], trainerId: string) {
  const map: Record<string, number> = {};
  all
    .filter((s) => s.trainerId === trainerId)
    .forEach((s) => {
      map[s.locationId] = (map[s.locationId] ?? 0) + s.duration / 60;
    });
  return map;
}
