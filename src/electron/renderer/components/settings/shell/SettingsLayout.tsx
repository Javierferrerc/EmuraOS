import type { ReactNode } from "react";

interface Props {
  topBar?: ReactNode;
  sidebar: ReactNode;
  tabBar?: ReactNode;
  saveBar?: ReactNode;
  bottomBar?: ReactNode;
  children: ReactNode;
}

/**
 * Two-column grid: fixed sidebar on the left, main column on the right.
 * An optional topBar spans the full width above both columns.
 * The main column stacks optional tab bar → scrollable list.
 */
export function SettingsLayout({ topBar, sidebar, tabBar, saveBar, bottomBar, children }: Props) {
  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-app">
      {topBar}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {sidebar}
        <main className="flex min-w-0 flex-1 flex-col overflow-hidden pt-5">
          {tabBar}
          <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
          {saveBar}
        </main>
      </div>
      {bottomBar}
    </div>
  );
}
