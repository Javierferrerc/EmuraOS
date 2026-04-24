/**
 * Shared right-click context menu for GameCard, GameListRow and GameCardCompact.
 *
 * Phase 20 slice 3: expands the legacy "Open with…" menu into a full set
 * of rom-level actions. Rendered through a portal so the popup escapes
 * the host card's `overflow: hidden`/3D transform context without needing
 * each card to co-ordinate its own stacking rules.
 *
 * The component is intentionally "dumb": it takes an already-opened
 * position and a close callback. Each host decides when to open the menu
 * (onContextMenu) and where (clientX/Y), keeping this file focused on
 * rendering + action dispatch.
 */

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useApp } from "../context/AppContext";
import type { DiscoveredRom } from "../../../core/types";

export interface GameContextMenuProps {
  rom: DiscoveredRom;
  /** Viewport x-coordinate where the menu should open. */
  x: number;
  y: number;
  onClose: () => void;
}

export function GameContextMenu({ rom, x, y, onClose }: GameContextMenuProps) {
  const {
    launchGame,
    openGameDetail,
    hideRom,
    showRomInExplorer,
    copyRomPath,
  } = useApp();

  const [emulators, setEmulators] = useState<
    Array<{ emulatorId: string; emulatorName: string }>
  >([]);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    // Only fetch emulators if we might need the "Abrir con…" submenu — a
    // rom with 0 or 1 detected emulator collapses to a plain "Lanzar",
    // so the extra IPC round-trip is avoided.
    let cancelled = false;
    window.electronAPI
      .getEmulatorsForSystem(rom.systemId)
      .then((list) => {
        if (!cancelled) setEmulators(list);
      })
      .catch(() => {
        /* list stays empty; menu still shows Lanzar as a fallback */
      });
    return () => {
      cancelled = true;
    };
  }, [rom.systemId]);

  // Close on Escape or outside click. The outside-click listener attaches
  // on `mousedown` (not `click`) so it fires before any React onClick on
  // the card, preventing the parent's double-click from accidentally
  // re-opening the game after a dismiss.
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const handleDown = () => onClose();
    document.addEventListener("keydown", handleKey);
    document.addEventListener("mousedown", handleDown);
    return () => {
      document.removeEventListener("keydown", handleKey);
      document.removeEventListener("mousedown", handleDown);
    };
  }, [onClose]);

  const stop = (e: React.MouseEvent) => e.stopPropagation();

  const handleLaunch = useCallback(
    (emulatorId?: string) => {
      launchGame(rom, emulatorId);
      onClose();
    },
    [launchGame, rom, onClose]
  );

  const handleDetail = useCallback(() => {
    openGameDetail(rom);
    onClose();
  }, [openGameDetail, rom, onClose]);

  const handleReveal = useCallback(() => {
    void showRomInExplorer(rom.filePath);
    onClose();
  }, [showRomInExplorer, rom.filePath, onClose]);

  const handleCopy = useCallback(async () => {
    await copyRomPath(rom.filePath);
    setCopied(true);
    // Brief visual confirmation before the menu unmounts.
    setTimeout(onClose, 600);
  }, [copyRomPath, rom.filePath, onClose]);

  const handleHide = useCallback(() => {
    void hideRom(rom.systemId, rom.fileName);
    onClose();
  }, [hideRom, rom.systemId, rom.fileName, onClose]);

  // Clamp menu position so it stays fully on-screen — a rom at the bottom
  // right of the grid would otherwise spill past the viewport edge.
  const MENU_WIDTH = 240;
  const MENU_HEIGHT = 260;
  const clampedX = Math.min(x, window.innerWidth - MENU_WIDTH - 8);
  const clampedY = Math.min(y, window.innerHeight - MENU_HEIGHT - 8);

  return createPortal(
    <div
      className="ctx-menu-panel fixed z-50 min-w-[220px] rounded-lg border py-1 shadow-xl backdrop-blur-sm"
      style={{
        left: clampedX,
        top: clampedY,
        background: "var(--color-ctx-bg)",
        borderColor: "var(--color-ctx-border)",
      }}
      onMouseDown={stop}
      onClick={stop}
    >
      <MenuItem onClick={() => handleLaunch()}>▶ Lanzar</MenuItem>

      {emulators.length > 1 && (
        <>
          <Divider />
          <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">
            Abrir con
          </div>
          {emulators.map((emu) => (
            <MenuItem
              key={emu.emulatorId}
              onClick={() => handleLaunch(emu.emulatorId)}
            >
              {emu.emulatorName}
            </MenuItem>
          ))}
        </>
      )}

      <Divider />
      <MenuItem onClick={handleDetail}>ⓘ Ver ficha</MenuItem>
      <MenuItem onClick={handleCopy}>
        {copied ? "✓ Ruta copiada" : "⎘ Copiar ruta"}
      </MenuItem>
      <MenuItem onClick={handleReveal}>↗ Mostrar en Explorer</MenuItem>

      <Divider />
      <MenuItem onClick={handleHide}>⦸ Ocultar de biblioteca</MenuItem>
    </div>,
    document.body
  );
}

function MenuItem({
  onClick,
  children,
}: {
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      className="ctx-menu-item flex w-full items-center gap-2 px-3 py-1.5 text-sm text-secondary transition-colors"
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function Divider() {
  return (
    <div
      className="mx-2 my-1 border-t"
      style={{ borderColor: "var(--color-ctx-border)" }}
    />
  );
}
