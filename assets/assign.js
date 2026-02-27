console.log("assign.js loaded");

import {
  verifyOfficerStatus,
  requireOfficer
} from "./auth.js";

import { API_BASE } from "./config.js";
import { cacheGet, cacheSet, cacheRemove, cachePBKey } from "./cache.js";

const url = new URL(window.location.href);
const pbId = url.searchParams.get("id");

if (!pbId) {
  document.body.innerHTML = "<h2>Error: No PB ID provided.</h2>";
  throw new Error("Missing PB ID");
}

document.getElementById("backLink").href = `/pb/roster.html?id=${pbId}`;

let pb = null;
let roster = [];
let assignments = { main: [], screening: [] };
let assignVersion = 0;
let brLimit = 0;

let countdownInterval = null;

// ------------------------------
// COUNTDOWN
// ------------------------------
function startCountdown(date, time) {
  const target = new Date(`${date}T${time}:00Z`).getTime();

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

    const d = Math.floor(diff / 86400000);
    const h = Math.floor((diff / 3600000) % 24);
    const m = Math.floor((diff / 60000) % 60);
    const s = Math.floor((diff / 1000) % 60);

    el.textContent = `${d}d ${h}h ${m}m ${s}s`;
  }, 1000);
}

// ------------------------------
// SAVE INDICATORS
// ------------------------------
let saveTimeout = null;

function showSaving() {
  let el = document.getElementById("savingIndicator");
  if (!el) {
    el = document.createElement("div");
    el.id = "savingIndicator";
    el.style.position = "fixed";
    el.style.bottom = "20px";
    el.style.right = "20px";
    el.style.padding = "10px 16px";
    el.style.background = "rgba(0,0,0,0.7)";
    el.style.color = "#fff";
    el.style.borderRadius = "6px";
    el.style.fontSize = "14px";
    el.style.zIndex = "9999";
    el.style.transition = "opacity 0.4s ease";
    document.body.appendChild(el);
  }
  el.textContent = "Saving…";
  el.style.opacity = "1";
}

function showSaved() {
  const el = document.getElementById("savingIndicator");
  if (!el) return;
  el.textContent = "Saved";
  setTimeout(() => (el.style.opacity = "0"), 600);
}

function scheduleSave() {
  showSaving();
  clearTimeout(saveTimeout);
  saveTimeout = setTimeout(autoSave, 2000);
}

// ------------------------------
// LOAD FULL SNAPSHOT (CACHED)
// ------------------------------
async function loadFull() {
  const key = cachePBKey(pbId, "full");
  const cached = cacheGet(key, 30000);

  if (cached) {
    applyFull(cached);
    return;
  }

  const res = await fetch(`${API_BASE}/pb/${pbId}/full`);
  const data = await res.json();

  cacheSet(key, data);
  applyFull(data);
}

function applyFull(data) {
  pb = data;
  roster = data.roster || [];
  assignments = data.assignments || { main: [], screening: [] };
  assignVersion = data.assignVersion || 0;

  brLimit = Number(pb.br) || 0;

  document.getElementById("pbTitle").textContent = pb.name;
  document.getElementById("pbNameText").textContent = pb.name;
  document.getElementById("pbDateText").textContent = pb.date;
  document.getElementById("pbTimeText").textContent = pb.time;
  document.getElementById("pbBRText").textContent = pb.br;
  document.getElementById("pbWaterText").textContent = pb.water;
  document.getElementById("mainBRLimit").textContent = brLimit;

  startCountdown(pb.date, pb.time);

  renderRoster();
  renderAssignments();
  enableDragDrop();
}

// ------------------------------
// RENDER
// ------------------------------
function makeCard(p) {
  const div = document.createElement("div");
  div.className = "card draggable";
  div.draggable = true;
  div.dataset.name = p.name;
  div.dataset.br = p.br;
  div.textContent = `${p.name} — ${p.ship} (${p.br} BR)`;
  return div;
}

function renderRoster() {
  const rosterDiv = document.getElementById("roster");
  rosterDiv.innerHTML = "";

  const assigned = new Set([...assignments.main, ...assignments.screening]);

  roster
    .filter(p => !assigned.has(p.name))
    .forEach(p => rosterDiv.appendChild(makeCard(p)));
}

function renderAssignments() {
  const mainDiv = document.getElementById("main");
  const screeningDiv = document.getElementById("screening");

  mainDiv.innerHTML = "";
  screeningDiv.innerHTML = "";

  let mainBR = 0;
  let screeningBR = 0;

  assignments.main.forEach(name => {
    const p = roster.find(x => x.name === name);
    if (p) {
      mainBR += Number(p.br) || 0;
      mainDiv.appendChild(makeCard(p));
    }
  });

  assignments.screening.forEach(name => {
    const p = roster.find(x => x.name === name);
    if (p) {
      screeningBR += Number(p.br) || 0;
      screeningDiv.appendChild(makeCard(p));
    }
  });

  document.getElementById("mainBR").textContent = mainBR;
  document.getElementById("screeningBR").textContent = screeningBR;

  updateBRStatus(mainBR);
}

function updateBRStatus(mainBR) {
  const statusDiv = document.getElementById("brStatus");
  const warningSpan = document.getElementById("brWarning");

  const ratio = brLimit ? mainBR / brLimit : 0;

  statusDiv.classList.remove("br-ok", "br-warn", "br-over");

  if (ratio >= 1) {
    statusDiv.classList.add("br-over");
    warningSpan.textContent = ` — OVER LIMIT by ${mainBR - brLimit} BR`;
  } else if (ratio >= 0.8) {
    statusDiv.classList.add("br-warn");
    warningSpan.textContent = ` — Approaching limit`;
  } else {
    statusDiv.classList.add("br-ok");
    warningSpan.textContent = "";
  }
}

// ------------------------------
// AUTO-SAVE
// ------------------------------
async function autoSave() {
  const isOfficer = await verifyOfficerStatus();
  if (!isOfficer) return;

  try {
    const res = await fetch(`${API_BASE}/pb/${pbId}/assign`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(assignments)
    });

    const data = await res.json();
    if (data.ok) {
      assignVersion = data.assignVersion;
      cacheRemove(cachePBKey(pbId, "full"));
    }

    showSaved();
  } catch (err) {
    console.error("Auto-save failed:", err);
  }
}

// ------------------------------
// DRAG + DROP
// ------------------------------
function enableDragDrop() {
  document.querySelectorAll(".draggable").forEach(el => {
    el.addEventListener("dragstart", e => {
      e.dataTransfer.setData("text/plain", e.target.dataset.name);
    });
  });

  document.querySelectorAll(".droppable, #roster").forEach(area => {
    area.addEventListener("dragover", e => e.preventDefault());

    area.addEventListener("drop", e => {
      e.preventDefault();
      const name = e.dataTransfer.getData("text/plain");

      assignments.main = assignments.main.filter(n => n !== name);
      assignments.screening = assignments.screening.filter(n => n !== name);

      if (area.id === "main") assignments.main.push(name);
      if (area.id === "screening") assignments.screening.push(name);

      renderRoster();
      renderAssignments();
      enableDragDrop();

      scheduleSave();
    });
  });
}

// ------------------------------
// INIT
// ------------------------------
(async () => {
  await requireOfficer();
  await loadFull();
})();
