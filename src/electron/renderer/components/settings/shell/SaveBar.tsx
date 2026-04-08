interface Props {
  onSave: () => void;
  onDiscard: () => void;
}

export function SaveBar({ onSave, onDiscard }: Props) {
  return (
    <div
      className="save-bar-enter mx-4 mb-4 flex items-center justify-between rounded-[var(--radius-md)] px-5 py-3 folder-row-glass"
    >
      <span className="text-sm font-medium text-secondary">
        Tienes cambios sin guardar
      </span>
      <div className="flex gap-3">
        <button
          type="button"
          onClick={onDiscard}
          className="cursor-pointer rounded-[var(--radius-sm)] px-4 py-1.5 text-sm font-medium text-secondary transition-colors hover:bg-white/10"
        >
          Descartar
        </button>
        <button
          type="button"
          onClick={onSave}
          className="cursor-pointer rounded-[var(--radius-sm)] px-4 py-1.5 text-sm font-medium text-white transition-colors"
          style={{ background: "var(--color-accent)" }}
        >
          Guardar
        </button>
      </div>
    </div>
  );
}
