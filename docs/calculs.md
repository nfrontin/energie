# Calculs et limites

## Électricité

- Les index en Wh ou kWh sont convertis en kWh avant agrégation.
- Les baisses d’index sont traitées comme des remises à zéro dans les vues électriques récentes.
- Les limites des journées suivent `Europe/Paris`, avec des journées de 23 ou 25 heures lors des changements d’heure.
- Le mode horaire montre des kWh par heure ; le mode 5 minutes montre une puissance moyenne calculée à partir de l’énergie de la tranche, en kW.
- La comparaison est celle de la veille complète. La journée courante et sa dernière tranche restent partielles.
- Le mode 24 heures utilise la puissance **apparente** réseau, en kVA : elle ne doit pas être confondue avec les kW actifs de l’Envoy.

Relations du bilan :

```text
Réseau acheté = somme des index d’achat
Solaire consommé = production − injection
Maison = réseau acheté + solaire consommé
Autoconsommation = solaire consommé / production
Autonomie = solaire consommé / maison
```

Les écarts de synchronisation des capteurs peuvent rendre un intervalle incohérent ; il reste alors inconnu au lieu de créer une consommation négative. Les absences de données sont représentées par des ruptures ou « — ».

## Diagrammes de flux

Maintenant utilise les derniers états de puissance en W ; le diagramme quotidien utilise les kWh de la date sélectionnée. La largeur des liens est proportionnelle à la valeur. Les appareils à zéro sont omis du dessin et restent dans les tableaux.

Le total des appareils suivis n’est pas forcément celui de la maison : couverture incomplète, circuits imbriqués ou mesures décalées. Les appareils sont regroupés selon leur pièce Home Assistant, même si la pièce représente l’emplacement du compteur plutôt que celui de l’usage.

## Tarifs

Les changements sont archivés à partir de leur **observation** par le synchroniseur, pas de leur date réelle d’effet contractuelle. Avant la première observation, le premier tarif connu est appliqué et l’interface le signale. Les changements intrahoraires sont estimés au prorata du temps dans l’heure : la consommation n’est pas ventilée exactement à la seconde du changement.

Les coûts sont des estimations hors abonnement et ajustements forfaitaires. L’injection est comptée en crédit. Un prix ou un volume inconnu rend le coût correspondant inconnu.

## Données conservées entre deux changements

Les appareils Home Assistant peuvent n’émettre qu’en cas de changement. Les vues récentes conservent leur dernière valeur connue, jusqu’à 30 jours selon la requête. Ce maintien ne prouve pas qu’un appareil est actuellement joignable. La vue de puissance 24 heures utilise une fenêtre de maintien de 24 heures.

Les anciennes archives, avant le 22 avril 2026 dans les vues Jour, gardent leur chaîne de calcul historique. Leur résolution dépend des données disponibles ; les contrôles modernes de résolution/comparaison y sont désactivés.

## Eau

Différence des index entre minuit et minuit à Paris, en litres, sur 30 jours. Les remises à zéro ou bornes manquantes restent inconnues. Le compteur général et les sous-compteurs ne sont pas additionnés.

## Sources du diagramme quotidien

La vue globale relie le réseau et la production solaire à la maison ; l’injection solaire constitue une branche distincte. L’écart positif entre consommation maison et appareils suivis apparaît comme « Consommation non suivie ». Il peut inclure des appareils non équipés et des relevés manquants ; ce n’est pas une mesure indépendante.

Si les appareils dépassent le total maison ou si le bilan global est incomplet, le diagramme revient aux seuls appareils suivis avec une explication. Lorsqu’une pièce est filtrée, les sources sont masquées : leur part réelle par pièce n’est pas mesurée. Les dégradés identifient les origines et destinations des liens ; les couleurs des appareils restent stables à travers les rafraîchissements.

### Eau et gaz : heures de la journée

Les vues Eau et Gaz présentent des barres par heure pour la journée sélectionnée (30 jours disponibles). L’eau propose les quatre compteurs séparément : le général et les sous-compteurs ne sont pas additionnés. Le gaz est exprimé en kWh, l’eau en litres. Les incréments sont répartis entre les relevés espacés de cinq minutes. Une remise à zéro ou un intervalle de plus de dix minutes laisse la tranche inconnue ; les heures futures restent vides. L’heure en cours est partielle. Les journées de changement d’heure comportent 23 ou 25 tranches ; les infobulles indiquent le décalage horaire.

La comparaison avec la veille est une courbe pointillée, alignée sur les heures locales. Elle peut être masquée. Le total connu et l’heure de pointe accompagnent le graphique ; une journée sans consommation n’affiche pas de fausse heure de pointe.

### Sources dans la vue Maintenant

Le diagramme utilise les puissances actives Envoy en watts : maison = production solaire + puissance nette du réseau. Le surplus est représenté comme injection. Les sources sont affichées en haut du même diagramme que les pièces et appareils lorsque le bilan le permet. Si les appareils dépassent la mesure maison, ou si une pièce est sélectionnée, le bilan global des sources reste visible séparément ; aucune attribution du solaire à un appareil particulier n’est inventée. Une mesure Envoy absente ou incohérente laisse les sources indisponibles. Les capteurs des appareils et Envoy sont relus ensemble au chargement de la vue, puis environ toutes les 30 secondes.

## Tarifs gaz du contrat fourni

La page Gaz utilise les conditions particulières Alterna énergie « Énergie moins chère ensemble 2024 », option T2 : **0,0875 €/kWh TTC** et **27,56 €/mois TTC**, applicables au **1er septembre 2025**. Le contrat individuel plus récent prévaut ici sur la grille générale datée du 1er janvier 2025. Les PDF et les données personnelles du contrat ne sont pas publiés.

Le coût de la journée sélectionnée utilise la somme des tranches horaires couvertes. Si une tranche écoulée manque, le coût énergétique reste indisponible. L’abonnement journalier est le montant mensuel divisé par le nombre de jours calendaires du mois ; pour aujourd’hui, cette part couvre la journée entière tandis que la consommation est partielle. Aucune estimation n’est appliquée avant la date renseignée. L’offre est à prix fixe selon les CGV, non fournies ici ; les éventuelles évolutions ultérieures ne sont pas connues. Ces tarifs sont ceux du document fourni et ne constituent pas une vérification de la facture actuelle. Ils sont définis dans `src/gas-tariffs.js` ; la configuration Home Assistant n’est pas modifiée.

## Contrat électricité Octopus Energy

Offre Énergie Moins Chère Ensemble 2025, contrat commencé le 28 novembre 2025, 36 kVA HP/HC, facturation mensuelle. Grille fournie applicable au **30 septembre 2026** : HP 0,1807 €/kWh TTC, HC 0,1387 €/kWh TTC, abonnement 53,79 €/mois TTC. Plages HC communiquées : 00:04–05:34 et 14:34–17:04, Europe/Paris. Aucun identifiant client ni PDF privé dans le dépôt.

`config-sync/electricity-contract.json` est la référence contractuelle. Le synchroniseur donne priorité à ces prix pour `westic1hp` et `westic1hc` à partir du 30 septembre à minuit Paris, dans l’historique partagé par Électricité et Mobilité. Les observations antérieures restent conservées ; leur exactitude contractuelle n’est pas confirmée. Avant la première observation, le premier tarif observé reste une estimation. L’injection et les nouvelles sources restent synchronisées depuis Home Assistant. La configuration Home Assistant n’est pas modifiée. Mettre à jour ce fichier lors de la prochaine évolution contractuelle.

Le bilan détaillé ajoute l’abonnement mensuel divisé par le nombre de jours du mois, journée entière même pour aujourd’hui, puis le total net (achats moins injection plus abonnement). L’abonnement historique reste inconnu avant la grille fournie. La mobilité exclut l’abonnement et conserve la distinction HP/HC mesurée par WES ; les plages affichées ne remplacent pas les états observés.

## Coût par appareil — vue Électricité Détail uniquement

Pour chaque heure : `kWh appareil × coût des achats réseau de l’heure / kWh maison`. Le coût réseau additionne les kWh de chaque source d’import multipliés par son tarif historique moyen sur l’heure. Le solaire autoconsommé réduit ainsi la part attribuée d’achat réseau, sans valoriser un coût de production ni un revenu d’injection. L’abonnement n’est pas réparti. Cette allocation proportionnelle est une estimation : les origines réseau/solaire ne sont pas mesurées par appareil. Les changements HP/HC au sein d’une heure et les usages non simultanés limitent sa précision.

Un relevé manquant, un tarif inconnu avec import positif ou une consommation maison incohérente rend le coût inconnu (—). Une consommation appareil nulle donne zéro. Les heures futures sont ignorées, les journées de changement d’heure suivent les bornes locales existantes. Les circuits peuvent se recouper : ne pas additionner les coûts de tous les appareils comme une facture. Aucune requête VictoriaMetrics supplémentaire n’est ajoutée.
