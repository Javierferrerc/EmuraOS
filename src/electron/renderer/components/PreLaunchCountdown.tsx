import { useEffect, useState } from "react";
import { useApp } from "../context/AppContext";

/**
 * 3-2-1 overlay shown before the emulator window appears. Hidden by
 * default; only renders when the user enabled
 * "Cuenta atrás de pre-lanzamiento" in Settings → Avanzado AND a launch
 * is in progress (see AppContext.doLaunch which sets the state).
 *
 * Under prefers-reduced-motion we render a short fade with just the
 * title instead of the bouncing countdown digits — see AppContext for
 * the matching 400ms vs 3000ms gating on the launch timer.
 */
export function PreLaunchCountdown() {
  const { preLaunchCountdown, getMetadataForRom } = useApp();
  const [seconds, setSeconds] = useState<number>(3);
  const reducedMotion =
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  useEffect(() => {
    if (!preLaunchCountdown) return;
    setSeconds(3);
    if (reducedMotion) return;
    const id = window.setInterval(() => {
      setSeconds((s) => (s > 0 ? s - 1 : 0));
    }, 1000);
    return () => window.clearInterval(id);
  }, [preLaunchCountdown, reducedMotion]);

  if (!preLaunchCountdown) return null;

  const { rom, coverDataUrl } = preLaunchCountdown;
  const metadata = getMetadataForRom(rom.systemId, rom.fileName);
  const displayName =
    metadata?.title || rom.fileName.replace(/\.[^.]+$/, "");

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={`Lanzando ${displayName}`}
      className="fixed inset-0 z-[9998] flex items-center justify-center"
      style={{
        background: "rgba(0,0,0,0.78)",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
        animation: reducedMotion
          ? "none"
          : "preLaunchFadeIn 200ms ease-out both",
      }}
    >
      <div className="flex flex-col items-center gap-6">
        {coverDataUrl ? (
          <img
            src={coverDataUrl}
            alt=""
            className="rounded-lg shadow-2xl"
            style={{
              width: 220,
              height: 308,
              objectFit: "cover",
              animation: reducedMotion
                ? "none"
                : "preLaunchPulse 1.5s ease-in-out infinite",
            }}
          />
        ) : (
          <div
            className="rounded-lg shadow-2xl flex items-center justify-center"
            style={{
              width: 220,
              height: 308,
              background:
                "linear-gradient(135deg, var(--color-accent) 0%, var(--color-surface-2) 100%)",
              color: "white",
              fontSize: 64,
              fontWeight: 800,
            }}
          >
            {displayName.charAt(0).toUpperCase()}
          </div>
        )}
        <div className="text-center">
          <h2
            className="text-2xl font-semibold mb-2"
            style={{ color: "var(--color-text-primary)" }}
          >
            {displayName}
          </h2>
          {!reducedMotion && (
            <div
              key={seconds}
              aria-hidden="true"
              className="font-bold tabular-nums"
              style={{
                fontSize: 96,
                lineHeight: 1,
                color: "var(--color-accent)",
                animation: "preLaunchDigit 700ms ease-out both",
              }}
            >
              {seconds > 0 ? seconds : "¡Ya!"}
            </div>
          )}
          {reducedMotion && (
            <p style={{ color: "var(--color-text-secondary)" }}>
              Lanzando…
            </p>
          )}
        </div>
      </div>
      <style>{`
        @keyframes preLaunchFadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes preLaunchPulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.04); }
        }
        @keyframes preLaunchDigit {
          0% { transform: scale(0.5); opacity: 0; }
          40% { transform: scale(1.15); opacity: 1; }
          100% { transform: scale(1); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
