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
let brLimit = 0;

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

  brLimit = Number(pb.br) || 0;
  safeSet("mainBRLimit", brLimit);

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
// RENDER ROSTER (WITH WITHDRAW BUTTON)
// ------------------------------
function renderRoster() {
  const rosterDiv = document.getElementById("roster");
  if (!rosterDiv) return;

  rosterDiv.innerHTML = "";

  const myName = localStorage.getItem("captainName");

  roster.forEach(p => {
    const div = document.createElement("div");
    div.className = "card";

    const tick = isAssigned(p.name) ? " ✔️" : "";
    div.textContent = `${p.name} — ${p.ship} (${p.br} BR)${tick}`;

// Add withdraw button for any captain created by this user
if (p.createdBy === localStorage.userId) {
  const btn = document.createElement("button");
  btn.textContent = "Withdraw";
  btn.className = "withdrawBtn";
  btn.style.marginLeft = "10px";

  btn.onclick = async () => {
    if (!confirm(`Withdraw ${p.name}?`)) return;

    const res = await fetch(
      `${API_BASE}/pb/${pbId}/withdraw/${encodeURIComponent(p.name)}`,
      { method: "DELETE" }
    );

    const data = await res.json();
    if (!data.ok) {
      alert("Failed to withdraw.");
      return;
    }

    // Do NOT clear captainName — user may have signed up multiple captains
    await loadRoster();
  };

  div.appendChild(btn);
}

    rosterDiv.appendChild(div);
  });
}

// ------------------------------
// RENDER ASSIGNMENTS + BR TOTALS
// ------------------------------
function renderAssignments() {
  const mainDiv = document.getElementById("mainAssignments");
  const screeningDiv = document.getElementById("screeningAssignments");

  if (!mainDiv || !screeningDiv) return;

  mainDiv.innerHTML = "";
  screeningDiv.innerHTML = "";

  let mainBR = 0;
  let screeningBR = 0;

  assignments.main.forEach(name => {
    const p = roster.find(x => x.name === name);
    if (p) {
      mainBR += Number(p.br) || 0;
      const div = document.createElement("div");
      div.className = "card";
      div.textContent = `${p.name} — ${p.ship} (${p.br} BR)`;
      mainDiv.appendChild(div);
    }
  });

  assignments.screening.forEach(name => {
    const p = roster.find(x => x.name === name);
    if (p) {
      screeningBR += Number(p.br) || 0;
      const div = document.createElement("div");
      div.className = "card";
      div.textContent = `${p.name} — ${p.ship} (${p.br} BR)`;
      screeningDiv.appendChild(div);
    }
  });

  safeSet("mainBR", mainBR);
  safeSet("screeningBR", screeningBR);

  updateBRStatus(mainBR);
}

// ------------------------------
// BR COLOUR CODING
// ------------------------------
function updateBRStatus(mainBR) {
  const statusDiv = document.getElementById("mainBRStatus");
  const warningSpan = document.getElementById("mainBRWarning");

  if (!statusDiv || !warningSpan) return;

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
// SSE STREAMING (PRIMARY METHOD)
// ------------------------------
function startSSE() {
  const streamUrl = `${API_BASE}/pb/${pbId}/stream`;
  const evtSource = new EventSource(streamUrl);

  console.log("SSE: Connecting to stream…");

  evtSource.onmessage = async (event) => {
    const data = JSON.parse(event.data);

    if (data.assignVersion !== assignVersion) {
      assignVersion = data.assignVersion;
      assignments = data.assignments;
      await loadRoster();
    }
  };

  evtSource.onerror = () => {
    console.warn("SSE failed — falling back to polling");
    evtSource.close();
    startPollingFallback();
  };
}

// ------------------------------
// POLLING FALLBACK (30s)
// ------------------------------
function startPollingFallback() {
  setInterval(async () => {
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
  }, 30000);
}

// ------------------------------
// INITIAL LOAD
// ------------------------------
(async () => {
  await loadPBConfig();
  await loadRoster();

  const isOfficer = await verifyOfficerStatus();
  if (isOfficer) {
    const link = document.getElementById("assignLink");
    if (link) {
      link.style.display = "inline-block";
      link.href = `/pb/assign.html?id=${pbId}`;
    }
  }

  // Start SSE (fallback handled automatically)
  startSSE();
})();