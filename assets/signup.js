// signup.js — uses ships.json, auto BR, dropdown shows name + rate + BR

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

const nameInput = document.getElementById("nameInput");
const shipSelect = document.getElementById("shipSelect");
const brInput = document.getElementById("brInput");

// Load PB metadata
async function loadPBInfo() {
  const res = await fetch(`${API_BASE}/pb/${pbId}/config`);
  if (!res.ok) return;

  const pb = await res.json();

  document.getElementById("pbTitle").textContent = pb.name;
  document.getElementById("pbDate").textContent = pb.date || "";
  document.getElementById("pbTime").textContent = pb.time || "";
  document.getElementById("pbBR").textContent = pb.br || "";
  document.getElementById("pbWater").textContent = pb.water || "";
}

// Load ships.json and populate dropdown with name + rate + BR
async function loadShips() {
  const res = await fetch("../assets/ships.json");
  const ships = await res.json();

  // Blank default
  shipSelect.innerHTML = `<option value="">-- Select your ship --</option>`;

  ships.forEach(ship => {
    const opt = document.createElement("option");

    // Dropdown text: Name — Rate X — Y BR
    opt.textContent = `${ship.name} — Rate ${ship.rate} — ${ship.br} BR`;

    // Value is the ship ID
    opt.value = ship.id;

    // Store BR for auto-fill
    opt.dataset.br = ship.br;

    shipSelect.appendChild(opt);
  });

  // Auto-fill BR when ship changes
  shipSelect.addEventListener("change", () => {
    const selected = shipSelect.options[shipSelect.selectedIndex];
    brInput.value = selected?.dataset.br || "";
  });
}

// Handle signup
document.getElementById("signupBtn").addEventListener("click", async () => {
  const name = nameInput.value.trim();
  const shipId = shipSelect.value;
  const br = brInput.value.trim();

  if (!name) {
    alert("Please enter your name.");
    return;
  }

  if (!shipId) {
    alert("Please select your ship.");
    return;
  }

  if (!br) {
    alert("BR is missing. Please select a ship again.");
    return;
  }

  // Convert shipId → shipName (the text shown in dropdown)
  const shipName = shipSelect.options[shipSelect.selectedIndex].textContent;

  const res = await fetch(`${API_BASE}/pb/${pbId}/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, ship: shipName, br })
  });

  const data = await res.json();

  if (data.ok) {
    window.location.href = `/pb/roster.html?id=${pbId}`;
  } else {
    alert("Signup failed: " + data.error);
  }
});

// Initial load
(async () => {
  await loadPBInfo();
  await loadShips();
})();