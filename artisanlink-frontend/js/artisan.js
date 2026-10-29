// ArtisanLink — artisan dashboard logic
(() => {
  showModeBanner();

  const state = { mode: "register", tab: "incoming", me: null, requests: [], poll: null, seen: new Set() };
  fillTradeSelect($("#aTrade"));
  fillAreaSelect($("#aArea"));

  // ---------- Register / sign in ----------
  document.querySelectorAll("#regView .tabs button").forEach((b) => b.addEventListener("click", () => {
    state.mode = b.dataset.mode;
    document.querySelectorAll("#regView .tabs button").forEach((x) => x.classList.toggle("active", x === b));
    const reg = state.mode === "register";
    $("#regFields").classList.toggle("hidden", !reg);
    $("#aConsentBox").classList.toggle("hidden", !reg);
    $("#regBtn").textContent = reg ? "Create my profile" : "Sign in";
  }));

  $("#regForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const phone = normalisePhone($("#aPhone").value);
    if (!phone) return toast("Enter a valid Ghana phone number, e.g. 0241234567.");
    const btn = $("#regBtn"); setBusy(btn, true);
    try {
      let me;
      if (state.mode === "login") {
        me = await API.findArtisanByPhone(phone);
        if (!me) throw new Error("No profile found for that number. Please register.");
      } else {
        const name = $("#aName").value.trim(), trade = $("#aTrade").value, area = $("#aArea").value;
        if (name.length < 2 || !trade || !area) throw new Error("Please fill in your name, trade and area.");
        if (!$("#aConsent").checked) throw new Error("Please accept the data notice to continue.");
        const [lat, lng] = CONFIG.AREAS[area];
        me = await API.registerArtisan({ name, phone, trade, area, lat, lng, consentAt: Date.now() });
        toast("Profile created. Go online to start receiving requests.");
      }
      Session.set({ role: "artisan", artisanId: me.artisanId, name: me.name, phone: me.phone });
      start();
    } catch (err) { toast(err.message); }
    finally { setBusy(btn, false); }
  });

  $("#signOut").addEventListener("click", () => {
    clearInterval(state.poll); Session.clear(); state.seen.clear(); state.loaded = false; start();
  });

  // ---------- Dashboard ----------
  async function start() {
    const s = Session.get();
    if (s?.role !== "artisan") {
      $("#dashView").classList.add("hidden"); $("#whoBox").classList.add("hidden");
      $("#regView").classList.remove("hidden");
      return;
    }
    state.me = await API.getArtisan(s.artisanId).catch(() => null);
    if (!state.me) { Session.clear(); return start(); }

    $("#regView").classList.add("hidden");
    $("#dashView").classList.remove("hidden");
    $("#whoBox").classList.remove("hidden");
    $("#whoName").textContent = state.me.name;
    renderProfile();
    await refresh();
    clearInterval(state.poll);
    state.poll = setInterval(refresh, 4000);
  }

  function renderProfile() {
    const me = state.me;
    $("#profName").textContent = me.name;
    $("#profMeta").textContent = `${me.trade} · ${me.area} · ${me.rating ? "★ " + me.rating.toFixed(1) : "No ratings yet"} · ${me.jobs || 0} jobs`;
    $("#onlineToggle").checked = me.status !== "offline";
    const b = $("#statusBadge");
    b.className = "badge " + me.status;
    b.textContent = { available: "Available", busy: "Busy", offline: "Offline" }[me.status];
    $("#statusHint").textContent = {
      available: "Customers nearby can see you and send requests.",
      busy: "You're on a job. Mark it complete to become available again.",
      offline: "You're hidden from customers. Switch on when you're ready for work."
    }[me.status];
  }

  $("#onlineToggle").addEventListener("change", async (e) => {
    const want = e.target.checked ? "available" : "offline";
    try {
      state.me = await API.setArtisanStatus(state.me.artisanId, want);
      renderProfile();
      toast(want === "available" ? "You're online." : "You're offline.");
    } catch (err) { e.target.checked = !e.target.checked; toast(err.message); }
  });

  document.querySelectorAll("#dashView .tabs button").forEach((b) => b.addEventListener("click", () => {
    state.tab = b.dataset.tab;
    document.querySelectorAll("#dashView .tabs button").forEach((x) => x.classList.toggle("active", x === b));
    renderJobs();
  }));

  async function refresh() {
    try {
      const [me, reqs] = await Promise.all([
        API.getArtisan(state.me.artisanId),
        API.listRequests({ artisanId: state.me.artisanId })
      ]);
      state.me = me; state.requests = reqs.sort((a, b) => b.createdAt - a.createdAt);
    } catch (_) { return; }

    const incoming = state.requests.filter((r) => r.status === "pending");
    if (state.loaded) {
      incoming.filter((r) => !state.seen.has(r.requestId))
        .forEach((r) => toast(`New request from ${r.customerName}`));
    }
    state.requests.forEach((r) => state.seen.add(r.requestId));
    state.loaded = true;

    $("#incomingCount").textContent = incoming.length ? `(${incoming.length})` : "";
    renderProfile();
    renderJobs();
  }

  function renderJobs() {
    const pick = {
      incoming: (r) => r.status === "pending",
      active: (r) => r.status === "accepted",
      history: (r) => ["completed", "declined", "cancelled"].includes(r.status)
    }[state.tab];
    const list = state.requests.filter(pick);
    const emptyText = {
      incoming: state.me.status === "offline" ? "You're offline. Go online to receive requests." : "No new requests yet. They'll appear here automatically.",
      active: "No active jobs.",
      history: "Completed and past jobs will show here."
    }[state.tab];
    if (!list.length) { $("#jobList").innerHTML = `<div class="empty">${emptyText}</div>`; return; }

    $("#jobList").innerHTML = list.map((r) => `
      <div class="request">
        <div class="head"><b>${esc(r.customerName)}</b><span class="badge ${esc(r.status)}">${esc(r.status)}</span></div>
        <div class="desc">${esc(r.description)}</div>
        <div class="meta">
          📍 ${esc(r.area || "")}${r.address ? " · " + esc(r.address) : ""}
          ${r.lat != null && state.me.lat != null ? " · " + Geo.km(state.me.lat, state.me.lng, r.lat, r.lng) + " km away" : ""}
        </div>
        <div class="meta">${timeAgo(r.createdAt)} · ${r.urgency === "urgent" ? '<span class="urgent">Urgent</span>' : r.urgency === "today" ? "Today" : "Within a few days"}
          ${r.rating ? " · Rated " + "★".repeat(r.rating) : ""}</div>
        ${r.status === "accepted" ? `<div class="meta">Customer: <a href="tel:${esc(r.customerPhone)}">${esc(r.customerPhone)}</a></div>` : ""}
        <div class="btn-row">
          ${r.status === "pending" ? `
            <button class="btn small" data-act="accepted" data-id="${esc(r.requestId)}">Accept</button>
            <button class="btn danger small" data-act="declined" data-id="${esc(r.requestId)}">Decline</button>` : ""}
          ${r.status === "accepted" ? `
            <button class="btn small" data-act="completed" data-id="${esc(r.requestId)}">Mark complete</button>` : ""}
        </div>
      </div>`).join("");

    $("#jobList").querySelectorAll("button[data-act]").forEach((b) => b.addEventListener("click", async () => {
      if (b.dataset.act === "accepted" && state.requests.some((r) => r.status === "accepted"))
        if (!confirm("You already have an active job. Accept this one too?")) return;
      setBusy(b, true);
      try {
        await API.updateRequest(b.dataset.id, b.dataset.act);
        toast({ accepted: "Request accepted. Call the customer to confirm.", declined: "Request declined.", completed: "Job marked complete. You're available again." }[b.dataset.act]);
        await refresh();
      } catch (err) { toast(err.message); setBusy(b, false); }
    }));
  }

  start();
})();
