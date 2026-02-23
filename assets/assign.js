// assets/assign.js — PB editing, assignments, drag/drop, autosave

import {
  verifyOfficerStatus,
  requireOfficer
} from "./auth.js";

const API_BASE = "https://pb-planner.peter-steely.workers.dev/api";

// ------------------------------
// PB ID
// ------------------------------
const url = new URL(window.location.href);
const pbId = url.searchParams.get("id");

if (!pbId) {
  document.body.innerHTML = "<h2>Error: No PB ID provided.</h2>";
  throw new Error("Missing PB ID");
}

document.getElementById("backLink").href = `/pb/roster.html?id=${pbId}`;

let roster = [];
let assignments = { main: [], screening: [] };
let brLimit = 0;

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

    if (diff <= 0) {
      document.getElementById("countdownTimer").textContent = "Battle is starting!";
      clearInterval(countdownInterval);
      return;
    }

    const days = Math.floor(diff / 86400000);
    const hours = Math.floor((diff / 3600000) % 24);
    const mins = Math.floor((diff / 60000) % 60);
    const secs = Math.floor((diff / 1000) % 60);

    document.getElementById("countdownTimer").textContent =
      `${days}d ${hours}h ${mins}m ${secs}s`;

  }, 1000);
}

// ------------------------------
// SAVING INDICATOR
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
  setTimeout(() => {
    el.style.opacity = "0";
  }, 600);
}

function scheduleSave() {
  showSaving();
  clearTimeout(saveTimeout);
  saveTimeout = setTimeout(() => {
    autoSave();
  }, 500);
}

// ------------------------------
// LOAD PB METADATA
// ------------------------------
async function loadPBInfo() {
  const res = await fetch(`${API_BASE}/pb/${pbId}/config`);
  if (!res.ok) return;

  const pb = await res.json();

  document.getElementById("pbTitle").textContent = pb.name;
  document.getElementById("pbNameText").textContent = pb.name;
  document.getElementById("pbDateText").textContent = pb.date;
  document.getElementById("pbTimeText").textContent = pb.time;
  document.getElementById("pbBRText").textContent = pb.br;
  document.getElementById("pbWaterText").textContent = pb.water;

  brLimit = Number(pb.br) || 0;
  document.getElementById("mainBRLimit").textContent = brLimit;

  assignments = pb.assignments || { main: [], screening: [] };

  startCountdown(pb.date, pb.time);

  enablePBMetaEditing(pb);
}

// ------------------------------
// ENABLE EDIT MODE FOR OFFICERS
// ------------------------------
async function enablePBMetaEditing(pb) {
  const isOfficer = await verifyOfficerStatus();
  if (!isOfficer) return;

  document.querySelectorAll(".officerOnly").forEach(el => {
    el.style.display = "inline-block";
  });

  document.getElementById("pbNameText").style.display = "none";
  document.getElementById("pbDateText").style.display = "none";
  document.getElementById("pbTimeText").style.display = "none";
  document.getElementById("pbBRText").style.display = "none";
  document.getElementById("pbWaterText").style.display = "none";

  document.getElementById("pbNameInput").value = pb.name;
  document.getElementById("pbDateInput").value = pb.date;
  document.getElementById("pbTimeInput").value = pb.time;
  document.getElementById("pbBRInput").value = pb.br;
  document.getElementById("pbWaterInput").value = pb.water;
}

// ------------------------------
// SAVE UPDATED PB METADATA
// ------------------------------
document.getElementById("savePBMeta")?.addEventListener("click", async () => {
  const isOfficer = await verifyOfficerStatus();
  if (!isOfficer) return alert("Officer access required.");

  const name = document.getElementById("pbNameInput").value.trim();
  const date = document.getElementById("pbDateInput").value;
  const time = document.getElementById("pbTimeInput").value;
  const br = document.getElementById("pbBRInput").value;
  const water = document.getElementById("pbWaterInput").value;

  if (!name || !date || !time || !br || !water) {
    alert("Please fill in all fields.");
    return;
  }

  showSaving();

  const res = await fetch(`${API_BASE}/pb/${pbId}/update`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      password: "SESSION",
      name,
      date,
      time,
      br,
      water
    })
  });

  const data = await res.json();

  if (data.ok) {
    showSaved();
    await loadPBInfo();
    startCountdown(date, time);
    renderAssignments();
  } else {
    alert("Failed to update battle details.");
  }
});

// ------------------------------
// LOAD ROSTER
// ------------------------------
async function loadRoster() {
  const res = await fetch(`${API_BASE}/pb/${pbId}/roster`);
  roster = await res.json();

  renderRoster();
  renderAssignments();
  enableDragDrop();
}

// ------------------------------
// RENDER ROSTER
// ------------------------------
function renderRoster() {
  const rosterDiv = document.getElementById("roster");
  rosterDiv.innerHTML = "";

  const assigned = new Set([...assignments.main, ...assignments.screening]);

  roster
    .filter(p => !assigned.has(p.name))
    .forEach(p => {
      rosterDiv.appendChild(makeCard(p));
    });
}

// ------------------------------
// RENDER ASSIGNMENTS
// ------------------------------
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

// ------------------------------
// BR STATUS
// ------------------------------
function updateBRStatus(mainBR) {
  const statusDiv = document.getElementById("brStatus");
  const warningSpan = document.getElementById("brWarning");

  const ratio = mainBR / brLimit;

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
// CARD CREATION
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

// ------------------------------
// AUTO-SAVE (NO PASSWORD PROMPT)
// ------------------------------
async function autoSave() {
  const isOfficer = await verifyOfficerStatus();
  if (!isOfficer) return;

  try {
    await fetch(`${API_BASE}/pb/${pbId}/assign`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        password: "SESSION",
        main: assignments.main,
        screening: assignments.screening
      })
    });

    showSaved();
  } catch (err) {
    console.error("Auto-save failed:", err);
  }
}

// ------------------------------
// DRAG & DROP
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
// INITIAL LOAD
// ------------------------------
(async () => {
  await requireOfficer();
  await loadPBInfo();
  await loadRoster();
})();