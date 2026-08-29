# Experimental swarm hero badges

This branch contains an isolated Hero Badge Lab. It does not change the normal
Memex shell unless the explicit query flag is present.

## Run

```powershell
npm run dev:hero-badges
```

Open:

```text
http://127.0.0.1:5174/?experimental=hero-badges
```

The lab currently exercises:

- code and research hero pools;
- role-specific desk, terminal, library, and lab vignette themes;
- created, working, waiting, review, complete, and failed states;
- keyboard-selectable badge cards and reduced-motion behavior;
- stable `HeroManifest` identity plus the Codex-compatible v2 sprite contract.

The renderer-only build is intentionally independent of Electron and the normal
Memex shell. The current silhouette is an operability placeholder. Generated v2 sprite assets
will replace `sprite.previewSrc` without changing the badge or state APIs. The
environment remains a separate vignette layer so transparent sprites can be
reused by the future user pet designer.
