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

- the full Agent_Swarm execution roster: 15 code heroes and 4 research heroes;
- role-specific desk, terminal, library, and lab vignette themes;
- created, working, waiting, review, complete, and failed states;
- keyboard-selectable badge cards and reduced-motion behavior;
- stable `HeroManifest` identity plus the Codex-compatible v2 sprite contract.
- explicit historical identity/cue fields for named historical figures; the sprite brief must use these fields rather than generic role archetypes.

The renderer-only build is intentionally independent of Electron and the normal
Memex shell. Ada, Linus, and Sagan use validated art; the remaining roster uses
the contract-safe placeholder until its historical environmental scene is
validated. The
environment remains a separate vignette layer so transparent sprites can be
reused by the future user pet designer.
