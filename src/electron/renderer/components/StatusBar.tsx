import { useApp } from "../context/AppContext";

export function StatusBar() {
  const { scanResult, config, gamepadConnected } = useApp();

  const systemCount = scanResult?.systems.length ?? 0;
  const romCount = scanResult?.totalRoms ?? 0;

  return (
    <footer className="flex items-center justify-between border-t border-gray-700 bg-gray-800 px-4 py-1.5 text-xs text-gray-400">
      <div className="flex gap-4">
        <span>{romCount} ROMs</span>
        <span>{systemCount} systems</span>
      </div>
      {gamepadConnected && (
        <div className="flex items-center gap-2">
          <span className="gamepad-btn">A</span><span>Select</span>
          <span className="gamepad-btn">B</span><span>Back</span>
          <span className="gamepad-btn">Y</span><span>Fav</span>
          <span className="gamepad-btn">LB</span>/<span className="gamepad-btn">RB</span><span>Filter</span>
          <span className="gamepad-btn">Start</span><span>Settings</span>
        </div>
      )}
      {config && !gamepadConnected && (
        <div className="flex gap-4">
          <span>ROMs: {config.romsPath}</span>
          <span>Emulators: {config.emulatorsPath}</span>
        </div>
      )}
    </footer>
  );
}
