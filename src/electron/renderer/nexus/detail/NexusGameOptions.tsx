/**
 * NexusGameOptions — per-game options modal opened from the detail's "Opciones"
 * action. Game-scoped (not the global settings page):
 *  - emulator/core override for THIS game
 *  - Dolphin / RetroArch per-game tweaks (only for the resolved emulator)
 *  - favorite / pin shortcuts, reset this game's play time, open ROM location
 */

import { useEffect, useState } from "react";
import type { NexusGame } from "../nexusModel";
import type { GameOverride, DolphinGameConfig, RetroArchGameConfig } from "../../../../core/types";
import { useApp } from "../../context/AppContext";
import { SettingsIcon, CloseIcon, CheckIcon, HeartIcon, TrashIcon } from "../NexusIcons";
import "./nexus-game-options.css";

interface EmuOption {
  emulatorId: string;
  emulatorName: string;
}

function Toggle({
  label,
  hint,
  on,
  disabled,
  onChange,
}: {
  label: string;
  hint?: string;
  on: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      className={"go-toggle" + (on ? " on" : "")}
      disabled={disabled}
      onClick={() => onChange(!on)}
    >
      <span className="go-opt-txt">
        <b>{label}</b>
        {hint && <span className="go-opt-sub">{hint}</span>}
      </span>
      <span className="go-switch">
        <span className="go-knob" />
      </span>
    </button>
  );
}

function SelectRow({
  label,
  value,
  options,
  disabled,
  onChange,
}: {
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <div className="go-select-row">
      <b>{label}</b>
      <select
        className="go-select"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export function NexusGameOptions({
  game,
  isFavorite,
  pinned,
  onToggleFavorite,
  onTogglePin,
  onClose,
  onChanged,
}: {
  game: NexusGame;
  isFavorite: boolean;
  pinned: boolean;
  onToggleFavorite: () => void;
  onTogglePin: () => void;
  onClose: () => void;
  /** Fired when an override changes, so the ficha can refresh its Core display. */
  onChanged?: () => void;
}) {
  const app = useApp();
  const sys = game.rom.systemId;
  const file = game.rom.fileName;
  const key = `${sys}:${file}`;

  const [emus, setEmus] = useState<EmuOption[]>([]);
  const [override, setOverride] = useState<GameOverride>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [resetDone, setResetDone] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [overrides, list] = await Promise.all([
          window.electronAPI.getGameOverrides(),
          window.electronAPI.getEmulatorsForSystem(sys),
        ]);
        if (cancelled) return;
        setEmus(list);
        setOverride(overrides[key] ?? {});
      } catch (e) {
        console.warn("[game-options] load failed:", e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [key, sys]);

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

  const overrideId = override.emulatorId ?? null;
  const resolvedEmu = overrideId ?? emus[0]?.emulatorId;
  const isDolphin = resolvedEmu === "dolphin";
  const isRetro = resolvedEmu === "retroarch";
  const dolphin = override.dolphin ?? {};
  const retro = override.retroarch ?? {};
  const defaultEmu = emus[0];

  const chooseEmu = async (id: string | null) => {
    if (busy || id === overrideId) return;
    setBusy(true);
    try {
      await window.electronAPI.setEmulatorOverride(sys, file, id);
      setOverride((o) => ({ ...o, emulatorId: id ?? undefined }));
      onChanged?.();
    } catch (e) {
      console.warn("[game-options] set emulator failed:", e);
    } finally {
      setBusy(false);
    }
  };

  const setDolphin = async <K extends keyof DolphinGameConfig>(k: K, v: DolphinGameConfig[K]) => {
    try {
      await window.electronAPI.setDolphinGameConfig(sys, file, { [k]: v });
      setOverride((o) => ({ ...o, dolphin: { ...(o.dolphin ?? {}), [k]: v } }));
    } catch (e) {
      console.warn("[game-options] set dolphin failed:", e);
    }
  };

  const setRetro = async <K extends keyof RetroArchGameConfig>(k: K, v: RetroArchGameConfig[K]) => {
    try {
      await window.electronAPI.setRetroArchGameConfig(sys, file, { [k]: v });
      setOverride((o) => ({ ...o, retroarch: { ...(o.retroarch ?? {}), [k]: v } }));
    } catch (e) {
      console.warn("[game-options] set retroarch failed:", e);
    }
  };

  const resetPlay = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await window.electronAPI.resetGamePlay(sys, file);
      await app.reloadUserLibrary();
      setResetDone(true);
      onChanged?.();
    } catch (e) {
      console.warn("[game-options] reset play failed:", e);
    } finally {
      setBusy(false);
    }
  };

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
          {/* ── Emulador ─────────────────────────────────────── */}
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

          {/* ── Dolphin tweaks ───────────────────────────────── */}
          {!loading && isDolphin && (
            <>
              <div className="go-label">Ajustes de Dolphin</div>
              <div className="go-list">
                <Toggle
                  label="Pantalla panorámica (16:9)"
                  hint="Renderiza en 16:9 real, no 4:3 con bandas"
                  on={!!dolphin.wideScreenHack}
                  onChange={(v) => void setDolphin("wideScreenHack", v)}
                />
                <SelectRow
                  label="Relación de aspecto"
                  value={String(dolphin.aspectRatio ?? 0)}
                  options={[
                    { value: "0", label: "Automática" },
                    { value: "1", label: "4:3" },
                    { value: "2", label: "16:9" },
                    { value: "3", label: "Estirar" },
                  ]}
                  onChange={(v) => void setDolphin("aspectRatio", Number(v) as 0 | 1 | 2 | 3)}
                />
                <SelectRow
                  label="Velocidad de emulación"
                  value={String(dolphin.emulationSpeed ?? 1)}
                  options={[
                    { value: "0", label: "Ilimitada" },
                    { value: "0.5", label: "50%" },
                    { value: "1", label: "100%" },
                    { value: "2", label: "200%" },
                  ]}
                  onChange={(v) => void setDolphin("emulationSpeed", Number(v))}
                />
                <Toggle
                  label="Overclock de CPU"
                  on={!!dolphin.overclockEnable}
                  onChange={(v) => void setDolphin("overclockEnable", v)}
                />
                <Toggle
                  label="Saltar acceso a EFB"
                  hint="Más rendimiento; puede romper algunos efectos"
                  on={!!dolphin.skipEFBAccess}
                  onChange={(v) => void setDolphin("skipEFBAccess", v)}
                />
                <Toggle
                  label="Ignorar mando 2"
                  on={!!dolphin.disablePort2}
                  onChange={(v) => void setDolphin("disablePort2", v)}
                />
              </div>
            </>
          )}

          {/* ── RetroArch tweaks ─────────────────────────────── */}
          {!loading && isRetro && (
            <>
              <div className="go-label">Ajustes de RetroArch</div>
              <div className="go-list">
                <Toggle
                  label="Filtro bilineal"
                  hint="Suaviza la imagen"
                  on={!!retro.bilinearFilter}
                  onChange={(v) => void setRetro("bilinearFilter", v)}
                />
                <Toggle
                  label="Escala entera"
                  hint="Píxeles nítidos (múltiplos exactos)"
                  on={!!retro.integerScale}
                  onChange={(v) => void setRetro("integerScale", v)}
                />
                <SelectRow
                  label="Relación de aspecto"
                  value={String(retro.aspectRatio ?? 0)}
                  options={[
                    { value: "0", label: "4:3" },
                    { value: "1", label: "16:9" },
                  ]}
                  onChange={(v) => void setRetro("aspectRatio", Number(v) as 0 | 1)}
                />
                <Toggle
                  label="Run-ahead"
                  hint="Reduce el input lag"
                  on={!!retro.runAhead}
                  onChange={(v) => void setRetro("runAhead", v)}
                />
                {retro.runAhead && (
                  <SelectRow
                    label="Fotogramas de run-ahead"
                    value={String(retro.runAheadFrames ?? 1)}
                    options={[1, 2, 3, 4, 5, 6].map((n) => ({ value: String(n), label: String(n) }))}
                    onChange={(v) => void setRetro("runAheadFrames", Number(v))}
                  />
                )}
                <Toggle
                  label="Rebobinado"
                  on={!!retro.rewind}
                  onChange={(v) => void setRetro("rewind", v)}
                />
              </div>
            </>
          )}

          {/* ── Acciones ─────────────────────────────────────── */}
          <div className="go-label">Acciones</div>
          <div className="go-list">
            <button
              className={"go-toggle" + (isFavorite ? " on" : "")}
              onClick={onToggleFavorite}
            >
              <span className="go-opt-txt">
                <b>Favorito</b>
              </span>
              <HeartIcon size={18} />
            </button>
            <button className={"go-toggle" + (pinned ? " on" : "")} onClick={onTogglePin}>
              <span className="go-opt-txt">
                <b>Fijar en el perfil</b>
              </span>
              {pinned && <CheckIcon size={16} />}
            </button>
            <button className="go-action" disabled={busy} onClick={() => void resetPlay()}>
              <TrashIcon size={16} />
              {resetDone ? "Tiempo restablecido" : "Restablecer tiempo jugado"}
            </button>
            <button
              className="go-action"
              onClick={() => void window.electronAPI.showInExplorer(game.rom.filePath)}
            >
              Abrir ubicación del ROM
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
