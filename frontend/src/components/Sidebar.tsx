import { useEffect, useState } from "react";
import { api } from "../lib/api";
import type { EngineHealth } from "../types";
import { FileIcon, Home, Logo, Settings } from "./Icons";

type View = "home" | "documents" | "settings";

const navItem: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 11,
  padding: "9px 11px",
  borderRadius: 8,
  fontSize: 13,
  cursor: "pointer",
};

export function Sidebar({
  view,
  onNavigate,
  docCount,
}: {
  view: View;
  onNavigate: (v: View) => void;
  docCount: number;
}) {
  const [engine, setEngine] = useState<EngineHealth | null>(null);

  useEffect(() => {
    let alive = true;
    api
      .engineHealth()
      .then((e) => alive && setEngine(e))
      .catch(() => alive && setEngine({ online: false, engine: "docling" }));
    return () => {
      alive = false;
    };
  }, []);

  const online = engine?.online ?? false;

  return (
    <aside
      style={{
        width: 228,
        flex: "none",
        background: "linear-gradient(180deg,#2c3e54,#26374A)",
        borderRight: "1px solid var(--rail2)",
        display: "flex",
        flexDirection: "column",
        position: "relative",
        zIndex: 2,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 11,
          padding: "17px 18px 16px",
          borderBottom: "1px solid rgba(255,255,255,.09)",
        }}
      >
        <div
          style={{
            width: 38,
            height: 38,
            flex: "none",
            borderRadius: 9,
            background: "#fff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "0 2px 8px rgba(0,0,0,.18)",
          }}
        >
          <Logo />
        </div>
        <div style={{ lineHeight: 1.05 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#fff" }}>PacifiCan</div>
          <div
            style={{
              fontSize: 8.5,
              fontFamily: "var(--mono)",
              letterSpacing: ".24em",
              color: "var(--teal-lt)",
              marginTop: 3,
            }}
          >
            PARSE&nbsp;STUDIO
          </div>
        </div>
      </div>

      <nav style={{ padding: "14px 12px", display: "flex", flexDirection: "column", gap: 3 }}>
        <div
          style={{
            fontFamily: "var(--mono)",
            fontSize: 8.5,
            letterSpacing: ".22em",
            color: "rgba(255,255,255,.4)",
            padding: "4px 10px 9px",
          }}
        >
          NAVIGATION
        </div>

        <NavLink active={view === "home"} onClick={() => onNavigate("home")}>
          <Home color={view === "home" ? "#fff" : "rgba(255,255,255,.72)"} />
          Home
        </NavLink>

        <NavLink active={view === "documents"} onClick={() => onNavigate("documents")} accent>
          <FileIcon color={view === "documents" ? "#ff6b6e" : "rgba(255,255,255,.72)"} />
          Documents
          <span style={{ marginLeft: "auto", fontFamily: "var(--mono)", fontSize: 9, color: "#ff8e90" }}>
            {docCount}
          </span>
        </NavLink>

        <NavLink active={view === "settings"} onClick={() => onNavigate("settings")}>
          <Settings color={view === "settings" ? "#fff" : "rgba(255,255,255,.72)"} />
          Settings
        </NavLink>
      </nav>

      <div
        style={{
          marginTop: "auto",
          padding: "14px 16px",
          borderTop: "1px solid rgba(255,255,255,.09)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            fontFamily: "var(--mono)",
            fontSize: 10,
            color: "rgba(255,255,255,.72)",
          }}
        >
          <span
            style={{
              width: 7,
              height: 7,
              borderRadius: "50%",
              background: online ? "#4fd08a" : "#d3a04f",
              boxShadow: online ? "0 0 7px #4fd08a" : "0 0 7px #d3a04f",
              animation: "pulseDot 2.4s infinite",
            }}
          />
          {online ? "ENGINE ONLINE" : "ENGINE OFFLINE"}
        </div>
        <div
          style={{
            fontFamily: "var(--mono)",
            fontSize: 9,
            color: "rgba(255,255,255,.42)",
            marginTop: 7,
          }}
        >
          docling{engine?.version ? ` · v${engine.version}` : ""} · CA-CENTRAL
        </div>
      </div>
    </aside>
  );
}

function NavLink({
  active,
  accent,
  onClick,
  children,
}: {
  active: boolean;
  accent?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  const activeStyle: React.CSSProperties = accent
    ? {
        color: "#fff",
        fontWeight: 500,
        background: "rgba(211,8,12,.18)",
        border: "1px solid rgba(211,8,12,.45)",
        boxShadow: "inset 3px 0 0 var(--red)",
      }
    : { background: "rgba(255,255,255,.07)", color: "#fff" };

  return (
    <a
      onClick={onClick}
      style={{
        ...navItem,
        color: "rgba(255,255,255,.72)",
        ...(active ? activeStyle : {}),
      }}
      onMouseEnter={(e) => {
        if (!active) {
          e.currentTarget.style.background = "rgba(255,255,255,.07)";
          e.currentTarget.style.color = "#fff";
        }
      }}
      onMouseLeave={(e) => {
        if (!active) {
          e.currentTarget.style.background = "transparent";
          e.currentTarget.style.color = "rgba(255,255,255,.72)";
        }
      }}
    >
      {children}
    </a>
  );
}
