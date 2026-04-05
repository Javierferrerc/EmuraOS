import type { ReactNode } from "react";

interface Props {
  sidebar: ReactNode;
  header: ReactNode;
  tabBar?: ReactNode;
  children: ReactNode;
}

/**
 * Two-column grid: fixed sidebar on the left, main column on the right.
 * The main column stacks header → optional tab bar → scrollable list.
 */
export function SettingsLayout({ sidebar, header, tabBar, children }: Props) {
  return (
    <div className="flex h-screen w-screen overflow-hidden bg-app">
      {sidebar}
      <main className="flex min-w-0 flex-1 flex-col">
        {header}
        {tabBar}
        <div className="flex min-h-0 flex-1 flex-col">{children}</div>
      </main>
    </div>
  );
}
