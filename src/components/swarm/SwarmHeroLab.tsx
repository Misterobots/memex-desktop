import { useMemo, useState } from "react";
import { DEMO_HEROES, heroesForDiscipline } from "../../lib/hero-manifests";
import type { HeroDiscipline, HeroWorkState } from "../../types/hero";
import { HeroBadge } from "./HeroBadge";

const STATES: HeroWorkState[] = ["created", "working", "waiting", "review", "complete", "failed"];

export function SwarmHeroLab() {
  const query = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
  const requestedHeroId = query?.get("hero") ?? "";
  const requestedHero = DEMO_HEROES.find((hero) => hero.id === requestedHeroId);
  const [discipline, setDiscipline] = useState<HeroDiscipline>(requestedHero?.discipline ?? "code");
  const [state, setState] = useState<HeroWorkState>("working");
  const [selectedId, setSelectedId] = useState(requestedHeroId || DEMO_HEROES[0].id);
  const heroes = useMemo(() => heroesForDiscipline(discipline), [discipline]);
  const selected = heroes.find((hero) => hero.id === selectedId) ?? heroes[0];

  const chooseDiscipline = (next: HeroDiscipline) => {
    setDiscipline(next);
    const nextHeroes = heroesForDiscipline(next);
    setSelectedId(nextHeroes[0]?.id ?? "");
  };

  return (
    <main className="hero-lab min-h-screen overflow-y-auto bg-canvas text-text p-6 md:p-10">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="text-[11px] uppercase tracking-[0.24em] text-accent">Experimental surface</div>
            <h1 className="mt-2 text-3xl font-medium">Swarm hero badges</h1>
            <p className="mt-2 max-w-2xl text-sm text-muted">
              A standalone operability lab for the badge vignette layer. The hero identity stays stable while swarm lifecycle state drives the animation.
            </p>
          </div>
          <div className="rounded-lg border border-border/60 bg-surface px-3 py-2 text-right text-[11px] text-muted">
            <div className="font-mono text-text">?experimental=hero-badges</div>
            <div>isolated renderer mode</div>
          </div>
        </div>

        <section className="mb-6 grid gap-3 rounded-xl border border-border/60 bg-surface p-4 md:grid-cols-[1fr_auto]">
          <div>
            <div className="mb-2 text-[11px] uppercase tracking-wide text-faint">Swarm type</div>
            <div className="flex gap-1 rounded-lg border border-border/60 bg-canvas p-1" role="group" aria-label="Swarm type">
              {(["code", "research"] as HeroDiscipline[]).map((item) => (
                <button key={item} type="button" onClick={() => chooseDiscipline(item)} className={`rounded-md px-3 py-1.5 text-xs capitalize transition-colors ${discipline === item ? "bg-surface2 text-text" : "text-muted hover:text-text"}`}>
                  {item} swarm
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="mb-2 text-[11px] uppercase tracking-wide text-faint">Lifecycle state</div>
            <select value={state} onChange={(event) => setState(event.target.value as HeroWorkState)} className="rounded-lg border border-border/60 bg-canvas px-3 py-2 text-xs text-text">
              {STATES.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </div>
        </section>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_280px]">
          <section>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-medium">Active agent badges</h2>
              <span className="text-xs text-muted">{heroes.length} heroes · {state}</span>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {heroes.map((hero) => <HeroBadge key={hero.id} hero={hero} state={state} selected={hero.id === selected.id} onSelect={() => setSelectedId(hero.id)} />)}
            </div>
          </section>

          <aside className="rounded-xl border border-border/60 bg-surface p-4">
            <div className="mb-4 text-[11px] uppercase tracking-wide text-faint">Selected hero</div>
            <HeroBadge hero={selected} state={state} />
            <div className="mt-4 border-t border-border/60 pt-4 text-xs text-muted">
              <div className="flex justify-between gap-3"><span>Identity</span><span className="font-mono text-text">{selected.id}</span></div>
              <div className="mt-2 flex justify-between gap-3"><span>Sprite contract</span><span className="font-mono text-text">192×208 / v2</span></div>
              <div className="mt-2 flex justify-between gap-3"><span>Asset status</span><span className={selected.sprite.interactionSrc || selected.sprite.atlasSrc ? "text-accent" : "text-yellow"}>{selected.sprite.interactionSrc ? "animated interaction" : selected.sprite.atlasSrc ? "animated atlas" : selected.sprite.previewSrc ? "preview" : "placeholder"}</span></div>
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}
