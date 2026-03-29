import { useCallback } from "react";
import { useApp } from "../context/AppContext";
import type { DiscoveredRom } from "../../../core/types";

const SYSTEM_COLORS: Record<string, string> = {
  nes: "bg-red-700",
  snes: "bg-red-600",
  n64: "bg-red-500",
  gb: "bg-green-700",
  gbc: "bg-purple-600",
  gba: "bg-indigo-600",
  nds: "bg-gray-600",
  gamecube: "bg-indigo-700",
  wii: "bg-sky-600",
  megadrive: "bg-blue-700",
  mastersystem: "bg-blue-600",
  dreamcast: "bg-blue-500",
  psx: "bg-slate-600",
  ps2: "bg-blue-900",
  psp: "bg-slate-700",
};

interface GameCardProps {
  rom: DiscoveredRom;
}

export function GameCard({ rom }: GameCardProps) {
  const { launchGame, lastLaunchResult } = useApp();

  const handleDoubleClick = useCallback(() => {
    launchGame(rom);
  }, [launchGame, rom]);

  const displayName = rom.fileName.replace(/\.[^.]+$/, "");
  const colorClass = SYSTEM_COLORS[rom.systemId] ?? "bg-gray-600";
  const sizeMB = (rom.sizeBytes / (1024 * 1024)).toFixed(1);

  const isLastLaunched =
    lastLaunchResult?.romPath === rom.filePath && lastLaunchResult?.success;

  return (
    <div
      onDoubleClick={handleDoubleClick}
      className={`group cursor-pointer rounded-lg border border-gray-700 bg-gray-800 p-4 transition-all duration-200 hover:border-gray-500 hover:bg-gray-750 hover:shadow-lg hover:shadow-black/20 ${
        isLastLaunched ? "ring-2 ring-green-500" : ""
      }`}
      title={`Double-click to launch\n${rom.filePath}`}
    >
      <div className="mb-3 flex h-16 items-center justify-center rounded bg-gray-700/50 text-3xl transition-transform duration-200 group-hover:scale-105">
        🎮
      </div>
      <h3 className="mb-2 truncate text-sm font-medium text-gray-100">
        {displayName}
      </h3>
      <div className="flex items-center justify-between">
        <span
          className={`rounded px-1.5 py-0.5 text-xs text-white ${colorClass}`}
        >
          {rom.systemId.toUpperCase()}
        </span>
        <span className="text-xs text-gray-500">{sizeMB} MB</span>
      </div>
    </div>
  );
}
