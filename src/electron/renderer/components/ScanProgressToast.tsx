import { useEffect, useRef, useState } from "react";
import { useApp } from "../context/AppContext";
import "./ScanProgressToast.css";

/**
 * Bottom-right toast for the ROM scan lifecycle.
 *
 * Two visual states share the same slot so they never stack:
 *   1. While `isScanning` is true → indeterminate "Escaneando ROMs" bar.
 *   2. As soon as scanning flips false (and we were just scanning) → a
 *      success toast that fades in, holds for ~4.4s, and fades out, for a
 *      total of 5s, then unmounts. Any new scan that starts during the
 *      success window cancels the timer and returns to state 1.
 *
 * Sits in the same stack as AddRomsProgressToast and CoverFetchProgressToast
 * so the three never overlap.
 */
export function ScanProgressToast() {
  const { isScanning, scanResult } = useApp();
  const [showCompleted, setShowCompleted] = useState(false);
  const [completedCount, setCompletedCount] = useState<number | null>(null);
  const prevScanningRef = useRef(false);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    // true → false transition: scan just finished. Snapshot the count so
    // the success toast keeps showing the right number even if the user
    // immediately changes filter / view.
    if (prevScanningRef.current && !isScanning) {
      setShowCompleted(true);
      setCompletedCount(scanResult?.totalRoms ?? null);
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
      }
      timerRef.current = window.setTimeout(() => {
        setShowCompleted(false);
        timerRef.current = null;
      }, 5000);
    }
    // false → true: a new scan started while the success was still on
    // screen. Hide it instantly so the live indicator can take over.
    if (!prevScanningRef.current && isScanning && showCompleted) {
      setShowCompleted(false);
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    }
    prevScanningRef.current = isScanning;
  }, [isScanning, scanResult, showCompleted]);

  // Cleanup on unmount so the timer doesn't fire into a dead component.
  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
      }
    };
  }, []);

  if (isScanning) {
    return (
      <div
        className="scan-toast w-80 rounded-lg bg-[var(--color-surface-1)]/95 p-3 shadow-2xl backdrop-blur-md"
        role="status"
        aria-live="polite"
      >
        <div className="mb-1 flex items-baseline justify-between gap-2">
          <span className="text-sm font-semibold text-[var(--color-text-primary)]">
            Escaneando ROMs
          </span>
        </div>
        <div className="text-xs text-[var(--color-text-secondary)]">
          Buscando ficheros compatibles…
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--color-surface-2)]/60">
          <div className="global-progress-indeterminate h-full bg-[var(--color-accent)]" />
        </div>
      </div>
    );
  }

  if (showCompleted) {
    const countLabel =
      completedCount === null
        ? null
        : completedCount === 1
          ? "1 juego encontrado"
          : `${completedCount} juegos encontrados`;
    return (
      <div
        className="scan-toast scan-toast--completed w-80 rounded-lg bg-[var(--color-surface-1)]/95 p-3 shadow-2xl backdrop-blur-md"
        role="status"
        aria-live="polite"
      >
        <div className="flex items-center gap-2">
          <span
            className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--color-good)] text-base font-bold text-white"
            aria-hidden
          >
            {"\u2713"}
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-[var(--color-text-primary)]">
              Escaneo completado
            </div>
            {countLabel && (
              <div className="text-xs text-[var(--color-text-secondary)]">
                {countLabel}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return null;
}
