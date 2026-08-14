import { DAYS, locationById, trainerById } from "./data";
import type { GenReport, Session } from "./types";

function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function rowsFor(sessions: Session[]) {
  return [...sessions]
    .sort((a, b) => a.locationId.localeCompare(b.locationId) || a.day - b.day || a.time.localeCompare(b.time))
    .map((s) => ({
      location: locationById(s.locationId).name,
      day: DAYS[s.day].full,
      time: s.time,
      class: s.name,
      studio: s.studio,
      trainer: trainerById(s.trainerId).name,
      duration: s.duration,
      capacity: s.capacity,
      fill: s.fill,
      avgCheckin: s.avg,
      sessions: s.sessions,
      score: s.score,
    }));
}

export function exportCSV(sessions: Session[]) {
  const rows = rowsFor(sessions);
  const headers = Object.keys(rows[0] ?? { location: "", day: "", time: "", class: "", studio: "", trainer: "", duration: "", capacity: "", fill: "", avgCheckin: "", sessions: "", score: "" });
  const esc = (v: unknown) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [headers.join(","), ...rows.map((r) => headers.map((h) => esc((r as Record<string, unknown>)[h])).join(","))].join("\n");
  downloadBlob(`athena-schedule-${Date.now()}.csv`, new Blob([csv], { type: "text/csv;charset=utf-8" }));
}

export function exportJSON(sessions: Session[], report: GenReport) {
  const payload = { generatedAt: report.generatedAt, hash: report.hash, sessions: rowsFor(sessions) };
  downloadBlob(`athena-schedule-${Date.now()}.json`, new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }));
}

function buildHtml(sessions: Session[]) {
  const rows = rowsFor(sessions);
  const body = rows
    .map(
      (r) =>
        `<tr><td>${r.location}</td><td>${r.day}</td><td>${r.time}</td><td>${r.class}</td><td>${r.studio}</td><td>${r.trainer}</td><td>${r.duration}m</td><td>${r.fill}%</td><td>${r.avgCheckin}</td><td>${r.sessions}</td><td>${r.score}</td></tr>`
    )
    .join("");
  return `<!doctype html><html><head><meta charset="utf-8"><title>Athena Scheduler — Export</title>
  <style>
    body{font-family:system-ui,sans-serif;color:#0e1729;margin:24px;}
    h1{font-size:20px;margin-bottom:4px;}
    p{color:#6b7280;margin-top:0;}
    table{width:100%;border-collapse:collapse;font-size:12px;}
    th,td{border:1px solid #e5e7eb;padding:6px 8px;text-align:left;}
    th{background:#f3f4f6;text-transform:uppercase;font-size:10px;letter-spacing:.05em;color:#6b7280;}
    @media print { body { margin: 0; } }
  </style></head><body>
  <h1>Athena Scheduler — Weekly Schedule</h1>
  <p>Exported ${new Date().toLocaleString()}</p>
  <table><thead><tr><th>Location</th><th>Day</th><th>Time</th><th>Class</th><th>Studio</th><th>Trainer</th><th>Duration</th><th>Fill</th><th>Avg</th><th>Sessions</th><th>Score</th></tr></thead>
  <tbody>${body}</tbody></table>
  </body></html>`;
}

export function exportHTML(sessions: Session[]) {
  downloadBlob(`athena-schedule-${Date.now()}.html`, new Blob([buildHtml(sessions)], { type: "text/html;charset=utf-8" }));
}

// Zero-dependency PDF export: open the printable HTML in a new tab and trigger the browser's
// native print-to-PDF dialog — no external library required.
export function exportPDF(sessions: Session[]) {
  const win = window.open("", "_blank");
  if (!win) return;
  win.document.write(buildHtml(sessions));
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 300);
}

// Zero-dependency PNG export: draw a simple grid onto a canvas using the 2D API (no rendering library).
export function exportPNG(sessions: Session[], locationName: string) {
  const rows = rowsFor(sessions).filter((r) => r.location === locationName);
  const rowH = 22;
  const colW = [70, 60, 150, 90, 120, 50, 50];
  const width = colW.reduce((a, b) => a + b, 0) + 40;
  const height = (rows.length + 3) * rowH + 40;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = "#0e1729";
  ctx.font = "bold 14px system-ui";
  ctx.fillText(`${locationName} — Weekly Schedule`, 20, 24);
  ctx.font = "10px system-ui";
  const headers = ["Day", "Time", "Class", "Studio", "Trainer", "Fill", "Score"];
  let y = 24 + rowH;
  ctx.fillStyle = "#6b7280";
  let x = 20;
  headers.forEach((h, i) => {
    ctx.fillText(h.toUpperCase(), x, y);
    x += colW[i];
  });
  y += 6;
  ctx.strokeStyle = "#e5e7eb";
  ctx.beginPath();
  ctx.moveTo(20, y);
  ctx.lineTo(width - 20, y);
  ctx.stroke();
  ctx.fillStyle = "#0e1729";
  rows.forEach((r) => {
    y += rowH;
    x = 20;
    const cells = [r.day, r.time, r.class, r.studio, r.trainer, `${r.fill}%`, String(r.score)];
    cells.forEach((c, i) => {
      ctx.fillText(String(c).slice(0, 20), x, y);
      x += colW[i];
    });
  });
  canvas.toBlob((blob) => {
    if (blob) downloadBlob(`athena-schedule-${locationName.replace(/\s+/g, "-").toLowerCase()}-${Date.now()}.png`, blob);
  });
}
