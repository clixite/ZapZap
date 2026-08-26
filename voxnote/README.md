# VoxNote — kit Claude Code

PWA d'enregistrement et de transcription vocale, type PLAUD.AI simplifié :
**enregistrer → transcrire → copier ou envoyer le texte**.
Cibles : navigateur Windows, Safari iPhone, Chrome Android, installable en PWA.

Ce dossier ne contient pas encore l'application : il contient le **kit de
développement** (sous-agents, skill projet, MCP, prompt maître) à partir duquel
elle sera construite.

> **Pourquoi un sous-dossier ?** Ce dépôt héberge ZapZap. VoxNote est un projet
> distinct : tout son outillage vit sous `voxnote/` pour ne pas écraser la
> configuration `.claude` ni le `package.json` de ZapZap. Le dossier est
> autonome — il suffit de le déplacer dans son propre dépôt le jour venu, sans
> rien changer.

## Contenu

```
voxnote/
├── .mcp.json                        # Vercel, Context7, Playwright
├── .claude/
│   ├── agents/                      # les 5 sous-agents
│   │   ├── architecte-reviewer.md   # opus   — revue archi / sécurité / RGPD
│   │   ├── dev-frontend.md          # sonnet — UI, capture audio, PWA
│   │   ├── dev-backend.md           # sonnet — routes API, transcription, stockage
│   │   ├── qa-tester.md             # sonnet — vitest, Playwright, critères d'acceptation
│   │   └── docs-devops.md           # haiku  — README, changelog, CI
│   └── skills/audio-web/SKILL.md    # pièges de la capture audio cross-platform
└── docs/
    ├── SETUP.md                     # partie 1 — ce qu'il reste à faire à la main
    ├── PROMPT-MAITRE.md             # partie 2 — le prompt à coller
    └── MODELES.md                   # partie 3 — modèles et limites
```

## Démarrer

```bash
cd voxnote
claude          # approuve les serveurs MCP au premier lancement
/agents         # vérifie que les 5 agents sont listés
/model opus
```

Puis colle le contenu de `docs/PROMPT-MAITRE.md`.

Lis `docs/SETUP.md` d'abord : c'est la seule étape qui ne se commite pas
(enregistrement des MCP, clés d'API, dépôt distant).

## État

- [x] Partie 1 — setup versionné : agents, skill, `.mcp.json`
- [x] Partie 2 — prompt maître
- [x] Partie 3 — répartition des modèles et limites
- [ ] Phase 0 — cadrage (`docs/PLAN.md`, `docs/TICKETS.md`)
- [ ] Phases 1 à 6 — l'application

Les parties 2 et 3 n'étaient pas fournies dans le kit d'origine : elles ont été
rédigées à partir des contraintes de la partie 1 (limite de body Vercel, segments
de 5 min, interface `TranscriptionProvider`, RGPD, pièges Safari iOS). À relire
et ajuster avant de lancer la phase 0.
