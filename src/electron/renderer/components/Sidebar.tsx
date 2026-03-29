import { useApp } from "../context/AppContext";

const MANUFACTURER_COLORS: Record<string, string> = {
  Nintendo: "bg-red-600",
  Sega: "bg-blue-600",
  Sony: "bg-blue-800",
};

export function Sidebar() {
  const { scanResult, systems, selectedSystemId, setSelectedSystemId } =
    useApp();

  const systemCounts = new Map<string, number>();
  if (scanResult) {
    for (const sys of scanResult.systems) {
      systemCounts.set(sys.systemId, sys.roms.length);
    }
  }

  const systemsWithRoms = systems.filter((s) => systemCounts.has(s.id));

  return (
    <aside className="flex w-56 flex-col border-r border-gray-700 bg-gray-800">
      <div className="p-3 text-xs font-semibold uppercase tracking-wider text-gray-400">
        Systems
      </div>
      <nav className="flex-1 overflow-y-auto">
        <button
          onClick={() => setSelectedSystemId(null)}
          className={`flex w-full items-center justify-between px-4 py-2 text-left text-sm transition-colors hover:bg-gray-700 ${
            selectedSystemId === null
              ? "bg-gray-700 text-white"
              : "text-gray-300"
          }`}
        >
          <span>All Systems</span>
          <span className="rounded-full bg-gray-600 px-2 py-0.5 text-xs">
            {scanResult?.totalRoms ?? 0}
          </span>
        </button>
        {systemsWithRoms.map((system) => {
          const count = systemCounts.get(system.id) ?? 0;
          const colorClass =
            MANUFACTURER_COLORS[system.manufacturer] ?? "bg-gray-600";

          return (
            <button
              key={system.id}
              onClick={() => setSelectedSystemId(system.id)}
              className={`flex w-full items-center justify-between px-4 py-2 text-left text-sm transition-colors hover:bg-gray-700 ${
                selectedSystemId === system.id
                  ? "bg-gray-700 text-white"
                  : "text-gray-300"
              }`}
            >
              <span className="truncate">{system.name}</span>
              <span
                className={`rounded-full px-2 py-0.5 text-xs text-white ${colorClass}`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </nav>
    </aside>
  );
}
