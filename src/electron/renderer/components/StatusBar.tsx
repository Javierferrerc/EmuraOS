import { useApp } from "../context/AppContext";

/**
 * Persistent footer showing live status for:
 * - Scan progress
 * - Emulator downloads
 * - Cover / metadata fetch
 * - Gamepad connection
 * - Active game session
 */
export function StatusBar() {
  const {
    isLoading,
    scanResult,
    downloadingEmulatorId,
    emulatorDownloadProgress,
    isFetchingCovers,
    coverFetchProgress,
    isScraping,
    scrapeProgress,
    gamepadConnected,
    isGameRunning,
    currentGame,
  } = useApp();

  return (
    <div className="flex h-7 shrink-0 items-center gap-4 border-t border-[var(--color-surface-1)] bg-[var(--color-surface-0)] px-3 text-[10px] text-[var(--color-text-muted)]">
      {/* Scan */}
      <span>
        {isLoading
          ? "Escaneando..."
          : scanResult
            ? `${scanResult.totalRoms} ROMs`
            : ""}
      </span>

      {/* Emulator download */}
      {downloadingEmulatorId && emulatorDownloadProgress && (
        <span className="text-[var(--color-good)]">
          {emulatorDownloadProgress.emulatorId}{" "}
          {emulatorDownloadProgress.bytesTotal > 0
            ? `${Math.round(
                (emulatorDownloadProgress.bytesReceived /
                  emulatorDownloadProgress.bytesTotal) *
                  100
              )}%`
            : emulatorDownloadProgress.phase}
        </span>
      )}

      {/* Covers */}
      {isFetchingCovers && coverFetchProgress && (
        <span>
          Covers: {coverFetchProgress.current}/{coverFetchProgress.total}
        </span>
      )}

      {/* Scraping */}
      {isScraping && scrapeProgress && (
        <span>
          Scraping: {scrapeProgress.current}/{scrapeProgress.total}
        </span>
      )}

      {/* Spacer */}
      <span className="flex-1" />

      {/* Gamepad */}
      <span>
        {gamepadConnected ? "Mando" : "Teclado"}
      </span>

      {/* Game session */}
      {isGameRunning && currentGame && (
        <span className="text-[var(--color-accent)]">
          Jugando: {currentGame.rom.fileName}
        </span>
      )}
    </div>
  );
}
