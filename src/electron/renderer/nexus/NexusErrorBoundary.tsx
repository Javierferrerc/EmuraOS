/**
 * NexusErrorBoundary — catches render/runtime crashes in the NEXUS tree so a
 * thrown error shows a readable message instead of a black screen, and surfaces
 * the message for diagnosis. Reset returns to a clean render attempt.
 */

import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}
interface State {
  error: Error | null;
}

export class NexusErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[NEXUS] render crash:", error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 14,
          padding: 40,
          textAlign: "center",
          background: "linear-gradient(180deg,#0a0c11,#07080b)",
          color: "#eef1f7",
          fontFamily: "Sora, system-ui, sans-serif",
        }}
      >
        <div style={{ fontSize: 18, fontWeight: 800 }}>Algo se rompió en NEXUS</div>
        <div
          style={{
            maxWidth: 720,
            fontSize: 13,
            color: "rgba(238,241,247,0.7)",
            fontFamily: "ui-monospace, Menlo, monospace",
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            background: "rgba(255,255,255,0.05)",
            border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: 12,
            padding: "12px 16px",
          }}
        >
          {error.message || String(error)}
        </div>
        <button
          onClick={() => this.setState({ error: null })}
          style={{
            height: 38,
            padding: "0 18px",
            borderRadius: 10,
            border: 0,
            background: "#3b82f6",
            color: "#fff",
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          Reintentar
        </button>
      </div>
    );
  }
}
