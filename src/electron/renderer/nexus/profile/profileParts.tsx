/**
 * Presentational pieces shared by the own profile (NexusProfile) and another
 * user's profile (NexusUserProfile), so both render with the exact same
 * markup / pf-* classes — one visual language for every profile.
 */

import { useState, type ComponentProps, type ReactNode } from "react";
import type { ProfileVisibility } from "../../social/socialTypes";
import { NexusGameCard } from "../NexusGameCard";
import type { NexusGame } from "../nexusModel";
import { GlobeIcon, LockIcon, UsersIcon } from "../NexusIcons";

export function StatCard({
  icon,
  label,
  children,
}: {
  icon: ReactNode;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="pf-stat">
      <span className="pf-stat-ico">{icon}</span>
      <span className="pf-stat-val">{children}</span>
      <span className="pf-stat-lbl">{label}</span>
    </div>
  );
}

export const VISIBILITY_LABEL: Record<ProfileVisibility, string> = {
  everyone: "Todos",
  friends: "Solo amigos",
  nobody: "Solo tú",
};

/** "Visible para …" pill shown next to a section title on the own profile. */
export function VisibilityChip({ level }: { level: ProfileVisibility }) {
  const Icon = level === "everyone" ? GlobeIcon : level === "friends" ? UsersIcon : LockIcon;
  return (
    <span className={"pf-vis-chip " + level} title={`Visible para: ${VISIBILITY_LABEL[level]}`}>
      <Icon size={12} /> {VISIBILITY_LABEL[level]}
    </span>
  );
}

/** Notice for a section the profile owner keeps hidden from the viewer. */
export function PrivateSection({ text }: { text: string }) {
  return (
    <div className="pf-empty small pf-private">
      <LockIcon size={16} /> {text}
    </div>
  );
}

const SHELF_PREVIEW = 12;

/**
 * A titled grid of game cards (pinned / library / likes). Long shelves show a
 * preview and a "Ver todo" toggle. `cardProps` decides whether the cards are
 * the viewer's own (interactive) or someone else's (readOnly).
 */
export function GameShelf({
  title,
  games,
  headExtra,
  empty,
  cardProps,
}: {
  title: string;
  games: NexusGame[];
  headExtra?: ReactNode;
  empty: ReactNode;
  cardProps: (game: NexusGame) => Omit<ComponentProps<typeof NexusGameCard>, "game" | "showFooter" | "ref">;
}) {
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? games : games.slice(0, SHELF_PREVIEW);
  return (
    <div className="pf-section">
      <div className="pf-section-head">
        <h2>{title}</h2>
        <span className="count">{games.length}</span>
        {headExtra}
        <div className="pf-section-spacer" />
        {games.length > SHELF_PREVIEW && (
          <button className="pf-section-edit" onClick={() => setExpanded((v) => !v)}>
            {expanded ? "Ver menos" : `Ver todo (${games.length})`}
          </button>
        )}
      </div>
      {games.length === 0 ? (
        empty
      ) : (
        <div className="pf-pinned">
          {shown.map((g) => (
            <div key={g.key} className="pf-pin">
              <NexusGameCard game={g} showFooter {...cardProps(g)} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
