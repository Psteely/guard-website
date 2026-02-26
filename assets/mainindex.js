document.addEventListener("DOMContentLoaded", () => {
  const usageBox = document.getElementById("cfUsage");
  if (!usageBox) return; // Page doesn't have the widget

  async function loadUsage() {
    try {
    const res = await fetch("https://pb-planner.peter-steely.workers.dev/api/usage");
      const data = await res.json();

      const percent = ((data.requests / data.limit) * 100).toFixed(1);

      usageBox.innerHTML = `
        <strong>Cloudflare Usage</strong><br>
        ${data.requests} / ${data.limit}<br>
        ${percent}% used today
      `;
    } catch (err) {
      usageBox.textContent = "Usage unavailable";
    }
  }

  loadUsage();
  setInterval(loadUsage, 5 * 60 * 1000);
});