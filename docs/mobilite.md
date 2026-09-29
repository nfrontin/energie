# Mobilité

Page `/mobility/`, accessible depuis Énergie. Elle présente l’énergie de la borne, les sessions estimées, leur attribution manuelle au BMW X3 30e ou à la Mini Aceman, et les pleins d’essence du BMW (date, montant, litres et kilométrage facultatifs). Modification, suppression avec confirmation et export JSON des saisies sont disponibles.

## Données et calculs

- Énergie : `sensor.smart_energy_monitor_mconsume_4_value`, index cumulatif en Wh. Le compteur `consumption_4` se remet à zéro quotidiennement et n’est pas utilisé ici.
- Puissance : `sensor.smart_energy_monitor_power_4_value`, W.
- Tarif : `sensor.wesheurecreuse_value`, 0 = HP, 1 = HC ; prix issus de `/output/energy-config.json` et de son historique.
- Le graphique quotidien superpose les barres de recharge (axe gauche, kWh) et deux courbes de distance (axe droit, km). Les distances sont les différences des index kilométriques aux bornes de chaque journée à Paris ; une borne absente ou une baisse d’index rend la journée inconnue. Le jour courant est partiel. Les mises à jour tardives sont rattachées au jour de réception ; ce n’est pas un journal des trajets. Le total de 2 106 km fourni par le propriétaire pour septembre n’est pas réparti artificiellement entre les jours.
- Kilométrages : `allee_x3_30e_xdrive_vehicle_mileage` et `allee_aceman_se_vehicle_mileage`.
- Pas de calcul : 5 minutes ; index conservés entre changements. Les changements de nom d’une série sont regroupés par maximum. En cas de remise à zéro du cumul, le delta négatif est écarté et signalé.
- Sessions : variations positives regroupées jusqu’à 30 minutes de pause. Les petits mouvements inférieurs à 20 Wh sans puissance >=200 W sont classés en veille, séparément. Les sauts >4 kWh/5 minutes sont exclus et signalés. Les heures sont approximatives, pas un journal natif de la borne. Les manques prolongés de collecte ne permettent pas de reconstruire des horaires précis.
- Contexte de 7 jours avant le mois sélectionné pour stabiliser les sessions qui passent minuit ou changent de mois ; énergie et coût attribués uniquement à la partie du mois affiché.
- Le coût est une **estimation équivalente réseau HP/HC**, sans déduction solaire et sans abonnement. Avant la première date connue des tarifs, le tarif courant est une hypothèse affichée. Un tarif inconnu produit un coût incomplet, jamais un faux zéro.
- Le ratio €/100 km est un ratio budgétaire du mois : électricité estimée attribuée + pleins saisis pour le BMW, électricité seule pour la Mini. Il est masqué si le kilométrage manque, est nul ou si des sessions restent non attribuées. Il ne mesure pas l’énergie effectivement consommée pour rouler ; le carburant et la batterie peuvent être consommés le mois suivant.

## Stockage et accès

L’API Python `config-sync/mobility_server.py` fonctionne dans le conteneur existant `energie-config-sync`, port interne 8081, réseau `energie_default`, sans port publié sur le NAS. Le serveur démarre seulement avec `MOBILITY_ENABLED=1`. Nginx relaie `/mobility-api/` vers ce serveur.

À la demande du propriétaire, aucun code d’accès applicatif n’est requis : le contrôle d’accès repose sur la restriction au réseau 10.1.2.0/24, confirmée par le propriétaire. Les personnes pouvant atteindre le site peuvent lire et modifier les données Mobilité. Les écritures exigent JSON et un en-tête dédié ; les requêtes cross-origin sont refusées. Ne pas exposer ce service à Internet sans protection en amont.

Les données sont dans `/volume1/docker/energie/config-sync/state/mobility.sqlite`, pas dans le navigateur. Les montants sont stockés en centimes. Les identifiants des pleins évitent les doublons lors d’une nouvelle tentative après interruption réseau. Les saisies utilisent SQLite et des requêtes paramétrées.

La sauvegarde Docker existante copie le dossier `energie` et utilise l’API de sauvegarde SQLite pour les fichiers SQLite ouverts. Les saisies et les attributions sont donc inclus dans cette préparation locale, puis dans le transfert Glacier. Une copie cohérente de cette base avec le mécanisme de sauvegarde existant a été testée (SQLite quick_check OK). Une sauvegarde suivante doit être vérifiée pour confirmer sa présence dans l’archive réelle.

## Déploiement / restauration

Copier le dossier `mobility/` dans `html/mobility/`. Monter tout `config-sync/` sur `/app:ro` dans le synchroniseur, conserver `/state`, `/output` et `/ha`, activer MOBILITY_ENABLED, connecter au réseau `energie_default`. Le fichier `deploy/compose.sync.yaml` donne la configuration. Ajouter à Nginx :

```
location ^~ /mobility-api/ {
    client_max_body_size 4k;
    proxy_pass http://energie-config-sync:8081/;
    proxy_set_header Host $host;
    proxy_read_timeout 180s;
    add_header Cache-Control "no-store";
}
```

Pour restaurer, remettre le dossier `energie` de l’archive, y compris `config-sync/state`, puis recréer les conteneurs avec leurs montages et réseau. Aucun conteneur supplémentaire n’est ajouté. Ne pas effacer la base lors d’une mise à jour.
