import { useApp } from "../context/AppContext";

export function StatusBar() {
  const { scanResult, config } = useApp();

  const systemCount = scanResult?.systems.length ?? 0;
  const romCount = scanResult?.totalRoms ?? 0;

  return (
    <footer className="flex items-center justify-between border-t border-gray-700 bg-gray-800 px-4 py-1.5 text-xs text-gray-400">
      <div className="flex gap-4">
        <span>{romCount} ROMs</span>
        <span>{systemCount} systems</span>
      </div>
      {config && (
        <div className="flex gap-4">
          <span>ROMs: {config.romsPath}</span>
          <span>Emulators: {config.emulatorsPath}</span>
        </div>
      )}
    </footer>
  );
}
