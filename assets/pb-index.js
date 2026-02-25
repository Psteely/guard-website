// pb-index.js — Port Battle List + Create/Delete PB + Officer Login

const API_BASE = "https://pb-planner.peter-steely.workers.dev/api";

// Elements
const pbList = document.getElementById("pbList");

// ------------------------------
// OFFICER LOGIN SYSTEM
// ------------------------------

function checkOfficerStatus() {
  const isOfficer = localStorage.getItem("isOfficer") === "true";

  document.querySelectorAll(".officerOnly").forEach(el => {
    el.style.display = isOfficer ? "inline-block" : "none";
  });
}

document.getElementById("officerLoginBtn").addEventListener("click", async () => {
  const entered = prompt("Enter officer password:");
  if (!entered) return;

  try {
    const res = await fetch(`${API_BASE}/officer/check`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: entered })
    });

    const data = await res.json();

    if (data.ok) {
      localStorage.setItem("isOfficer", "true");
      localStorage.setItem("officerVersion", data.version);
      alert("Officer access granted.");
      checkOfficerStatus();
    } else {
      alert("Incorrect password.");
    }
  } catch (err) {
    console.error("Login error:", err);
    alert("Login failed — network or server error.");
  }
});

// ------------------------------
// CHANGE OFFICER PASSWORD
// ------------------------------

document.getElementById("changeOfficerPassword").addEventListener("click", async () => {
  const isOfficer = localStorage.getItem("isOfficer") === "true";
  if (!isOfficer) {
    alert("You must be logged in as an officer.");
    return;
  }

  const oldPassword = prompt("Enter current officer password:");
  if (!oldPassword) return;

  const newPassword = prompt("Enter new officer password:");
  if (!newPassword) return;

  try {
    const res = await fetch(`${API_BASE}/officer/password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ oldPassword, newPassword })
    });

    const data = await res.json();

    if (data.ok) {
      alert("Officer password updated successfully.");

      // 🔥 FORCE LOGOUT — restore old behavior
      localStorage.removeItem("isOfficer");
      localStorage.removeItem("officerVersion");

      alert("Password changed. Please log in again.");
      checkOfficerStatus();
    } else {
      alert("Password change failed: " + (data.error || "Unknown error"));
    }
  } catch (err) {
    console.error("Password change error:", err);
    alert("Network or server error while changing password.");
  }
});

// ------------------------------
// LOAD PB LIST
// ------------------------------

async function loadPBs() {
  pbList.innerHTML = "Loading port battles...";

  const res = await fetch(`${API_BASE}/pb/list`);
  const data = await res.json();

  if (!data.length) {
    pbList.innerHTML = "<p>No port battles created yet.</p>";
    return;
  }

  let html = "<div class='pb-list'>";

  data.forEach(pb => {
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
          <a href="/pb/assign.html?id=${pb.id}" class="officerOnly assignBtn">Assign</a>
        </div>

        <button class="pb-delete officerOnly deleteBtn" data-id="${pb.id}">Delete</button>
      </div>
    `;
  });

  html += "</div>";
  pbList.innerHTML = html;

  // Re-check officer visibility AFTER cards are created
  checkOfficerStatus();
}

// ------------------------------
// MODAL HANDLING
// ------------------------------

function openModal() {
  document.getElementById("createModal").style.display = "block";
}

function closeModal() {
  document.getElementById("createModal").style.display = "none";
}

// Create PB
async function createPB() {
  const name = document.getElementById("pbName").value.trim();
  const date = document.getElementById("pbDateInput").value;
  const time = document.getElementById("pbTimeInput").value;
  const br = document.getElementById("pbBRInput").value;
  const water = document.getElementById("pbWaterInput").value;

  if (!name || !date || !time || !br || !water) {
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
    closeModal();
    loadPBs();
  } else {
    alert("Failed to create port battle.");
  }
}

// ------------------------------
// DELETE PB
// ------------------------------

document.addEventListener("click", async (e) => {
  if (!e.target.classList.contains("pb-delete")) return;

  const id = e.target.dataset.id;

  if (!confirm("Delete this Port Battle? This cannot be undone.")) return;

  const res = await fetch(`${API_BASE}/pb/${id}`, { method: "DELETE" });
  const data = await res.json();

  if (data.ok) {
    loadPBs();
  } else {
    alert("Failed to delete Port Battle.");
  }
});

// ------------------------------
// INITIALIZE PAGE
// ------------------------------

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("openCreatePB").addEventListener("click", openModal);
  document.getElementById("closeModal").addEventListener("click", closeModal);
  document.getElementById("createPBBtn").addEventListener("click", createPB);

  loadPBs();
  checkOfficerStatus();
});
