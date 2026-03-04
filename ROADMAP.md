# Global Threat Map — Product Roadmap

Feature roadmap drawing on capabilities from [XTOC™ Tactical Operations Center](https://www.mkme.org/xtocapp/) and the broader OSINT/geospatial threat intelligence space.

---

## Current State (Implemented)

### Core Map & Visualization
- Interactive Mapbox GL map with clustering, heatmaps, and popups
- 8 visual rendering modes: Normal, CRT, Night Vision, FLIR, Anime, Noir, Snow, AI
- 20+ toggleable map layers via Layer Panel
- 3D terrain, ArcGIS hillshade, Mapbox satellite base layers
- Google Photorealistic 3D Tiles (zoom ≥15, deck.gl)
- Watchbox drawing — user-drawn bounding boxes for area analysis
- City quick-fly navigation bar
- HUD banner with threat summary and data freshness

### Threat Events
- Real-time threat event feed with 14+ categories: conflict, protest, disaster, diplomatic, economic, terrorism, cyber, health, environmental, military, crime, piracy, infrastructure, commodities
- 5-tier severity classification: critical, high, medium, low, info
- AI-powered event classification (Claude / OpenAI fallback)
- Filtering by category, threat level, time range, and keyword search
- Entity extraction and keyword tagging
- Timeline search with bounding box, date range, and geocoding (Exa + Claude)

### Real-time Data Layers
- **Aircraft tracking** — OpenSky Network, 30s refresh, live positions/headings/altitudes
- **Vessel/maritime tracking** — AISStream WebSocket (key required: `NEXT_PUBLIC_AISSTREAM_API_KEY`)
- **Earthquake/seismic** — USGS, magnitude ≥2.0, 5-min refresh
- **Weather radar** — RainViewer animated radar tiles, 5-min refresh
- **Weather alerts** — NOAA/NWS active alert polygons, 5-min refresh
- **Satellite orbital positions** — CelesTrak TLE + SGP4 propagation, 8 categories (ISS, GPS, Starlink, weather, Galileo, GLONASS, Beidou), 30s refresh
- **News hotspots** — GDELT geolocated article clusters, 15-min refresh
- **Fire hotspots** — NASA GIBS VIIRS active fires
- **GhostMaps (S2 Underground)** — CIP critical infrastructure + Border Crisis KML overlays, 1-hr refresh
- **Military bases** — USA & NATO installations (Valyu API)

### Camera Overlays (6 sources)
- NYC DOT traffic cameras
- FAA aviation weather cameras
- CalTrans traffic cameras (all 12 CA districts)
- WSDOT Washington State traffic cameras
- NOAA NDBC BuoyCams (ocean buoy cameras)
- National Park Service webcams

### Intelligence & Research Features
- Entity profile lookup with related entities, economic data, recent events (Valyu API)
- Deep research tasks — async background jobs with SSE polling
- Geopolitical, economic, security, and humanitarian report generation
- Image geolocation — EXIF GPS → GeoSpy AI → Claude Vision fallback chain
- Polymarket prediction market ticker

### Auth & Access Control
- Valyu OAuth integration with token persistence
- Usage limits and free-tier enforcement
- Sign-in modal with rate limit gating

---

## Roadmap

### Camera & Surveillance Overlays

#### Flock Safety Camera Network
- [ ] Integrate Flock Safety LPR (license plate reader) camera locations as a map overlay
- [ ] Camera popup with location metadata, jurisdiction, and install date where available
- [ ] Community/HOA vs. law enforcement camera distinction
- [ ] Alert layer for cameras covering a drawn watchbox area
- [ ] Link to Flock public data / FOIA-sourced camera location datasets

#### Additional Camera Sources
- [ ] Skyline / Earthcam live webcam network integration
- [ ] Windy.com webcam API overlay
- [ ] InsecamDB / open RTSP stream discovery layer (with privacy/legal flags)
- [ ] DOT/highway camera expansion beyond CA/WA/NYC (TX, FL, IL, etc.)

### Aircraft Enhancements
- [ ] Aircraft watchlist — flag specific ICAO hex, registration, or callsign
- [ ] Flagged aircraft rendered with distinct pulsing icon, elevated in sidebar
- [ ] Watchlist persistence across sessions; exportable
- [ ] Alert when flagged aircraft enters a drawn watchbox zone
- [ ] Aircraft type filtering improvements (military, cargo, bizjet, helicopter)
- [ ] ADSBexchange / FR24 as fallback/supplement to OpenSky for higher coverage

### Maritime / Vessel Enhancements
- [ ] Vessel watchlist — flag by MMSI, IMO, or name
- [ ] Zone entry alert when flagged vessel crosses into a watchbox
- [ ] Vessel history trail / breadcrumb track on map
- [ ] Dark vessel detection — AIS gap analysis (vessel goes silent)
- [ ] AIS spoofing detection indicators (position jump anomalies)
- [ ] Port congestion overlay

### OSINT Intelligence Enrichment
- [ ] Click-to-enrich for vessels: ownership, flag state, sanctions status, route history (MarineTraffic / Pole Star)
- [ ] Click-to-enrich for aircraft: owner, operator, registration history (ADS-B Exchange / RadarBox)
- [ ] Cross-reference flagged entities against open sanctions/watchlists: UN, OFAC, EU, UK HMT
- [ ] Reverse geocoding and place intelligence for all incident markers
- [ ] Telegram channel monitoring — geotagged posts from conflict/crisis channels
- [ ] Social media hotspot layer (X/Twitter geotag clusters around breaking events)

### Satellite (SATCOM) Enhancements
- [ ] Filter satellite overlay by type: ham radio, LEO constellations, military, weather
- [ ] Real-time pass prediction overlay for a selected ground location
- [ ] SAR (Synthetic Aperture Radar) satellite pass alerts for a watchbox
- [ ] Planet Labs / Maxar tasking link for on-demand imagery requests
- [ ] Historical satellite imagery scrubber (Google Earth Engine or SentinelHub)

### Tactical Zones & Area Markings
- [ ] Draw zones on map — circle or freehand polygon
- [ ] Label zones: Danger, Safe, Exclusion, Watch Area, Cordon, etc.
- [ ] Share zones as exportable overlays (GeoJSON / KMZ)
- [ ] Zone entry/exit alerting for tracked entities (aircraft, vessels, events)

### Structured Intelligence Packets / SITREPs (XTOC-inspired)
- [ ] Standardised packet templates: SITREP, TASK, CONTACT, RESOURCE, ASSET, CHECKIN/LOC, ZONE, MISSION, EVENT, PHASE LINE
- [ ] Import/export structured packets via clipboard, QR code, or file
- [ ] Multipart chunking (P/N) — send in any order, receiver reassembles and deduplicates
- [ ] Filter, map, and archive events by packet type

### ATAK / CoT Integration
- [ ] Exchange KML/KMZ overlays with ATAK-compatible clients
- [ ] Live Cursor-on-Target (CoT) gateway — ATAK ↔ Global Threat Map
- [ ] Import ATAK data packages as map overlays

### Mesh Network Node Overlay
- [ ] Plot Meshtastic / MeshCore / OpenMANET nodes on the tactical map
- [ ] Node-to-team/unit assignment
- [ ] Signal health / last-seen indicator per node

### Shared / Multi-Screen TOC View
- [ ] Host exports DB snapshot; others join as read-only mirror via QR or link
- [ ] Auto-sync for multi-screen EOC/mission control setups (wall map + planner + scribe)
- [ ] LAN-local sync without internet dependency

### Offline / Local-First Mode
- [ ] Full PWA — installable on iOS, Android, Desktop
- [ ] All data stored locally; works without internet once loaded
- [ ] Graceful degradation when live feeds are unavailable (cached last-known state)

### Secure Session / Trust Link (XTOC-inspired)
- [ ] One-time challenge/response to link field operators to the TOC
- [ ] Auto-sign packets from linked operators
- [ ] TOC verifies signatures and rejects replays/forgeries regardless of transport

### Multi-Transport Packet Relay
- [ ] Export packets as compact text for relay over: radio, email, Meshtastic, Reticulum (RNS), Winlink
- [ ] QR code encode/decode for packet transfer
- [ ] CLEAR (unencrypted) and SECURE (encrypted) packet modes

### Voice / TTS Output
- [ ] Text-to-speech readback for packets — character-by-character or full sentence
- [ ] Useful for voice relay operators in radio-only environments

### Mission & Phase Management
- [ ] Create and track named Missions with associated phases and phase lines
- [ ] Link SITREPs, TASKs, and assets to a specific mission
- [ ] Timeline/chronological log view per mission

### Resource & Asset Tracking
- [ ] Inventory tracking: resources (consumables/supplies) and assets (vehicles, equipment, personnel)
- [ ] Assign assets to zones or missions
- [ ] Status updates: available, deployed, out-of-service

### Infrastructure & Configuration
- [ ] AISStream API key configuration UI (currently requires `.env.local` — `NEXT_PUBLIC_AISSTREAM_API_KEY`)
- [ ] API key health dashboard — show which integrations are active/missing keys
- [ ] Fallback AIS source when key unavailable (e.g. VesselFinder or MarineTraffic public feed)

---

## Sources
- [XTOC™ App — mkme.org](https://www.mkme.org/xtocapp/)
- [XTOC™ Store Listing — store.mkme.org](https://store.mkme.org/product/xtoc-tactical-operations-center-software-suite/)
- [Flock Safety](https://www.flocksafety.com/)
