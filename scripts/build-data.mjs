// scripts/build-data.mjs
// Analyse les 5 derniers matchs de chaque équipe pour repérer :
// - les équipes qui marquent/encaissent beaucoup
// - les équipes qui marquent/encaissent à tous les coups
// - les matchs à venir qui croisent ces profils
//
// Nécessite la variable d'environnement FOOTBALL_DATA_TOKEN

import { writeFile } from "node:fs/promises";

const TOKEN = process.env.FOOTBALL_DATA_TOKEN;
if (!TOKEN) {
  console.error("FOOTBALL_DATA_TOKEN manquant (secret GitHub).");
  process.exit(1);
}

const COMPETITIONS = {
  PL: "Premier League",
  PD: "La Liga",
  SA: "Serie A",
  BL1: "Bundesliga",
  FL1: "Ligue 1",
};

const LAST_N = 5;          // nombre de matchs récents pris en compte par équipe
const MIN_MATCHES = 3;     // échantillon minimum pour être pris en compte
const SEUIL_BEAUCOUP = 1.6; // moyenne de buts / match pour "marque/encaisse beaucoup"

const BASE = "https://api.football-data.org/v4";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchJson(url) {
  const res = await fetch(url, { headers: { "X-Auth-Token": TOKEN } });
  if (!res.ok) throw new Error(`${url} -> ${res.status} ${await res.text()}`);
  return res.json();
}

function dateStr(d) { return d.toISOString().slice(0, 10); }

async function main() {
  const today = new Date();
  const past = new Date(today); past.setDate(past.getDate() - 45);
  const future = new Date(today); future.setDate(future.getDate() + 14);

  // matches[teamName] = { league, history: [{scored, conceded, date}] }
  const matches = {};
  const upcomingRaw = [];

  const addMatch = (team, league, scored, conceded, date) => {
    if (!matches[team]) matches[team] = { league, history: [] };
    matches[team].history.push({ scored, conceded, date });
  };

  for (const [code, label] of Object.entries(COMPETITIONS)) {
    const finishedData = await fetchJson(
      `${BASE}/competitions/${code}/matches?status=FINISHED&dateFrom=${dateStr(past)}&dateTo=${dateStr(today)}`
    );
    for (const m of finishedData.matches ?? []) {
      const hs = m.score?.fullTime?.home, as = m.score?.fullTime?.away;
      if (hs == null || as == null) continue;
      const home = m.homeTeam.shortName || m.homeTeam.name;
      const away = m.awayTeam.shortName || m.awayTeam.name;
      addMatch(home, label, hs, as, m.utcDate);
      addMatch(away, label, as, hs, m.utcDate);
    }
    await sleep(6500);

    const upcomingData = await fetchJson(
      `${BASE}/competitions/${code}/matches?status=SCHEDULED&dateFrom=${dateStr(today)}&dateTo=${dateStr(future)}`
    );
    for (const m of upcomingData.matches ?? []) {
      upcomingRaw.push({
        league: label,
        home: m.homeTeam.shortName || m.homeTeam.name,
        away: m.awayTeam.shortName || m.awayTeam.name,
        date: m.utcDate,
      });
    }
    await sleep(6500);
  }

  // --- calcule le profil de chaque équipe ---
  const profiles = {};
  for (const [team, { league, history }] of Object.entries(matches)) {
    const recent = history
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .slice(0, LAST_N);
    const n = recent.length;
    if (n < MIN_MATCHES) continue;

    const avgScored = recent.reduce((s, m) => s + m.scored, 0) / n;
    const avgConceded = recent.reduce((s, m) => s + m.conceded, 0) / n;
    const marqueToujours = recent.every((m) => m.scored > 0);
    const encaisseToujours = recent.every((m) => m.conceded > 0);

    profiles[team] = {
      name: team,
      league,
      n,
      avgScored: Math.round(avgScored * 100) / 100,
      avgConceded: Math.round(avgConceded * 100) / 100,
      marqueBeaucoup: avgScored >= SEUIL_BEAUCOUP,
      encaisseBeaucoup: avgConceded >= SEUIL_BEAUCOUP,
      marqueToujours,
      encaisseToujours,
    };
  }

  // --- matchs à venir enrichis des profils des deux équipes ---
  const upcoming = upcomingRaw
    .filter((m) => profiles[m.home] && profiles[m.away])
    .map((m) => {
      const h = profiles[m.home], a = profiles[m.away];
      return {
        league: m.league, home: m.home, away: m.away, date: m.date,
        home_p: h, away_p: a,
        attackVsLeaky:
          (h.marqueBeaucoup && a.encaisseBeaucoup) ||
          (a.marqueBeaucoup && h.encaisseBeaucoup),
        certainGoal:
          (h.marqueToujours && a.encaisseToujours) ||
          (a.marqueToujours && h.encaisseToujours),
      };
    });

  const payload = {
    updatedAt: new Date().toISOString(),
    teams: Object.values(profiles),
    upcoming,
  };

  await writeFile("data/matches.json", JSON.stringify(payload, null, 2));
  console.log(`OK: ${Object.keys(profiles).length} équipes profilées, ${upcoming.length} matchs à venir croisés.`);
}

main().catch((err) => { console.error(err); process.exit(1); });
