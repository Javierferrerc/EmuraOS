import { useApp } from "./context/AppContext";
import { Layout } from "./components/Layout";
import { SettingsPage } from "./components/SettingsPage";

export default function App() {
  const { currentView } = useApp();

  return currentView === "settings" ? <SettingsPage /> : <Layout />;
}
