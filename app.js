/* Arsenal Dash — live fixtures/results/table from ESPN's public JSON API.
 * No API key, no build step. All fetches happen in the browser (ESPN allows CORS).
 */

const TEAM_ID = "359"; // Arsenal on ESPN
const API = "https://site.api.espn.com/apis/site/v2/sports/soccer";
const STANDINGS_API = "https://site.api.espn.com/apis/v2/sports/soccer";
const CACHE_KEY = "arsenal-dash-cache-v1";

// Order matters: Premier League first. Tabs only appear for competitions that
// currently have fixtures, so cup/European tabs surface automatically once drawn.
const COMPETITIONS = [
  { code: "eng.1", name: "Premier League", short: "PL", hasTable: true },
  { code: "uefa.champions", name: "Champions League", short: "UCL" },
  { code: "uefa.europa", name: "Europa League", short: "UEL" },
  { code: "eng.fa", name: "FA Cup", short: "FA" },
  { code: "eng.league_cup", name: "Carabao Cup", short: "EFL" },
  { code: "eng.charity", name: "Community Shield", short: "CS" },
];

const state = { matches: [], standings: [], season: "", table: null, active: "Summary", fromCache: false };

/* ---------- data ---------- */

function logoFor(team) {
  if (!team) return "";
  if (team.logo) return team.logo;
  if (team.logos && team.logos[0]) return team.logos[0].href;
  return team.id ? `https://a.espncdn.com/i/teamlogos/soccer/500/${team.id}.png` : "";
}

function normalizeEvent(ev, comp) {
  const c = (ev.competitions && ev.competitions[0]) || {};
  const type = (c.status && c.status.type) || {};
  const completed = !!type.completed;
  const competitors = c.competitors || [];
  const us = competitors.find((x) => String(x.team.id) === TEAM_ID);
  const opp = competitors.find((x) => String(x.team.id) !== TEAM_ID);
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

async function fetchCompetition(comp) {
  try {
    const url = `${API}/${comp.code}/teams/${TEAM_ID}/schedule?fixture=true`;
    const res = await fetch(url);
    if (!res.ok) return { comp, events: [], season: "" };
    const data = await res.json();
    const season = (data.season && data.season.displayName) || "";
    const events = (data.events || [])
      .map((ev) => normalizeEvent(ev, comp))
      .filter(Boolean);
    return { comp, events, season };
  } catch (e) {
    return { comp, events: [], season: "" };
  }
}

async function fetchStandings(seasonYear) {
  try {
    const url = `${STANDINGS_API}/eng.1/standings${seasonYear ? `?season=${seasonYear}` : ""}`;
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
        isArsenal: String(e.team.id) === TEAM_ID,
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

async function loadData() {
  const results = await Promise.all(COMPETITIONS.map(fetchCompetition));
  const matches = [];
  let season = "";
  let seasonYear = "";
  results.forEach((r) => {
    if (r.comp.code === "eng.1" && r.season) {
      season = r.season;
      const m = r.season.match(/(\d{4})/);
      if (m) seasonYear = m[1];
    }
    matches.push(...r.events);
  });

  const standings = await fetchStandings(seasonYear);

  if (matches.length) {
    state.matches = matches;
    state.standings = standings;
    state.season = season;
    state.fromCache = false;
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({ matches, standings, season, savedAt: Date.now() }));
    } catch (e) {}
    return true;
  }

  // fall back to last good snapshot if the live fetch came back empty/failed
  try {
    const cached = JSON.parse(localStorage.getItem(CACHE_KEY) || "null");
    if (cached && cached.matches && cached.matches.length) {
      state.matches = cached.matches;
      state.standings = cached.standings || [];
      state.season = cached.season || "";
      state.fromCache = true;
      return true;
    }
  } catch (e) {}
  return false;
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
  const present = new Set(state.matches.map((m) => m.competition));
  return COMPETITIONS.filter((c) => present.has(c.name));
}
function arsenalRow() {
  return state.standings.find((r) => r.isArsenal) || null;
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
  const all = state.matches;
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
        ? `<div class="stat-big">${(next.isHome ? next.opp : next.opp).name}</div>
           <div class="stat-sub">${next.isHome ? "Home" : "Away"} · ${next.short} · ${fmtDate(next.date)}, ${fmtTime(next.date)}</div>`
        : `<div class="stat-big">—</div><div class="stat-sub">No upcoming fixtures</div>`}
    </div>`);

  cards.push(`
    <div class="stat-card">
      <h3>Last result</h3>
      ${last
        ? `<div class="stat-big"><span class="result-tag ${last.result}">${last.result}</span> ${last.isHome ? `${last.us.score}–${last.opp.score}` : `${last.us.score}–${last.opp.score}`}</div>
           <div class="stat-sub">${last.isHome ? "vs" : "at"} ${last.opp.name} · ${last.short}</div>`
        : `<div class="stat-big">—</div><div class="stat-sub">No results yet</div>`}
    </div>`);

  cards.push(`
    <div class="stat-card">
      <h3>Premier League</h3>
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

  const plRec = record(past.filter((m) => m.competition === "Premier League"));
  cards.push(`
    <div class="stat-card">
      <h3>Premier League Results</h3>
      <div class="record">
        <div class="pill w"><small>Won</small>${plRec.W}</div>
        <div class="pill d"><small>Drew</small>${plRec.D}</div>
        <div class="pill l"><small>Lost</small>${plRec.L}</div>
      </div>
    </div>`);

  const nextFive = upcoming.slice(0, 5).map(matchCard).join("") || `<div class="empty">No upcoming fixtures scheduled.</div>`;

  return `
    <div class="summary-grid">${cards.join("")}</div>
    <div class="section-title">Next up <span class="count">${upcoming.length} scheduled</span></div>
    ${nextFive}`;
}

function renderCompetition(name) {
  const ms = state.matches.filter((m) => m.competition === name);
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
  const past = state.matches.filter((m) => m.completed).sort(byDateDesc);

  let html = `<div class="section-title">Premier League table</div>`;
  if (state.standings.length) {
    const rows = state.standings
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
    html += `<div class="empty">Premier League table isn't available yet.</div>`;
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

  const note = state.fromCache
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

/* ---------- boot ---------- */

async function main() {
  const content = document.getElementById("content");
  const updated = document.getElementById("updated");
  const ok = await loadData();

  if (!ok) {
    updated.textContent = "Offline";
    content.innerHTML = `<div class="error">Couldn't load data from ESPN. Check your connection and refresh. If it keeps failing, ESPN's public API may be temporarily unavailable.</div>`;
    return;
  }

  updated.textContent = `updated ${new Date().toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}`;
  renderTabs();
  renderActive();
}

main();
