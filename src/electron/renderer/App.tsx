import { useApp } from "./context/AppContext";
import { Layout } from "./components/Layout";
import { SettingsPage } from "./components/SettingsPage";
import { GameModeView } from "./components/GameModeView";

export default function App() {
  const { currentView } = useApp();

  switch (currentView) {
    case "settings":
      return <SettingsPage />;
    case "game":
      return <GameModeView />;
    default:
      return <Layout />;
  }
}
