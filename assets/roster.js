import { API_BASE } from "./config.js";
import { cacheGet, cacheSet, cacheRemove, cachePBKey } from "./cache.js";

const url = new URL(window.location.href);
const pbId = url.searchParams.get("id");

if (!pbId) {
  document.body.innerHTML = "<h2>Error: No PB ID provided.</h2>";
  throw new Error("Missing PB ID");
}

let pb = null;
let roster = [];
let assignments = { main: [], screening: [] };
let assignVersion = 0;
let brLimit = 0;

let countdownInterval = null;

// ------------------------------
// GMT OFFSET LIST
// ------------------------------
const TIMEZONE_OFFSETS = [
  { offset: -12, label: "GMT-12 — Baker Island" },
  { offset: -11, label: "GMT-11 — Pago Pago" },
  { offset: -10, label: "GMT-10 — Honolulu" },
  { offset: -9,  label: "GMT-9 — Anchorage" },
  { offset: -8,  label: "GMT-8 — Los Angeles" },
  { offset: -7,  label: "GMT-7 — Denver" },
  { offset: -6,  label: "GMT-6 — Chicago" },
  { offset: -5,  label: "GMT-5 — New York" },
  { offset: -4,  label: "GMT-4 — Halifax" },
  { offset: -3,  label: "GMT-3 — Buenos Aires" },
  { offset: -2,  label: "GMT-2 — South Georgia" },
  { offset: -1,  label: "GMT-1 — Azores" },
  { offset: 0,   label: "GMT — London" },
  { offset: 1,   label: "GMT+1 — Berlin" },
  { offset: 2,   label: "GMT+2 — Athens" },
  { offset: 3,   label: "GMT+3 — Moscow" },
  { offset: 4,   label: "GMT+4 — Dubai" },
  { offset: 5,   label: "GMT+5 — Karachi" },
  { offset: 6,   label: "GMT+6 — Dhaka" },
  { offset: 7,   label: "GMT+7 — Bangkok" },
  { offset: 8,   label: "GMT+8 — Singapore" },
  { offset: 9,   label: "GMT+9 — Tokyo" },
  { offset: 10,  label: "GMT+10 — Sydney" },
  { offset: 11,  label: "GMT+11 — Noumea" },
  { offset: 12,  label: "GMT+12 — Auckland" },
  { offset: 13,  label: "GMT+13 — Tonga" },
  { offset: 14,  label: "GMT+14 — Kiritimati" }
];

// ------------------------------
// SSE STATUS
// ------------------------------
function updateSSEStatus(text, ok) {
  const el = document.getElementById("sseStatus");
  if (!el) return;

  el.textContent = text;
  el.classList.toggle("ok", ok === true);
  el.classList.toggle("fail", ok === false);
}

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

    if (diff <= 0 || isNaN(diff)) {
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
// LOAD FULL SNAPSHOT
// ------------------------------
async function loadFull() {
  const key = cachePBKey(pbId, "full");
  const cached = cacheGet(key, 30000);

  if (cached) {
    applyFull(cached);
    return;
  }

  const res = await fetch(`${API_BASE}/pb/${pbId}/full`);
  if (!res.ok) {
    console.error("Failed to load PB:", res.status);
    return;
  }

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
  document.getElementById("pbBRText").textContent = pb.br;
  document.getElementById("pbWaterText").textContent = pb.water;
  document.getElementById("mainBRLimit").textContent = brLimit;

  startCountdown(pb.date, pb.time);

  updateTimeCards();
  renderRoster();
  renderAssignments();

  const isOfficer = localStorage.getItem("isOfficer") === "true";
  if (isOfficer) {
    const link = document.getElementById("assignLink");
    if (link) {
      link.style.display = "inline-block";
      link.href = `/pb/assign.html?id=${pbId}`;
    }
  }
}

// ------------------------------
// TIME CARDS (DST-AWARE VERSION)
// ------------------------------
function updateTimeCards() {
  if (!pb) return;

  const pbDateTimeGMT = `${pb.date}T${pb.time}:00Z`;

  // GMT card
  const gmtEl = document.getElementById("pbTimeGMT");
  if (gmtEl) {
    gmtEl.textContent = new Date(pbDateTimeGMT).toLocaleString("en-GB", {
      timeZone: "GMT",
      dateStyle: "medium",
      timeStyle: "short"
    });
  }

  const tzSelect = document.getElementById("timezoneSelect");
  if (!tzSelect) return;

  // Build dropdown once
  if (tzSelect.options.length === 0) {
    TIMEZONE_OFFSETS.forEach(tz => {
      const opt = document.createElement("option");
      opt.value = tz.offset;
      opt.textContent = tz.label;
      tzSelect.appendChild(opt);
    });

    // DST-aware auto-detection
    const autoOffset = -new Date().getTimezoneOffset() / 60;
    const savedManual = localStorage.getItem("preferredGMTOffset");
    const lastAuto = localStorage.getItem("autoDetectedOffset");

    let chosenOffset;

    if (savedManual !== null) {
      chosenOffset = Number(savedManual);
    } else {
      if (lastAuto === null || Number(lastAuto) !== autoOffset) {
        localStorage.setItem("autoDetectedOffset", autoOffset);
      }
      chosenOffset = autoOffset;
    }

    tzSelect.value = String(chosenOffset);

    tzSelect.addEventListener("change", () => {
      localStorage.setItem("preferredGMTOffset", tzSelect.value);
      updateTimeCards();
    });
  }

  // Convert PB time using chosen offset
  const offsetHours = Number(tzSelect.value);
  const localDate = new Date(
    new Date(pbDateTimeGMT).getTime() + offsetHours * 3600 * 1000
  );

  const formatted = localDate.toLocaleString("en-GB", {
    dateStyle: "medium",
    timeStyle: "short"
  });

  const localEl = document.getElementById("pbTimeLocal");
  if (localEl) {
    localEl.textContent =
      `${formatted} (GMT${offsetHours >= 0 ? "+" + offsetHours : offsetHours})`;
  }
}

// ------------------------------
// RENDER ROSTER
// ------------------------------
function isAssigned(name) {
  return (
    assignments.main.includes(name) ||
    assignments.screening.includes(name)
  );
}

function sortRoster(a, b) {
    const score = captain => {
        if (captain.signedUp) return 0;          // group 1: signed up
        if (!captain.assignment) return 1;       // group 2: unallocated
        return 2;                                // group 3: allocated
    };
    return score(a) - score(b);
}

function renderRoster() {
  const rosterDiv = document.getElementById("roster");
  if (!rosterDiv) return;

  rosterDiv.innerHTML = "";

  if (!Array.isArray(roster) || roster.length === 0) {
    rosterDiv.textContent = "No captains signed up yet.";
    return;
  }

  // Compute state for sorting
  roster.forEach(p => {
    p.isMine = p.createdBy === localStorage.userId;   // has Withdraw
    p.isAssigned = isAssigned(p.name);                // has tick
    p.isUnassigned = !p.isAssigned;                   // no tick
  });

  // Sort: my signups → unallocated → allocated
  roster.sort((a, b) => {
    const score = p => {
      if (p.isMine) return 0;         // my signups (Withdraw)
      if (p.isUnassigned) return 1;   // no tick
      return 2;                       // tick (allocated)
    };
    return score(a) - score(b);
  });

  roster.forEach(p => {
    const div = document.createElement("div");
    div.className = "card";

    const tick = isAssigned(p.name) ? " ✔️" : "";
    div.textContent = `${p.name} — ${p.ship} (${p.br} BR)${tick}`;

    // Withdraw button (UUID identity)
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

        cacheRemove(cachePBKey(pbId, "full"));
        await loadFull();
      };

      div.appendChild(btn);
    }

    rosterDiv.appendChild(div);
  });
}


// ------------------------------
// RENDER ASSIGNMENTS
// ------------------------------
function renderAssignments() {
  const mainDiv = document.getElementById("mainAssignments");
  const screeningDiv = document.getElementById("screeningAssignments");

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

  document.getElementById("mainBR").textContent = mainBR;
  document.getElementById("screeningBR").textContent = screeningBR;
// Update subtotals
document.getElementById("mainBR").textContent = mainBR;
document.getElementById("screeningBR").textContent = screeningBR;

// Combined BR
const combinedBR = mainBR + screeningBR;
document.getElementById("combinedBR").textContent = combinedBR;

// Update limit display (pb.br)
document.getElementById("mainBRLimit").textContent = brLimit;

// Update combined BR status
updateBRStatus(mainBR, screeningBR);
  updateBRStatus(mainBR, screeningBR);
}

function updateBRStatus(mainBR, screeningBR) {
    const combinedBR = mainBR + screeningBR;
    const limit = brLimit; // from PB object

    const statusDiv = document.getElementById("combinedBRStatus");
    const warningSpan = document.getElementById("combinedBRWarning");

    const ratio = limit ? combinedBR / limit : 0;

    statusDiv.classList.remove("br-ok", "br-warn", "br-over");

    if (ratio >= 1) {
        statusDiv.classList.add("br-over");
        warningSpan.textContent = ` — OVER LIMIT by ${combinedBR - limit} BR`;
    } else if (ratio >= 0.8) {
        statusDiv.classList.add("br-warn");
        warningSpan.textContent = ` — Approaching limit`;
    } else {
        statusDiv.classList.add("br-ok");
        warningSpan.textContent = "";
    }
}


// ------------------------------
// SSE
// ------------------------------
let sse = null;
let retryDelay = 1000;
let sseConnected = false;

function startSSE() {
  const streamUrl = `${API_BASE}/pb/${pbId}/stream`;
  sse = new EventSource(streamUrl);

  updateSSEStatus("Connecting…", false);

  sse.onopen = () => {
    sseConnected = true;
    retryDelay = 1000;
    updateSSEStatus("SSE Connected", true);
  };

  sse.onmessage = async (event) => {
    const data = JSON.parse(event.data);

    if (data.assignVersion !== assignVersion) {
      assignVersion = data.assignVersion;
      assignments = data.assignments;

      cacheRemove(cachePBKey(pbId, "full"));
      await loadFull();
    }
  };

  sse.onerror = () => {
    if (sseConnected) {
      sseConnected = false;
      updateSSEStatus("SSE Disconnected", false);
    }

    sse.close();

    setTimeout(() => {
      retryDelay = Math.min(retryDelay * 2, 30000);
      startSSE();
    }, retryDelay);
  };
}

// ------------------------------
// INIT
// ------------------------------
(async () => {
  await loadFull();
  startSSE();
})();
