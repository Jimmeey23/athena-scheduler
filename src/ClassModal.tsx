import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { DAYS, FORMATS, locationById, trainerById, trainerLoad } from "./data";
import { historicFor, slotHistory } from "./engine";
import { getPerformanceRows, topTrainersForClass } from "./performance";
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
  // Every historic instance of this exact class format, across all trainers/locations/dates — not just this slot.
  const classGroupRows = getPerformanceRows()
    .filter((r) => r.className.toLowerCase() === session.name.toLowerCase())
    .sort((a, b) => b.date.localeCompare(a.date));
  const topTrainers = topTrainersForClass(session.name, 3);

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
                Every historic {session.name} class \u2014 any trainer, any location, any date (Hosted / Foundations / SWEAT excluded).
              </p>
              <div className="overflow-x-auto rounded-2xl ring-1 ring-line">
                <table className="w-full text-left text-[11px]">
                  <thead>
                    <tr className="bg-ink uppercase text-mist">
                      <th className="px-2 py-2">Date</th>
                      <th>Day</th>
                      <th>Time</th>
                      <th>Location</th>
                      <th>Trainer</th>
                      <th>In</th>
                      <th>Cancelled</th>
                      <th>Booked</th>
                      <th>Cap</th>
                      <th>Fill</th>
                      <th>Revenue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {classGroupRows.slice(0, 80).map((r, i) => (
                      <tr key={i} className="border-t border-line">
                        <td className="px-2 py-1.5">{r.date}</td>
                        <td>{r.day}</td>
                        <td>{r.time}</td>
                        <td>{r.location}</td>
                        <td>{r.trainer}</td>
                        <td>{r.checkedIn}</td>
                        <td>{r.lateCancelled}</td>
                        <td>{r.booked}</td>
                        <td>{r.capacity}</td>
                        <td>{r.capacity ? Math.round((r.checkedIn / r.capacity) * 100) : 0}%</td>
                        <td>\u20b9{Math.round(r.revenue).toLocaleString("en-IN")}</td>
                      </tr>
                    ))}
                    {!classGroupRows.length && (
                      <tr>
                        <td colSpan={11} className="px-2 py-3 text-mist">
                          No source-sheet rows for {session.name} yet. Connect Google Sheets in Settings or wait for the snapshot to load.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              <p className="pt-2 text-[10px] uppercase text-mist">Top 3 trainers for {session.name} (by avg check-in, then fill)</p>
              {topTrainers.map((t, i) => (
                <div key={t.trainer} className="flex items-center justify-between rounded-2xl bg-ink px-3 py-2 text-sm">
                  <span>
                    {i + 1}. {t.trainer}
                  </span>
                  <span className="text-mist">
                    {t.agg.checkin} avg \u00b7 {t.agg.fill}% fill \u00b7 {t.agg.sessions} sessions
                  </span>
                </div>
              ))}
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
            <ul className="space-y-2 text-sm text-mist">
              <li>Certified for {format?.cert}. Uncertified trainers are blocked.</li>
              <li>Daily cap 4h / weekly cap 15h. Current week {hours}h.</li>
              <li>AM/PM split and one-location-per-shift are hard unless disabled in Settings.</li>
              <li>Foundations, Hosted, and SWEAT In 30 cannot be generated.</li>
              <li>{session.pinned ? "This slot is pinned and bypasses quality gates." : "Not pinned — quality floors apply."}</li>
            </ul>
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

function locHours(all: Session[], trainerId: string) {
  const map: Record<string, number> = {};
  all
    .filter((s) => s.trainerId === trainerId)
    .forEach((s) => {
      map[s.locationId] = (map[s.locationId] ?? 0) + s.duration / 60;
    });
  return map;
}
