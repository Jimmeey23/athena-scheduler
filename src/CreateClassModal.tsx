import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import { DAYS, LOCATIONS, TIMES, TRAINERS } from "./data";
import { historicFor, scoreCombo } from "./engine";
import { ScoreRing, FillBar, trainerWeekHours } from "./ui";
import type { Format, Session, Settings, Trainer } from "./types";

export function CreateClassModal({
  all,
  settings,
  locationId,
  day,
  time,
  onClose,
  onCreate,
}: {
  all: Session[];
  settings: Settings;
  locationId: string;
  day: number;
  time: string;
  onClose: () => void;
  onCreate: (opts: { locationId: string; day: number; time: string; format: Format; trainer: Trainer; recurring: boolean }) => void;
}) {
  const formats = settings.formats?.length ? settings.formats : [];
  const roster = settings.trainers?.length ? settings.trainers : TRAINERS;
  const houses = settings.locations?.length ? settings.locations : LOCATIONS;

  const [formatName, setFormatName] = useState(formats[0]?.name ?? "");
  const [trainerId, setTrainerId] = useState(roster[0]?.id ?? "");
  const [loc, setLoc] = useState(locationId);
  const [d, setDay] = useState(day);
  const [t, setTime] = useState(time);
  const [recurring, setRecurring] = useState(true);

  const format = formats.find((f) => f.name === formatName) ?? formats[0];

  // How many of this format (or its Express/full-length pair) are already on the calendar
  // for this exact day and location \u2014 helps avoid over-scheduling one format.
  const baseName = (n: string) => n.replace(/ Express$/i, "");
  const countFor = (f: Format) => all.filter((s) => s.locationId === loc && s.day === d && baseName(s.name) === baseName(f.name)).length;

  // Every active trainer, ranked by fit for this exact slot — irrespective of historic quality floors,
  // so users can still pick anyone, but the strongest options surface first.
  const trainerOptions = useMemo(() => {
    return roster
      .filter((tr) => tr.active)
      .map((tr) => {
        const h = historicFor(loc, d, t, format?.name ?? "", tr.name);
        const scored = format ? scoreCombo(h, tr, settings, format.name) : { score: 0 };
        const hours = trainerWeekHours(all, tr.id);
        const certified = format ? tr.certs[format.cert] : true;
        return { trainer: tr, hours, h, score: scored.score, certified };
      })
      .sort((a, b) => Number(b.certified) - Number(a.certified) || b.score - a.score);
  }, [roster, loc, d, t, format, settings, all]);

  const picked = trainerOptions.find((o) => o.trainer.id === trainerId) ?? trainerOptions[0];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="max-h-[88vh] w-full max-w-lg overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[10px] uppercase tracking-[0.2em] text-mist">Create class</p>
            <h2 className="font-serif text-2xl">Add to the calendar</h2>
          </div>
          <button onClick={onClose} className="rounded-xl p-2 hover:bg-ink">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <label className="text-xs text-mist">
            Location
            <select value={loc} onChange={(e) => setLoc(e.target.value)} className="mt-1 w-full rounded-xl border border-line bg-ink px-3 py-2 text-sm text-ivory">
              {houses.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-mist">
            Day
            <select value={d} onChange={(e) => setDay(Number(e.target.value))} className="mt-1 w-full rounded-xl border border-line bg-ink px-3 py-2 text-sm text-ivory">
              {DAYS.map((day0) => (
                <option key={day0.key} value={day0.key}>
                  {day0.full}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-mist">
            Time
            <select value={t} onChange={(e) => setTime(e.target.value)} className="mt-1 w-full rounded-xl border border-line bg-ink px-3 py-2 text-sm text-ivory">
              {[...new Set([time, ...TIMES])].map((tm) => (
                <option key={tm} value={tm}>
                  {tm}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-mist">
            Class format
            <select value={formatName} onChange={(e) => setFormatName(e.target.value)} className="mt-1 w-full rounded-xl border border-line bg-ink px-3 py-2 text-sm text-ivory">
              {formats.map((f) => (
                <option key={f.name} value={f.name}>
                  {f.name} · n={countFor(f)} today at this house
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="mt-3 block text-xs text-mist">
          Trainer
          <select value={trainerId} onChange={(e) => setTrainerId(e.target.value)} className="mt-1 w-full rounded-xl border border-line bg-ink px-3 py-2 text-sm text-ivory">
            {trainerOptions.map((o) => (
              <option key={o.trainer.id} value={o.trainer.id}>
                {o.trainer.name} {o.certified ? "" : "(uncertified)"} · {o.hours}h this week · {o.h.sessions} sessions · {o.h.checkin} avg · {o.h.fill}% fill · score {o.score}
              </option>
            ))}
          </select>
        </label>

        {picked && (
          <div className="mt-3 flex items-center gap-3 rounded-2xl bg-ink p-3">
            <ScoreRing score={picked.score} size={40} />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{picked.trainer.name}</p>
              <p className="text-[11px] text-mist">
                {picked.hours}h scheduled this week (all locations) · {picked.h.sessions} historic sessions · {picked.h.checkin} avg check-in
              </p>
              <div className="mt-1 w-40">
                <FillBar fill={picked.h.fill} />
              </div>
              {!picked.certified && <p className="mt-1 text-[11px] text-rose-700">Not certified for this format — will still be scheduled if you proceed.</p>}
            </div>
          </div>
        )}

        <label className="mt-4 flex items-center gap-2 rounded-2xl bg-ink p-3 text-sm">
          <input type="checkbox" checked={recurring} onChange={(e) => setRecurring(e.target.checked)} className="h-4 w-4" />
          <span>
            <span className="block font-medium">Recurring weekly slot</span>
            <span className="block text-[11px] text-mist">Pinned so future generations always keep this class. Turn off to add it just this once.</span>
          </span>
        </label>

        <button
          disabled={!format || !picked}
          onClick={() => format && picked && onCreate({ locationId: loc, day: d, time: t, format, trainer: picked.trainer, recurring })}
          className="mt-4 w-full rounded-xl bg-[#005eed] py-2.5 text-sm font-medium text-white disabled:opacity-50"
        >
          Add class
        </button>
      </div>
    </div>
  );
}
