/**
 * NexusRegisterModal — full account sign-up for NEXUS, ported from the design
 * handoff (register-modal.jsx) into our stack. The simulated uniqueness lists
 * (TAKEN_IDS / TAKEN_USERS) are replaced by debounced calls to the Supabase
 * availability RPCs, and onSubmit performs the real sign-up via SocialContext.
 *
 * Esc / click-outside → onClose. On success it shows the confirmation view; the
 * "Entrar a NEXUS" button also calls onClose.
 */

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useSocial } from "../../social/SocialContext";
import {
  CheckIcon,
  CloseIcon,
  EyeIcon,
  EyeOffIcon,
  GamepadIcon,
  WarnIcon,
} from "../NexusIcons";
import "./nexus-register.css";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ID_RE = /^[A-Za-z0-9]{3,5}$/;

function strengthOf(pw: string): number {
  let s = 0;
  if (pw.length >= 8) s++;
  if (pw.length >= 12) s++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) s++;
  if (/\d/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw)) s++;
  return Math.min(4, s);
}
const STRENGTH = [
  { label: "Muy débil", color: "var(--bad)" },
  { label: "Débil", color: "#f97316" },
  { label: "Aceptable", color: "var(--warn)" },
  { label: "Buena", color: "#84cc16" },
  { label: "Fuerte", color: "var(--good)" },
];

/** idle = nothing to check yet; checking = RPC in flight; ok/taken = result. */
type Avail = "idle" | "checking" | "ok" | "taken";

interface FieldProps {
  label?: string;
  required?: boolean;
  optional?: boolean;
  hint?: React.ReactNode;
  error?: string | null;
  good?: string | null;
  children: React.ReactNode;
}

function Field({ label, required, optional, hint, error, good, children }: FieldProps) {
  return (
    <div className="reg-field">
      {label && (
        <label className="reg-label">
          {label}
          {required && <span className="req">*</span>}
          {optional && <span className="opt">· opcional</span>}
        </label>
      )}
      {children}
      {error ? (
        <div className="reg-error">
          <WarnIcon size={13} /> {error}
        </div>
      ) : good ? (
        <div className="reg-msg-good">
          <CheckIcon size={13} /> {good}
        </div>
      ) : hint ? (
        <div className="reg-hint">{hint}</div>
      ) : null}
    </div>
  );
}

function PrivacyToggle({
  on,
  onChange,
  title,
  sub,
}: {
  on: boolean;
  onChange: (v: boolean) => void;
  title: string;
  sub: string;
}) {
  return (
    <div className="reg-priv">
      <div className="reg-priv-txt">
        <b>{title}</b>
        <span>{sub}</span>
      </div>
      <button
        type="button"
        className="reg-sw"
        data-on={on ? "1" : "0"}
        role="switch"
        aria-checked={on}
        onClick={() => onChange(!on)}
      >
        <i />
      </button>
    </div>
  );
}

interface Values {
  nombre: string;
  apellido: string;
  username: string;
  userid: string;
  email: string;
  edad: string;
  password: string;
  password2: string;
  recovery: string;
}

/** Data emitted once an account is created, so a host (e.g. the profile
 *  selector) can add it to its list without forcing a manual sign-in. */
export interface RegisteredAccount {
  userId: string;
  /** True only if Supabase returned a live session (email auto-confirm). */
  hasSession: boolean;
  username: string;
  /** Public display name (real name or username, per the privacy toggle). */
  fullName: string;
}

export interface NexusRegisterModalProps {
  onClose: () => void;
  /** Switch back to the inline sign-in panel ("¿Ya tienes cuenta?"). */
  onSwitchToSignIn?: () => void;
  /** Fired right after a successful sign-up with the new account's data. */
  onRegistered?: (account: RegisteredAccount) => void;
}

export function NexusRegisterModal({ onClose, onSwitchToSignIn, onRegistered }: NexusRegisterModalProps) {
  const social = useSocial();

  const [v, setV] = useState<Values>({
    nombre: "",
    apellido: "",
    username: "",
    userid: "",
    email: "",
    edad: "",
    password: "",
    password2: "",
    recovery: "",
  });
  const [showName, setShowName] = useState(true);
  const [showAge, setShowAge] = useState(false);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [showPw, setShowPw] = useState(false);
  const [showPw2, setShowPw2] = useState(false);
  const [idFocus, setIdFocus] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Live availability, replacing the simulated TAKEN_USERS / TAKEN_IDS lists.
  // Riot-style: availability is on the whole handle (username#tag), since the
  // username and tag may each repeat on their own — only the pair must be free.
  const [handleAvail, setHandleAvail] = useState<Avail>("idle");

  const set = (k: keyof Values, val: string) => setV((p) => ({ ...p, [k]: val }));
  const touch = (k: string) => setTouched((p) => ({ ...p, [k]: true }));

  const setUserid = (raw: string) =>
    set("userid", raw.replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 5));
  const setEdad = (raw: string) => set("edad", raw.replace(/[^0-9]/g, "").slice(0, 3));

  // ── Debounced handle (usuario#ID) availability ───────────────────────
  // Only the pair matters: alex#AX12 and alex#9Q2 can coexist. We wait until
  // both parts have a valid format, then check the combination.
  useEffect(() => {
    const name = v.username.trim();
    const tag = v.userid;
    if (name.length < 3 || !ID_RE.test(tag)) {
      setHandleAvail("idle");
      return;
    }
    setHandleAvail("checking");
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const free = await social.checkHandle(name, tag);
        if (!cancelled) setHandleAvail(free ? "ok" : "taken");
      } catch {
        if (!cancelled) setHandleAvail("idle");
      }
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [v.username, v.userid, social]);

  // ── Validation ───────────────────────────────────────────────────────
  const errs: Partial<Record<keyof Values, string>> = {};
  if (!v.nombre.trim()) errs.nombre = "Introduce tu nombre.";
  if (!v.apellido.trim()) errs.apellido = "Introduce tu apellido.";
  if (!v.username.trim()) errs.username = "Elige un nombre de usuario.";
  else if (v.username.trim().length < 3) errs.username = "Mínimo 3 caracteres.";
  if (!v.userid) errs.userid = "Introduce tu ID.";
  else if (!ID_RE.test(v.userid)) errs.userid = "Entre 3 y 5 letras o números.";
  // The conflict is on the whole handle; surface it on the #ID (the part the
  // user tweaks to make it unique, Riot-style).
  else if (handleAvail === "taken") errs.userid = "Ese usuario#ID ya está en uso.";
  if (!v.email.trim()) errs.email = "Introduce tu correo.";
  else if (!EMAIL_RE.test(v.email.trim())) errs.email = "Correo no válido.";
  const ageN = parseInt(v.edad, 10);
  if (!v.edad) errs.edad = "Introduce tu edad.";
  else if (ageN < 13) errs.edad = "Debes tener al menos 13 años.";
  else if (ageN > 120) errs.edad = "Edad no válida.";
  if (!v.password) errs.password = "Crea una contraseña.";
  else if (v.password.length < 8) errs.password = "Mínimo 8 caracteres.";
  if (!v.password2) errs.password2 = "Repite la contraseña.";
  else if (v.password2 !== v.password) errs.password2 = "Las contraseñas no coinciden.";
  if (!v.recovery.trim()) errs.recovery = "Introduce un correo de recuperación.";
  else if (!EMAIL_RE.test(v.recovery.trim())) errs.recovery = "Correo no válido.";

  const recoverySameWarn =
    !!v.recovery &&
    EMAIL_RE.test(v.recovery.trim()) &&
    v.recovery.trim().toLowerCase() === v.email.trim().toLowerCase();

  const show = (k: keyof Values) => (touched[k] || submitted) && errs[k];
  const valid = Object.keys(errs).length === 0;

  const handleOk = handleAvail === "ok";
  const usernameFormatOk = v.username.trim().length >= 3 && !errs.username;
  const st = strengthOf(v.password);

  // ── Submit: real sign-up ─────────────────────────────────────────────
  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setSubmitted(true);
    setSubmitError(null);
    if (!valid || busy) return;
    // Block while the handle availability check is still resolving.
    if (handleAvail === "checking") return;

    const display_name = showName ? `${v.nombre.trim()} ${v.apellido.trim()}`.trim() : v.username.trim();
    setBusy(true);
    try {
      const res = await social.registerAccount(v.email.trim(), v.password, {
        username: v.username.trim(),
        user_tag: v.userid,
        first_name: v.nombre.trim(),
        last_name: v.apellido.trim(),
        full_name: display_name,
        age: ageN,
        show_name: showName,
        show_age: showAge,
        recovery_email: v.recovery.trim(),
      });
      if (res.userId) {
        onRegistered?.({
          userId: res.userId,
          hasSession: res.hasSession,
          username: v.username.trim(),
          fullName: display_name,
        });
      }
      setDone(true);
    } catch (err) {
      const m = err instanceof Error ? err.message : String(err);
      // Friendlier message for the common collision cases.
      if (/already registered|already exists|duplicate/i.test(m)) {
        setSubmitError("Ese correo o identificador ya está registrado.");
      } else {
        setSubmitError(m);
      }
    } finally {
      setBusy(false);
    }
  };

  // Esc closes (matches the handoff behaviour).
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") onCloseRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (done) {
    return createPortal(
      <div className="nexus-reg">
        <div className="reg-stage">
          <div className="reg-modal">
          <div className="reg-success">
            <div className="reg-success-badge">
              <CheckIcon size={38} />
            </div>
            <h2>¡Cuenta creada!</h2>
            <p>
              Te damos la bienvenida a NEXUS, {v.nombre}. Hemos enviado un correo de verificación a{" "}
              {v.email}.
            </p>
            <div className="tag">
              {v.username} <b>#{v.userid}</b>
            </div>
            <button
              className="reg-submit"
              style={{ maxWidth: 240, marginTop: 8 }}
              onClick={onClose}
            >
              Entrar a NEXUS
            </button>
          </div>
        </div>
      </div>
      </div>,
      document.body
    );
  }

  return createPortal(
    <div className="nexus-reg">
    <div
      className="reg-stage"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <form className="reg-modal" onSubmit={submit} noValidate>
        <div className="reg-head">
          <div className="reg-mark">
            <i />
          </div>
          <div className="reg-head-txt">
            <h1>Crear cuenta</h1>
            <p>Únete a NEXUS y conecta con tu biblioteca y tus amigos.</p>
          </div>
          <button type="button" className="reg-close" onClick={onClose} aria-label="Cerrar">
            <CloseIcon size={20} />
          </button>
        </div>

        <div className="reg-body">
          {/* Nombre + Apellido */}
          <div className="reg-grid2">
            <Field label="Nombre" required error={show("nombre") ? errs.nombre : null}>
              <div className="reg-input-wrap">
                <input
                  className={"reg-input" + (show("nombre") ? " err" : "")}
                  value={v.nombre}
                  placeholder="Alex"
                  onChange={(e) => set("nombre", e.target.value)}
                  onBlur={() => touch("nombre")}
                />
              </div>
            </Field>
            <Field label="Apellido" required error={show("apellido") ? errs.apellido : null}>
              <div className="reg-input-wrap">
                <input
                  className={"reg-input" + (show("apellido") ? " err" : "")}
                  value={v.apellido}
                  placeholder="Vega"
                  onChange={(e) => set("apellido", e.target.value)}
                  onBlur={() => touch("apellido")}
                />
              </div>
            </Field>
          </div>
          <PrivacyToggle
            on={showName}
            onChange={setShowName}
            title="Mostrar nombre y apellido en mi perfil"
            sub={showName ? "Tus amigos verán tu nombre real" : "Solo se mostrará tu nombre de usuario"}
          />

          {/* Username + ID */}
          <div className="reg-grid2">
            <Field
              label="Nombre de usuario"
              required
              error={show("username") ? errs.username : null}
              hint="Puede repetirse; tu #ID lo hace único"
            >
              <div className="reg-input-wrap">
                <input
                  className={
                    "reg-input has-icon" + (show("username") ? " err" : usernameFormatOk ? " ok" : "")
                  }
                  value={v.username}
                  placeholder="alexvega"
                  onChange={(e) => set("username", e.target.value)}
                  onBlur={() => touch("username")}
                />
                {usernameFormatOk && (
                  <span className="reg-in-icon good">
                    <CheckIcon size={17} />
                  </span>
                )}
              </div>
            </Field>
            <Field
              label="ID de usuario"
              required
              error={show("userid") ? errs.userid : null}
              good={handleOk ? "Disponible" : null}
              hint={
                handleAvail === "checking"
                  ? "Comprobando disponibilidad…"
                  : !show("userid")
                    ? "3–5 letras y/o números"
                    : null
              }
            >
              <div
                className={
                  "reg-id" +
                  (idFocus ? " focus" : "") +
                  (show("userid") ? " err" : handleOk ? " ok" : "")
                }
              >
                <span className="reg-id-hash">#</span>
                <input
                  value={v.userid}
                  placeholder="AX12"
                  inputMode="text"
                  onChange={(e) => setUserid(e.target.value)}
                  onFocus={() => setIdFocus(true)}
                  onBlur={() => {
                    setIdFocus(false);
                    touch("userid");
                  }}
                />
                <span className="reg-id-count">{v.userid.length}/5</span>
              </div>
            </Field>
          </div>

          {/* Email */}
          <Field label="Correo electrónico" required error={show("email") ? errs.email : null}>
            <div className="reg-input-wrap">
              <input
                type="email"
                className={
                  "reg-input has-icon" +
                  (show("email") ? " err" : v.email && !errs.email ? " ok" : "")
                }
                value={v.email}
                placeholder="alex@correo.com"
                autoComplete="email"
                onChange={(e) => set("email", e.target.value)}
                onBlur={() => touch("email")}
              />
              {v.email && !errs.email && (
                <span className="reg-in-icon good">
                  <CheckIcon size={17} />
                </span>
              )}
            </div>
          </Field>

          {/* Edad */}
          <Field label="Edad" required error={show("edad") ? errs.edad : null}>
            <div className="reg-input-wrap">
              <input
                className={"reg-input" + (show("edad") ? " err" : "")}
                value={v.edad}
                placeholder="18"
                inputMode="numeric"
                style={{ maxWidth: 140 }}
                onChange={(e) => setEdad(e.target.value)}
                onBlur={() => touch("edad")}
              />
            </div>
          </Field>
          <PrivacyToggle
            on={showAge}
            onChange={setShowAge}
            title="Mostrar edad en mi perfil"
            sub={showAge ? "Tu edad será visible para tus amigos" : "Tu edad permanecerá privada"}
          />

          <div className="reg-divider">
            <span>Seguridad</span>
          </div>

          {/* Password */}
          <Field label="Contraseña" required error={show("password") ? errs.password : null}>
            <div className="reg-input-wrap">
              <input
                type={showPw ? "text" : "password"}
                className={"reg-input has-icon" + (show("password") ? " err" : "")}
                value={v.password}
                placeholder="Mínimo 8 caracteres"
                autoComplete="new-password"
                onChange={(e) => set("password", e.target.value)}
                onBlur={() => touch("password")}
              />
              <button
                type="button"
                className="reg-eye"
                onClick={() => setShowPw((s) => !s)}
                aria-label="Mostrar/ocultar"
              >
                {showPw ? <EyeOffIcon size={18} /> : <EyeIcon size={18} />}
              </button>
            </div>
            {v.password && (
              <div className="reg-strength">
                <div className="reg-strength-bars">
                  {[0, 1, 2, 3].map((i) => (
                    <i key={i} style={{ background: i < st ? STRENGTH[st].color : undefined }} />
                  ))}
                </div>
                <span className="reg-strength-label" style={{ color: STRENGTH[st].color }}>
                  Seguridad: {STRENGTH[st].label}
                </span>
              </div>
            )}
          </Field>

          {/* Repeat password */}
          <Field
            label="Repetir contraseña"
            required
            error={show("password2") ? errs.password2 : null}
            good={v.password2 && v.password2 === v.password ? "Las contraseñas coinciden" : null}
          >
            <div className="reg-input-wrap">
              <input
                type={showPw2 ? "text" : "password"}
                className={
                  "reg-input has-icon" +
                  (show("password2")
                    ? " err"
                    : v.password2 && v.password2 === v.password
                      ? " ok"
                      : "")
                }
                value={v.password2}
                placeholder="Repite tu contraseña"
                autoComplete="new-password"
                onChange={(e) => set("password2", e.target.value)}
                onBlur={() => touch("password2")}
              />
              <button
                type="button"
                className="reg-eye"
                onClick={() => setShowPw2((s) => !s)}
                aria-label="Mostrar/ocultar"
              >
                {showPw2 ? <EyeOffIcon size={18} /> : <EyeIcon size={18} />}
              </button>
            </div>
          </Field>

          {/* Recovery email */}
          <Field
            label="Correo de recuperación"
            required
            error={show("recovery") ? errs.recovery : null}
            hint={recoverySameWarn ? null : "Lo usaremos si pierdes el acceso a tu cuenta."}
          >
            <div className="reg-input-wrap">
              <input
                type="email"
                className={
                  "reg-input has-icon" +
                  (show("recovery") ? " err" : v.recovery && !errs.recovery ? " ok" : "")
                }
                value={v.recovery}
                placeholder="recuperacion@correo.com"
                autoComplete="email"
                onChange={(e) => set("recovery", e.target.value)}
                onBlur={() => touch("recovery")}
              />
              {v.recovery && !errs.recovery && (
                <span className="reg-in-icon good">
                  <CheckIcon size={17} />
                </span>
              )}
            </div>
            {recoverySameWarn && (
              <div className="reg-hint" style={{ color: "var(--warn)" }}>
                Recomendamos un correo distinto al principal.
              </div>
            )}
          </Field>
        </div>

        <div className="reg-foot">
          {submitError && (
            <div className="reg-error">
              <WarnIcon size={13} /> {submitError}
            </div>
          )}
          <button type="submit" className="reg-submit" disabled={busy || (submitted && !valid)}>
            <GamepadIcon size={19} /> {busy ? "Creando…" : "Crear cuenta"}
          </button>
          <div className="reg-foot-alt">
            ¿Ya tienes cuenta?{" "}
            <a
              href="#"
              onClick={(e) => {
                e.preventDefault();
                if (onSwitchToSignIn) onSwitchToSignIn();
                else onClose();
              }}
            >
              Inicia sesión
            </a>
          </div>
          <div className="reg-terms">
            Al registrarte aceptas las <a href="#">Condiciones</a> y la{" "}
            <a href="#">Política de privacidad</a> de NEXUS.
          </div>
        </div>
      </form>
    </div>
    </div>,
    document.body
  );
}
