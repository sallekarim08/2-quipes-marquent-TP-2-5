// scripts/build-data.mjs
// Va chercher les matchs récents et à venir sur football-data.org,
// calcule les stats BTTS (Both Teams To Score) et écrit data/matches.json
//
// Nécessite la variable d'environnement FOOTBALL_DATA_TOKEN (clé gratuite
// sur https://www.football-data.org/client/register)

import { writeFile } from "node:fs/promises";

const TOKEN = process.env.FOOTBALL_DATA_TOKEN;
if (!TOKEN) {
  console.error("FOOTBALL_DATA_TOKEN manquant (secret GitHub).");
  process.exit(1);
}

// Codes des compétitions disponibles en accès gratuit sur football-data.org
const COMPETITIONS = {
  PL: "Premier League",
  PD: "La Liga",
  SA: "Serie A",
  BL1: "Bundesliga",
  FL1: "Ligue 1",
};

const BASE = "https://api.football-data.org/v4";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchJson(url) {
  const res = await fetch(url, { headers: { "X-Auth-Token": TOKEN } });
  if (!res.ok) {
    throw new Error(`${url} -> ${res.status} ${await res.text()}`);
  }
  return res.json();
}

function dateStr(d) {
  return d.toISOString().slice(0, 10);
}

async function main() {
  const today = new Date();
  const past = new Date(today);
  past.setDate(past.getDate() - 10);
  const future = new Date(today);
  future.setDate(future.getDate() + 10);

  const finished = [];
  const upcoming = [];
  // dernier résultat BTTS connu par équipe, pour estimer la "tendance"
  // des matchs à venir
  const lastBtts = {};

  for (const [code, label] of Object.entries(COMPETITIONS)) {
    // --- Matchs terminés récents ---
    const finishedData = await fetchJson(
      `${BASE}/competitions/${code}/matches?status=FINISHED&dateFrom=${dateStr(past)}&dateTo=${dateStr(today)}`
    );
    for (const m of finishedData.matches ?? []) {
      const hs = m.score?.fullTime?.home;
      const as = m.score?.fullTime?.away;
      if (hs == null || as == null) continue;
      const home = m.homeTeam.shortName || m.homeTeam.name;
      const away = m.awayTeam.shortName || m.awayTeam.name;
      finished.push({ league: label, home, away, hs, as, date: m.utcDate });
      const btts = hs > 0 && as > 0 ? 1 : 0;
      // on garde le résultat le plus récent (les matchs arrivent triés par date)
      lastBtts[home] = btts;
      lastBtts[away] = btts;
    }
    await sleep(6500); // reste sous la limite de 10 req/min du plan gratuit

    // --- Matchs à venir ---
    const upcomingData = await fetchJson(
      `${BASE}/competitions/${code}/matches?status=SCHEDULED&dateFrom=${dateStr(today)}&dateTo=${dateStr(future)}`
    );
    for (const m of upcomingData.matches ?? []) {
      const home = m.homeTeam.shortName || m.homeTeam.name;
      const away = m.awayTeam.shortName || m.awayTeam.name;
      upcoming.push({
        league: label,
        home,
        away,
        date: m.utcDate,
        homeBtts: lastBtts[home] ?? null,
        awayBtts: lastBtts[away] ?? null,
      });
    }
    await sleep(6500);
  }

  const bttsCount = finished.filter((m) => m.hs > 0 && m.as > 0).length;

  const payload = {
    updatedAt: new Date().toISOString(),
    stats: {
      total: finished.length,
      bttsCount,
      bttsPct: finished.length ? Math.round((bttsCount / finished.length) * 100) : 0,
    },
    finished,
    upcoming,
  };

  await writeFile("data/matches.json", JSON.stringify(payload, null, 2));
  console.log(`OK: ${finished.length} matchs terminés, ${upcoming.length} à venir.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
