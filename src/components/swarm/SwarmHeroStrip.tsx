import { useMemo } from "react";
import { DEMO_HEROES } from "../../lib/hero-manifests";
import { heroStateForWorker } from "../../lib/hero-state";
import type { HeroDiscipline, HeroManifest } from "../../types/hero";
import type { MessageEvent } from "../../types/memex";
import { HeroBadge } from "./HeroBadge";

interface Props {
  events: MessageEvent[];
  discipline: HeroDiscipline;
}

function labelForEvent(event: MessageEvent): string {
  return event.pioneer_name ?? event.agent_name ?? "Swarm hero";
}

function heroForEvent(event: MessageEvent, index: number, discipline: HeroDiscipline): HeroManifest {
  const pool = DEMO_HEROES.filter((hero) => hero.discipline === discipline);
  const template = pool[index % Math.max(pool.length, 1)] ?? DEMO_HEROES[0];
  const data = event.data ?? {};
  const label = labelForEvent(event);
  const role = typeof data.role === "string" ? data.role : template.role;
  return {
    ...template,
    id: `${template.id}-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    displayName: label,
    role,
  };
}

export function SwarmHeroStrip({ events, discipline }: Props) {
  const heroes = useMemo(() => {
    const latest = new Map<string, MessageEvent>();
    for (const event of events) {
      if (event.type !== "agent_event") continue;
      latest.set(labelForEvent(event), event);
    }
    return [...latest.entries()].map(([label, event], index) => ({
      hero: heroForEvent(event, index, discipline),
      state: heroStateForWorker(event.data?.status, event.data?.phase),
      label,
    }));
  }, [discipline, events]);

  if (heroes.length === 0) return null;

  return (
    <section className="swarm-hero-strip" aria-label={`${discipline} swarm heroes`}>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-[0.16em] text-faint">Swarm heroes</span>
        <span className="text-[10px] text-muted">{heroes.length} active</span>
      </div>
      <div className="grid gap-2 md:grid-cols-2">
        {heroes.map(({ hero, state, label }) => <HeroBadge key={label} hero={hero} state={state} />)}
      </div>
    </section>
  );
}
