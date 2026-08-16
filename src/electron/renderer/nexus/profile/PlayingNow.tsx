/**
 * PlayingNow — live "▶ Jugando {título} 00:23:45" badge shown for a friend who
 * is in a game session. Title + start come from the player's presence broadcast
 * (`playing_title` / `playing_since`); the timer ticks locally from `since`
 * (epoch ms), so it survives the friend's away/online toggles. Shared by the
 * friends list and the public profile.
 */

import { useEffect, useState } from "react";
import { PlayIcon } from "../NexusIcons";

function formatHMS(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
}

export function PlayingNow({ title, since }: { title: string; since?: number | null }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!since) return;
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [since]);

  const elapsed = since ? formatHMS((now - since) / 1000) : null;
  return (
    <>
      <PlayIcon size={11} /> Jugando <span className="playing">{title}</span>
      {elapsed && (
        <span
          className="playing-time"
          style={{ fontVariantNumeric: "tabular-nums", opacity: 0.75, marginLeft: 4 }}
        >
          {elapsed}
        </span>
      )}
    </>
  );
}
