import { useState, useCallback } from "react";
import { useApp, type DisambiguationState } from "../context/AppContext";

export function DisambiguationDialog() {
  const { disambiguationPending, resolveDisambiguation, cancelDisambiguation } =
    useApp();

  if (!disambiguationPending) return null;

  return (
    <DisambiguationDialogInner
      state={disambiguationPending}
      onConfirm={resolveDisambiguation}
      onCancel={cancelDisambiguation}
    />
  );
}

function DisambiguationDialogInner({
  state,
  onConfirm,
  onCancel,
}: {
  state: DisambiguationState;
  onConfirm: (
    selections: Array<{ filePath: string; systemId: string }>
  ) => Promise<void>;
  onCancel: () => void;
}) {
  const [selections, setSelections] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const f of state.files) {
      init[f.filePath] = "";
    }
    return init;
  });

  const handleSelect = useCallback(
    (filePath: string, systemId: string) => {
      setSelections((prev) => ({ ...prev, [filePath]: systemId }));
    },
    []
  );

  const allResolved = state.files.every((f) => selections[f.filePath]);

  const handleConfirm = useCallback(() => {
    const entries: Array<{ filePath: string; systemId: string }> = [];
    for (const f of state.files) {
      const systemId = selections[f.filePath];
      if (systemId) {
        entries.push({ filePath: f.filePath, systemId });
      }
    }
    onConfirm(entries);
  }, [state.files, selections, onConfirm]);

  const handleSkip = useCallback(() => {
    // Only add files that have a selection, skip the rest
    const entries: Array<{ filePath: string; systemId: string }> = [];
    for (const f of state.files) {
      const systemId = selections[f.filePath];
      if (systemId) {
        entries.push({ filePath: f.filePath, systemId });
      }
    }
    onConfirm(entries);
  }, [state.files, selections, onConfirm]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-2xl rounded-2xl bg-gray-800 shadow-2xl">
        {/* Header */}
        <div className="border-b border-gray-700 px-6 py-4">
          <h2 className="text-lg font-semibold text-gray-100">
            Select system for ambiguous ROMs
          </h2>
          <p className="mt-1 text-sm text-gray-400">
            These files match multiple systems. Choose the correct one for each.
          </p>
        </div>

        {/* Body */}
        <div className="max-h-96 overflow-y-auto px-6 py-4 space-y-4">
          {state.files.map((file) => (
            <div
              key={file.filePath}
              className="rounded-lg border border-gray-700 bg-gray-900 p-4"
            >
              <p className="text-sm font-medium text-gray-200 truncate mb-2">
                {file.fileName}
              </p>
              <div className="flex flex-wrap gap-2">
                {file.systems.map((sys) => (
                  <button
                    key={sys.id}
                    onClick={() => handleSelect(file.filePath, sys.id)}
                    className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                      selections[file.filePath] === sys.id
                        ? "bg-blue-600 text-white"
                        : "bg-gray-700 text-gray-300 hover:bg-gray-600"
                    }`}
                  >
                    {sys.name}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 border-t border-gray-700 px-6 py-4">
          <button
            onClick={onCancel}
            className="rounded-lg bg-gray-700 px-4 py-2 text-sm font-medium text-gray-300 transition-colors hover:bg-gray-600"
          >
            Cancel
          </button>
          <button
            onClick={handleSkip}
            className="rounded-lg bg-gray-700 px-4 py-2 text-sm font-medium text-gray-300 transition-colors hover:bg-gray-600"
          >
            Skip unselected
          </button>
          <button
            onClick={handleConfirm}
            disabled={!allResolved}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Confirm & Add
          </button>
        </div>
      </div>
    </div>
  );
}
