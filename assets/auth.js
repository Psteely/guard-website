// auth.js — Centralized officer authentication + version enforcement

const API_BASE = "https://pb-planner.peter-steely.workers.dev/api";

// ------------------------------
// CHECK IF OFFICER + VERSION MATCH
// ------------------------------
console.log("auth.js loaded");
export async function verifyOfficerStatus() {
  const isOfficer = localStorage.getItem("isOfficer") === "true";
  const storedVersion = localStorage.getItem("officerVersion");

  // Not logged in at all
  if (!isOfficer || !storedVersion) {
    return false;
  }

  // Check version mismatch (password changed)
  try {
    const res = await fetch(`${API_BASE}/officer/version`);
    const data = await res.json();

    console.log("Stored:", storedVersion, "Server:", data.version);

    if (Number(storedVersion) !== Number(data.version)) {
      // Password changed → force logout everywhere
      localStorage.removeItem("isOfficer");
      localStorage.removeItem("officerVersion");
      return false;
    }
  } catch (err) {
    console.error("Version check failed:", err);
    return false;
  }

  return true;
}

// ------------------------------
// REQUIRE OFFICER (redirect if not)
// ------------------------------

export async function requireOfficer() {
  const ok = await verifyOfficerStatus();

  if (!ok) {
    alert("Officer access required. Please log in again.");
    window.location.href = "/pb/index.html";
    return false;
  }

  return true;
}