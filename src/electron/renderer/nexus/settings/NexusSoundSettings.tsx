/**
 * NexusSoundSettings — Settings → "Sonido": the launch sound-signature picker.
 * Lists the 6 LAUNCH_SOUNDS with the active one marked (persists
 * config.launchSoundProfile, default "minimal") and a "Probar" button per
 * option to audition it. Plus a master toggle (config.launchSoundEnabled).
 */

import type { SettingsContext } from "../../schemas/settings-schema-types";
import { LAUNCH_SOUNDS, playLaunch } from "../launch/nexusLaunchSound";
import { CheckIcon, PlayIcon } from "../NexusIcons";
import "./nexus-sound-settings.css";

export function NexusSoundSettings({ ctx }: { ctx: SettingsContext }) {
  const profile = ctx.config?.launchSoundProfile ?? "minimal";
  const enabled = ctx.config?.launchSoundEnabled ?? true;
  const save = ctx.liveUpdateConfig ?? ctx.updateConfig;

  const audition = (id: string) =>
    playLaunch({ duration: 2.4, intensity: 1, hue: 220, enabled: true, profile: id });

  const selectProfile = (id: string) => {
    void save({ launchSoundProfile: id });
    audition(id);
  };

  return (
    <div className="set-page">
      <div className="set-section-head">
        <h1>Sonido</h1>
        <p>Firma de sonido de la animación de inicio. Se reproduce al encender un juego.</p>
      </div>

      <button
        className={`snd-master${enabled ? " on" : ""}`}
        onClick={() => void save({ launchSoundEnabled: !enabled })}
        role="switch"
        aria-checked={enabled}
      >
        <span className="snd-master-txt">
          <b>Sonido de arranque</b>
          <span>Reproduce la firma de sonido al lanzar un juego.</span>
        </span>
        <span className="snd-switch">
          <span className="snd-switch-dot" />
        </span>
      </button>

      <div className="snd-group-label">Firma de sonido</div>
      <div className="snd-chips" data-disabled={!enabled}>
        {LAUNCH_SOUNDS.map((s) => {
          const active = profile === s.id;
          return (
            <div key={s.id} className={`snd-chip${active ? " active" : ""}`}>
              <button className="snd-chip-main" onClick={() => selectProfile(s.id)}>
                <span className="snd-chip-ico">
                  {active ? <CheckIcon size={14} /> : <PlayIcon size={13} />}
                </span>
                <span className="snd-chip-txt">
                  <b>{s.name}</b>
                  <span>{s.desc}</span>
                </span>
              </button>
              <button className="snd-probar" onClick={() => audition(s.id)} title={`Probar ${s.name}`}>
                <PlayIcon size={13} /> Probar
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
