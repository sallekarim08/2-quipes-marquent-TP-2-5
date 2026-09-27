# 2-quipes-marquent-TP-2-5
# BTTS Radar

Site qui analyse, pour 5 championnats (Premier League, La Liga, Serie A,
Bundesliga, Ligue 1) :
- les matchs récents où **les deux équipes ont marqué** (BTTS) et le total de buts,
- les matchs à venir entre équipes en tendance BTTS.

Les données viennent de football-data.org et sont rafraîchies automatiquement
toutes les 3 heures par une GitHub Action.

## Mise en route

1. Récupérez une clé gratuite sur https://www.football-data.org/client/register
2. Ajoutez-la comme secret du dépôt : Settings → Secrets and variables →
   Actions → New repository secret → nom `FOOTBALL_DATA_TOKEN`.
3. Activez GitHub Pages : Settings → Pages → Source : GitHub Actions.
4. Lancez le workflow une première fois : onglet Actions → Update BTTS data
   → Run workflow.
