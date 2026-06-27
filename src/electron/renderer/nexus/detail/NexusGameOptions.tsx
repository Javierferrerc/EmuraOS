/**
 * NexusGameOptions — per-game options modal opened from the detail's "Opciones"
 * action. Game-scoped (not the global settings page): pick the emulator/core
 * used for THIS game (a per-game override) and open the ROM's location.
 */

import { useEffect, useState } from "react";
import type { NexusGame } from "../nexusModel";
import { SettingsIcon, CloseIcon, CheckIcon } from "../NexusIcons";
import "./nexus-game-options.css";

interface EmuOption {
  emulatorId: string;
  emulatorName: string;
}

export function NexusGameOptions({
  game,
  onClose,
  onChanged,
}: {
  game: NexusGame;
  onClose: () => void;
  /** Fired after the per-game emulator override changes, so the ficha can
   *  refresh its "Core" display. */
  onChanged?: () => void;
}) {
  const key = `${game.rom.systemId}:${game.rom.fileName}`;
  const [emus, setEmus] = useState<EmuOption[]>([]);
  const [overrideId, setOverrideId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [overrides, list] = await Promise.all([
          window.electronAPI.getGameOverrides(),
          window.electronAPI.getEmulatorsForSystem(game.rom.systemId),
        ]);
        if (cancelled) return;
        setEmus(list);
        setOverrideId(overrides[key]?.emulatorId ?? null);
      } catch (e) {
        console.warn("[game-options] load failed:", e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [key, game.rom.systemId]);

  // Esc closes (stop it bubbling to the ficha's own Esc → back).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  const chooseEmu = async (id: string | null) => {
    if (busy || id === overrideId) return;
    setBusy(true);
    try {
      await window.electronAPI.setEmulatorOverride(game.rom.systemId, game.rom.fileName, id);
      setOverrideId(id);
      onChanged?.();
    } catch (e) {
      console.warn("[game-options] set emulator failed:", e);
    } finally {
      setBusy(false);
    }
  };

  const defaultEmu = emus[0];

  return (
    <div
      className="go-stage"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="go-modal" role="dialog" aria-label="Opciones del juego">
        <div className="go-head">
          <span className="go-ic">
            <SettingsIcon size={19} />
          </span>
          <div className="go-head-txt">
            <h2>Opciones del juego</h2>
            <p>{game.title}</p>
          </div>
          <button className="go-close" onClick={onClose} aria-label="Cerrar">
            <CloseIcon size={19} />
          </button>
        </div>

        <div className="go-body">
          <div className="go-label">Emulador para este juego</div>
          {loading ? (
            <div className="go-empty">Cargando…</div>
          ) : emus.length === 0 ? (
            <div className="go-empty">No hay emuladores instalados para este sistema.</div>
          ) : (
            <div className="go-list">
              <button
                className={"go-opt" + (overrideId === null ? " on" : "")}
                disabled={busy}
                onClick={() => void chooseEmu(null)}
              >
                <span className="go-opt-txt">
                  <b>Predeterminado</b>
                  {defaultEmu && <span className="go-opt-sub">{defaultEmu.emulatorName}</span>}
                </span>
                {overrideId === null && <CheckIcon size={16} />}
              </button>
              {emus.map((e) => (
                <button
                  key={e.emulatorId}
                  className={"go-opt" + (overrideId === e.emulatorId ? " on" : "")}
                  disabled={busy}
                  onClick={() => void chooseEmu(e.emulatorId)}
                >
                  <span className="go-opt-txt">
                    <b>{e.emulatorName}</b>
                  </span>
                  {overrideId === e.emulatorId && <CheckIcon size={16} />}
                </button>
              ))}
            </div>
          )}

          <div className="go-label">Acciones</div>
          <button
            className="go-action"
            onClick={() => void window.electronAPI.showInExplorer(game.rom.filePath)}
          >
            Abrir ubicación del ROM
          </button>
        </div>
      </div>
    </div>
  );
}
