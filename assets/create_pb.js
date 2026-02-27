// create_pb.js

console.log("create_pb.js loaded");

import { API_BASE } from "./config.js";
//const API_BASE = "http://127.0.0.1:8787/api";
//const API_BASE = "https://pb-planner.peter-steely.workers.dev/api";


document.getElementById("createForm").addEventListener("submit", async (e) => {
  e.preventDefault();

  const name = document.getElementById("name").value;

  const res = await fetch(`${API_BASE}/pb`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name })
  });

  const data = await res.json();

  if (data.ok) {
    window.location.href = `/pb/roster.html?id=${data.id}`;
  } else {
    alert("Failed to create Port Battle.");
  }
});