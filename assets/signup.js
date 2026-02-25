const API_BASE = "https://pb-planner.peter-steely.workers.dev/api";

document.addEventListener("DOMContentLoaded", () => {
  const url = new URL(window.location.href);
  const pbId = url.searchParams.get("id");

  if (!pbId) {
    document.body.innerHTML = "<h2>Error: No PB ID provided.</h2>";
    return;
  }

  // Match EXACT IDs from your HTML
  const nameInput = document.getElementById("nameInput");
  const shipSelect = document.getElementById("shipSelect");
  const brInput = document.getElementById("brInput");
  const signupBtn = document.getElementById("signupBtn");

  const pbTitle = document.getElementById("pbTitle");
  const pbDate = document.getElementById("pbDate");
  const pbTime = document.getElementById("pbTime");
  const pbBR = document.getElementById("pbBR");
  const pbWater = document.getElementById("pbWater");

  const backLink = document.getElementById("backLink");

  if (!nameInput || !shipSelect || !brInput || !signupBtn) {
    console.error("Signup page elements missing");
    return;
  }

  // ------------------------------
  // LOAD PB METADATA
  // ------------------------------
  async function loadPBMeta() {
    try {
      const res = await fetch(`${API_BASE}/pb/${pbId}/config`);
      if (!res.ok) {
        console.error("Failed to load PB metadata");
        return;
      }

      const pb = await res.json();

      if (pbTitle) pbTitle.textContent = pb.name;
      if (pbDate) pbDate.textContent = pb.date;
      if (pbTime) pbTime.textContent = pb.time;
      if (pbBR) pbBR.textContent = pb.br;
      if (pbWater) pbWater.textContent = pb.water;

      // Back link
      if (backLink) {
        backLink.href = `/pb/roster.html?id=${pbId}`;
      }

    } catch (err) {
      console.error("Error loading PB metadata:", err);
    }
  }

  // ------------------------------
  // LOAD SHIPS FROM /assets/ships.json
  // ------------------------------
  async function loadShips() {
    try {
      const res = await fetch("/assets/ships.json");
      if (!res.ok) {
        console.error("Failed to load /assets/ships.json");
        return;
      }

      const ships = await res.json();

      // Clear dropdown
      shipSelect.innerHTML = "";

      // Placeholder
      const placeholder = document.createElement("option");
      placeholder.value = "";
      placeholder.textContent = "Select your ship";
      placeholder.disabled = true;
      placeholder.selected = true;
      shipSelect.appendChild(placeholder);

      // Populate
      ships.forEach(ship => {
        const opt = document.createElement("option");
        opt.value = ship.name;
        opt.textContent = `${ship.name} (${ship.br} BR)`;
        opt.dataset.br = ship.br;
        shipSelect.appendChild(opt);
      });

      // Auto-fill BR
      shipSelect.addEventListener("change", () => {
        const selected = shipSelect.options[shipSelect.selectedIndex];
        brInput.value = selected?.dataset?.br || "";
      });

    } catch (err) {
      console.error("Error loading ships:", err);
    }
  }

  // ------------------------------
  // SIGNUP BUTTON HANDLER
  // ------------------------------
  signupBtn.addEventListener("click", async () => {
    const name = nameInput.value.trim();
    const ship = shipSelect.value.trim();
    const br = brInput.value.trim();

    if (!name || !ship || !br) {
      alert("Please fill in all fields.");
      return;
    }

    const body = { name, ship, br };

    try {
      const res = await fetch(`${API_BASE}/pb/${pbId}/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });

      const data = await res.json();

      if (!data.ok) {
        alert(data.error || "Signup failed.");
        return;
      }

      // Store captain identity
      localStorage.setItem("captainName", name);

      // Redirect
      window.location.href = `/pb/roster.html?id=${pbId}`;

    } catch (err) {
      console.error("Signup failed:", err);
      alert("Signup failed — check console.");
    }
  });

  // ------------------------------
  // INIT
  // ------------------------------
  loadPBMeta();
  loadShips();
});