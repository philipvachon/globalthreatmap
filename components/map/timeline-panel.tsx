"use client";

import { useState } from "react";
import { Clock, Search, X, Square, ExternalLink, ChevronDown, ChevronUp, Loader2, AlertTriangle } from "lucide-react";
import { useTimelineStore, TimelineEvent, TimelineEventType } from "@/stores/timeline-store";
import { useMapStore } from "@/stores/map-store";

// ─── Event type config ────────────────────────────────────────────────────────

export const EVENT_TYPE_CONFIG: Record<TimelineEventType, { label: string; emoji: string; color: string }> = {
  strike:         { label: "Strike",         emoji: "💥", color: "#ef4444" },
  explosion:      { label: "Explosion",      emoji: "💣", color: "#f97316" },
  military:       { label: "Military",       emoji: "🪖", color: "#22c55e" },
  protest:        { label: "Protest",        emoji: "✊", color: "#eab308" },
  infrastructure: { label: "Infrastructure", emoji: "🏭", color: "#6b7280" },
  political:      { label: "Political",      emoji: "🏛️", color: "#3b82f6" },
  natural:        { label: "Natural",        emoji: "🌊", color: "#06b6d4" },
  disaster:       { label: "Disaster",       emoji: "⚠️", color: "#f97316" },
  other:          { label: "Other",          emoji: "📍", color: "#a3a3a3" },
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function EventCard({ event, selected, onSelect }: { event: TimelineEvent; selected: boolean; onSelect: () => void }) {
  const cfg = EVENT_TYPE_CONFIG[event.eventType] ?? EVENT_TYPE_CONFIG.other;
  const date = new Date(event.timestamp);
  const dateStr = isNaN(date.getTime())
    ? event.timestamp
    : date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

  return (
    <button
      onClick={onSelect}
      className={`w-full text-left rounded border px-2.5 py-2 transition-colors ${
        selected
          ? "border-sky-500/60 bg-sky-500/10"
          : "border-border/30 bg-card/40 hover:border-border/60 hover:bg-card/70"
      }`}
    >
      <div className="flex items-start gap-2">
        <span className="mt-0.5 shrink-0 text-base leading-none" title={cfg.label}>{cfg.emoji}</span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[11px] font-semibold text-foreground leading-snug">{event.title}</p>
          <div className="mt-0.5 flex items-center gap-1.5 text-[10px] text-muted-foreground">
            <span>{dateStr}</span>
            <span>·</span>
            <span className="truncate">{event.location}</span>
          </div>
        </div>
        <a
          href={event.url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="mt-0.5 shrink-0 text-muted-foreground/50 hover:text-muted-foreground"
        >
          <ExternalLink className="h-2.5 w-2.5" />
        </a>
      </div>
    </button>
  );
}

// ─── Main Panel ───────────────────────────────────────────────────────────────

export function TimelinePanel() {
  const {
    isOpen, setOpen,
    isLoading, setLoading,
    error, setError,
    events, setEvents,
    selectedEvent, selectEvent,
    keyword, setKeyword,
    startDate, setStartDate,
    endDate, setEndDate,
    bbox, setBbox,
    isDrawingBbox, setDrawingBbox,
  } = useTimelineStore();

  const { flyTo } = useMapStore();

  const [collapsed, setCollapsed] = useState(false);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!keyword.trim()) return;
    setLoading(true);
    setError(null);
    setEvents([]);
    selectEvent(null);

    try {
      const res = await fetch("/api/timeline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keyword: keyword.trim(), startDate, endDate, bbox }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Search failed");
      setEvents(data.events ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  function handleSelectEvent(ev: TimelineEvent) {
    selectEvent(ev);
    flyTo(ev.longitude, ev.latitude, 8);
  }

  if (!isOpen) return null;

  return (
    <div className="absolute left-4 top-[68px] z-20 flex w-[300px] flex-col overflow-hidden rounded-lg border border-border/50 bg-background/90 shadow-xl backdrop-blur-md">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border/40 px-3 py-2">
        <div className="flex items-center gap-1.5">
          <Clock className="h-3.5 w-3.5 text-sky-400" />
          <span className="text-xs font-semibold tracking-wide text-foreground/90">TIMELINE REPLAY</span>
          {events.length > 0 && (
            <span className="rounded bg-sky-500/20 px-1.5 py-0.5 text-[10px] font-bold text-sky-400">
              {events.length}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setCollapsed((c) => !c)}
            className="rounded p-0.5 text-muted-foreground hover:text-foreground"
          >
            {collapsed ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
          </button>
          <button
            onClick={() => { setOpen(false); setDrawingBbox(false); }}
            className="rounded p-0.5 text-muted-foreground hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {!collapsed && (
        <>
          {/* Search form */}
          <form onSubmit={handleSearch} className="flex flex-col gap-2 p-3">
            {/* Keyword */}
            <div className="relative">
              <Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
              <input
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder='e.g. "Iran strikes" or "Ukraine offensive"'
                className="w-full rounded border border-border/50 bg-card/60 py-1.5 pl-6 pr-2 text-[11px] text-foreground placeholder:text-muted-foreground/50 focus:border-sky-500/60 focus:outline-none"
              />
            </div>

            {/* Date range */}
            <div className="flex gap-2">
              <div className="flex flex-1 flex-col gap-0.5">
                <label className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground">From</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full rounded border border-border/50 bg-card/60 px-2 py-1 text-[11px] text-foreground focus:border-sky-500/60 focus:outline-none"
                />
              </div>
              <div className="flex flex-1 flex-col gap-0.5">
                <label className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground">To</label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full rounded border border-border/50 bg-card/60 px-2 py-1 text-[11px] text-foreground focus:border-sky-500/60 focus:outline-none"
                />
              </div>
            </div>

            {/* Bbox */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setDrawingBbox(!isDrawingBbox)}
                className={`flex items-center gap-1 rounded border px-2 py-1 text-[10px] transition-colors ${
                  isDrawingBbox
                    ? "border-amber-500/60 bg-amber-500/15 text-amber-400"
                    : bbox
                    ? "border-sky-500/60 bg-sky-500/10 text-sky-400"
                    : "border-border/40 text-muted-foreground hover:border-border/70"
                }`}
              >
                <Square className="h-3 w-3" />
                {isDrawingBbox ? "Drawing…" : bbox ? "Region set" : "Draw region"}
              </button>
              {bbox && (
                <button
                  type="button"
                  onClick={() => setBbox(null)}
                  className="text-[10px] text-muted-foreground hover:text-foreground"
                >
                  Clear
                </button>
              )}
            </div>

            <button
              type="submit"
              disabled={isLoading || !keyword.trim()}
              className="flex items-center justify-center gap-1.5 rounded bg-sky-600 py-1.5 text-[11px] font-semibold text-white transition-colors hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Analyzing…
                </>
              ) : (
                <>
                  <Search className="h-3 w-3" />
                  Search &amp; Plot
                </>
              )}
            </button>
          </form>

          {/* Error */}
          {error && (
            <div className="mx-3 mb-3 flex items-center gap-1.5 rounded border border-red-500/30 bg-red-500/10 px-2 py-1.5">
              <AlertTriangle className="h-3 w-3 shrink-0 text-red-400" />
              <span className="text-[10px] text-red-400">{error}</span>
            </div>
          )}

          {/* Results list */}
          {events.length > 0 && (
            <div className="flex flex-col gap-0.5 border-t border-border/30 p-2" style={{ maxHeight: 320, overflowY: "auto" }}>
              <p className="px-0.5 pb-1 text-[9px] font-medium uppercase tracking-wider text-muted-foreground/60">
                {events.length} events · click to fly to location
              </p>
              {events.map((ev) => (
                <EventCard
                  key={ev.id}
                  event={ev}
                  selected={selectedEvent?.id === ev.id}
                  onSelect={() => handleSelectEvent(ev)}
                />
              ))}
            </div>
          )}

          {/* Empty state */}
          {!isLoading && events.length === 0 && keyword && !error && (
            <p className="px-3 pb-3 text-center text-[10px] text-muted-foreground/60">
              Enter a search term and date range, then click Search & Plot.
            </p>
          )}
        </>
      )}
    </div>
  );
}

// ─── Trigger button (shown in layer panel or standalone) ─────────────────────

export function TimelineTrigger() {
  const { isOpen, setOpen, events } = useTimelineStore();
  return (
    <button
      onClick={() => setOpen(!isOpen)}
      title="Timeline Replay"
      className={`flex items-center gap-1.5 rounded border px-2.5 py-1.5 text-[11px] font-medium transition-colors ${
        isOpen
          ? "border-sky-500/60 bg-sky-500/15 text-sky-400"
          : "border-border/40 bg-card/60 text-muted-foreground hover:border-border/70 hover:text-foreground"
      }`}
    >
      <Clock className="h-3.5 w-3.5" />
      <span>Timeline</span>
      {events.length > 0 && (
        <span className="rounded bg-sky-500/25 px-1 text-[9px] font-bold text-sky-400">
          {events.length}
        </span>
      )}
    </button>
  );
}
