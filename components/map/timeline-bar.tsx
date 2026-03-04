"use client";

import { useRef, useMemo } from "react";
import { useTimelineStore, TimelineEvent } from "@/stores/timeline-store";
import { useMapStore } from "@/stores/map-store";
import { EVENT_TYPE_CONFIG } from "./timeline-panel";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatBarDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso.slice(0, 10);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatPopDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-US", {
    month: "short", day: "numeric", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

// ─── Single event tick on the bar ─────────────────────────────────────────────

function EventTick({
  event,
  pct,
  selected,
  onSelect,
}: {
  event: TimelineEvent;
  pct: number;
  selected: boolean;
  onSelect: () => void;
}) {
  const cfg = EVENT_TYPE_CONFIG[event.eventType] ?? EVENT_TYPE_CONFIG.other;

  return (
    <button
      onClick={onSelect}
      title={`${event.title}\n${event.location}`}
      className="absolute -translate-x-1/2 flex flex-col items-center group"
      style={{ left: `${pct}%`, top: 0 }}
    >
      {/* Stem */}
      <div
        className="w-px transition-all"
        style={{
          height: selected ? 28 : 16,
          backgroundColor: cfg.color,
          opacity: selected ? 1 : 0.65,
        }}
      />
      {/* Dot */}
      <div
        className="flex items-center justify-center rounded-full border transition-all"
        style={{
          width:  selected ? 22 : 16,
          height: selected ? 22 : 16,
          fontSize: selected ? 12 : 9,
          borderColor: cfg.color,
          backgroundColor: selected ? `${cfg.color}30` : "rgba(0,0,0,0.6)",
          boxShadow: selected ? `0 0 8px ${cfg.color}80` : "none",
        }}
      >
        {cfg.emoji}
      </div>

      {/* Hover tooltip */}
      <div className="pointer-events-none absolute bottom-full mb-1 z-50 hidden group-hover:flex flex-col items-center">
        <div className="max-w-[180px] rounded border border-border/60 bg-background/95 px-2 py-1.5 shadow-xl text-left">
          <p className="text-[10px] font-semibold text-foreground leading-snug line-clamp-2">{event.title}</p>
          <p className="text-[9px] text-muted-foreground mt-0.5">{formatPopDate(event.timestamp)}</p>
          <p className="text-[9px] text-muted-foreground truncate">{event.location}</p>
        </div>
        <div className="h-1.5 w-px bg-border/60" />
      </div>
    </button>
  );
}

// ─── Main bar ─────────────────────────────────────────────────────────────────

export function TimelineBar() {
  const { events, selectedEvent, selectEvent, startDate, endDate } = useTimelineStore();
  const { flyTo } = useMapStore();
  const scrollRef = useRef<HTMLDivElement>(null);

  const { minMs, maxMs, rangeMs } = useMemo(() => {
    const start = new Date(startDate).getTime();
    const end   = new Date(endDate).getTime() || Date.now();
    return { minMs: start, maxMs: end, rangeMs: end - start || 1 };
  }, [startDate, endDate]);

  if (events.length === 0) return null;

  function handleSelect(ev: TimelineEvent) {
    selectEvent(ev);
    flyTo(ev.longitude, ev.latitude, 8);
  }

  const startLabel = formatBarDate(startDate);
  const endLabel   = formatBarDate(endDate);

  return (
    <div className="absolute bottom-16 left-1/2 z-20 w-[min(860px,calc(100vw-2rem))] -translate-x-1/2">
      <div className="rounded-lg border border-border/40 bg-background/85 px-4 py-3 shadow-xl backdrop-blur-md">
        {/* Top row: title + count */}
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/70">
            Timeline · {events.length} event{events.length !== 1 ? "s" : ""}
          </span>
          <div className="flex gap-3">
            {(["strike", "explosion", "military", "protest", "infrastructure", "political", "natural", "disaster"] as const)
              .filter((t) => events.some((e) => e.eventType === t))
              .map((t) => {
                const cfg = EVENT_TYPE_CONFIG[t];
                const count = events.filter((e) => e.eventType === t).length;
                return (
                  <span key={t} className="flex items-center gap-0.5 text-[9px] text-muted-foreground">
                    <span>{cfg.emoji}</span>
                    <span>{count}</span>
                  </span>
                );
              })}
          </div>
        </div>

        {/* Timeline track */}
        <div ref={scrollRef} className="relative" style={{ height: 56 }}>
          {/* Baseline */}
          <div className="absolute inset-x-0 top-[28px] h-px bg-border/40" />

          {/* Start / end labels */}
          <span className="absolute left-0 top-[32px] text-[9px] text-muted-foreground/50">{startLabel}</span>
          <span className="absolute right-0 top-[32px] text-[9px] text-muted-foreground/50">{endLabel}</span>

          {/* Event ticks — clustered events get horizontal offset */}
          {events.map((ev) => {
            const evMs = new Date(ev.timestamp).getTime();
            const pct  = isNaN(evMs) ? 50 : Math.max(1, Math.min(99, ((evMs - minMs) / rangeMs) * 100));
            return (
              <EventTick
                key={ev.id}
                event={ev}
                pct={pct}
                selected={selectedEvent?.id === ev.id}
                onSelect={() => handleSelect(ev)}
              />
            );
          })}
        </div>

        {/* Selected event detail strip */}
        {selectedEvent && (
          <div className="mt-2 flex items-start gap-2 rounded border border-border/30 bg-card/40 px-2.5 py-2">
            <span className="mt-0.5 shrink-0 text-base leading-none">
              {EVENT_TYPE_CONFIG[selectedEvent.eventType]?.emoji ?? "📍"}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold text-foreground leading-snug">{selectedEvent.title}</p>
              <p className="mt-0.5 text-[10px] text-muted-foreground leading-snug line-clamp-2">{selectedEvent.summary}</p>
              <div className="mt-1 flex items-center gap-2 text-[9px] text-muted-foreground/70">
                <span>{formatPopDate(selectedEvent.timestamp)}</span>
                <span>·</span>
                <span>{selectedEvent.location}</span>
                <span>·</span>
                <span className="capitalize">{selectedEvent.eventType}</span>
                {selectedEvent.url && (
                  <>
                    <span>·</span>
                    <a
                      href={selectedEvent.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sky-400 hover:underline"
                    >
                      {selectedEvent.source}
                    </a>
                  </>
                )}
              </div>
            </div>
            <button
              onClick={() => selectEvent(null)}
              className="shrink-0 text-muted-foreground/40 hover:text-muted-foreground"
              aria-label="Dismiss"
            >
              ×
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
