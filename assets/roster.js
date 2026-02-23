// roster.js — PB Metadata + BR Totals + Countdown Timer + Officer Mode

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
document.getElementById("backLink").href = `/pb/index.html`;

let currentAssignments = null;
let currentRoster = [];
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

    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
    const mins = Math.floor((diff / (1000 * 60)) % 60);
    const secs = Math.floor((diff / 1000) % 60);

    document.getElementById("countdownTimer").textContent =
      `${days}d ${hours}h ${mins}m ${secs}s`;

  }, 1000);
}

// ------------------------------
// LOAD PB INFO
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

  currentAssignments = pb.assignments || null;

  // Start countdown
  startCountdown(pb.date, pb.time);
}

// ------------------------------
// LOAD ROSTER
// ------------------------------

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

    renderAssignments();

  } catch (err) {
    console.error(err);
    document.getElementById("roster").innerHTML = "<p>Error loading roster.</p>";
  }
}

// ------------------------------
// RENDER ASSIGNMENTS
// ------------------------------

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

  if (currentAssignments.main?.length) {
    currentAssignments.main.forEach(name => {
      const p = currentRoster.find(x => x.name === name);
      if (p) {
        mainBR += Number(p.br) || 0;
        mainView.appendChild(makeCard(p));
      }
    });
  }

  if (currentAssignments.screening?.length) {
    currentAssignments.screening.forEach(name => {
      const p = currentRoster.find(x => x.name === name);
      if (p) {
        screeningBR += Number(p.br) || 0;
        screeningView.appendChild(makeCard(p));
      }
    });
  }

  document.getElementById("mainBR").textContent = mainBR;
  document.getElementById("screeningBR").textContent = screeningBR;

  updateBRStatus(mainBR);
}

// ------------------------------
// BR STATUS
// ------------------------------

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

// ------------------------------
// WITHDRAW
// ------------------------------

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
      await loadRoster();
    } else {
      alert("Failed to remove player.");
    }
  } catch (err) {
    console.error(err);
    alert("Error removing player.");
  }
});

// ------------------------------
// INITIAL LOAD
// ------------------------------

(async () => {
  await loadPBInfo();
  await loadRoster();
  checkOfficerStatus();
})();