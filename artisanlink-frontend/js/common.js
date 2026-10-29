// ArtisanLink — helpers shared by every page

// Who is signed in (kept in this browser). Replace with Cognito tokens later.
// Separate keys per role so a customer tab and an artisan tab can run side by side.
const Session = {
  KEY: "artisanlink_session_" + (location.pathname.includes("artisan.html") ? "artisan" : "customer"),
  get() { try { return JSON.parse(localStorage.getItem(this.KEY)); } catch (_) { return this._mem || null; } },
  set(v) { this._mem = v; try { localStorage.setItem(this.KEY, JSON.stringify(v)); } catch (_) {} },
  clear() { this._mem = null; try { localStorage.removeItem(this.KEY); } catch (_) {} }
};

const Geo = {
  // Great-circle distance in km (haversine)
  km(lat1, lng1, lat2, lng2) {
    const R = 6371, rad = (d) => (d * Math.PI) / 180;
    const dLat = rad(lat2 - lat1), dLng = rad(lng2 - lng1);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
    return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * 10) / 10;
  },
  // Try GPS; resolve null if refused or slow
  current() {
    return new Promise((resolve) => {
      if (!navigator.geolocation) return resolve(null);
      navigator.geolocation.getCurrentPosition(
        (p) => resolve([p.coords.latitude, p.coords.longitude]),
        () => resolve(null),
        { timeout: 6000, maximumAge: 300000 }
      );
    });
  }
};

const $ = (sel, root = document) => root.querySelector(sel);

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function initials(name) {
  return String(name || "?").trim().split(/\s+/).slice(0, 2).map((w) => w[0].toUpperCase()).join("");
}

function timeAgo(ms) {
  const s = Math.floor((Date.now() - ms) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return Math.floor(s / 60) + " min ago";
  if (s < 86400) return Math.floor(s / 3600) + " h ago";
  return new Date(ms).toLocaleDateString();
}

function toast(msg) {
  let t = $("#toast");
  if (!t) { t = document.createElement("div"); t.id = "toast"; t.className = "toast"; t.setAttribute("role", "status"); document.body.appendChild(t); }
  t.textContent = msg; t.classList.add("show");
  clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove("show"), 2800);
}

// Ghana mobile numbers: 0XXXXXXXXX or +233XXXXXXXXX -> stored as 0XXXXXXXXX
function normalisePhone(v) {
  let p = String(v || "").replace(/[\s-]/g, "");
  if (p.startsWith("+233")) p = "0" + p.slice(4);
  else if (p.startsWith("233")) p = "0" + p.slice(3);
  return /^0\d{9}$/.test(p) ? p : null;
}

function fillAreaSelect(select) {
  select.innerHTML = '<option value="">Select your area</option>' +
    Object.keys(CONFIG.AREAS).map((a) => `<option>${esc(a)}</option>`).join("");
}

function fillTradeSelect(select) {
  select.innerHTML = '<option value="">Select your trade</option>' +
    CONFIG.TRADES.map((t) => `<option>${esc(t)}</option>`).join("");
}

function showModeBanner() {
  if (API.LIVE) return;
  const b = document.createElement("div");
  b.className = "mode-banner";
  b.innerHTML = 'Demo mode: data is saved in this browser only. <a href="#" id="resetDemo">Reset demo data</a>';
  document.body.prepend(b);
  $("#resetDemo").addEventListener("click", (e) => {
    e.preventDefault();
    if (confirm("Clear all demo artisans, requests and sign-ins?")) { API.resetDemo();
      try { ["customer", "artisan"].forEach((r) => localStorage.removeItem("artisanlink_session_" + r)); } catch (_) {}
      location.href = "index.html"; }
  });
}

function setBusy(btn, busy, label) {
  if (busy) { btn.dataset.label = btn.textContent; btn.textContent = label || "Please wait…"; btn.disabled = true; }
  else { btn.textContent = btn.dataset.label || btn.textContent; btn.disabled = false; }
}
