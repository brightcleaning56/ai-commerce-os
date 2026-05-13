"use client";
import { useState } from "react";
import Sidebar from "@/components/Sidebar";
import TopBar from "@/components/TopBar";
import CommandPaletteProvider from "@/components/CommandPalette";
import ToastProvider from "@/components/Toast";
import VoiceProvider from "@/components/voice/VoiceContext";
import IncomingCallWidget from "@/components/voice/IncomingCallWidget";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  return (
    <ToastProvider>
      <CommandPaletteProvider>
        {/* VoiceProvider mounts ONCE per browser tab and registers the
            Twilio Device. Inbound calls then ring on every page (vs the
            old /tasks-scoped Device that only fired when /tasks was open).
            Falls back to no-op silently when voice isn't configured. */}
        <VoiceProvider>
          <div className="flex min-h-screen">
            <Sidebar mobileOpen={mobileOpen} onClose={() => setMobileOpen(false)} />
            <div className="flex flex-1 flex-col min-w-0">
              <TopBar onMenuClick={() => setMobileOpen(true)} />
              <main className="flex-1 overflow-x-hidden p-4 sm:p-6">{children}</main>
            </div>
          </div>
          {/* Floating bottom-right alert when an inbound call rings.
              Z-index puts it above any page content + drawer. */}
          <IncomingCallWidget />
        </VoiceProvider>
      </CommandPaletteProvider>
    </ToastProvider>
  );
}
