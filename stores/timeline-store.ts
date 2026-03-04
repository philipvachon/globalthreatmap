import { create } from "zustand";

export type TimelineEventType =
  | "strike"
  | "explosion"
  | "military"
  | "protest"
  | "infrastructure"
  | "political"
  | "natural"
  | "disaster"
  | "other";

export interface TimelineEvent {
  id: string;
  title: string;
  summary: string;
  latitude: number;
  longitude: number;
  timestamp: string;
  eventType: TimelineEventType;
  source: string;
  url: string;
  location: string;
  confidence: number;
}

export interface BBox {
  north: number;
  south: number;
  east: number;
  west: number;
}

interface TimelineState {
  isOpen: boolean;
  isLoading: boolean;
  error: string | null;
  events: TimelineEvent[];
  selectedEvent: TimelineEvent | null;
  keyword: string;
  startDate: string;
  endDate: string;
  bbox: BBox | null;
  isDrawingBbox: boolean;

  setOpen: (open: boolean) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setEvents: (events: TimelineEvent[]) => void;
  selectEvent: (event: TimelineEvent | null) => void;
  setKeyword: (keyword: string) => void;
  setStartDate: (date: string) => void;
  setEndDate: (date: string) => void;
  setBbox: (bbox: BBox | null) => void;
  setDrawingBbox: (drawing: boolean) => void;
}

function daysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().split("T")[0];
}

export const useTimelineStore = create<TimelineState>((set) => ({
  isOpen:        false,
  isLoading:     false,
  error:         null,
  events:        [],
  selectedEvent: null,
  keyword:       "",
  startDate:     daysAgo(30),
  endDate:       new Date().toISOString().split("T")[0],
  bbox:          null,
  isDrawingBbox: false,

  setOpen:         (isOpen)       => set({ isOpen }),
  setLoading:      (isLoading)    => set({ isLoading }),
  setError:        (error)        => set({ error }),
  setEvents:       (events)       => set({ events }),
  selectEvent:     (selectedEvent) => set({ selectedEvent }),
  setKeyword:      (keyword)      => set({ keyword }),
  setStartDate:    (startDate)    => set({ startDate }),
  setEndDate:      (endDate)      => set({ endDate }),
  setBbox:         (bbox)         => set({ bbox }),
  setDrawingBbox:  (isDrawingBbox) => set({ isDrawingBbox }),
}));
