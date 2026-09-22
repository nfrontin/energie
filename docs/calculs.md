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
