// ArtisanLink — data layer
// Every page talks to the backend ONLY through the functions in `API`.
// - DEMO mode (CONFIG.API_BASE_URL empty): uses localStorage so the whole flow works offline.
// - LIVE mode: calls API Gateway -> Lambda -> DynamoDB using the REST routes listed below.
//
// REST routes the Lambda team should implement (JSON in, JSON out):
//   GET    /artisans?trade=Plumber&lat=5.6&lng=-0.18     -> [Artisan] (available first, sorted by distance)
//   POST   /artisans                                      -> Artisan        (register)
//   GET    /artisans/{artisanId}                          -> Artisan
//   PATCH  /artisans/{artisanId}  { status }              -> Artisan        ("available" | "busy" | "offline")
//   POST   /requests                                      -> Request
//   GET    /requests?customerPhone=...  or ?artisanId=... -> [Request]
//   PATCH  /requests/{requestId}  { status }              -> Request        ("accepted" | "declined" | "completed" | "cancelled")
//   POST   /reviews  { requestId, artisanId, rating, comment } -> Review

const API = (() => {
  const LIVE = Boolean(CONFIG.API_BASE_URL);

  // ---------- LIVE mode ----------
  async function http(method, path, body) {
    const headers = { "Content-Type": "application/json" };
    const token = Session.get()?.idToken; // set once Cognito sign-in is wired up
    if (token) headers.Authorization = token;
    const res = await fetch(CONFIG.API_BASE_URL.replace(/\/$/, "") + path, {
      method, headers, body: body ? JSON.stringify(body) : undefined
    });
    if (!res.ok) {
      let msg = `Request failed (${res.status})`;
      try { msg = (await res.json()).message || msg; } catch (_) {}
      throw new Error(msg);
    }
    return res.status === 204 ? null : res.json();
  }

  // ---------- DEMO mode (localStorage) ----------
  const KEY = "artisanlink_demo_db_v1";
  const SEED = [
    { name: "Kofi Mensah", trade: "Plumber", area: "Osu", rating: 4.8, jobs: 41, verified: true },
    { name: "Yaw Asante", trade: "Plumber", area: "Achimota", rating: 4.5, jobs: 18, verified: false },
    { name: "Ama Owusu", trade: "Tailor", area: "Madina", rating: 4.9, jobs: 63, verified: true },
    { name: "Esi Boateng", trade: "Tailor", area: "Accra Central", rating: 4.4, jobs: 12, verified: false },
    { name: "Kwame Darko", trade: "Electrician", area: "East Legon", rating: 4.7, jobs: 35, verified: true },
    { name: "Fiifi Quaye", trade: "Electrician", area: "Dansoman", rating: 4.2, jobs: 9, verified: false, status: "busy" },
    { name: "Kojo Addo", trade: "Carpenter", area: "Tema", rating: 4.6, jobs: 27, verified: true },
    { name: "Nii Armah", trade: "Mason", area: "Kasoa", rating: 4.3, jobs: 15, verified: false },
    { name: "Akosua Frimpong", trade: "Painter", area: "East Legon", rating: 4.7, jobs: 22, verified: true },
    { name: "Selorm Agbeko", trade: "Mechanic", area: "Achimota", rating: 4.5, jobs: 30, verified: true },
    { name: "Ibrahim Mohammed", trade: "AC Technician", area: "Osu", rating: 4.6, jobs: 19, verified: false }
  ];

  let memoryDb = null; // fallback if localStorage is blocked
  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) return JSON.parse(raw);
    } catch (_) { if (memoryDb) return memoryDb; }
    const db = {
      artisans: SEED.map((a, i) => ({
        artisanId: "seed-" + (i + 1), phone: "02400000" + String(i + 10),
        lat: CONFIG.AREAS[a.area][0] + (Math.random() - 0.5) * 0.02,
        lng: CONFIG.AREAS[a.area][1] + (Math.random() - 0.5) * 0.02,
        status: a.status || "available", seed: true, ...a
      })),
      requests: [], reviews: []
    };
    save(db);
    return db;
  }
  function save(db) {
    memoryDb = db;
    try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (_) {}
  }
  const id = (p) => p + "-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const wait = (ms = 350) => new Promise((r) => setTimeout(r, ms)); // feel of a network call

  // Seeded (pretend) artisans respond on their own so a solo demo works end-to-end.
  function simulateSeedArtisans(db) {
    let changed = false;
    for (const r of db.requests) {
      const a = db.artisans.find((x) => x.artisanId === r.artisanId);
      if (a?.seed && r.status === "pending" && Date.now() - r.createdAt > 5000) {
        r.status = "accepted"; r.updatedAt = Date.now(); a.status = "busy"; changed = true;
      }
    }
    if (changed) save(db);
  }

  const demo = {
    async listArtisans({ trade, lat, lng }) {
      await wait();
      const db = load();
      return db.artisans
        .filter((a) => (!trade || a.trade === trade) && a.status !== "offline")
        .map((a) => ({ ...a, distanceKm: lat != null ? Geo.km(lat, lng, a.lat, a.lng) : null }))
        .sort((x, y) => (x.status === "available" ? 0 : 1) - (y.status === "available" ? 0 : 1) || (x.distanceKm ?? 0) - (y.distanceKm ?? 0));
    },
    async registerArtisan(data) {
      await wait();
      const db = load();
      const existing = db.artisans.find((a) => a.phone === data.phone);
      if (existing) { Object.assign(existing, data); save(db); return existing; }
      const a = { artisanId: id("art"), rating: 0, jobs: 0, verified: false, status: "offline", ...data };
      db.artisans.push(a); save(db); return a;
    },
    async getArtisan(artisanId) {
      await wait(150);
      return load().artisans.find((a) => a.artisanId === artisanId) || null;
    },
    async findArtisanByPhone(phone) {
      await wait(150);
      return load().artisans.find((a) => a.phone === phone) || null;
    },
    async setArtisanStatus(artisanId, status) {
      await wait(200);
      const db = load(); const a = db.artisans.find((x) => x.artisanId === artisanId);
      if (!a) throw new Error("Artisan not found");
      a.status = status; save(db); return a;
    },
    async createRequest(data) {
      await wait();
      const db = load();
      const a = db.artisans.find((x) => x.artisanId === data.artisanId);
      if (!a || a.status !== "available") throw new Error("That artisan is no longer available. Please pick another.");
      const r = { requestId: id("req"), status: "pending", createdAt: Date.now(), updatedAt: Date.now(),
        artisanName: a.name, artisanPhone: a.phone, trade: a.trade, ...data };
      db.requests.unshift(r); save(db); return r;
    },
    async listRequests({ customerPhone, artisanId }) {
      await wait(200);
      const db = load(); simulateSeedArtisans(db);
      return db.requests.filter((r) => (customerPhone && r.customerPhone === customerPhone) || (artisanId && r.artisanId === artisanId));
    },
    async updateRequest(requestId, status) {
      await wait(250);
      const db = load(); const r = db.requests.find((x) => x.requestId === requestId);
      if (!r) throw new Error("Request not found");
      r.status = status; r.updatedAt = Date.now();
      const a = db.artisans.find((x) => x.artisanId === r.artisanId);
      if (a) {
        if (status === "accepted") a.status = "busy";
        if (status === "completed") { a.status = "available"; a.jobs = (a.jobs || 0) + 1; }
        if (status === "cancelled" && a.status === "busy") a.status = "available";
      }
      save(db); return r;
    },
    async submitReview({ requestId, artisanId, rating, comment }) {
      await wait();
      const db = load();
      db.reviews.push({ reviewId: id("rev"), requestId, artisanId, rating, comment, createdAt: Date.now() });
      const r = db.requests.find((x) => x.requestId === requestId); if (r) r.rating = rating;
      const a = db.artisans.find((x) => x.artisanId === artisanId);
      if (a) {
        const mine = db.reviews.filter((v) => v.artisanId === artisanId).map((v) => v.rating);
        const base = a.seed ? [a.rating, a.rating, a.rating] : []; // keep seed ratings stable
        const all = base.concat(mine);
        a.rating = Math.round((all.reduce((s, n) => s + n, 0) / all.length) * 10) / 10;
      }
      save(db); return { ok: true };
    },
    resetDemo() { try { localStorage.removeItem(KEY); } catch (_) {} memoryDb = null; }
  };

  const live = {
    listArtisans: ({ trade, lat, lng }) => {
      const q = new URLSearchParams({ trade });
      if (lat != null) { q.set("lat", lat); q.set("lng", lng); }
      return http("GET", "/artisans?" + q);
    },
    registerArtisan: (data) => http("POST", "/artisans", data),
    getArtisan: (artisanId) => http("GET", "/artisans/" + encodeURIComponent(artisanId)),
    findArtisanByPhone: (phone) => http("GET", "/artisans?phone=" + encodeURIComponent(phone)).then((l) => (Array.isArray(l) ? l[0] : l) || null),
    setArtisanStatus: (artisanId, status) => http("PATCH", "/artisans/" + encodeURIComponent(artisanId), { status }),
    createRequest: (data) => http("POST", "/requests", data),
    listRequests: ({ customerPhone, artisanId }) =>
      http("GET", "/requests?" + new URLSearchParams(customerPhone ? { customerPhone } : { artisanId })),
    updateRequest: (requestId, status) => http("PATCH", "/requests/" + encodeURIComponent(requestId), { status }),
    submitReview: (data) => http("POST", "/reviews", data),
    resetDemo() {}
  };

  return { LIVE, ...(LIVE ? live : demo) };
})();
