import { useRef, useEffect, useCallback } from "react";
import { useApp } from "../context/AppContext";

export function GameModeView() {
  const { currentGame, stopGame, getMetadataForRom, isFullscreen, toggleFullscreen } = useApp();
  const gameAreaRef = useRef<HTMLDivElement>(null);

  const sendBounds = useCallback(() => {
    const el = gameAreaRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    window.electronAPI.setGameAreaBounds({
      x: Math.round(rect.left),
      y: Math.round(rect.top),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
    });
  }, []);

  // F10 toggles fullscreen, Escape exits fullscreen
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "F10") {
        e.preventDefault();
        toggleFullscreen();
        return;
      }
      if (e.key === "Escape" && isFullscreen) {
        toggleFullscreen();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isFullscreen, toggleFullscreen]);

  // Send bounds on mount + observe resizes
  useEffect(() => {
    const el = gameAreaRef.current;
    if (!el) return;

    // Initial send
    sendBounds();

    const observer = new ResizeObserver(() => {
      sendBounds();
    });
    observer.observe(el);

    return () => observer.disconnect();
  }, [sendBounds]);

  const metadata = currentGame
    ? getMetadataForRom(currentGame.rom.systemId, currentGame.rom.fileName)
    : null;

  const displayName = metadata?.title || currentGame?.rom.fileName || "Game";
  const systemName = currentGame?.rom.systemName || "";

  return (
    <div className="flex h-screen flex-col text-primary" style={{ background: "var(--color-bg)" }}>
      {/* Top bar — hidden in fullscreen */}
      {!isFullscreen && (
        <header className="flex items-center justify-between border-b px-4 py-2 bg-surface-1 shadow-themed" style={{ borderColor: "var(--color-ctx-border)" }}>
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg text-sm font-bold" style={{ background: "var(--color-accent)" }}>
              {"\u25B6"}
            </div>
            <div>
              <h1 className="text-sm font-semibold leading-tight">
                {displayName}
              </h1>
              {systemName && (
                <p className="text-xs text-muted">{systemName}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={toggleFullscreen}
              className="rounded-lg px-3 py-1.5 text-sm font-medium text-primary transition-colors bg-surface-2 shadow-themed shadow-themed-hover"
              title="Toggle Fullscreen (F10)"
            >
              Fullscreen
            </button>
            <button
              onClick={stopGame}
              className="rounded-lg bg-red-600 px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-red-500 shadow-themed shadow-themed-hover"
            >
              Stop Game
            </button>
          </div>
        </header>
      )}

      {/* Game area — the emulator window is positioned over this div */}
      <div
        ref={gameAreaRef}
        className="flex flex-1 items-center justify-center bg-black"
      >
        {/* Content behind the emulator overlay, visible during loading */}
        <p className="text-sm text-muted">Loading emulator...</p>
      </div>
    </div>
  );
}
