import React from "react";
import Sidebar from "./Sidebar";
import { C } from "@/theme";
import { useResponsive } from "@/hooks/useResponsive";

export default function Layout({ profile, signOut, children }) {
  const { isMobile } = useResponsive();
  return (
    <div style={{ 
      display: "flex", 
      height: "100vh",
      overflow: "hidden",
      background: C.bg
    }}>
      <Sidebar profile={profile} signOut={signOut} />
      <main style={{ 
        flex: 1, 
        minWidth: 0,
        overflowY: "auto",
        color: C.text,
        paddingTop: isMobile ? "env(safe-area-inset-top, 0px)" : 0,
      }}>
        {children}
      </main>
    </div>
  );
}
