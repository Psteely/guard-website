import { verifyOfficerStatus } from "./auth.js";

const API_BASE = "https://pb-planner.peter-steely.workers.dev/api";

const url = new URL(window.location.href);
const pbId = url.searchParams.get("id");

if (!pbId) {
  document.body.innerHTML = "<h2>Error: No PB ID provided.</h2>";
  throw new Error("Missing PB ID");
}

let roster = [];
let assignments = { main: [], screening: [] };
let assignVersion = 0;

// ------------------------------
// SAFE UI UPDATE HELPER
// ------------------------------
function safeSet(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

// ------------------------------
// COUNTDOWN TIMER
// ------------------------------
let countdownInterval = null;

function startCountdown(pbDate, pbTime) {
  const target = new Date(`${pbDate}T${pbTime}:00Z`).getTime();

  if (countdownInterval) clearInterval(countdownInterval);

  countdownInterval = setInterval(() => {
    const now = Date.now();
    const diff = target - now;

    const el = document.getElementById("countdownTimer");
    if (!el) return;

    if (diff <= 0) {
      el.textContent = "Battle is starting!";
      clearInterval(countdownInterval);
      return;
    }

    const days = Math.floor(diff / 86400000);
    const hours = Math.floor((diff / 3600000) % 24);
    const mins = Math.floor((diff / 60000) % 60);
    const secs = Math.floor((diff / 1000) % 60);

    el.textContent = `${days}d ${hours}h ${mins}m ${secs}s`;
  }, 1000);
}

// ------------------------------
// LOAD PB CONFIG
// ------------------------------
async function loadPBConfig() {
  const res = await fetch(`${API_BASE}/pb/${pbId}/config`);
  const pb = await res.json();

  safeSet("pbTitle", pb.name);
  safeSet("pbDateText", pb.date);
  safeSet("pbTimeText", pb.time);
  safeSet("pbBRText", pb.br);
  safeSet("pbWaterText", pb.water);

  assignments = pb.assignments || { main: [], screening: [] };
  assignVersion = pb.assignVersion || 0;

  startCountdown(pb.date, pb.time);
}

// ------------------------------
// LOAD ROSTER
// ------------------------------
async function loadRoster() {
  const res = await fetch(`${API_BASE}/pb/${pbId}/roster`);
  roster = await res.json();

  renderRoster();
  renderAssignments();
}

// ------------------------------
// ASSIGNMENT CHECK
// ------------------------------
function isAssigned(name) {
  return assignments.main.includes(name) || assignments.screening.includes(name);
}

// ------------------------------
// RENDER ROSTER
// ------------------------------
function renderRoster() {
  const rosterDiv = document.getElementById("roster");
  if (!rosterDiv) return;

  rosterDiv.innerHTML = "";

  roster.forEach(p => {
    const div = document.createElement("div");
    div.className = "card";

    const tick = isAssigned(p.name) ? " ✔️" : "";

    div.textContent = `${p.name} — ${p.ship} (${p.br} BR)${tick}`;

    rosterDiv.appendChild(div);
  });
}

// ------------------------------
// RENDER ASSIGNMENTS
// ------------------------------
function renderAssignments() {
  const mainDiv = document.getElementById("mainAssignments");
  const screeningDiv = document.getElementById("screeningAssignments");

  if (!mainDiv || !screeningDiv) return;

  mainDiv.innerHTML = "";
  screeningDiv.innerHTML = "";

  assignments.main.forEach(name => {
    const p = roster.find(x => x.name === name);
    if (p) {
      const div = document.createElement("div");
      div.className = "card";
      div.textContent = `${p.name} — ${p.ship} (${p.br} BR)`;
      mainDiv.appendChild(div);
    }
  });

  assignments.screening.forEach(name => {
    const p = roster.find(x => x.name === name);
    if (p) {
      const div = document.createElement("div");
      div.className = "card";
      div.textContent = `${p.name} — ${p.ship} (${p.br} BR)`;
      screeningDiv.appendChild(div);
    }
  });
}

// ------------------------------
// REAL‑TIME POLLING
// ------------------------------
async function pollForUpdates() {
  try {
    const res = await fetch(`${API_BASE}/pb/${pbId}/config`);
    if (!res.ok) return;

    const pb = await res.json();
    const newVersion = pb.assignVersion || 0;

    if (newVersion !== assignVersion) {
      assignVersion = newVersion;
      assignments = pb.assignments || { main: [], screening: [] };
      await loadRoster();
    }
  } catch (err) {
    console.error("Polling failed:", err);
  }
}

setInterval(pollForUpdates, 5000);

// ------------------------------
// INITIAL LOAD
// ------------------------------
(async () => {
  await loadPBConfig();
  await loadRoster();

  const isOfficer = await verifyOfficerStatus();
  if (isOfficer) {
    const link = document.getElementById("assignLink");
    if (link) link.style.display = "inline-block";
    link.href = `/pb/assign.html?id=${pbId}`;
  }
})();