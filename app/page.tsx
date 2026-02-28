"use client";

import { useState, useEffect } from "react";
import { useEvents } from "@/hooks/use-events";
import { Header } from "@/components/header";
import { Sidebar } from "@/components/sidebar";
import { ThreatMap } from "@/components/map/threat-map";
import { TimelineScrubber } from "@/components/map/timeline-scrubber";
import { LayerPanel } from "@/components/map/layer-panel";
import { SatelliteControls } from "@/components/map/satellite-controls";
import { WelcomeModal } from "@/components/welcome-modal";
import { SignInPanel, SignInModal } from "@/components/auth";
import { PolymarketTicker, POLYMARKET_TICKER_HEIGHT } from "@/components/polymarket-ticker";

const WELCOME_DISMISSED_KEY = "globalthreatmap_welcome_dismissed";

export default function Home() {
  const [showWelcome, setShowWelcome] = useState(false);
  const [showSignInModal, setShowSignInModal] = useState(false);
  const { isLoading, refresh, requiresSignIn } = useEvents({
    autoRefresh: true,
    refreshInterval: 300000,
  });

  useEffect(() => {
    const dismissed = localStorage.getItem(WELCOME_DISMISSED_KEY);
    if (!dismissed) setShowWelcome(true);
  }, []);

  useEffect(() => {
    if (requiresSignIn) setShowSignInModal(true);
  }, [requiresSignIn]);

  return (
    <div className="flex h-screen flex-col" style={{ paddingBottom: POLYMARKET_TICKER_HEIGHT }}>
      <Header onRefresh={refresh} isLoading={isLoading} onShowHelp={() => setShowWelcome(true)} />
      <div className="flex flex-1 overflow-hidden">
        <div className="relative flex-1">
          <ThreatMap />

          {/* Layer control panel — top-left */}
          <div className="absolute left-4 top-4 z-10">
            <LayerPanel />
          </div>

          {/* Satellite date scrubber — bottom-center, above auto-pan button */}
          <div className="absolute bottom-6 left-1/2 z-10 -translate-x-1/2">
            <SatelliteControls />
          </div>

          {/* Auto-pan toggle — bottom-left */}
          <TimelineScrubber />
        </div>
        <Sidebar />
      </div>
      <WelcomeModal open={showWelcome} onOpenChange={setShowWelcome} />
      <SignInPanel />
      <SignInModal open={showSignInModal} onOpenChange={setShowSignInModal} />
      <PolymarketTicker category="Politics" />
    </div>
  );
}
