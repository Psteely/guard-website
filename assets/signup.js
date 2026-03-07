import { API_BASE } from "./config.js";
import { cacheGet, cacheSet, cacheRemove, cachePBKey } from "./cache.js";

document.addEventListener("DOMContentLoaded", () => {
  const url = new URL(window.location.href);
  const pbId = url.searchParams.get("id");

  if (!pbId) {
    document.body.innerHTML = "<h2>Error: No PB ID provided.</h2>";
    return;
  }

  // Ensure user identity exists
  if (!localStorage.userId) {
    localStorage.userId = crypto.randomUUID();
  }

  // Form elements
  const nameInput = document.getElementById("nameInput");
  const shipSelect = document.getElementById("shipSelect");
  const brInput = document.getElementById("brInput");
  const signupBtn = document.getElementById("signupBtn");

  // PB metadata display
  const pbTitle = document.getElementById("pbTitle");
  const pbDate = document.getElementById("pbDate");
  const pbTime = document.getElementById("pbTime");
  const pbBR = document.getElementById("pbBR");
  const pbWater = document.getElementById("pbWater");

  const backLink = document.getElementById("backLink");

  // ------------------------------
  // PERMANENT SSE STATUS INDICATOR
  // ------------------------------
  function updateSSEStatus(text, ok) {
    const el = document.getElementById("sseStatus");
    if (!el) return;

    el.textContent = text;
    el.classList.toggle("ok", ok === true);
    el.classList.toggle("fail", ok === false);
  }

  // ------------------------------
  // LOAD PB METADATA (from /full)
  // ------------------------------
  async function loadPBMeta() {
    const key = cachePBKey(pbId, "full");
    const cached = cacheGet(key, 30000);

    let pb;

    if (cached) {
      pb = cached;
    } else {
      const res = await fetch(`${API_BASE}/pb/${pbId}/full`);
      pb = await res.json();
      cacheSet(key, pb);
    }

    applyPBMeta(pb);
    return pb;
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
// ------------------------------
// LOAD SHIPS FILTERED BY PB BR
// ------------------------------
async function loadShips(pbBRValue) {
  // Load ships.json (cached)
  const shipsKey = "ships_json";
  let ships = cacheGet(shipsKey, 86400000);

  if (!ships) {
    const res = await fetch("/assets/ships.json");
    ships = await res.json();
    cacheSet(shipsKey, ships);
  }

  // Load br-rules.json (cached)
  const rulesKey = "br_rules_json";
  let rules = cacheGet(rulesKey, 86400000);

  if (!rules) {
    const res = await fetch("/assets/br-rules.json");
    rules = await res.json();
    cacheSet(rulesKey, rules);
  }

  // Find rule block matching this PB BR
  const rule = rules.find(r => r.battleBR.includes(pbBRValue));

  if (!rule) {
    console.error("No BR rule found for PB BR:", pbBRValue);
    shipSelect.innerHTML = `<option>No valid ships for BR ${pbBRValue}</option>`;
    return;
  }

  // Filter ships by allowed BR range
  const allowedShips = ships.filter(s =>
    s.br >= rule.minBR && s.br <= rule.maxBR
  );

  // Sort by BR ascending
  allowedShips.sort((a, b) => a.br - b.br);

  // Populate dropdown
  shipSelect.innerHTML = "";

  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "Select your ship";
  placeholder.disabled = true;
  placeholder.selected = true;
  shipSelect.appendChild(placeholder);

  allowedShips.forEach(ship => {
    const opt = document.createElement("option");
    opt.value = ship.name;
    opt.textContent = `${ship.name} (${ship.br} BR)`;
    opt.dataset.br = ship.br;
    shipSelect.appendChild(opt);
  });

  // Auto-fill BR when ship selected
  shipSelect.addEventListener("change", () => {
    const selected = shipSelect.options[shipSelect.selectedIndex];
    brInput.value = selected?.dataset?.br || "";
  });
}

  // ------------------------------
  // SIGNUP HANDLER
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

      // Invalidate full PB snapshot so roster/assign reload fresh
      cacheRemove(cachePBKey(pbId, "full"));
await fetch(`${API_BASE}/pb/${pbId}/assign`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({})
});


      // Redirect
      window.location.href = `/pb/roster.html?id=${pbId}`;

    } catch (err) {
      console.error("Signup failed:", err);
      alert("Signup failed — check console.");
    }
  });

  // ------------------------------
  // SSE WITH PERMANENT STATUS
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

      // If PB metadata changed, reload it
      if (data.assignVersion !== undefined) {
        cacheRemove(cachePBKey(pbId, "full"));
        await loadPBMeta();
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
async function init() {
  const pb = await loadPBMeta();   // load metadata first
  const pbBRValue = Number(pb.br); // convert PB BR to number
  loadShips(pbBRValue);            // now filter ships correctly
  
  startSSE();
}



init();
});
