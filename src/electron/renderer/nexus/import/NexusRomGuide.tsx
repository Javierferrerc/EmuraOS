/**
 * NexusRomGuide — EMURA "Pon bien el nombre" onboarding modal, ported 1:1 from
 * the design (rom-guide.jsx + rom-guide.css). Shown once between onboarding and
 * the first import; explains that the FILE NAME is what makes EMURA load cover +
 * metadata, with a minimal Bien/Mal comparison.
 *
 * The "Bien" example shows the real Super Mario Galaxy 2 box art (bundled), the
 * cover a correctly-named ROM would load.
 */

import { useEffect, useState } from "react";
import { CloseIcon, CheckIcon, WarnIcon, DownloadIcon } from "../NexusIcons";
import rgCover from "../../assets/rg-cover.jpg";
import "./nexus-rom-guide.css";

export interface NexusRomGuideProps {
  onClose: () => void;
  onContinue: (opts: { dontShow: boolean }) => void;
  step?: string;
}

export function NexusRomGuide({ onClose, onContinue, step = "Paso 2 de 3" }: NexusRomGuideProps) {
  const [dont, setDont] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="rg-stage" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="rg-modal" role="dialog" aria-label="Cómo nombrar tus ROMs">
        <button className="rg-close" onClick={onClose} aria-label="Cerrar"><CloseIcon size={19} /></button>
        <div className="rg-head">
          <span className="rg-step">{step} · Antes de importar</span>
          <h1>Pon bien el nombre</h1>
          <p>
            El <b>nombre del archivo</b> es lo que hace que EMURA cargue la carátula y los datos. Usa
            solo el <b>título del juego</b>.
          </p>
        </div>

        <div className="rg-body">
          {/* BIEN */}
          <div className="rg-ex good">
            <span className="rg-ex-mark"><CheckIcon size={15} /></span>
            <div className="rg-ex-text">
              <span className="rg-ex-name mono">Mario Galaxy 2</span>
              <span className="rg-ex-status"><CheckIcon size={12} /> Carátula y datos cargados</span>
            </div>
            <div className="rg-ex-cover">
              <img src={rgCover} alt="Mario Galaxy 2" />
            </div>
          </div>

          {/* MAL */}
          <div className="rg-ex bad">
            <span className="rg-ex-mark"><CloseIcon size={15} /></span>
            <div className="rg-ex-text">
              <span className="rg-ex-name mono">Mario - Galaxy 2 game</span>
              <span className="rg-ex-status"><WarnIcon size={12} /> No se reconoce · sin carátula</span>
            </div>
            <div className="rg-ex-cover empty"><WarnIcon size={18} /></div>
          </div>

          <div className="rg-note">
            Solo el título. <b>Sin</b> guiones entre palabras, versiones (<span className="mono">v1.2</span>),
            regiones (<span className="mono">(USA)</span>) ni palabras extra (<span className="mono">game</span>,{" "}
            <span className="mono">FINAL</span>).
          </div>
        </div>

        <div className="rg-foot">
          <button className="rg-foot-check" onClick={() => setDont((v) => !v)}>
            <span className={"box" + (dont ? " on" : "")}><CheckIcon size={12} /></span>
            No volver a mostrar
          </button>
          <button className="rg-btn primary" onClick={() => onContinue({ dontShow: dont })}>
            <DownloadIcon size={18} /> Entendido, importar
          </button>
        </div>
      </div>
    </div>
  );
}
