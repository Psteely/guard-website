import { API_BASE } from "./config.js";
import { cacheGet, cacheSet, cacheRemove, cachePBKey } from "./cache.js";

document.addEventListener("DOMContentLoaded", () => {
  const url = new URL(window.location.href);
  const pbId = url.searchParams.get("id");

  if (!pbId) {
    document.body.innerHTML = "<h2>Error: No PB ID provided.</h2>";
    return;
  }

  if (!localStorage.userId) {
    localStorage.userId = crypto.randomUUID();
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
  // LOAD PB METADATA (CACHED)
  // ------------------------------
  async function loadPBMeta() {
    const key = cachePBKey(pbId, "config");
    const cached = cacheGet(key);

    if (cached) {
      applyPBMeta(cached);
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/pb/${pbId}/config`);
      if (!res.ok) {
        console.error("Failed to load PB metadata");
        return;
      }

      const pb = await res.json();
      cacheSet(key, pb);
      applyPBMeta(pb);

    } catch (err) {
      console.error("Error loading PB metadata:", err);
    }
  }

  function applyPBMeta(pb) {
    if (pbTitle) pbTitle.textContent = pb.name;
    if (pbDate) pbDate.textContent = pb.date;
    if (pbTime) pbTime.textContent = pb.time;
    if (pbBR) pbBR.textContent = pb.br;
    if (pbWater) pbWater.textContent = pb.water;

    if (backLink) {
      backLink.href = `/pb/roster.html?id=${pbId}`;
    }
  }

  // ------------------------------
  // LOAD SHIPS (CACHED)
  // ------------------------------
  async function loadShips() {
    const key = "ships_json";

    // Cache ships for 24 hours
    const cached = cacheGet(key, 86400000);
    let ships;

    if (cached) {
      ships = cached;
    } else {
      try {
        const res = await fetch("/assets/ships.json");
        if (!res.ok) {
          console.error("Failed to load /assets/ships.json");
          return;
        }

        ships = await res.json();
        cacheSet(key, ships);

      } catch (err) {
        console.error("Error loading ships:", err);
        return;
      }
    }

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

    const body = {
      name,
      ship,
      br,
      createdBy: localStorage.userId
    };

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

      // Invalidate roster cache so roster page reloads fresh
      cacheRemove(cachePBKey(pbId, "roster"));

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
