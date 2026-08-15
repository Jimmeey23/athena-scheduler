import { useState } from "react";
import { MessageCircle, Send, X } from "lucide-react";
import { DAYS, FORMATS, LOCATIONS, TIMES, TRAINERS, resolveLocationId, trainerById } from "./data";
import type { Session, Settings } from "./types";
import { historicFor, scoreCombo, generateSchedule, hasConflict, weekOffDays } from "./engine";
import { recordOverride } from "./overrides";

type Msg = { role: "user" | "bot"; text: string };
type Pending = { next: Session[]; reply: string };

export function Chatbot({
  all,
  setAll,
  settings,
  locationId,
}: {
  all: Session[];
  setAll: (s: Session[]) => void;
  settings: Settings;
  locationId: string;
}) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [msgs, setMsgs] = useState<Msg[]>([
    {
      role: "bot",
      text: "Ask me anything, or tell me what to change — add, remove, swap, substitute, reschedule, or optimize. I'll preview edits before they touch the live week. Examples: “add 3 classes at Kwality on Saturday”, “remove Sunday 18:15 Mat 57”, “swap Anisha with Reshma on Friday”, “optimize Supreme”.",
    },
  ]);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null);

  function diffSummary(next: Session[]) {
    const beforeIds = new Set(all.map((s) => s.id));
    const afterIds = new Set(next.map((s) => s.id));
    const added = next.filter((s) => !beforeIds.has(s.id)).length;
    const removed = all.filter((s) => !afterIds.has(s.id)).length;
    const changed = next.filter((s) => {
      const prev = all.find((p) => p.id === s.id);
      return prev && prev.trainerId !== s.trainerId;
    }).length;
    const parts = [added && `+${added} added`, removed && `-${removed} removed`, changed && `${changed} reassigned`].filter(Boolean);
    return parts.length ? parts.join(", ") : "no changes";
  }

  async function send() {
    const text = input.trim();
    if (!text) return;
    setInput("");
    setMsgs((m) => [...m, { role: "user", text }]);
    setBusy(true);
    if (settings.ai.openaiKey) {
      try {
        const result = await runAssistant(text, msgs, all, settings, locationId);
        const changed = diffSummary(result.next) !== "no changes";
        if (changed) {
          setPending({ next: result.next, reply: result.reply });
          setMsgs((m) => [...m, { role: "bot", text: `${result.reply}\n\nPreview: ${diffSummary(result.next)}. Apply this to the live week?` }]);
        } else {
          setPending(null);
          setMsgs((m) => [...m, { role: "bot", text: result.reply }]);
        }
        setBusy(false);
        return;
      } catch (err) {
        const fallback = applyNaturalLanguage(text, all, settings, locationId);
        const changed = diffSummary(fallback.next) !== "no changes";
        if (changed) {
          setPending(fallback);
          setMsgs((m) => [...m, { role: "bot", text: `${fallback.reply}\n\nPreview: ${diffSummary(fallback.next)}. Apply this to the live week?` }]);
        } else {
          setPending(null);
          setMsgs((m) => [...m, { role: "bot", text: `I could not reach OpenAI for a full answer. ${fallback.reply}` }]);
        }
        setBusy(false);
        return;
      }
    }

    const applied = applyNaturalLanguage(text, all, settings, locationId);
    const changed = diffSummary(applied.next) !== "no changes";
    if (changed) {
      setPending(applied);
      setMsgs((m) => [...m, { role: "bot", text: `${applied.reply}\n\nPreview: ${diffSummary(applied.next)}. Apply this to the live week?` }]);
    } else {
      setPending(null);
      setMsgs((m) => [
        ...m,
        {
          role: "bot",
          text: "OpenAI is not configured for this app session, so I can only use the local schedule-edit parser. Add `VITE_OPENAI_API_KEY` to enable full general Q&A and richer schedule instructions.",
        },
      ]);
    }
    setBusy(false);
  }

  function confirmPending() {
    if (!pending) return;
    setAll(pending.next);
    setMsgs((m) => [...m, { role: "bot", text: "Applied to the live week." }]);
    setPending(null);
  }

  function discardPending() {
    setPending(null);
    setMsgs((m) => [...m, { role: "bot", text: "Discarded — the live week is unchanged." }]);
  }

  return (
    <>
      <button onClick={() => setOpen(true)} className="fixed bottom-6 right-6 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-[#005eed] text-white shadow-xl">
        <MessageCircle className="h-5 w-5" />
      </button>
      {open && (
        <div className="fixed bottom-6 right-6 z-50 flex h-[480px] w-[min(400px,92vw)] flex-col overflow-hidden rounded-3xl border border-line bg-white shadow-2xl">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <div>
              <p className="text-sm font-medium">Athena assistant</p>
              <p className="text-[11px] text-mist">Answers anything and edits the live schedule (preview first)</p>
            </div>
            <button onClick={() => setOpen(false)}>
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="flex-1 space-y-2 overflow-y-auto p-3">
            {msgs.map((m, i) => (
              <div key={i} className={`max-w-[92%] whitespace-pre-line rounded-2xl px-3 py-2 text-sm ${m.role === "user" ? "ml-auto bg-[#005eed] text-white" : "bg-ink"}`}>
                {m.text}
              </div>
            ))}
            {busy && <p className="text-xs text-mist">Thinking…</p>}
            {pending && !busy && (
              <div className="flex gap-2">
                <button onClick={confirmPending} className="rounded-xl bg-[#005eed] px-3 py-1.5 text-sm text-white">
                  Apply
                </button>
                <button onClick={discardPending} className="rounded-xl border border-line px-3 py-1.5 text-sm">
                  Discard
                </button>
              </div>
            )}
          </div>
          <div className="flex gap-2 border-t border-line p-3">
            <input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} placeholder="Ask anything, or edit the schedule…" className="flex-1 rounded-xl border border-line bg-ink px-3 py-2 text-sm outline-none" />
            <button onClick={send} className="rounded-xl bg-[#005eed] px-3 text-white">
              <Send className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </>
  );
}

function findDay(text: string) {
  const map = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
  const i = map.findIndex((d) => text.includes(d) || text.includes(d.slice(0, 3)));
  return i >= 0 ? i : null;
}
function findTime(text: string) {
  const m = text.match(/\b(\d{1,2}):(\d{2})\b/);
  return m ? `${m[1].padStart(2, "0")}:${m[2]}` : null;
}
function findLoc(text: string) {
  return resolveLocationId(text, LOCATIONS);
}
function findTrainer(text: string) {
  return TRAINERS.find((t) => text.includes(t.name.toLowerCase()) || text.includes(t.name.split(" ")[0].toLowerCase()));
}
function findFormat(text: string) {
  return [...FORMATS].sort((a, b) => b.name.length - a.name.length).find((f) => text.includes(f.name.toLowerCase()));
}

function buildSession(house: string, day: number, time: string, format: (typeof FORMATS)[number], trainer: (typeof TRAINERS)[number], settings: Settings): Session {
  const h = historicFor(house, day, time, format.name, trainer.name);
  const sc = scoreCombo(h, trainer, settings, format.name);
  return {
    id: `${house}-${day}-${time}-${format.name}-${trainer.id}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    locationId: house,
    day,
    time,
    name: format.name,
    studio: house === "supreme" && format.family === "cycle" ? "Studio 2" : format.studio,
    duration: format.duration,
    trainerId: trainer.id,
    score: sc.score,
    fill: h.fill,
    avg: h.checkin,
    sessions: h.sessions,
    oneOff: sc.oneOff,
    reason: `Live chat add. ${trainer.name} is certified for ${format.name}.`,
    breakdown: sc.breakdown,
    capacity: format.family === "cycle" ? 24 : 18,
    tags: ["new"],
    accent: format.accent,
  };
}

export function applyNaturalLanguage(raw: string, all: Session[], settings: Settings, fallbackLoc: string) {
  const text = raw.toLowerCase();
  const day = findDay(text);
  const time = findTime(text);
  const loc = findLoc(text) || fallbackLoc;
  const trainer = findTrainer(text);
  const format = findFormat(text);
  let next = [...all];

  const match = (s: Session) =>
    (day == null || s.day === day) &&
    (!time || s.time === time) &&
    (!loc || s.locationId === loc) &&
    (!format || s.name.toLowerCase() === format.name.toLowerCase()) &&
    (!trainer || s.trainerId === trainer.id);

  if (/(remove|delete|drop|cancel)/.test(text)) {
    const before = next.length;
    next = next.filter((s) => !match(s));
    return { next, reply: `Removed ${before - next.length} live class${before - next.length === 1 ? "" : "es"}. Refresh the ${DAYS[day ?? 0].full} column if you are filtered to another house.` };
  }

  if (/(swap|replace|substitute|sub |cover)/.test(text)) {
    const names = TRAINERS.filter((t) => text.includes(t.name.split(" ")[0].toLowerCase()));
    const from = names[0];
    const to = names[1];
    if (from && to) {
      let n = 0;
      next = next.map((s) => {
        if (s.trainerId === from.id && match({ ...s, trainerId: from.id })) {
          n += 1;
          recordOverride(s.locationId, s.day, s.time, s.name, from.id, to.id);
          return { ...s, trainerId: to.id, reason: `Chat swap: ${from.name} → ${to.name}` };
        }
        return s;
      });
      return { next, reply: `Swapped ${from.name} → ${to.name} on ${n} live slot${n === 1 ? "" : "s"}.` };
    }
  }

  if (/(add|more class|few more|schedule|insert|put)/.test(text)) {
    const house = loc;
    const d = day ?? 5;
    const countMatch = text.match(/\b(\d+)\b/);
    const want = Math.min(6, Math.max(format && time ? 1 : Number(countMatch?.[1] || 3), 1));
    const used = new Set(next.filter((s) => s.locationId === house && s.day === d).map((s) => `${s.time}|${s.studio}`));
    const added: Session[] = [];
    const times = time ? [time] : TIMES.filter((t) => !next.some((s) => s.locationId === house && s.day === d && s.time === t));
    const formats = format ? [format] : FORMATS.filter((f) => !/hosted|foundation|sweat/i.test(f.name));
    const roster = settings.trainers?.length ? settings.trainers : TRAINERS;
    for (const t of times) {
      if (added.length >= want) break;
      const f = formats[(added.length + d) % formats.length];
      const who =
        trainer ||
        roster.find((tr) => tr.active && tr.certs[f.cert] && tr.access[house]?.days.includes(d) && !weekOffDays(settings, tr.id).includes(d));
      if (!who) continue;
      const room = house === "supreme" && f.family === "cycle" ? "Studio 2" : f.studio;
      if (used.has(`${t}|${room}`)) continue;
      const s = buildSession(house, d, t, f, who, settings);
      s.studio = room;
      next.push(s);
      added.push(s);
      used.add(`${t}|${room}`);
    }
    if (!added.length) return { next, reply: `Could not add classes — no free Saturday/selected slots or eligible trainers at ${house}.` };
    const lines = added.map((s) => `• ${DAYS[s.day].label} ${s.time} ${s.name} — ${trainerById(s.trainerId).name} (${s.studio})`).join("\n");
    return {
      next,
      reply: `Added ${added.length} live class${added.length === 1 ? "" : "es"} at ${LOCATIONS.find((l) => l.id === house)?.name}. They are on the calendar now:\n${lines}`,
    };
  }

  return { next, reply: "I need a house and a day, e.g. “add 3 classes at Kwality on Saturday” or “remove Friday 19:00 FIT”." };
}

function eligibleTrainer(format: (typeof FORMATS)[number], loc: string, day: number, settings: Settings) {
  const roster = settings.trainers?.length ? settings.trainers : TRAINERS;
  return roster.find((t) => t.active && t.certs[format.cert] && t.access[loc]?.days.includes(day) && !weekOffDays(settings, t.id).includes(day));
}

function matchesFilter(s: Session, loc: string | null, day: number | null, time: string | null, format: (typeof FORMATS)[number] | undefined, trainer: (typeof TRAINERS)[number] | undefined) {
  return (
    (!loc || s.locationId === loc) &&
    (day == null || s.day === day) &&
    (!time || s.time === time) &&
    (!format || s.name === format.name) &&
    (!trainer || s.trainerId === trainer.id)
  );
}

type ToolArgs = {
  location?: string;
  day?: string;
  time?: string;
  className?: string;
  trainer?: string;
  newDay?: string;
  newTime?: string;
  newLocation?: string;
  newClassName?: string;
  newTrainer?: string;
};

type ToolResult = { working: Session[]; result: string };

function toolAddSession(working: Session[], settings: Settings, fallbackLoc: string, args: ToolArgs): ToolResult {
  const loc = findLoc((args.location || "").toLowerCase()) || fallbackLoc;
  const day = findDay((args.day || "").toLowerCase());
  const time = args.time ? findTime(args.time) || (/^\d{1,2}:\d{2}$/.test(args.time) ? args.time : null) : null;
  if (day == null || !time) return { working, result: "error: add needs a valid day and time (HH:MM)" };
  const format = findFormat((args.className || "").toLowerCase());
  if (!format) return { working, result: `error: unknown class name "${args.className || ""}"` };
  const trainer = args.trainer ? findTrainer((args.trainer || "").toLowerCase()) : eligibleTrainer(format, loc, day, settings);
  if (!trainer) return { working, result: `error: no eligible trainer found for ${format.name} at that house/day` };
  const room = loc === "supreme" && format.family === "cycle" ? "Studio 2" : format.studio;
  const conflict = hasConflict(working, { id: "new-pending", locationId: loc, day, time, trainerId: trainer.id, studio: room, duration: format.duration }, undefined, settings.limits.weeklyCap);
  if (conflict) return { working, result: `error: conflict — ${conflict}` };
  const s = buildSession(loc, day, time, format, trainer, settings);
  s.studio = room;
  return { working: [...working, s], result: `added ${format.name} on ${DAYS[day].label} ${time} at ${LOCATIONS.find((l) => l.id === loc)?.name || loc} with ${trainer.name}` };
}

function toolDeleteSessions(working: Session[], fallbackLoc: string, args: ToolArgs): ToolResult {
  const loc = findLoc((args.location || "").toLowerCase()) || fallbackLoc;
  const day = args.day ? findDay(args.day.toLowerCase()) : null;
  const time = args.time ? findTime(args.time) : null;
  const format = args.className ? findFormat(args.className.toLowerCase()) : undefined;
  const trainer = args.trainer ? findTrainer(args.trainer.toLowerCase()) : undefined;
  if (day == null && !time && !format && !trainer) return { working, result: "error: delete needs at least one of day/time/className/trainer to avoid removing the whole house" };
  const matches = (s: Session) => matchesFilter(s, loc, day, time, format, trainer);
  const removed = working.filter(matches).length;
  const next = working.filter((s) => !matches(s));
  return { working: next, result: `removed ${removed} session${removed === 1 ? "" : "s"}` };
}

function toolSwapTrainer(working: Session[], fallbackLoc: string, args: ToolArgs): ToolResult {
  const loc = findLoc((args.location || "").toLowerCase()) || fallbackLoc;
  const day = args.day ? findDay(args.day.toLowerCase()) : null;
  const time = args.time ? findTime(args.time) : null;
  const format = args.className ? findFormat(args.className.toLowerCase()) : undefined;
  const trainer = args.trainer ? findTrainer(args.trainer.toLowerCase()) : undefined;
  const newTrainer = findTrainer((args.newTrainer || "").toLowerCase());
  if (!newTrainer) return { working, result: `error: unknown new trainer "${args.newTrainer || ""}"` };
  const matches = (s: Session) => matchesFilter(s, loc, day, time, format, trainer);
  let n = 0;
  const next = working.map((s) => {
    if (!matches(s)) return s;
    n += 1;
    recordOverride(s.locationId, s.day, s.time, s.name, s.trainerId, newTrainer.id);
    return { ...s, trainerId: newTrainer.id, reason: `Chat swap: ${trainerById(s.trainerId).name} → ${newTrainer.name}` };
  });
  if (!n) return { working, result: "error: no matching sessions to swap" };
  return { working: next, result: `swapped trainer to ${newTrainer.name} on ${n} slot${n === 1 ? "" : "s"}` };
}

function toolRescheduleSession(working: Session[], settings: Settings, fallbackLoc: string, args: ToolArgs): ToolResult {
  const loc = findLoc((args.location || "").toLowerCase()) || fallbackLoc;
  const day = args.day ? findDay(args.day.toLowerCase()) : null;
  const time = args.time ? findTime(args.time) : null;
  const format = args.className ? findFormat(args.className.toLowerCase()) : undefined;
  const trainer = args.trainer ? findTrainer(args.trainer.toLowerCase()) : undefined;
  const matches = (s: Session) => matchesFilter(s, loc, day, time, format, trainer);
  const newDay = args.newDay ? findDay(args.newDay.toLowerCase()) : null;
  const newTime = args.newTime ? findTime(args.newTime) : null;
  const newLoc = args.newLocation ? findLoc(args.newLocation.toLowerCase()) : null;
  const newFormat = args.newClassName ? findFormat(args.newClassName.toLowerCase()) : null;
  const newTrainer = args.newTrainer ? findTrainer(args.newTrainer.toLowerCase()) : null;
  if (!newDay && !newTime && !newLoc && !newFormat && !newTrainer) return { working, result: "error: reschedule needs at least one new field (newDay/newTime/newLocation/newClassName/newTrainer)" };
  let n = 0;
  const skipped: string[] = [];
  const next = working.map((s) => {
    if (!matches(s)) return s;
    const fmt = newFormat || FORMATS.find((f) => f.name === s.name) || FORMATS[0];
    const trn = newTrainer || trainerById(s.trainerId);
    const dayVal = newDay ?? s.day;
    const timeVal = newTime || s.time;
    const locVal = newLoc || s.locationId;
    const room = locVal === "supreme" && fmt.family === "cycle" ? "Studio 2" : fmt.studio;
    const conflict = hasConflict(working, { id: s.id, locationId: locVal, day: dayVal, time: timeVal, trainerId: trn.id, studio: room, duration: fmt.duration }, s.id, settings.limits.weeklyCap);
    if (conflict) {
      skipped.push(`${DAYS[s.day].label} ${s.time} (${conflict})`);
      return s;
    }
    n += 1;
    const moved = buildSession(locVal, dayVal, timeVal, fmt, trn, settings);
    return { ...moved, id: s.id, pinned: s.pinned, reason: "Chat reschedule/edit." };
  });
  const result = `rescheduled/modified ${n} slot${n === 1 ? "" : "s"}${skipped.length ? `; skipped ${skipped.length} due to conflict: ${skipped.join(", ")}` : ""}`;
  return { working: next, result };
}

function toolOptimizeSchedule(working: Session[], settings: Settings, fallbackLoc: string, args: ToolArgs): ToolResult {
  const loc = args.location ? findLoc(args.location.toLowerCase()) || fallbackLoc : fallbackLoc;
  const seed = Math.floor(Math.random() * 1_000_000_000);
  const { sessions: generated } = generateSchedule(settings, seed, true, [loc]);
  const next = [...working.filter((s) => s.locationId !== loc), ...generated];
  return { working: next, result: `optimized ${LOCATIONS.find((l) => l.id === loc)?.name || loc}: regenerated ${generated.length} session${generated.length === 1 ? "" : "s"}` };
}

const TOOLS = [
  {
    type: "function" as const,
    function: {
      name: "add_session",
      description: "Add one new class session to the live schedule.",
      parameters: {
        type: "object",
        properties: {
          location: { type: "string", description: "House/location name or id, optional (defaults to the currently viewed house)" },
          day: { type: "string", description: "Day name, e.g. Monday..Sunday" },
          time: { type: "string", description: "24h time HH:MM" },
          className: { type: "string", description: "Class/format name" },
          trainer: { type: "string", description: "Trainer name, optional — an eligible trainer is picked automatically if omitted" },
        },
        required: ["day", "time", "className"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "delete_sessions",
      description: "Remove one or more existing sessions matching the given filters (cancel/drop/remove).",
      parameters: {
        type: "object",
        properties: {
          location: { type: "string", description: "House/location name or id, optional (defaults to the currently viewed house)" },
          day: { type: "string" },
          time: { type: "string" },
          className: { type: "string" },
          trainer: { type: "string" },
        },
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "swap_trainer",
      description: "Replace the trainer on matching session(s) with a new trainer. Use for swap/substitute/cover requests.",
      parameters: {
        type: "object",
        properties: {
          location: { type: "string" },
          day: { type: "string" },
          time: { type: "string" },
          className: { type: "string" },
          trainer: { type: "string", description: "Current trainer to match, optional" },
          newTrainer: { type: "string", description: "The trainer to assign instead" },
        },
        required: ["newTrainer"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "reschedule_session",
      description: "Move or modify matching session(s) to a new day/time/location/class/trainer.",
      parameters: {
        type: "object",
        properties: {
          location: { type: "string", description: "Filter: current location of the session to move" },
          day: { type: "string", description: "Filter: current day" },
          time: { type: "string", description: "Filter: current time" },
          className: { type: "string", description: "Filter: current class name" },
          trainer: { type: "string", description: "Filter: current trainer" },
          newDay: { type: "string" },
          newTime: { type: "string" },
          newLocation: { type: "string" },
          newClassName: { type: "string" },
          newTrainer: { type: "string" },
        },
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "optimize_schedule",
      description: "Run the scheduling optimizer to regenerate/rebalance sessions for a house using historic performance and constraints.",
      parameters: {
        type: "object",
        properties: {
          location: { type: "string", description: "House/location name or id, optional (defaults to the currently viewed house)" },
        },
      },
    },
  },
];

function systemPrompt(snap: string) {
  return `You are Athena, an OpenAI-powered assistant inside a scheduling app. Answer any question the user asks, including questions outside Physique 57, in a clear, accurate, detailed, well-written manner. If current real-world facts may have changed, say you may need live verification because this app chat has no browser access.

For schedule changes (add, remove, swap, substitute, reschedule, modify, optimize), call the matching tool instead of describing steps in text — tool calls are how edits actually happen. You can call multiple tools in one turn for compound requests (e.g. add three classes then swap one trainer). After tool calls run, write a short final natural-language summary in your reply.

Use only these location ids/names: ${LOCATIONS.map((l) => `${l.id} (${l.name})`).join(", ")}.
Use only these class names: ${FORMATS.map((f) => f.name).join(", ")}.
Use only these trainers: ${TRAINERS.map((t) => t.name).join(", ")}.
Never create Hosted, Foundations, or SWEAT In 30.
Never claim an edit is already applied to the live week — it is only prepared for preview until the user clicks Apply.
If a request is ambiguous, ask a clarifying question in your reply instead of guessing/calling a tool.

LIVE WEEK SNAPSHOT:
${snap}`;
}

async function runAssistant(prompt: string, history: Msg[], all: Session[], settings: Settings, fallbackLoc: string): Promise<{ reply: string; next: Session[] }> {
  const key = settings.ai.openaiKey;
  const model = settings.ai.openaiModel || "gpt-4.1-mini";
  const snap = all
    .slice(0, 220)
    .map((s) => `${s.id} | ${DAYS[s.day].full} ${s.time} | ${s.locationId} | ${s.studio} | ${s.name} | ${trainerById(s.trainerId).name} | avg ${s.avg} | fill ${s.fill}% | sessions ${s.sessions}`)
    .join("\n");
  const recent = history.slice(-8).map((m) => ({ role: m.role === "bot" ? "assistant" : "user", content: m.text }));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const messages: any[] = [{ role: "system", content: systemPrompt(snap) }, ...recent, { role: "user", content: prompt }];

  let working = all;
  const notes: string[] = [];

  for (let i = 0; i < 6; i++) {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model, messages, tools: TOOLS, tool_choice: "auto" }),
    });
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();
    const msg = data.choices?.[0]?.message;
    if (!msg) throw new Error("empty response from OpenAI");
    messages.push(msg);
    const calls = msg.tool_calls;
    if (!calls || !calls.length) {
      return { reply: String(msg.content || "Done."), next: working };
    }
    for (const call of calls) {
      let args: ToolArgs = {};
      try {
        args = JSON.parse(call.function.arguments || "{}");
      } catch {
        args = {};
      }
      let outcome: ToolResult;
      switch (call.function.name) {
        case "add_session":
          outcome = toolAddSession(working, settings, fallbackLoc, args);
          break;
        case "delete_sessions":
          outcome = toolDeleteSessions(working, fallbackLoc, args);
          break;
        case "swap_trainer":
          outcome = toolSwapTrainer(working, fallbackLoc, args);
          break;
        case "reschedule_session":
          outcome = toolRescheduleSession(working, settings, fallbackLoc, args);
          break;
        case "optimize_schedule":
          outcome = toolOptimizeSchedule(working, settings, fallbackLoc, args);
          break;
        default:
          outcome = { working, result: `error: unknown tool ${call.function.name}` };
      }
      working = outcome.working;
      notes.push(outcome.result);
      messages.push({ role: "tool", tool_call_id: call.id, content: outcome.result });
    }
  }
  return { reply: notes.length ? `Prepared: ${notes.join("; ")}.` : "I could not complete that.", next: working };
}
