# Global Threat Map — Product Roadmap

Feature roadmap drawing on capabilities from [XTOC™ Tactical Operations Center](https://www.mkme.org/xtocapp/) and the broader OSINT/geospatial threat intelligence space.

---

## Current State

- Live maritime AIS vessel tracking (aisstream.io integration — key required)
- Live flight ADS-B tracking (OpenSky / ADSBexchange)
- Interactive threat map with layer toggles
- Real-time WebSocket data feeds

---

## Roadmap Items (sourced from XTOC™ feature set)

### Structured Intelligence Packets / SITREPs
- [ ] Standardised packet templates: SITREP, TASK, CONTACT, RESOURCE, ASSET, CHECKIN/LOC, ZONE, MISSION, EVENT, PHASE LINE
- [ ] Import/export structured packets via clipboard, QR code, or file
- [ ] Multipart chunking (P/N) — send in any order, receiver reassembles and deduplicates
- [ ] Filter, map, and archive by packet type

### Tactical Zones & Area Markings
- [ ] Draw zones on the map — circle or freehand polygon
- [ ] Label zones (e.g. Danger, Safe, Exclusion, Watch Area)
- [ ] Export/share zones as packets or overlays so all viewers share the same operational picture

### Satellite (SATCOM) Tracking
- [ ] Load TLE data sets (paste, file upload, or fetch from Celestrak)
- [ ] Visualise satellite positions and ground tracks on the tactical map
- [ ] Filter by satellite type (e.g. ham radio birds, LEO constellations, military)
- [ ] Real-time pass prediction overlay

### Aircraft Watchlist / Flagging
- [ ] Flag specific aircraft (ICAO hex, registration, or callsign) from the map popup or a lookup panel
- [ ] Flagged aircraft rendered with a distinct pulsing icon and elevated in sidebar lists
- [ ] Persist watchlist across sessions; exportable
- [ ] Alert/notification when a flagged aircraft enters a defined zone

### Ship / Vessel Watchlist
- [ ] Flag specific vessels (MMSI, IMO, or name)
- [ ] Watchlist alert when flagged vessel enters a zone or changes course significantly
- [ ] Vessel history trail on the map

### ATAK / CoT Integration
- [ ] Exchange KML/KMZ overlays with ATAK-compatible clients
- [ ] Live Cursor-on-Target (CoT) gateway — ATAK ↔ Global Threat Map
- [ ] Import ATAK data packages as map overlays

### Mesh Network Node Overlay
- [ ] Plot Meshtastic / MeshCore / OpenMANET nodes on the tactical map
- [ ] Node-to-team/unit assignment
- [ ] Signal health / last-seen indicator per node

### Shared / Mirrored TOC View
- [ ] One host device exports a DB snapshot; others join as read-only mirror via QR or link
- [ ] Auto-sync for multi-screen EOC/mission control setups (wall map + planner + scribe)
- [ ] LAN-local sync without internet dependency

### Offline / Local-First Mode
- [ ] Full PWA — installable on iOS, Android, Desktop
- [ ] All data stored locally; works without internet once loaded
- [ ] No accounts, no central server required
- [ ] Graceful degradation when live feeds are unavailable (cached last-known state)

### Secure Session / Trust Link
- [ ] One-time challenge/response to link field operators to the TOC
- [ ] Auto-sign packets from linked operators
- [ ] TOC verifies signatures and rejects replays/forgeries regardless of transport

### Multi-Transport Packet Relay
- [ ] Export packets as compact text for relay over: radio, email, Meshtastic, Reticulum (RNS), Winlink-style workflows
- [ ] QR code encode/decode for packet transfer
- [ ] CLEAR (unencrypted) and SECURE (encrypted) modes for non-ham transports

### Voice / TTS Output
- [ ] Text-to-speech output for packets — character-by-character or full readback
- [ ] Useful for voice relay operators in radio-only environments

### Mission & Phase Management
- [ ] Create and track named Missions with associated phases and phase lines
- [ ] Link SITREPs, TASKs, and assets to a specific mission
- [ ] Timeline/chronological log view per mission

### Resource & Asset Tracking
- [ ] Inventory tracking: resources (consumables/supplies) and assets (vehicles, equipment, personnel)
- [ ] Assign assets to zones or missions
- [ ] Status updates (available, deployed, out-of-service)

### Intel Enrichment (OSINT-native additions beyond XTOC)
- [ ] Vessel/aircraft OSINT enrichment on click (ownership, sanctions, flag state, route history)
- [ ] Reverse geocoding and place intelligence for incident markers
- [ ] Cross-reference flagged entities against open sanctions/watchlists (UN, OFAC, EU)
- [ ] Dark vessel detection (AIS gap analysis)
- [ ] Spoofing detection indicators on vessel/aircraft tracks

---

## Sources
- [XTOC™ App — mkme.org](https://www.mkme.org/xtocapp/)
- [XTOC™ Store Listing — store.mkme.org](https://store.mkme.org/product/xtoc-tactical-operations-center-software-suite/)
