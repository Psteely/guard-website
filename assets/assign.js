// assign.js — Auto-Save Version with PB Metadata + BR Totals + Roster Filtering

//const API_BASE = "http://127.0.0.1:8787/api";

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

// Load PB metadata + existing assignments
async function loadPBInfo() {
  const res = await fetch(`${API_BASE}/pb/${pbId}/config`);
  if (!res.ok) return;

  const pb = await res.json();

  // Title
  document.getElementById("pbTitle").textContent = pb.name;

  // Metadata
  document.getElementById("pbDate").textContent = pb.date || "N/A";
  document.getElementById("pbTime").textContent = pb.time || "N/A";
  document.getElementById("pbBR").textContent = pb.br || "N/A";
  document.getElementById("pbWater").textContent = pb.water || "N/A";

  assignments = pb.assignments || { main: [], screening: [] };
}

// Load roster
async function loadRoster() {
  const res = await fetch(`${API_BASE}/pb/${pbId}/roster`);
  roster = await res.json();

  renderRoster();
  renderAssignments();
  enableDragDrop();
}

// Render roster (only unassigned captains)
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

// Render assignments into columns
function renderAssignments() {
  const mainDiv = document.getElementById("main");
  const screeningDiv = document.getElementById("screening");

  mainDiv.innerHTML = "";
  screeningDiv.innerHTML = "";

  let mainBR = 0;

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
    if (p) screeningDiv.appendChild(makeCard(p));
  });

  // Update BR total
  document.getElementById("mainBR").textContent = mainBR;
}

// Create draggable card
function makeCard(p) {
  const div = document.createElement("div");
  div.className = "card draggable";
  div.draggable = true;
  div.dataset.name = p.name;
  div.dataset.br = p.br;
  div.textContent = `${p.name} — ${p.ship} (${p.br} BR)`;
  return div;
}

// Auto-save assignments to backend
async function autoSave() {
  await fetch(`${API_BASE}/pb/${pbId}/assign`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      password: "Nelson1798",
      main: assignments.main,
      screening: assignments.screening
    })
  });
}

// Drag & Drop logic
function enableDragDrop() {
  document.querySelectorAll(".draggable").forEach(el => {
    el.addEventListener("dragstart", e => {
      e.dataTransfer.setData("text/plain", e.target.dataset.name);
    });
  });

  // All drop zones: main, screening, roster
  document.querySelectorAll(".droppable, #roster").forEach(area => {
    area.addEventListener("dragover", e => e.preventDefault());

    area.addEventListener("drop", async e => {
      e.preventDefault();
      const name = e.dataTransfer.getData("text/plain");

      // Remove from both groups
      assignments.main = assignments.main.filter(n => n !== name);
      assignments.screening = assignments.screening.filter(n => n !== name);

      // Add to the correct group
      if (area.id === "main") assignments.main.push(name);
      if (area.id === "screening") assignments.screening.push(name);
      // If dropped on roster, do nothing (captain becomes unassigned)

      renderRoster();
      renderAssignments();
      enableDragDrop();

      // Auto-save immediately
      await autoSave();
    });
  });
}

// Initial load
(async () => {
  await loadPBInfo();
  await loadRoster();
})();