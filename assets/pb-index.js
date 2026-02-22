// pb-index.js — Port Battle List + Create/Delete PB

const API_BASE = "http://127.0.0.1:8787/api";

// Elements
const pbList = document.getElementById("pbList");

// Load all PBs
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
          <a href="/pb/assign.html?id=${pb.id}">Assign</a> |
          <a href="/pb/signup.html?id=${pb.id}">Signup</a>
        </div>

        <button class="pb-delete" data-id="${pb.id}">Delete</button>
      </div>
    `;
  });

  html += "</div>";
  pbList.innerHTML = html;
}

// Modal handling
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
    body: JSON.stringify({
      name,
      date,
      time,
      br,
      water
    })
  });

  const data = await res.json();

  if (data.ok) {
    closeModal();
    loadPBs();
  } else {
    alert("Failed to create port battle.");
  }
}

// Delete PB
document.addEventListener("click", async (e) => {
  if (!e.target.classList.contains("pb-delete")) return;

  const id = e.target.dataset.id;

  if (!confirm("Delete this Port Battle? This cannot be undone.")) return;

  const res = await fetch(`${API_BASE}/pb/${id}`, {
    method: "DELETE"
  });

  const data = await res.json();

  if (data.ok) {
    loadPBs();
  } else {
    alert("Failed to delete Port Battle.");
  }
});

// Attach modal events
document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("openCreatePB").addEventListener("click", openModal);
  document.getElementById("closeModal").addEventListener("click", closeModal);
  document.getElementById("createPBBtn").addEventListener("click", createPB);

  loadPBs();
});