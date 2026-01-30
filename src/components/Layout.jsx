import React from "react";
import Sidebar from "./Sidebar";

export default function Layout({ profile, signOut, children }) {
  const S = {
    wrapper: { 
      display: "flex", 
      minHeight: "100vh", 
      background: "#000" 
    },
    main: { 
      flex: 1, 
      padding: "20px", 
      overflowY: "auto",
      color: "#d0d0d0"
    },
  };

  return (
    <div style={S.wrapper}>
      {/* El Sidebar se encarga de los permisos internamente */}
      <Sidebar profile={profile} signOut={signOut} />
      
      <main style={S.main}>
        {children}
      </main>
    </div>
  );
}