import React from "react";
import Sidebar from "./Sidebar";

export default function Layout({ profile, signOut, children }) {
  return (
    <div style={{ 
      display: "flex", 
      height: "100vh",
      overflow: "hidden",
      background: "#000" 
    }}>
      <Sidebar profile={profile} signOut={signOut} />
      <main style={{ 
        flex: 1, 
        overflowY: "auto",
        color: "#d0d0d0"
      }}>
        {children}
      </main>
    </div>
  );
}
