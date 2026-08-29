import type { CSSProperties } from "react";
import type { HeroManifest, HeroWorkState } from "../../types/hero";

const STATE_LABEL: Record<HeroWorkState, string> = {
  created: "Joining swarm",
  working: "Working",
  waiting: "Waiting",
  review: "Reviewing",
  complete: "Complete",
  failed: "Needs recovery",
};

const STATE_CLASS: Record<HeroWorkState, string> = {
  created: "hero-state-created",
  working: "hero-state-working",
  waiting: "hero-state-waiting",
  review: "hero-state-review",
  complete: "hero-state-complete",
  failed: "hero-state-failed",
};

const STATE_ROW: Record<HeroWorkState, number> = {
  created: 0,
  working: 7,
  waiting: 6,
  review: 8,
  complete: 3,
  failed: 5,
};

interface Props {
  hero: HeroManifest;
  state: HeroWorkState;
  onSelect?: () => void;
  selected?: boolean;
}

export function HeroBadge({ hero, state, onSelect, selected = false }: Props) {
  const interactive = Boolean(onSelect);
  const interactionSrc = state === "working" ? hero.sprite.interactionSrc : undefined;
  const badge = (
    <article
      className={`hero-badge ${selected ? "hero-badge-selected" : ""}`}
      style={{ "--hero-accent": hero.accent } as CSSProperties}
      data-hero-id={hero.id}
      data-hero-state={state}
    >
      <div className="hero-badge-header">
        <div className="hero-avatar" aria-hidden="true">{hero.avatarGlyph}</div>
        <div className="min-w-0">
          <div className="hero-name">{hero.displayName}</div>
          <div className="hero-role">{hero.role}</div>
        </div>
        <span className={`hero-state-dot ${STATE_CLASS[state]}`} title={STATE_LABEL[state]} aria-label={STATE_LABEL[state]} />
      </div>

      <div className={`hero-vignette hero-scene-${hero.vignette.scene} ${STATE_CLASS[state]}`}>
        <div className="hero-scene-label">{hero.vignette.title}</div>
        {interactionSrc ? (
          <div className="hero-interaction-layer" aria-label={`${hero.displayName} working in their environment`}>
            <img src={interactionSrc} alt="" />
          </div>
        ) : (
          <>
            <div className="hero-scene-grid" aria-hidden="true" />
            <div className="hero-work-surface" aria-hidden="true">
              <div className="hero-work-prop">{hero.vignette.prop ?? "work"}</div>
              <div className="hero-sprite" aria-label={`${hero.displayName} ${STATE_LABEL[state].toLowerCase()}`}>
                {hero.sprite.atlasSrc ? (
                  <div
                    className="hero-atlas-sprite"
                    style={{
                      "--hero-row": STATE_ROW[state],
                      backgroundImage: `url(${hero.sprite.atlasSrc})`,
                    } as CSSProperties}
                  />
                ) : hero.sprite.previewSrc ? (
                  <img src={hero.sprite.previewSrc} alt="" />
                ) : (
                  <div className="hero-sprite-placeholder">
                    <span>{hero.avatarGlyph}</span>
                  </div>
                )}
              </div>
            </div>
          </>
        )}
        <div className="hero-vignette-status">{STATE_LABEL[state]}</div>
      </div>

      <p className="hero-description">{hero.vignette.description}</p>
      <div className="hero-badge-footer">
        <span>{hero.discipline === "code" ? "Code swarm" : "Research swarm"}</span>
        <span className="font-mono">v2 sprite</span>
      </div>
    </article>
  );

  return interactive ? (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect?.();
        }
      }}
      className="hero-badge-button"
      aria-pressed={selected}
    >
      {badge}
    </div>
  ) : badge;
}
