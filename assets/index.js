// index.js — list PBs, create PB, delete PB
console.log("index.js loaded");

//const API_BASE = "http://127.0.0.1:8787/api";
const API_BASE = "https://soft-queen-933f.peter-steely.workers.dev/api";

const OFFICER_PASSWORD = "Nelson1798";

function checkOfficerStatus() {
  const isOfficer = localStorage.getItem("isOfficer") === "true";

  document.querySelectorAll(".officerOnly").forEach(el => {
    el.style.display = isOfficer ? "inline-block" : "none";
  });
}

document.getElementById("officerLoginBtn").addEventListener("click", () => {
  const entered = prompt("Enter officer password:");

  if (entered === OFFICER_PASSWORD) {
    localStorage.setItem("isOfficer", "true");
    alert("Officer access granted.");
    checkOfficerStatus();
  } else {
    alert("Incorrect password.");
  }
});

checkOfficerStatus();

async function loadPBs() {
  const listDiv = document.getElementById("pbList");
  listDiv.innerHTML = "Loading...";

  try {
    const res = await fetch(`${API_BASE}/pb-list`);
    if (!res.ok) {
      listDiv.innerHTML = "<p>Failed to load Port Battles.</p>";
      return;
    }

    const pbs = await res.json();

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

    <!-- OFFICER ONLY -->
    <a href="/pb/assign.html?id=${pb.id}" class="officerOnly assignBtn">Assign</a>
  </div>

  <!-- OFFICER ONLY -->
  <button class="pb-delete officerOnly deleteBtn" data-id="${pb.id}">Delete</button>
</div>
      `;
    });

    listDiv.innerHTML = html;

  } catch (err) {
    console.error(err);
    listDiv.innerHTML = "<p>Error loading Port Battles.</p>";
  }
}

// Show modal
document.getElementById("createPB").addEventListener("click", () => {
  document.getElementById("createModal").style.display = "block";
});

// Cancel modal
document.getElementById("createPBCancel").addEventListener("click", () => {
  document.getElementById("createModal").style.display = "none";
});

// Confirm creation
document.getElementById("createPBConfirm").addEventListener("click", async () => {
  const name = document.getElementById("pbName").value.trim();
  const date = document.getElementById("pbDate").value;
  const time = document.getElementById("pbTime").value;
  const br = parseInt(document.getElementById("pbBR").value, 10);
  const water = document.getElementById("pbWater").value;

  if (!name || !date || !time || !br) {
    alert("Please fill in all fields.");
    return;
  }

  const res = await fetch(`${API_BASE}/pb`, {
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
    window.location.href = `/pb/roster.html?id=${data.id}`;
  } else {
    alert("Failed to create Port Battle.");
  }
});

// DELETE PB
document.addEventListener("click", async (e) => {
  if (!e.target.classList.contains("deletePB")) return;

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

loadPBs();