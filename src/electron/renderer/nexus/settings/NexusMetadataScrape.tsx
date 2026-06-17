/**
 * NexusMetadataScrape — action card in the NEXUS Portadas settings to run the
 * full metadata scrape (libretro). This is what populates género / desarrolladora
 * / año / nº de jugadores on the game ficha; the cover fetch only handles art, so
 * without this those fields stay empty. Wired to the real AppContext scrape via
 * the settings ctx (startScraping → IPC scrape-all-metadata).
 */

import type { SettingsContext as ISettingsContext } from "../../schemas/settings-schema-types";
import { DownloadIcon, CheckIcon, WarnIcon } from "../NexusIcons";

export function NexusMetadataScrape({ ctx }: { ctx: ISettingsContext }) {
  const { isScraping, scrapeProgress, lastScrapeResult, startScraping } = ctx;
  const pct =
    scrapeProgress && scrapeProgress.total > 0
      ? Math.round((scrapeProgress.current / scrapeProgress.total) * 100)
      : 0;

  return (
    <div className="nx-meta-scrape">
      <div className="nx-ms-head">
        <span className="nx-ms-ico">
          <DownloadIcon size={18} />
        </span>
        <div className="nx-ms-txt">
          <h3>Metadatos completos</h3>
          <p>
            Descarga <b>género</b>, <b>desarrolladora</b>, <b>año</b>, <b>nº de jugadores</b> y
            descripción, y los muestra en la ficha de cada juego. Combina varias fuentes sin
            credenciales: <b>libretro</b> (cartuchos), <b>OpenVGDB</b> (PSX, NDS, PSP, GameCube…) y{" "}
            <b>Wikidata</b> (PS2, Wii, 3DS… best-effort). La primera vez descarga una base de datos de
            ~9 MB.
          </p>
        </div>
        <button className="ct-btn primary nx-ms-btn" disabled={isScraping} onClick={() => void startScraping()}>
          {isScraping ? "Descargando…" : "Descargar metadatos"}
        </button>
      </div>

      {isScraping && scrapeProgress && (
        <div className="nx-ms-prog">
          <div className="nx-ms-bar">
            <i style={{ width: pct + "%" }} />
          </div>
          <div className="nx-ms-prog-txt">
            {scrapeProgress.current}/{scrapeProgress.total} · {scrapeProgress.romFileName}
          </div>
        </div>
      )}

      {!isScraping && lastScrapeResult && (
        <div className="nx-ms-result">
          {lastScrapeResult.totalFound > 0 ? <CheckIcon size={14} /> : <WarnIcon size={14} />}
          {lastScrapeResult.totalFound} con datos · {lastScrapeResult.totalNotFound} sin coincidencia ·{" "}
          {lastScrapeResult.totalProcessed} procesados
        </div>
      )}
    </div>
  );
}
