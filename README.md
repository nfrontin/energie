# Maison VT · Énergie

Tableau de bord de la maison : électricité, production solaire, eau, gaz et historique. Site en service : [vt-energie.frontin.fr](https://vt-energie.frontin.fr/).

## Fonctionnalités

- **Maintenant** : puissances des appareils et diagramme de flux par pièce.
- **Détail** : bilan journalier, solaire, achats/injection, estimation des coûts, comparaison à la veille, appareils et diagramme quotidien en kWh.
- **Aujourd’hui / Jour** : barres verticales par heure (kWh) ou par 5 minutes (puissance moyenne en kW).
- **24 heures** : puissance apparente du compteur, en kVA, avec comparaison à la veille.
- **Mois / Historique** : historique électrique, y compris les anciennes séries importées.
- **Eau** : quatre compteurs, consommations quotidiennes, graphique sur 7 ou 30 jours.
- Quatre palettes : Lagon, Aurore, Tropical, Sauge ; préférence conservée dans le navigateur.

Les appareils, noms, pièces, sources électriques et tarifs sont synchronisés avec Home Assistant. Une nouvelle prise doit être ajoutée au **tableau Énergie de Home Assistant**, et ses mesures doivent être exportées vers VictoriaMetrics. Ajouter une intégration seule ne suffit pas. La vue Maintenant nécessite aussi un capteur de puissance associé.

## Construire et tester

Pré requis : Python 3.9+ et Node.js 18+ pour les tests. Aucune dépendance Python ou npm à installer.

```sh
python3 scripts/build.py
python3 scripts/check.py
```

La construction génère `dist/index.html` et `dist/app.js`. La page est autonome côté application, mais charge Chart.js 4.4.1 depuis cdnjs et utilise les points d’accès serveur décrits dans [l’architecture](docs/architecture.md). Ouvrir le fichier seul ne donne pas accès aux mesures.

`dist/index.html` est versionné pour permettre un déploiement sur le NAS sans Node.js. La construction est reproductible et ne dépend d’aucun chemin propre au poste de développement.

## Organisation

- `src/` : HTML, CSS, logique des vues, thèmes et configuration de secours.
- `src/legacy.html` : base des vues historiques et fonctions anciennes ; utilisée par le constructeur. Ne pas la déployer directement.
- `scripts/build.py` : assemble les sources en une page statique.
- `config-sync/sync.py` : service de synchronisation Home Assistant → configuration publique filtrée.
- `tests/`, `config-sync/test_sync.py` : tests des calculs et de la synchronisation ; données de puissance synthétiques.
- `deploy/` : exemple de définition du service de synchronisation.

## Documentation

- [Architecture et données](docs/architecture.md)
- [Installation, mises à jour et retour arrière](docs/exploitation.md)
- [Calculs et limites](docs/calculs.md)

Les identifiants WES/Envoy, clés SSH, fichiers privés Home Assistant et historiques réels ne sont pas inclus. Le site expose publiquement ses mesures et sa configuration filtrée, selon le choix du propriétaire. Ne pas déposer de secrets dans ce dépôt.
