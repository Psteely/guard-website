// assets/index.js — list PBs, create PB, delete PB
console.log("index.js loaded");

import {
  getOfficerPassword,
  changeOfficerPassword
} from "./auth.js";

import { API_BASE } from "./config.js";
import { cacheGet, cacheSet, cacheRemove } from "./cache.js";

// ------------------------------
// OFFICER UI
// ------------------------------
function updateOfficerUI() {
  const isOfficer = localStorage.getItem("isOfficer") === "true";
  document.querySelectorAll(".officerOnly").forEach(el => {
    el.style.display = isOfficer ? "inline-block" : "none";
  });
}

// Officer login button
const loginBtn = document.getElementById("officerLoginBtn");
if (loginBtn) {
  loginBtn.addEventListener("click", async () => {
    const pwd = await getOfficerPassword();
    if (pwd) {
      alert("Officer access granted.");
      updateOfficerUI();
    }
  });
}

// Change password button
const changePwdBtn = document.getElementById("changeOfficerPassword");
if (changePwdBtn) {
  changePwdBtn.addEventListener("click", changeOfficerPassword);
}

// ------------------------------
// LOAD PB LIST (CACHED)
// ------------------------------
async function loadPBs() {
  const listDiv = document.getElementById("pbList");
  if (!listDiv) return;

  listDiv.innerHTML = "Loading...";

  const key = "pb_list_cache";

  // Try cache first (TTL 15 seconds)
  const cached = cacheGet(key, 15000);
  if (cached) {
    renderPBList(cached);
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/pb/list`);
    if (!res.ok) {
      listDiv.innerHTML = "<p>Failed to load Port Battles.</p>";
      return;
    }

    const pbs = await res.json();

    cacheSet(key, pbs);
    renderPBList(pbs);

  } catch (err) {
    console.error(err);
    listDiv.innerHTML = "<p>Error loading Port Battles.</p>";
  }
}

function renderPBList(pbs) {
  const listDiv = document.getElementById("pbList");
  if (!listDiv) return;

  if (pbs.length === 0) {
    listDiv.innerHTML = "<p>No active Port Battles.</p>";
    return;
  }

  let html = "";
  pbs.forEach(pb => {
    html += `
      <div class="pb-card">
        <h3>${pb.name}</h3>
        <div>Date: ${pb.date}</div>
        <div>Time: ${pb.time}</div>
        <div>BR: ${pb.br}</div>
        <div>Water: ${pb.water}</div>

        <div class="pb-links">
          <a href="/pb/roster.html?id=${pb.id}">Roster</a> |
          <a href="/pb/signup.html?id=${pb.id}">Signup</a> |
          <a href="/pb/assign.html?id=${pb.id}" class="officerOnly">Assign</a>
        </div>

        <button class="pb-delete officerOnly" data-id="${pb.id}">Delete</button>
      </div>
    `;
  });

  listDiv.innerHTML = html;
  updateOfficerUI();
}

// ------------------------------
// CREATE PB MODAL
// ------------------------------
const createBtn = document.getElementById("createPB");
if (createBtn) {
  createBtn.addEventListener("click", () => {
    const modal = document.getElementById("createModal");
    if (modal) modal.style.display = "block";
  });
}

const cancelBtn = document.getElementById("createPBCancel");
if (cancelBtn) {
  cancelBtn.addEventListener("click", () => {
    const modal = document.getElementById("createModal");
    if (modal) modal.style.display = "none";
  });
}

const confirmBtn = document.getElementById("createPBConfirm");
if (confirmBtn) {
  confirmBtn.addEventListener("click", async () => {
    const name = document.getElementById("pbName")?.value.trim();
    const date = document.getElementById("pbDate")?.value;
    const time = document.getElementById("pbTime")?.value;
    const br = parseInt(document.getElementById("pbBR")?.value, 10);
    const water = document.getElementById("pbWater")?.value;

    if (!name || !date || !time || !br) {
      alert("Please fill in all fields.");
      return;
    }

    const res = await fetch(`${API_BASE}/pb/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, date, time, br, water })
    });

    const data = await res.json();

    if (data.ok) {
      // Invalidate PB list cache
      cacheRemove("pb_list_cache");

      window.location.href = `/pb/roster.html?id=${data.id}`;
    } else {
      alert("Failed to create Port Battle.");
    }
  });
}

// ------------------------------
// DELETE PB
// ------------------------------
document.addEventListener("click", async (e) => {
  if (!e.target.classList.contains("pb-delete")) return;

  const id = e.target.dataset.id;
  if (!id) return;

  if (!confirm("Delete this Port Battle? This cannot be undone.")) return;

  const res = await fetch(`${API_BASE}/pb/${id}`, {
    method: "DELETE"
  });

  const data = await res.json();

  if (data.ok) {
    // Invalidate PB list cache
    cacheRemove("pb_list_cache");

    loadPBs();
  } else {
    alert("Failed to delete Port Battle.");
  }
});

// ------------------------------
// INITIAL LOAD
// ------------------------------
(async () => {
  updateOfficerUI();
  await loadPBs();
})();
