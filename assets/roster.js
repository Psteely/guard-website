// roster.js — READ-ONLY VERSION WITH PB METADATA + BR TOTALS + BR WARNINGS + OFFICER LOGIN

const API_BASE = "https://soft-queen-933f.peter-steely.workers.dev/api";

// ------------------------------
// OFFICER LOGIN SYSTEM
// ------------------------------

const OFFICER_PASSWORD = "Nelson1798";

function checkOfficerStatus() {
  const isOfficer = localStorage.getItem("isOfficer") === "true";

  document.querySelectorAll(".officerOnly").forEach(el => {
    el.style.display = isOfficer ? "inline-block" : "none";
  });
}

document.getElementById("officerLoginBtn")?.addEventListener("click", () => {
  const entered = prompt("Enter officer password:");

  if (entered === OFFICER_PASSWORD) {
    localStorage.setItem("isOfficer", "true");
    alert("Officer access granted.");
    checkOfficerStatus();
  } else {
    alert("Incorrect password.");
  }
});

// ------------------------------
// PB ID
// ------------------------------

const url = new URL(window.location.href);
const pbId = url.searchParams.get("id");

if (!pbId) {
  document.body.innerHTML = "<h2>Error: No PB ID provided.</h2>";
  throw new Error("Missing PB ID");
}

// Links
document.getElementById("signupLink").href = `/pb/signup.html?id=${pbId}`;
document.getElementById("officerLink").href = `/pb/assign.html?id=${pbId}`;

let currentAssignments = null;
let currentRoster = [];
let brLimit = 0;

// Load PB info (name + date + time + BR + water + assignments)
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

  brLimit = Number(pb.br) || 0;
  document.getElementById("mainBRLimit").textContent = brLimit;

  currentAssignments = pb.assignments || null;
}

// Back to roster
document.getElementById("backLink").href = `/pb/index.html`;

// Load roster from backend
async function loadRoster() {
  try {
    const res = await fetch(`${API_BASE}/pb/${pbId}/roster`);
    if (!res.ok) {
      document.getElementById("roster").innerHTML = "<p>Failed to load roster.</p>";
      return;
    }

    currentRoster = await res.json();

    if (currentRoster.length === 0) {
      document.getElementById("roster").innerHTML = "<p>No players have signed up yet.</p>";
    } else {
      let html = "<ul>";

      // Build a set of assigned names
      const assigned = new Set([
        ...(currentAssignments?.main || []),
        ...(currentAssignments?.screening || [])
      ]);

      for (const p of currentRoster) {
        const isAssigned = assigned.has(p.name);
        const tick = isAssigned ? "✔️" : "";

        html += `
          <li>
            ${tick} ${p.name} — ${p.ship} (${p.br} BR)
            <button class="withdraw" data-name="${p.name}">Withdraw</button>
          </li>
        `;
      }

      html += "</ul>";
      document.getElementById("roster").innerHTML = html;
    }

    // Render assignments AFTER roster loads
    renderAssignments();

  } catch (err) {
    console.error(err);
    document.getElementById("roster").innerHTML = "<p>Error loading roster.</p>";
  }
}

// Render assignments in read-only officer-style layout
function renderAssignments() {
  const mainView = document.getElementById("mainView");
  const screeningView = document.getElementById("screeningView");

  mainView.innerHTML = "";
  screeningView.innerHTML = "";

  if (!currentAssignments) {
    mainView.innerHTML = "<p>No assignments yet.</p>";
    screeningView.innerHTML = "<p>No assignments yet.</p>";
    return;
  }

  const makeCard = (p) => {
    const div = document.createElement("div");
    div.className = "card";
    div.textContent = `${p.name} — ${p.ship} (${p.br} BR)`;
    return div;
  };

  let mainBR = 0;
  let screeningBR = 0;

  // MAIN PORT BATTLE
  if (currentAssignments.main?.length) {
    currentAssignments.main.forEach(name => {
      const p = currentRoster.find(x => x.name === name);
      if (p) {
        mainBR += Number(p.br) || 0;
        mainView.appendChild(makeCard(p));
      }
    });
  } else {
    mainView.innerHTML = "<p>No captains assigned.</p>";
  }

  // SCREENING
  if (currentAssignments.screening?.length) {
    currentAssignments.screening.forEach(name => {
      const p = currentRoster.find(x => x.name === name);
      if (p) {
        screeningBR += Number(p.br) || 0;
        screeningView.appendChild(makeCard(p));
      }
    });
  } else {
    screeningView.innerHTML = "<p>No captains assigned.</p>";
  }

  // Update BR totals
  document.getElementById("mainBR").textContent = mainBR;
  document.getElementById("screeningBR").textContent = screeningBR;

  updateBRStatus(mainBR);
}

// Update BR status block
function updateBRStatus(mainBR) {
  const statusDiv = document.getElementById("mainBRStatus");
  const warningSpan = document.getElementById("mainBRWarning");

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

// Handle withdraw button clicks
document.addEventListener("click", async (e) => {
  if (!e.target.classList.contains("withdraw")) return;

  const name = e.target.dataset.name;

  if (!confirm(`Remove ${name} from the roster?`)) return;

  try {
    const res = await fetch(
      `${API_BASE}/pb/${pbId}/remove/${encodeURIComponent(name)}`,
      { method: "DELETE" }
    );

    const data = await res.json();

    if (data.ok) {
      await loadRoster(); // refresh roster + assignments
    } else {
      alert("Failed to remove player.");
    }
  } catch (err) {
    console.error(err);
    alert("Error removing player.");
  }
});

// Initial load
(async () => {
  await loadPBInfo();
  await loadRoster();
  checkOfficerStatus();   // <-- IMPORTANT
})();