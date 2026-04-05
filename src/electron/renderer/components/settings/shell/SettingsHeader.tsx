interface Props {
  title: string;
  breadcrumb?: string[];
  canGoBack: boolean;
  onBack: () => void;
}

export function SettingsHeader({ title, breadcrumb, canGoBack, onBack }: Props) {
  return (
    <header className="flex items-center gap-3 border-b border-white/5 bg-surface-0 px-6 py-3">
      <button
        type="button"
        onClick={onBack}
        disabled={!canGoBack}
        className="flex h-9 w-9 items-center justify-center rounded-md text-secondary transition-colors hover:bg-surface-2 disabled:opacity-30"
        title="Volver"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className="h-5 w-5"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M15 19l-7-7 7-7"
          />
        </svg>
      </button>
      <div className="flex flex-1 flex-col">
        <h1 className="text-lg font-semibold text-primary">{title}</h1>
        {breadcrumb && breadcrumb.length > 0 && (
          <div className="mt-0.5 text-xs text-muted">
            {breadcrumb.join(" › ")}
          </div>
        )}
      </div>
    </header>
  );
}
