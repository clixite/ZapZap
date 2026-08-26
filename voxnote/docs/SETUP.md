# Partie 1 — Setup (une seule fois, avant de lancer le prompt maître)

Tout ce qui est versionnable est **déjà dans ce dossier**. Il reste les deux
opérations qui ne se commitent pas : enregistrer les serveurs MCP dans ta config
Claude Code, et vérifier que les sous-agents sont bien vus.

## 1. Ouvrir le projet à la racine `voxnote/`

Les fichiers `.claude/` et `.mcp.json` sont lus depuis le répertoire de travail.
Lance donc Claude Code **depuis `voxnote/`**, pas depuis le dépôt parent :

```bash
cd voxnote
claude
```

## 2. Enregistrer les MCP

`.mcp.json` (déjà présent) déclare les trois serveurs au niveau du projet :
Claude Code te demande de les approuver au premier lancement. Si tu préfères les
déclarer dans ta config personnelle plutôt que dans le repo :

```bash
claude mcp add --transport http vercel https://mcp.vercel.com
claude mcp add --transport http context7 https://mcp.context7.com/mcp
claude mcp add playwright -- npx -y @playwright/mcp@latest
```

Vérification : `claude mcp list` doit afficher les trois serveurs connectés.

| MCP | Rôle |
| --- | --- |
| **Vercel** | Créer le projet, déployer previews et prod, gérer les variables d'environnement et Vercel Blob (stockage audio). |
| **Context7** | Documentation à jour des librairies (Next.js, couche PWA, SDK des providers de transcription). Évite que les agents codent sur des versions périmées. |
| **Playwright** | Tests navigateur réels : Chromium pour Windows/Android, WebKit pour approcher Safari iOS. |

GitHub : le CLI `gh` suffit (déjà utilisable via Bash), pas de MCP dédié.

## 3. Vérifier les sous-agents et la skill

```bash
claude
> /agents      # doit lister : architecte-reviewer, dev-frontend, dev-backend, qa-tester, docs-devops
```

Les cinq agents sont dans `.claude/agents/`, la skill projet dans
`.claude/skills/audio-web/SKILL.md`.

Le champ `model` du frontmatter fixe le modèle de chaque agent. Si ta version de
Claude Code ne le reconnaît pas : `claude update`.

## 4. Créer le dépôt distant (optionnel, recommandé avant la phase 1)

```bash
gh repo create voxnote --private --source=. --remote=origin
```

## 5. Variables d'environnement

À créer en phase 1, dans `.env.local` (jamais commité) et côté Vercel :

| Variable | Rôle |
| --- | --- |
| `TRANSCRIBE_PROVIDER` | `groq` (défaut), `openai` ou `gladia` |
| `GROQ_API_KEY` | clé du provider par défaut |
| `OPENAI_API_KEY` | si `TRANSCRIBE_PROVIDER=openai` |
| `GLADIA_API_KEY` | si `TRANSCRIBE_PROVIDER=gladia` |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob (fourni par l'intégration Vercel) |
| `CRON_SECRET` | protège la route de purge des blobs orphelins |

Aucune de ces clés ne doit être préfixée `NEXT_PUBLIC_`.

## Ensuite

- `docs/PROMPT-MAITRE.md` — le prompt à coller (partie 2)
- `docs/MODELES.md` — répartition des modèles et limites à connaître (partie 3)
