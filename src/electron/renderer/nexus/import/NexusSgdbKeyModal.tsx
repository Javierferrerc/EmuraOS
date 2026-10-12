/**
 * NexusSgdbKeyModal — onboarding for the SteamGridDB API key. Shown to users
 * without a key (new installs, or never configured): step-by-step guide, a
 * link to the API page, and an input that verifies the key against the API
 * before saving it. Shares the "Pon bien el nombre" guide's modal chrome
 * (rg-* classes) so every NEXUS onboarding modal looks the same.
 */

import { useEffect, useRef, useState } from "react";
import { CloseIcon, CheckIcon, WarnIcon, EyeIcon, EyeOffIcon, ChevronRightIcon } from "../NexusIcons";
import "./nexus-rom-guide.css";
import "./nexus-sgdb-key.css";

const SGDB_API_PAGE = "https://www.steamgriddb.com/profile/preferences/api";

type Check = "idle" | "verifying" | "valid" | "invalid" | "network";

export interface NexusSgdbKeyModalProps {
  /** Persist the verified key (config.steamGridDbApiKey). */
  onSave: (key: string) => Promise<void>;
  /** Close without a key. `dontShow` → never prompt again. */
  onDismiss: (opts: { dontShow: boolean }) => void;
}

export function NexusSgdbKeyModal({ onSave, onDismiss }: NexusSgdbKeyModalProps) {
  const [key, setKey] = useState("");
  const [reveal, setReveal] = useState(false);
  const [check, setCheck] = useState<Check>("idle");
  const [dont, setDont] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const dismiss = () => onDismiss({ dontShow: dont });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onDismiss({ dontShow: false });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onDismiss]);

  const trimmed = key.trim();
  const busy = check === "verifying" || check === "valid";

  const submit = async () => {
    if (!trimmed || busy) return;
    setCheck("verifying");
    const result = await window.electronAPI.verifySteamGridDbKey(trimmed).catch(() => "network" as const);
    if (result !== "valid") {
      setCheck(result);
      inputRef.current?.focus();
      return;
    }
    setCheck("valid");
    await onSave(trimmed);
  };

  const openApiPage = () => void window.electronAPI.openExternal(SGDB_API_PAGE);

  return (
    <div className="rg-stage" onMouseDown={(e) => { if (e.target === e.currentTarget) dismiss(); }}>
      <div className="rg-modal sk-modal" role="dialog" aria-label="Conecta SteamGridDB">
        <button className="rg-close" onClick={dismiss} aria-label="Cerrar"><CloseIcon size={19} /></button>
        <div className="rg-head">
          <span className="rg-step">Carátulas · Recomendado</span>
          <h1>Conecta SteamGridDB</h1>
          <p>
            Sin SteamGridDB <b>no podrás acceder a todas las carátulas y recursos</b> de tus juegos, como
            fondos y estilos alternativos. Para una <b>experiencia mejor y más completa</b>, te recomendamos
            conectarlo con una API key gratuita.
          </p>
        </div>

        <div className="rg-body">
          <ol className="sk-steps">
            <li>
              <span className="sk-num">1</span>
              <div className="sk-step-txt">
                <b>Inicia sesión en SteamGridDB</b>
                <span>Entra con tu cuenta de Steam. Es gratis.</span>
              </div>
            </li>
            <li>
              <span className="sk-num">2</span>
              <div className="sk-step-txt">
                <b>Abre la página de la API</b>
                <span>
                  En tu perfil: <span className="mono">Preferences → API</span>.
                </span>
              </div>
              <button className="sk-link" onClick={openApiPage}>
                Abrir página <ChevronRightIcon size={15} />
              </button>
            </li>
            <li>
              <span className="sk-num">3</span>
              <div className="sk-step-txt">
                <b>Genera y copia tu key</b>
                <span>
                  Pulsa <span className="mono">Generate API Key</span> y copia la clave.
                </span>
              </div>
            </li>
            <li>
              <span className="sk-num">4</span>
              <div className="sk-step-txt">
                <b>Pégala aquí abajo</b>
                <span>La comprobamos con SteamGridDB antes de guardarla.</span>
              </div>
            </li>
          </ol>

          <form
            className={"sk-field" + (check === "invalid" || check === "network" ? " err" : check === "valid" ? " ok" : "")}
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            <label htmlFor="sk-key">API key de SteamGridDB</label>
            <div className="sk-input">
              <input
                id="sk-key"
                ref={inputRef}
                className="mono"
                type={reveal ? "text" : "password"}
                value={key}
                placeholder="Pega tu API key"
                autoComplete="off"
                spellCheck={false}
                autoFocus
                disabled={busy}
                onChange={(e) => {
                  setKey(e.target.value);
                  if (check !== "idle") setCheck("idle");
                }}
              />
              <button
                type="button"
                className="sk-eye"
                onClick={() => setReveal((v) => !v)}
                aria-label={reveal ? "Ocultar key" : "Mostrar key"}
              >
                {reveal ? <EyeOffIcon size={17} /> : <EyeIcon size={17} />}
              </button>
            </div>
            <span className="sk-msg" role="status">
              {check === "invalid" && (<><WarnIcon size={12} /> SteamGridDB rechazó esta key. Revisa que esté completa.</>)}
              {check === "network" && (<><WarnIcon size={12} /> No se pudo conectar con SteamGridDB. Inténtalo de nuevo.</>)}
              {check === "valid" && (<><CheckIcon size={12} /> Key verificada. ¡Listo!</>)}
            </span>
          </form>
        </div>

        <div className="rg-foot">
          <button className="rg-foot-check" onClick={() => setDont((v) => !v)}>
            <span className={"box" + (dont ? " on" : "")}><CheckIcon size={12} /></span>
            No volver a mostrar
          </button>
          <button className="rg-btn ghost" onClick={dismiss}>Ahora no</button>
          <button className="rg-btn primary" disabled={!trimmed || busy} onClick={() => void submit()}>
            {check === "verifying" ? (
              <><span className="sk-spin" /> Verificando…</>
            ) : check === "valid" ? (
              <><CheckIcon size={18} /> Guardada</>
            ) : (
              <><CheckIcon size={18} /> Verificar y guardar</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
