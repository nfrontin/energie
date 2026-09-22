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
