# Partie 2 — Le prompt maître

> Rédigé à partir des contraintes de la partie 1 (le texte du kit ne l'incluait
> pas). Colle le bloc ci-dessous dans Claude Code, à la racine de `voxnote/`,
> après `/model opus`.

---

Tu pilotes la construction de **VoxNote**, une PWA d'enregistrement et de
transcription vocale, type PLAUD.AI simplifié : **enregistrer → transcrire →
copier ou envoyer le texte**. Rien d'autre en v1.

Cibles : navigateur Windows, Safari iPhone, Chrome Android. Installable en PWA.
Langue de l'interface et des commits : français.

## Contraintes non négociables

1. **Aucune clé API côté client.** Aucun secret dans le repo.
2. **L'audio ne transite jamais par une route API** : upload client direct vers
   Vercel Blob (limite de body serverless ≈ 4,5 Mo). La route reçoit l'URL du blob.
3. **Enregistrement par segments d'environ 5 minutes**, chaque segment persisté en
   IndexedDB avant upload. Un refresh ou un crash ne perd au pire que le segment
   en cours.
4. **Détection de capacités à l'exécution** (`MediaRecorder.isTypeSupported`),
   jamais de user-agent sniffing.
5. **Un seul `TranscriptionProvider`**, implémentations `groq` / `openai` /
   `gladia`, sélection par `TRANSCRIBE_PROVIDER`, défaut `groq`
   (whisper-large-v3-turbo).
6. **RGPD dès le départ** : supprimer une note supprime audio *et* texte ; les
   blobs orphelins de plus de 7 jours sont purgés par un cron ; une page
   confidentialité existe.
7. **Mobile-first.** L'UI se conçoit pour un téléphone tenu à une main.
8. Avant tout code touchant à l'audio, à `getUserMedia`, à la PWA ou à l'upload :
   **lis la skill projet `audio-web`**.

## Ton équipe

Délègue systématiquement, ne code pas toi-même :

| Agent | Pour quoi |
| --- | --- |
| `dev-frontend` | UI React, capture audio, couche PWA |
| `dev-backend` | routes API, pipeline de transcription, stockage |
| `qa-tester` | tests vitest et Playwright, vérification des critères d'acceptation |
| `architecte-reviewer` | revue archi / sécurité / RGPD, en fin de ticket significatif et de phase |
| `docs-devops` | README, changelog, CI, checklists de test manuel |

Un sous-agent ne voit pas notre conversation : chaque invocation doit contenir le
ticket, ses critères d'acceptation et les fichiers concernés.

## La boucle par ticket

Pour chaque ticket, sans exception :

1. Tu délègues l'implémentation à `dev-frontend` ou `dev-backend`.
2. `qa-tester` écrit et exécute les tests qui prouvent les critères d'acceptation.
3. FAIL → retour au développeur avec le rapport. **Trois allers-retours maximum** ;
   au quatrième, tu t'arrêtes et tu me demandes un arbitrage.
4. Ticket significatif (nouvelle route, nouveau stockage, touche à l'audio ou aux
   données personnelles) → `architecte-reviewer`. Verdict BLOQUANT → retour au
   développeur.
5. Commit conventionnel (`feat:`, `fix:`, `test:`, `docs:`), un ticket = un commit
   atomique.

## La boucle par phase

En fin de phase : `docs-devops` met à jour README et changelog → déploiement d'une
preview Vercel → `qa-tester` rejoue la suite E2E sur les trois projets
(chromium desktop, chromium mobile, webkit mobile) → `architecte-reviewer` passe
sur la phase entière → **tu t'arrêtes et tu me présentes la preview**. Je valide
avant la phase suivante. Tu ne déploies jamais en production sans mon accord
explicite.

## Les phases

**Phase 0 — Cadrage** (moi en `opus`, avec toi)
Spécification fonctionnelle courte, arborescence, choix de la couche PWA (tranche
avec Context7, pas de mémoire), liste des tickets par phase avec critères
d'acceptation. Sorties : `docs/PLAN.md`, `docs/TICKETS.md`. Aucun code. Tu
t'arrêtes pour validation.

**Phase 1 — Socle**
Next.js (App Router) + TypeScript strict + Tailwind, couche PWA (manifeste,
service worker, icônes, installable iOS et Android), vitest + Playwright
configurés, workflow GitHub Actions (lint, test, build), projet Vercel créé et
preview qui répond. Critère : l'app s'installe sur un vrai iPhone et un vrai
Android et affiche un écran vide.

**Phase 2 — Capture audio**
Bouton d'enregistrement (tap obligatoire), détection du mimeType, segments de
5 min via timeslice, persistance IndexedDB, `wakeLock` + bandeau « garde l'écran
allumé », reprise après refresh, gestion du refus de permission micro.
Critère : un enregistrement de 12 min survit à un refresh à la 7e minute.

**Phase 3 — Upload**
Upload client direct vers Vercel Blob, file d'attente avec retry exponentiel,
statut par segment dans l'UI, reprise après coupure réseau.
Critère : couper le réseau pendant un upload puis le rétablir aboutit à un
transcript complet.

**Phase 4 — Transcription**
Interface `TranscriptionProvider` + implémentations groq / openai / gladia,
transcription par segment, assemblage ordonné et horodaté côté serveur, langue en
détection auto avec forçage fr / nl / en, erreurs provider traduites en messages
utilisateur exploitables, retry ×3.
Critère : les trois providers passent le même test d'intégration.

**Phase 5 — Notes et partage**
Liste des notes, vue détail, **bouton Copier bien visible** (cas d'usage n°1),
`navigator.share` avec fallback Clipboard + mailto, renommage, suppression.
Critère : copier et partager fonctionnent sur iPhone et Android réels.

**Phase 6 — RGPD et mise en production**
Suppression qui efface blob + transcript, cron Vercel de purge des orphelins de
plus de 7 jours, page confidentialité, revue sécurité complète, checklist de test
manuel sur appareils réels, passage en production après mon accord.

## Règles de conduite

- Une phase à la fois. Tu ne prends pas d'avance sur la suivante.
- Tu ne crées pas d'abstraction qui n'a qu'une implémentation et aucun besoin
  identifié.
- Tu vérifies les versions et les API avec Context7 plutôt que de te fier à ta
  mémoire.
- Tu me signales tout de suite ce qui te bloque au lieu de contourner.

Commence par la phase 0.
