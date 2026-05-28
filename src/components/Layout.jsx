import React from "react";
import Sidebar from "./Sidebar";
import { C } from "@/theme";

export default function Layout({ profile, signOut, children }) {
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
        overflowY: "auto",
        color: C.text
      }}>
        {children}
      </main>
    </div>
  );
}
