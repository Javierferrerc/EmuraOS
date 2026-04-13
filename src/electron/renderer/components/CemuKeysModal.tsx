import { useState, useEffect, useRef, useMemo } from "react";

interface Props {
  onSubmit: (content: string) => Promise<void>;
  onCancel: () => void;
}

/**
 * Mirror of isValidKeyLine in core/cemu-setup.ts — accepts both the
 * "hash = disc_key" legacy format and the community bare-hex-key format,
 * with optional inline comments starting with "#".
 */
function isValidKeyLine(line: string): boolean {
  const hashIdx = line.indexOf("#");
  const stripped = (hashIdx >= 0 ? line.slice(0, hashIdx) : line).trim();
  if (!stripped) return false;
  if (stripped.includes("=")) {
    const [left, right] = stripped.split("=").map((s) => s.trim());
    return /^[0-9a-f]+$/i.test(left) && /^[0-9a-f]+$/i.test(right);
  }
  return /^[0-9a-f]{16,64}$/i.test(stripped);
}

function countValidKeys(text: string): number {
  return text.split(/\r?\n/).filter(isValidKeyLine).length;
}

export function CemuKeysModal({ onSubmit, onCancel }: Props) {
  const [content, setContent] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const validCount = useMemo(() => countValidKeys(content), [content]);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  // Esc closes the modal
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !submitting) {
        onCancel();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel, submitting]);

  const handleSubmit = async () => {
    const trimmed = content.trim();
    if (!trimmed) {
      setError("Pegá al menos una key antes de continuar.");
      return;
    }
    if (validCount === 0) {
      setError(
        "No se detectaron keys válidas. Cada línea debe contener una disc key " +
          "en formato hexadecimal (32 caracteres) o el formato " +
          "<hash> = <discKey>. Los comentarios con # están permitidos."
      );
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      await onSubmit(trimmed);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-2xl rounded-2xl bg-gray-800 shadow-2xl">
        {/* Header */}
        <div className="border-b border-gray-700 px-6 py-4">
          <h2 className="text-xl font-bold text-white">
            Cemu necesita las disc keys
          </h2>
          <p className="mt-1 text-sm text-gray-400">
            Para desencriptar los juegos de Wii U (.wud/.wux), Cemu necesita un
            archivo <code className="rounded bg-gray-900 px-1.5 py-0.5 text-xs text-blue-300">keys.txt</code>
            {" "}con las claves correspondientes a cada título.
          </p>
        </div>

        {/* Body */}
        <div className="px-6 py-4">
          <label
            htmlFor="cemu-keys-input"
            className="mb-2 block text-sm font-medium text-gray-300"
          >
            Pegá el contenido de tu keys.txt:
          </label>
          <textarea
            ref={textareaRef}
            id="cemu-keys-input"
            value={content}
            onChange={(e) => {
              setContent(e.target.value);
              if (error) setError(null);
            }}
            placeholder={
              "# Formato aceptado (cualquiera de los dos):\n" +
              "0123456789abcdef0123456789abcdef  # Zelda BOTW (EUR)\n" +
              "fedcba9876543210fedcba9876543210  # Mario Kart 8 (USA)\n" +
              "\n" +
              "# O el formato legacy:\n" +
              "abcd1234567890abcdef1234567890ab = 0123456789abcdef0123456789abcdef\n"
            }
            spellCheck={false}
            className="h-56 w-full resize-none rounded-lg border border-gray-600 bg-gray-900 p-3 font-mono text-xs text-gray-100 placeholder-gray-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            disabled={submitting}
          />

          <div className="mt-2 flex items-center justify-between text-xs">
            <span className="text-gray-400">
              {validCount > 0 ? (
                <>
                  <span className="font-semibold text-green-400">
                    {validCount}
                  </span>{" "}
                  {validCount === 1 ? "key detectada" : "keys detectadas"}
                </>
              ) : (
                <span className="text-gray-500">
                  Pegá tu keys.txt o escribí las keys manualmente
                </span>
              )}
            </span>
          </div>

          {error && (
            <p className="mt-2 text-sm text-red-400">{error}</p>
          )}

          <div className="mt-3 rounded-lg border border-amber-900/50 bg-amber-950/30 p-3">
            <p className="text-xs text-amber-200">
              <strong>Nota legal:</strong> Las disc keys son material propietario
              de Nintendo. EmuraOS no puede distribuirlas. Debés dumpear
              las keys de tu propia Wii U usando herramientas como
              {" "}<code className="text-amber-100">disc2app</code> o
              {" "}<code className="text-amber-100">wudump</code>.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-gray-700 bg-gray-850 px-6 py-4">
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className="rounded-lg bg-gray-700 px-4 py-2 text-sm font-medium text-gray-200 transition-colors hover:bg-gray-600 disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting || validCount === 0}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? "Guardando..." : "Guardar y lanzar juego"}
          </button>
        </div>
      </div>
    </div>
  );
}
