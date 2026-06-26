/**
 * NexusProfileShots — own-profile screenshot gallery. Upload images to the
 * cloud ('screenshots' bucket), list them and delete them. Shown on the user's
 * own profile when signed in; other accounts see these via NexusPublicProfile.
 */

import { useEffect, useRef, useState } from "react";
import { addScreenshot, listScreenshots, deleteScreenshot } from "../../social/socialApi";
import type { ProfileScreenshot } from "../../social/socialTypes";
import { UploadIcon, TrashIcon } from "../NexusIcons";

export function NexusProfileShots({ userId }: { userId: string }) {
  const [shots, setShots] = useState<ProfileScreenshot[]>([]);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    void listScreenshots(userId)
      .then((s) => {
        if (!cancelled) setShots(s);
      })
      .catch((e) => console.warn("[shots] list failed:", e));
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const onPick = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setBusy(true);
    try {
      for (const f of Array.from(files)) {
        if (!f.type.startsWith("image/")) continue;
        const row = await addScreenshot(f);
        setShots((prev) => [row, ...prev]);
      }
    } catch (e) {
      console.warn("[shots] upload failed:", e);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (s: ProfileScreenshot) => {
    try {
      await deleteScreenshot(s.id, s.storage_path);
      setShots((prev) => prev.filter((x) => x.id !== s.id));
    } catch (e) {
      console.warn("[shots] delete failed:", e);
    }
  };

  return (
    <div className="nps">
      <div className="nps-head">
        <span className="nps-title">Capturas</span>
        <button className="pf-act-btn" disabled={busy} onClick={() => fileRef.current?.click()}>
          <UploadIcon size={15} /> {busy ? "Subiendo…" : "Subir"}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          style={{ display: "none" }}
          onChange={(e) => {
            void onPick(e.target.files);
            e.target.value = "";
          }}
        />
      </div>
      {shots.length === 0 ? (
        <div className="nps-empty">Aún no has subido capturas. Sube imágenes para mostrarlas en tu perfil.</div>
      ) : (
        <div className="nps-grid">
          {shots.map((s) => (
            <div className="nps-item" key={s.id}>
              <img src={s.url} alt={s.caption ?? ""} />
              <button className="nps-del" title="Eliminar" onClick={() => void remove(s)}>
                <TrashIcon size={15} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
