// ArtisanLink — customer page logic
(() => {
  showModeBanner();

  const state = { trade: new URLSearchParams(location.search).get("trade") || "", coords: null, rating: 0, rateReq: null, poll: null };

  // ---------- Sign in ----------
  function start() {
    const s = Session.get();
    if (s?.role === "customer") {
      $("#signInView").classList.add("hidden");
      $("#appView").classList.remove("hidden");
      $("#whoBox").classList.remove("hidden");
      $("#whoName").textContent = s.name;
      renderTrades();
      fillAreaSelect($("#jobArea"));
      if (s.area) $("#jobArea").value = s.area;
      refreshMine();
      clearInterval(state.poll);
      state.poll = setInterval(refreshMine, 5000); // poll for artisan responses (SNS can replace this later)
    } else {
      $("#appView").classList.add("hidden");
      $("#whoBox").classList.add("hidden");
      $("#signInView").classList.remove("hidden");
    }
  }

  $("#signInForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const name = $("#cName").value.trim();
    const phone = normalisePhone($("#cPhone").value);
    if (name.length < 2) return toast("Please enter your name.");
    if (!phone) return toast("Enter a valid Ghana phone number, e.g. 0241234567.");
    if (!$("#cConsent").checked) return toast("Please accept the data notice to continue.");
    Session.set({ role: "customer", name, phone, consentAt: Date.now() });
    start();
  });

  $("#signOut").addEventListener("click", () => { clearInterval(state.poll); Session.clear(); start(); });

  // ---------- Tabs ----------
  document.querySelectorAll(".tabs button").forEach((b) =>
    b.addEventListener("click", () => switchTab(b.dataset.tab)));
  function switchTab(tab) {
    document.querySelectorAll(".tabs button").forEach((x) => x.classList.toggle("active", x.dataset.tab === tab));
    $("#newTab").classList.toggle("hidden", tab !== "newTab");
    $("#myTab").classList.toggle("hidden", tab !== "myTab");
    if (tab === "myTab") refreshMine();
  }

  // ---------- Step 1: job ----------
  function renderTrades() {
    $("#tradePicker").innerHTML = CONFIG.TRADES.map(
      (t) => `<button type="button" class="chip ${t === state.trade ? "active" : ""}" data-t="${esc(t)}">${esc(t)}</button>`
    ).join("");
    $("#tradePicker").querySelectorAll(".chip").forEach((c) =>
      c.addEventListener("click", () => { state.trade = c.dataset.t; renderTrades(); }));
  }

  $("#useGps").addEventListener("click", async () => {
    $("#gpsStatus").textContent = "Getting your location…";
    state.coords = await Geo.current();
    $("#gpsStatus").textContent = state.coords
      ? "Location found. Distances will be measured from where you are."
      : "Couldn't get your location. We'll use your selected area instead.";
  });

  function step(n) {
    ["#stepJob", "#stepPick", "#stepSent"].forEach((s, i) => $(s).classList.toggle("hidden", i !== n - 1));
    ["#st1", "#st2", "#st3"].forEach((s, i) => $(s).classList.toggle("on", i < n));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  $("#findBtn").addEventListener("click", async () => {
    if (!state.trade) return toast("Choose a service first.");
    if ($("#jobDesc").value.trim().length < 5) return toast("Please describe the job in a few words.");
    const area = $("#jobArea").value;
    if (!area && !state.coords) return toast("Select your area or use your current location.");
    const s = Session.get(); s.area = area; Session.set(s);

    const [lat, lng] = state.coords || CONFIG.AREAS[area];
    const btn = $("#findBtn");
    setBusy(btn, true, "Searching…");
    try {
      const list = await API.listArtisans({ trade: state.trade, lat, lng });
      renderArtisans(list);
      step(2);
    } catch (err) { toast(err.message); }
    finally { setBusy(btn, false); }
  });

  $("#backToJob").addEventListener("click", () => step(1));

  // ---------- Step 2: pick ----------
  function renderArtisans(list) {
    const available = list.filter((a) => a.status === "available").length;
    $("#pickTitle").textContent = `${state.trade}s near you`;
    $("#pickSummary").textContent = `${available} available now · ${list.length} total`;
    if (!list.length) {
      $("#artisanList").innerHTML = `<div class="empty">No ${esc(state.trade.toLowerCase())}s are online right now. Try another area or check back soon.</div>`;
      return;
    }
    $("#artisanList").innerHTML = list.map((a) => `
      <div class="artisan">
        <div class="avatar">${esc(initials(a.name))}</div>
        <div class="info">
          <div class="name">${esc(a.name)} ${a.verified ? '<span class="verified">✓ Verified</span>' : ""}</div>
          <div class="meta">
            ${esc(a.trade)}${a.distanceKm != null ? " · " + a.distanceKm + " km" : ""} · ${esc(a.area || "")}
            · ${a.rating ? "★ " + a.rating.toFixed(1) : "New"}${a.jobs ? " (" + a.jobs + " jobs)" : ""}
          </div>
          <span class="badge ${esc(a.status)}">${a.status === "available" ? "Available" : "Busy"}</span>
        </div>
        <button class="btn small" data-id="${esc(a.artisanId)}" ${a.status !== "available" ? "disabled" : ""}>Request</button>
      </div>`).join("");
    $("#artisanList").querySelectorAll("button[data-id]").forEach((b) =>
      b.addEventListener("click", () => sendRequest(b, list.find((a) => a.artisanId === b.dataset.id))));
  }

  async function sendRequest(btn, artisan) {
    const s = Session.get();
    const area = $("#jobArea").value;
    const [lat, lng] = state.coords || CONFIG.AREAS[area];
    setBusy(btn, true, "Sending…");
    try {
      await API.createRequest({
        artisanId: artisan.artisanId,
        customerName: s.name, customerPhone: s.phone,
        description: $("#jobDesc").value.trim(),
        urgency: $("#jobUrgency").value,
        area, address: $("#jobAddress").value.trim(), lat, lng
      });
      $("#sentText").textContent = `We've sent your request to ${artisan.name}. They can accept or decline.`;
      $("#jobDesc").value = ""; $("#jobAddress").value = "";
      step(3);
      refreshMine();
    } catch (err) { toast(err.message); setBusy(btn, false); }
  }

  $("#goMy").addEventListener("click", () => switchTab("myTab"));
  $("#newAgain").addEventListener("click", () => step(1));

  // ---------- My requests ----------
  const STATUS_TEXT = {
    pending: "Waiting for response", accepted: "Accepted, artisan is on the way",
    declined: "Declined", completed: "Completed", cancelled: "Cancelled"
  };

  let lastStatuses = {};
  async function refreshMine() {
    const s = Session.get(); if (!s) return;
    let list;
    try { list = await API.listRequests({ customerPhone: s.phone }); } catch (err) { return; }
    list.sort((a, b) => b.createdAt - a.createdAt);

    // Notify on status changes
    list.forEach((r) => {
      const prev = lastStatuses[r.requestId];
      if (prev && prev !== r.status) toast(`${r.artisanName}: ${STATUS_TEXT[r.status]}`);
      lastStatuses[r.requestId] = r.status;
    });

    const open = list.filter((r) => r.status === "pending" || r.status === "accepted").length;
    $("#pendingCount").textContent = open ? `(${open})` : "";

    if (!list.length) { $("#myList").innerHTML = '<div class="empty">No requests yet.</div>'; return; }
    $("#myList").innerHTML = list.map((r) => `
      <div class="request">
        <div class="head"><b>${esc(r.trade)} · ${esc(r.artisanName)}</b><span class="badge ${esc(r.status)}">${esc(r.status)}</span></div>
        <div class="desc">${esc(r.description)}</div>
        <div class="meta">${esc(STATUS_TEXT[r.status])} · ${timeAgo(r.createdAt)}
          ${r.urgency === "urgent" ? ' · <span class="urgent">Urgent</span>' : ""}</div>
        ${r.status === "accepted" ? `<div class="meta">Call: <a href="tel:${esc(r.artisanPhone)}">${esc(r.artisanPhone)}</a></div>` : ""}
        <div class="btn-row">
          ${r.status === "pending" ? `<button class="btn ghost small" data-cancel="${esc(r.requestId)}">Cancel</button>` : ""}
          ${r.status === "accepted" ? `<button class="btn small" data-done="${esc(r.requestId)}">Mark job done</button>` : ""}
          ${r.status === "completed" && !r.rating ? `<button class="btn small" data-rate="${esc(r.requestId)}">Rate job</button>` : ""}
          ${r.rating ? `<span class="meta">Your rating: ${"★".repeat(r.rating)}</span>` : ""}
        </div>
      </div>`).join("");

    $("#myList").querySelectorAll("[data-cancel]").forEach((b) => b.addEventListener("click", async () => {
      await API.updateRequest(b.dataset.cancel, "cancelled"); refreshMine();
    }));
    $("#myList").querySelectorAll("[data-done]").forEach((b) => b.addEventListener("click", async () => {
      await API.updateRequest(b.dataset.done, "completed"); openRating(list.find((r) => r.requestId === b.dataset.done));
    }));
    $("#myList").querySelectorAll("[data-rate]").forEach((b) => b.addEventListener("click", () =>
      openRating(list.find((r) => r.requestId === b.dataset.rate))));
  }

  // ---------- Rating ----------
  function openRating(req) {
    state.rateReq = req; state.rating = 0;
    $("#rateName").textContent = req.artisanName;
    $("#rateComment").value = "";
    drawStars();
    $("#appView").classList.add("hidden");
    $("#rateView").classList.remove("hidden");
  }
  function drawStars() {
    $("#stars").innerHTML = [1, 2, 3, 4, 5].map((n) =>
      `<button type="button" aria-label="${n} star${n > 1 ? "s" : ""}" class="${n <= state.rating ? "on" : ""}" data-n="${n}">★</button>`).join("");
    $("#stars").querySelectorAll("button").forEach((b) => b.addEventListener("click", () => { state.rating = +b.dataset.n; drawStars(); }));
  }
  function closeRating() {
    $("#rateView").classList.add("hidden"); $("#appView").classList.remove("hidden"); switchTab("myTab");
  }
  $("#rateCancel").addEventListener("click", closeRating);
  $("#rateSubmit").addEventListener("click", async () => {
    if (!state.rating) return toast("Tap a star to rate.");
    const btn = $("#rateSubmit"); setBusy(btn, true);
    try {
      await API.submitReview({ requestId: state.rateReq.requestId, artisanId: state.rateReq.artisanId,
        rating: state.rating, comment: $("#rateComment").value.trim() });
      toast("Thanks for your rating!"); closeRating();
    } catch (err) { toast(err.message); }
    finally { setBusy(btn, false); }
  });

  start();
})();
