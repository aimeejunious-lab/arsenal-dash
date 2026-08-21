/* Arsenal 26/27 — live fixtures/results/table from ESPN's public JSON API.
 * No API key, no build step. All fetches happen in the browser (ESPN allows CORS).
 * Supports two "sides": the men's and women's teams, switchable via the toggle.
 */

const API = "https://site.api.espn.com/apis/site/v2/sports/soccer";
const STANDINGS_API = "https://site.api.espn.com/apis/v2/sports/soccer";
const CACHE_KEY = "arsenal-dash-cache-v2";

// Each side has its own ESPN team id, league table, and competition list.
// Tabs only appear for competitions that currently have fixtures, so cup /
// European tabs surface automatically once those draws are made.
const SIDES = {
  men: {
    key: "men",
    label: "Men",
    teamId: "359",
    leagueName: "Premier League",
    standingsCode: "eng.1",
    competitions: [
      { code: "eng.1", name: "Premier League", short: "PL", hasTable: true },
      { code: "uefa.champions", name: "Champions League", short: "UCL" },
      { code: "uefa.europa", name: "Europa League", short: "UEL" },
      { code: "eng.fa", name: "FA Cup", short: "FA" },
      { code: "eng.league_cup", name: "Carabao Cup", short: "EFL" },
      { code: "eng.charity", name: "Community Shield", short: "CS" },
    ],
  },
  women: {
    key: "women",
    label: "Women",
    teamId: "19973",
    leagueName: "Women's Super League",
    standingsCode: "eng.w.1",
    competitions: [
      { code: "eng.w.1", name: "Women's Super League", short: "WSL", hasTable: true },
      { code: "uefa.wchampions", name: "Women's Champions League", short: "UWCL" },
      { code: "eng.w.fa", name: "Women's FA Cup", short: "FA" },
      { code: "eng.w.league_cup", name: "Women's League Cup", short: "LC" },
    ],
  },
};

const state = {
  side: "men",          // "men" | "women"
  active: "Summary",    // active tab
  data: {},             // side key -> { matches, standings, season, fromCache, ok }
};

function sideCfg() { return SIDES[state.side]; }
function cur() {
  return state.data[state.side] || { matches: [], standings: [], season: "", fromCache: false, ok: false };
}

/* ---------- data ---------- */

function logoFor(team) {
  if (!team) return "";
  if (team.logo) return team.logo;
  if (team.logos && team.logos[0]) return team.logos[0].href;
  return team.id ? `https://a.espncdn.com/i/teamlogos/soccer/500/${team.id}.png` : "";
}

function normalizeEvent(ev, comp, teamId) {
  const c = (ev.competitions && ev.competitions[0]) || {};
  const type = (c.status && c.status.type) || {};
  const completed = !!type.completed;
  const competitors = c.competitors || [];
  const us = competitors.find((x) => String(x.team.id) === teamId);
  const opp = competitors.find((x) => String(x.team.id) !== teamId);
  if (!us || !opp) return null;

  const isHome = us.homeAway === "home";
  const usScore = us.score != null && us.score !== "" ? Number(us.score) : null;
  const oppScore = opp.score != null && opp.score !== "" ? Number(opp.score) : null;

  let result = null;
  if (completed) {
    if (us.winner) result = "W";
    else if (opp.winner) result = "L";
    else result = "D";
  }

  return {
    id: ev.id,
    date: ev.date,
    ts: new Date(ev.date).getTime(),
    competition: comp.name,
    short: comp.short,
    venue: (c.venue && c.venue.fullName) || "",
    isHome,
    completed,
    result,
    statusDetail: type.shortDetail || type.detail || type.description || "",
    us: { name: us.team.displayName, id: us.team.id, logo: logoFor(us.team), score: usScore },
    opp: { name: opp.team.displayName, id: opp.team.id, logo: logoFor(opp.team), score: oppScore },
  };
}

async function fetchCompetition(comp, teamId) {
  try {
    const url = `${API}/${comp.code}/teams/${teamId}/schedule?fixture=true`;
    const res = await fetch(url);
    if (!res.ok) return { comp, events: [], season: "" };
    const data = await res.json();
    const season = (data.season && data.season.displayName) || "";
    const events = (data.events || [])
      .map((ev) => normalizeEvent(ev, comp, teamId))
      .filter(Boolean);
    return { comp, events, season };
  } catch (e) {
    return { comp, events: [], season: "" };
  }
}

async function fetchStandings(standingsCode, seasonYear, teamId) {
  try {
    const url = `${STANDINGS_API}/${standingsCode}/standings${seasonYear ? `?season=${seasonYear}` : ""}`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json();
    const group = (data.children && data.children[0]) || data;
    const entries = (group.standings && group.standings.entries) || [];
    return entries.map((e) => {
      const s = {};
      (e.stats || []).forEach((st) => (s[st.name] = st.value));
      return {
        rank: Number(s.rank) || null,
        team: e.team.displayName,
        logo: logoFor(e.team),
        isArsenal: String(e.team.id) === teamId,
        played: Number(s.gamesPlayed) || 0,
        wins: Number(s.wins) || 0,
        draws: Number(s.ties) || 0,
        losses: Number(s.losses) || 0,
        gf: Number(s.pointsFor) || 0,
        ga: Number(s.pointsAgainst) || 0,
        gd: Number(s.pointDifferential) || 0,
        points: Number(s.points) || 0,
      };
    });
  } catch (e) {
    return [];
  }
}

async function loadData(sideKey) {
  const side = SIDES[sideKey];
  const cacheKey = `${CACHE_KEY}-${sideKey}`;
  const results = await Promise.all(side.competitions.map((c) => fetchCompetition(c, side.teamId)));

  const matches = [];
  let season = "";
  let seasonYear = "";
  results.forEach((r) => {
    if (r.comp.hasTable && r.season) {
      season = r.season;
      const m = r.season.match(/(\d{4})/);
      if (m) seasonYear = m[1];
    }
    matches.push(...r.events);
  });

  const standings = await fetchStandings(side.standingsCode, seasonYear, side.teamId);

  if (matches.length) {
    try {
      localStorage.setItem(cacheKey, JSON.stringify({ matches, standings, season }));
    } catch (e) {}
    return { matches, standings, season, fromCache: false, ok: true };
  }

  // fall back to last good snapshot for this side if the live fetch was empty/failed
  try {
    const cached = JSON.parse(localStorage.getItem(cacheKey) || "null");
    if (cached && cached.matches && cached.matches.length) {
      return {
        matches: cached.matches,
        standings: cached.standings || [],
        season: cached.season || "",
        fromCache: true,
        ok: true,
      };
    }
  } catch (e) {}

  return { matches: [], standings: [], season: "", fromCache: false, ok: false };
}

/* ---------- helpers ---------- */

const byDateAsc = (a, b) => a.ts - b.ts;
const byDateDesc = (a, b) => b.ts - a.ts;

function fmtDate(iso) {
  return new Date(iso).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
}
function fmtTime(iso) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}
function competitionsWithData() {
  const present = new Set(cur().matches.map((m) => m.competition));
  return sideCfg().competitions.filter((c) => present.has(c.name));
}
function arsenalRow() {
  return cur().standings.find((r) => r.isArsenal) || null;
}
function record(matches) {
  const r = { W: 0, D: 0, L: 0 };
  matches.forEach((m) => {
    if (m.result) r[m.result]++;
  });
  return r;
}
function ordinal(n) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

/* ---------- rendering ---------- */

function matchCard(m) {
  const home = m.isHome ? m.us : m.opp;
  const away = m.isHome ? m.opp : m.us;
  const homeIsUs = m.isHome;
  const showScore = m.completed && home.score != null && away.score != null;

  const scoreCell = (val) =>
    showScore ? `<span class="score">${val}</span>` : `<span class="score dim"></span>`;

  const rightMeta = m.completed && m.result
    ? `<span class="result-tag ${m.result}">${m.result}</span>`
    : `<div class="d">${fmtTime(m.date)}</div>`;

  return `
    <div class="match">
      <div class="when"><span class="d">${fmtDate(m.date)}</span><br>${m.completed ? "FT" : fmtTime(m.date)}</div>
      <div class="teams">
        <div class="row">
          <img src="${home.logo}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">
          <span class="name ${homeIsUs ? "us" : ""}">${home.name}</span>
          ${scoreCell(home.score)}
        </div>
        <div class="row">
          <img src="${away.logo}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">
          <span class="name ${!homeIsUs ? "us" : ""}">${away.name}</span>
          ${scoreCell(away.score)}
        </div>
      </div>
      <div class="meta"><span class="comp-badge">${m.short}</span><br>${rightMeta}</div>
    </div>`;
}

function renderSummary() {
  const league = sideCfg().leagueName;
  const all = cur().matches;
  const upcoming = all.filter((m) => !m.completed).sort(byDateAsc);
  const past = all.filter((m) => m.completed).sort(byDateDesc);
  const next = upcoming[0];
  const last = past[0];
  const rec = record(past);
  const ars = arsenalRow();
  const form = past.slice(0, 5).reverse().map((m) => `<span class="${m.result}">${m.result}</span>`).join("");

  const cards = [];

  cards.push(`
    <div class="stat-card">
      <h3>Next match</h3>
      ${next
        ? `<div class="stat-big">${next.opp.name}</div>
           <div class="stat-sub">${next.isHome ? "Home" : "Away"} · ${next.short} · ${fmtDate(next.date)}, ${fmtTime(next.date)}</div>`
        : `<div class="stat-big">—</div><div class="stat-sub">No upcoming fixtures</div>`}
    </div>`);

  cards.push(`
    <div class="stat-card">
      <h3>Last result</h3>
      ${last
        ? `<div class="stat-big"><span class="result-tag ${last.result}">${last.result}</span> ${last.us.score}–${last.opp.score}</div>
           <div class="stat-sub">${last.isHome ? "vs" : "at"} ${last.opp.name} · ${last.short}</div>`
        : `<div class="stat-big">—</div><div class="stat-sub">No results yet</div>`}
    </div>`);

  cards.push(`
    <div class="stat-card">
      <h3>${league}</h3>
      ${ars && ars.rank
        ? `<div class="stat-big">${ordinal(ars.rank)}</div>
           <div class="stat-sub">${ars.points} pts · ${ars.played} played · GD ${ars.gd >= 0 ? "+" : ""}${ars.gd}</div>`
        : `<div class="stat-big">—</div><div class="stat-sub">Table not available yet</div>`}
    </div>`);

  cards.push(`
    <div class="stat-card">
      <h3>Record (all competitions)</h3>
      <div class="record">
        <div class="pill w"><small>Won</small>${rec.W}</div>
        <div class="pill d"><small>Drew</small>${rec.D}</div>
        <div class="pill l"><small>Lost</small>${rec.L}</div>
      </div>
      ${form ? `<div class="stat-sub" style="margin-top:12px">Form <span class="form-dots">${form}</span></div>` : ""}
    </div>`);

  const leagueRec = record(past.filter((m) => m.competition === league));
  cards.push(`
    <div class="stat-card">
      <h3>${league} Results</h3>
      <div class="record">
        <div class="pill w"><small>Won</small>${leagueRec.W}</div>
        <div class="pill d"><small>Drew</small>${leagueRec.D}</div>
        <div class="pill l"><small>Lost</small>${leagueRec.L}</div>
      </div>
    </div>`);

  const nextFive = upcoming.slice(0, 5).map(matchCard).join("") || `<div class="empty">No upcoming fixtures scheduled.</div>`;

  return `
    <div class="summary-grid">${cards.join("")}</div>
    <div class="section-title">Next up <span class="count">${upcoming.length} scheduled</span></div>
    ${nextFive}`;
}

function renderCompetition(name) {
  const ms = cur().matches.filter((m) => m.competition === name);
  const upcoming = ms.filter((m) => !m.completed).sort(byDateAsc);
  const past = ms.filter((m) => m.completed).sort(byDateDesc);

  let html = "";
  html += `<div class="section-title">Fixtures <span class="count">${upcoming.length}</span></div>`;
  html += upcoming.length ? upcoming.map(matchCard).join("") : `<div class="empty">No upcoming fixtures.</div>`;
  html += `<div class="section-title">Results <span class="count">${past.length}</span></div>`;
  html += past.length ? past.map(matchCard).join("") : `<div class="empty">No results yet.</div>`;
  return html;
}

function renderResults() {
  const league = sideCfg().leagueName;
  const past = cur().matches.filter((m) => m.completed).sort(byDateDesc);

  let html = `<div class="section-title">${league} table</div>`;
  if (cur().standings.length) {
    const rows = cur().standings
      .slice()
      .sort((a, b) => (a.rank || 99) - (b.rank || 99))
      .map(
        (r) => `
        <tr class="${r.isArsenal ? "us" : ""}">
          <td class="rank">${r.rank ?? ""}</td>
          <td class="team"><img src="${r.logo}" alt="" onerror="this.style.visibility='hidden'">${r.team}</td>
          <td>${r.played}</td><td>${r.wins}</td><td>${r.draws}</td><td>${r.losses}</td>
          <td>${r.gf}</td><td>${r.ga}</td><td>${r.gd >= 0 ? "+" : ""}${r.gd}</td>
          <td><strong>${r.points}</strong></td>
        </tr>`
      )
      .join("");
    html += `
      <div class="table-wrap">
        <table class="standings">
          <thead><tr>
            <th>#</th><th class="team">Club</th><th>P</th><th>W</th><th>D</th><th>L</th>
            <th>GF</th><th>GA</th><th>GD</th><th>Pts</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  } else {
    html += `<div class="empty">${league} table isn't available yet.</div>`;
  }

  html += `<div class="section-title">All results <span class="count">${past.length}</span></div>`;
  html += past.length ? past.map(matchCard).join("") : `<div class="empty">No completed matches yet this season.</div>`;
  return html;
}

function renderActive() {
  const content = document.getElementById("content");
  let body = "";
  if (state.active === "Summary") body = renderSummary();
  else if (state.active === "Results") body = renderResults();
  else body = renderCompetition(state.active);

  const note = cur().fromCache
    ? `<div class="cache-note">Couldn't reach ESPN just now — showing the last data this browser loaded.</div>`
    : "";
  content.innerHTML = note + body;
}

function renderTabs() {
  const tabs = document.getElementById("tabs");
  const names = ["Summary", ...competitionsWithData().map((c) => c.name), "Results"];
  tabs.innerHTML = names
    .map(
      (n) =>
        `<button class="tab" role="tab" aria-selected="${n === state.active}" data-tab="${n}">${n}</button>`
    )
    .join("");
  tabs.querySelectorAll(".tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.active = btn.dataset.tab;
      renderTabs();
      renderActive();
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  });
}

// Trophy cabinet (men's side). Generic, stylised cup/shield silhouettes — not
// replicas of the actual trademarked trophies. `won` lights it gold; otherwise
// it renders as a dark shadow. (Can be made data-driven later once completed
// results are pulled in and final wins can be detected.)
const TROPHIES = [
  {
    name: "Community Shield",
    won: true,
    // a shield
    svg: `<svg viewBox="0 0 64 84"><path d="M32 8 L54 16 V38 C54 55 44 66 32 73 C20 66 10 55 10 38 V16 Z"/><path d="M32 16 L47 21 V38 C47 51 40 59 32 65 C24 59 17 51 17 38 V21 Z" fill="none" stroke="currentColor" stroke-width="2" opacity=".45"/></svg>`,
  },
  {
    name: "FA Cup",
    won: false,
    // lidded cup with a figure/knob on top
    svg: `<svg viewBox="0 0 64 84"><circle cx="32" cy="7" r="3.2"/><rect x="30" y="9" width="4" height="4"/><path d="M22 22 C22 12 42 12 42 22 Z"/><path d="M23 24 H41 C41 36 37 45 32 47 C27 45 23 36 23 24 Z"/><path d="M23 27 C14 27 14 37 23 36" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round"/><path d="M41 27 C50 27 50 37 41 36" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round"/><rect x="29" y="47" width="6" height="8"/><rect x="23" y="55" width="18" height="4" rx="1"/><rect x="18" y="59" width="28" height="5" rx="2"/></svg>`,
  },
  {
    name: "Carabao Cup",
    won: false,
    // slim cup with tall looping handles
    svg: `<svg viewBox="0 0 64 84"><path d="M25 16 H39 C39 36 36 47 32 49 C28 47 25 36 25 16 Z"/><path d="M25 19 C12 15 14 40 26 38" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round"/><path d="M39 19 C52 15 50 40 38 38" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round"/><rect x="29" y="49" width="6" height="8"/><rect x="23" y="57" width="18" height="4" rx="1"/><rect x="18" y="61" width="28" height="4" rx="2"/></svg>`,
  },
  {
    name: "Premier League",
    won: false,
    // crowned cup
    svg: `<svg viewBox="0 0 64 84"><path d="M20 22 L23 9 L28 16 L32 7 L36 16 L41 9 L44 22 Z"/><path d="M22 24 H42 C42 37 38 46 32 48 C26 46 22 37 22 24 Z"/><path d="M22 27 C13 27 13 38 22 37" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round"/><path d="M42 27 C51 27 51 38 42 37" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round"/><rect x="29" y="48" width="6" height="8"/><rect x="23" y="56" width="18" height="4" rx="1"/><rect x="18" y="60" width="28" height="5" rx="2"/></svg>`,
  },
  {
    name: "Champions League",
    won: false,
    // tall cup with big "ears" handles
    svg: `<svg viewBox="0 0 64 84"><path d="M22 16 H42 C42 34 38 46 32 48 C26 46 22 34 22 16 Z"/><path d="M22 18 C4 14 4 44 22 40" fill="none" stroke="currentColor" stroke-width="4"/><path d="M42 18 C60 14 60 44 42 40" fill="none" stroke="currentColor" stroke-width="4"/><rect x="29" y="48" width="6" height="8"/><rect x="22" y="56" width="20" height="4" rx="1"/><rect x="17" y="60" width="30" height="5" rx="2"/></svg>`,
  },
];

function renderTrophies() {
  const el = document.getElementById("trophies");
  if (!el) return;
  if (state.side !== "men") { el.innerHTML = ""; return; } // men's cabinet only
  el.innerHTML = TROPHIES.map(
    (t) =>
      `<span class="trophy ${t.won ? "lit" : "shadow"}" title="${t.name}${t.won ? " — won 🏆" : ""}" role="img" aria-label="${t.name}${t.won ? ", won" : ", not yet won"}">${t.svg}</span>`
  ).join("");
}

function renderSideToggle() {
  const el = document.getElementById("sideToggle");
  if (!el) return;
  el.innerHTML = Object.values(SIDES)
    .map(
      (s) =>
        `<button class="side-btn" data-side="${s.key}" aria-pressed="${s.key === state.side}">${s.label}</button>`
    )
    .join("");
  el.querySelectorAll(".side-btn").forEach((btn) => {
    btn.addEventListener("click", () => selectSide(btn.dataset.side));
  });
}

/* ---------- boot / side switching ---------- */

async function selectSide(sideKey) {
  if (!SIDES[sideKey]) return;
  // clicking the already-active, already-loaded side does nothing
  if (sideKey === state.side && state.data[sideKey]) return;

  state.side = sideKey;
  state.active = "Summary";
  renderSideToggle();

  const updated = document.getElementById("updated");
  const content = document.getElementById("content");
  const tabs = document.getElementById("tabs");

  if (!state.data[sideKey]) {
    tabs.innerHTML = "";
    updated.textContent = "Loading…";
    content.innerHTML = `<div class="loading">Loading Arsenal ${SIDES[sideKey].label}'s fixtures…</div>`;
    state.data[sideKey] = await loadData(sideKey);
  }

  const d = state.data[sideKey];
  if (!d.ok) {
    updated.textContent = "Offline";
    tabs.innerHTML = "";
    content.innerHTML = `<div class="error">Couldn't load Arsenal ${SIDES[sideKey].label}'s data from ESPN. Refresh to try again.</div>`;
    return;
  }

  updated.textContent = `updated ${new Date().toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}`;
  renderTrophies();
  renderTabs();
  renderActive();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

async function main() {
  renderSideToggle();
  await selectSide("men");
}

main();
