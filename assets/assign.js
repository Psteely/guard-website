// assign.js — PB Metadata + BR Totals + Screening BR + Drag/Drop + Debounced Auto-Save + Saving Indicator

const API_BASE = "https://soft-queen-933f.peter-steely.workers.dev/api";

// Read PB ID
const url = new URL(window.location.href);
const pbId = url.searchParams.get("id");

if (!pbId) {
  document.body.innerHTML = "<h2>Error: No PB ID provided.</h2>";
  throw new Error("Missing PB ID");
}

// Back to roster
document.getElementById("backLink").href = `/pb/roster.html?id=${pbId}`;

let roster = [];
let assignments = { main: [], screening: [] };
let brLimit = 0;

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
  }, 500); // waits 0.5 seconds after last drag
}

// ------------------------------
// LOAD PB METADATA
// ------------------------------

async function loadPBInfo() {
  const res = await fetch(`${API_BASE}/pb/${pbId}/config`);
  if (!res.ok) return;

  const pb = await res.json();

  document.getElementById("pbTitle").textContent = pb.name;
  document.getElementById("pbDate").textContent = pb.date || "N/A";
  document.getElementById("pbTime").textContent = pb.time || "N/A";
  document.getElementById("pbBR").textContent = pb.br || "N/A";
  document.getElementById("pbWater").textContent = pb.water || "N/A";

  brLimit = Number(pb.br) || 0;
  document.getElementById("mainBRLimit").textContent = brLimit;

  assignments = pb.assignments || { main: [], screening: [] };
}

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

  // MAIN
  assignments.main.forEach(name => {
    const p = roster.find(x => x.name === name);
    if (p) {
      mainBR += Number(p.br) || 0;
      mainDiv.appendChild(makeCard(p));
    }
  });

  // SCREENING
  assignments.screening.forEach(name => {
    const p = roster.find(x => x.name === name);
    if (p) {
      screeningBR += Number(p.br) || 0;
      screeningDiv.appendChild(makeCard(p));
    }
  });

  // Update BR totals
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
// AUTO-SAVE (DEBOUNCED)
// ------------------------------

async function autoSave() {
  try {
    await fetch(`${API_BASE}/pb/${pbId}/assign`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        password: "Nelson1798",
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
  await loadPBInfo();
  await loadRoster();
})();