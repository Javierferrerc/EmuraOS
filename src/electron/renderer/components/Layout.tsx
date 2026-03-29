import { Sidebar } from "./Sidebar";
import { GameGrid } from "./GameGrid";
import { SearchBar } from "./SearchBar";
import { StatusBar } from "./StatusBar";
import { useApp } from "../context/AppContext";

export function Layout() {
  const { isLoading } = useApp();

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-900">
        <div className="text-center">
          <div className="mb-4 text-4xl">🎮</div>
          <p className="text-lg text-gray-400">Loading Retro Launcher...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col bg-gray-900">
      <SearchBar />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-y-auto p-4">
          <GameGrid />
        </main>
      </div>
      <StatusBar />
    </div>
  );
}
