# Partie 3 — Répartition des modèles et limites à connaître

> Rédigé à partir des contraintes de la partie 1 (le texte du kit ne l'incluait
> pas). Les modèles indiqués sont ceux du frontmatter des agents ; un agent garde
> son modèle quel que soit celui de la session principale.

## Qui tourne sur quoi

| Rôle | Modèle | Pourquoi | Consommation |
| --- | --- | --- | --- |
| Session principale, **phase 0** | `opus` | Cadrage, arbitrages d'architecture, découpage en tickets : c'est le moment où une erreur coûte le plus cher. | forte, mais bornée à une phase |
| Session principale, **phases 1 à 6** | `sonnet` | Pilotage courant : lire un ticket, déléguer, relire un rapport, committer. | modérée |
| `architecte-reviewer` | `opus` | Trouver la faille de sécurité ou la fuite RGPD que personne n'a vue demande le meilleur modèle. Il ne code pas : ses invocations sont courtes. | forte, ponctuelle |
| `dev-frontend` | `sonnet` | Volume de code élevé, spécifications claires. | forte (le gros du budget) |
| `dev-backend` | `sonnet` | Idem. | forte |
| `qa-tester` | `sonnet` | Écriture de tests et lecture de traces : mécanique mais pas trivial. | modérée |
| `docs-devops` | `haiku` | README, changelog, workflows CI, checklists : rapide et bon marché. | faible |

Bascule de la session principale : `/model opus` pour la phase 0, `/model sonnet`
dès la phase 1.

## Limites côté Claude Code

- **Plafonds d'usage.** `opus` consomme le quota bien plus vite que `sonnet`.
  D'où la règle : opus pour cadrer et pour relire, sonnet pour produire. Si tu
  atteins le plafond en pleine phase, bascule la session principale sur `sonnet`
  et diffère les revues `architecte-reviewer`, pas l'inverse.
- **Un sous-agent a son propre contexte.** Il ne voit ni la conversation, ni ce
  qu'un autre agent vient de faire. Chaque invocation doit être auto-portante :
  ticket, critères d'acceptation, fichiers concernés.
- **Le contexte de la session principale n'est pas infini.** Une phase = une
  session. `docs/PLAN.md` et `docs/TICKETS.md` sont la mémoire du projet, pas
  l'historique de conversation.
- **Les MCP HTTP peuvent être indisponibles.** Si Context7 ne répond pas, ne
  code pas de mémoire sur une version de librairie : arrête-toi.

## Limites côté plateforme

| Limite | Valeur | Conséquence sur le design |
| --- | --- | --- |
| Body d'une fonction serverless Vercel | ≈ 4,5 Mo | L'audio ne passe jamais par une route API : upload client direct vers Blob. |
| Durée d'exécution d'une fonction | quelques secondes par défaut, extensible selon le plan | La transcription se fait **par segment** ; jamais un fichier d'une heure en un appel. |
| Cron Vercel sur les petits plans | fréquence limitée (typiquement 1/jour) | La purge des blobs orphelins est quotidienne, pas continue. |
| Taille de fichier Whisper (OpenAI) | ≈ 25 Mo | Les segments de 5 min passent nativement sous la limite. |
| Rate limits des providers | par minute et par jour | Retry exponentiel ×3 obligatoire, et une erreur de quota doit produire un message utilisateur clair. |

## Limites côté navigateur

- **Safari iOS n'enregistre pas en arrière-plan.** Écran verrouillé ou app en
  arrière-plan = enregistrement arrêté. Parade v1 : `wakeLock` + avertissement
  utilisateur. Il n'existe pas de solution web à ce jour — ne pas promettre le
  contraire dans l'UI.
- **Le stockage d'une PWA iOS peut être purgé** après une période d'inactivité.
  Les notes non transcrites doivent partir vite ; le dire à l'utilisateur.
- **`getUserMedia` exige HTTPS et un geste utilisateur.** Pas d'auto-start, et
  rien ne fonctionne en `http://` autre que `localhost`.
- **Formats divergents** : `audio/mp4` (AAC) sur Safari, `audio/webm` (Opus)
  ailleurs. Stocker le mimeType avec chaque blob et le transmettre au provider.
- **Web Share API** : pas disponible partout, et le partage de fichiers l'est
  encore moins que celui de texte. Le bouton **Copier** reste le chemin principal.
- **WebKit Playwright n'est pas Safari iOS.** C'est le meilleur proxy
  disponible, pas une preuve : la checklist de test manuel sur un vrai iPhone
  reste obligatoire avant la production.
