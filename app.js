// ------------------------------------------------------
// 1. Mock data (current working dataset)
//    This keeps the UI alive and lets us build features
//    while we decide on a robust live-data strategy.
// ------------------------------------------------------
const mockResources = [
  {
    name: "Live Oak",
    ports: ["La Mona", "Savanna la Mar", "Mortimer Town"]
  },
  {
    name: "White Oak",
    ports: ["Port Morant", "La Tortue"]
  },
  {
    name: "Teak",
    ports: ["La Navasse", "Les Cayes", "Port-au-Prince"]
  },
  {
    name: "Iron Ore",
    ports: ["KPR", "Charlestown", "Willemstad"]
  }
];

// ------------------------------------------------------
// 2. Render function (works with any resource→ports map)
// ------------------------------------------------------
function renderResources(resourceMap) {
  const container = document.getElementById("resource-list");
  container.innerHTML = "";

  Object.entries(resourceMap).forEach(([resourceName, ports]) => {
    const div = document.createElement("div");
    div.className = "resource";

    div.innerHTML = `
      <h2>${resourceName}</h2>
      <ul class="port-list">
        ${ports.map(p => `<li>${p}</li>`).join("")}
      </ul>
    `;

    container.appendChild(div);
  });
}

// Build a map from the mock data
function buildMockResourceMap() {
  const map = {};
  mockResources.forEach(r => {
    map[r.name] = r.ports;
  });
  return map;
}

// ------------------------------------------------------
// 3. Status helper (for future data loading / errors)
// ------------------------------------------------------
function setStatus(message) {
  const statusEl = document.getElementById("status");
  if (statusEl) statusEl.textContent = message;
}

// ------------------------------------------------------
// 4. Boot: render current data model
// ------------------------------------------------------
function boot() {
  setStatus("Using local mock data (no live feed yet).");

  const mockMap = buildMockResourceMap();
  renderResources(mockMap);

  // NOTE:
  // When we have a robust, trustworthy live data source
  // (API, backend, or preprocessed JSON), we’ll:
  //  - add a loadLiveData() function here
  //  - swap mockMap for liveMap
  //  - keep the rest of the UI logic unchanged.
}

boot();