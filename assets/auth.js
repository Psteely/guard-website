// assets/auth.js — shared officer authentication module

const API_BASE = "https://pb-planner.peter-steely.workers.dev/api";

export async function fetchOfficerVersion() {
  const res = await fetch(`${API_BASE}/officer/version`);
  if (!res.ok) return null;
  return res.json();
}

export async function verifyOfficerStatus() {
  const isOfficer = localStorage.getItem("isOfficer") === "true";
  const localVersion = Number(localStorage.getItem("officerVersion") || 0);

  const server = await fetchOfficerVersion();
  if (!server) return false;

  if (isOfficer && localVersion !== server.version) {
    localStorage.removeItem("isOfficer");
    localStorage.removeItem("officerVersion");
    alert("Officer password has been changed. Please re-enter the new password.");
    return false;
  }

  return isOfficer;
}

export async function requireOfficer() {
  const ok = await verifyOfficerStatus();
  if (!ok) {
    alert("Officer access required.");
    window.location.href = "/pb/index.html";
  }
}

export async function getOfficerPassword() {
  const entered = prompt("Enter officer password:");
  if (!entered) return null;

  const res = await fetch(`${API_BASE}/officer/check`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password: entered })
  });

  const data = await res.json();

  if (data.ok) {
    localStorage.setItem("isOfficer", "true");
    localStorage.setItem("officerVersion", data.version);
    return entered;
  }

  alert("Incorrect password.");
  return null;
}

export async function changeOfficerPassword() {
  const oldPassword = prompt("Enter CURRENT officer password:");
  if (!oldPassword) return;

  const newPassword = prompt("Enter NEW officer password:");
  if (!newPassword) return;

  const confirmPassword = prompt("Confirm NEW officer password:");
  if (newPassword !== confirmPassword) {
    alert("Passwords do not match.");
    return;
  }

  const res = await fetch(`${API_BASE}/officer/password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ oldPassword, newPassword })
  });

  const data = await res.json();

  if (data.ok) {
    alert("Officer password updated. All officers must log in again.");
    localStorage.removeItem("isOfficer");
    localStorage.removeItem("officerVersion");
    window.location.reload();
  } else {
    alert("Failed to update password.");
  }
}