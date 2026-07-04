/**
 * NexusSystemRail — the library's system selector rendered in the style the
 * user picked in Configuración → Apariencia → Sistemas (lib.selectorStyle →
 * config.librarySelectorStyle). "chips" is the original NexusRailNav strip;
 * "two" (Dos niveles), "breadcrumb" and "seg" (Segmentado) are the alternate
 * layouts ported from the handoff's system-rail.jsx, driven by the same
 * families / platform-selection model, so keyboard & gamepad traversal via
 * selectableOrder keeps working regardless of the visual style.
 */

import { useEffect, useState } from "react";
import type { NexusFamily, NexusSystemNode } from "./nexusPlatforms";
import { ALL_PLATFORM } from "./nexusPlatforms";
import { NexusRailNav } from "./NexusRailNav";
import { GridIcon, ChevronRightIcon } from "./NexusIcons";
import "./nexus-system-rail.css";

export type RailStyle = "chips" | "two" | "breadcrumb" | "seg";

export interface RailVariantProps {
  families: NexusFamily[];
  activePlatform: string;
  navFocused?: boolean;
  onSelect: (platformId: string) => void;
  /** Game count of the current selection — shown by the "seg" style. */
  gameCount?: number;
}

const ChevronDownIcon = ({ size = 15 }: { size?: number }) => (
  <svg
    viewBox="0 0 24 24"
    width={size}
    height={size}
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M6 9l6 6 6-6" />
  </svg>
);

/** Locate a system node (and its family) by system id. */
function findSystem(
  families: NexusFamily[],
  id: string
): { fam: NexusFamily; sys: NexusSystemNode } | null {
  for (const fam of families) {
    const sys = fam.systems.find((s) => s.id === id);
    if (sys) return { fam, sys };
  }
  return null;
}

/** Family the current selection belongs to (the family itself, or the
 *  selected system's family). Null for "all" / unknown. */
function familyOfSelection(families: NexusFamily[], id: string): NexusFamily | null {
  return families.find((f) => f.id === id) ?? findSystem(families, id)?.fam ?? null;
}

/** Local "browsing family" state shared by the two-level and segmented
 *  styles: follows the active selection (incl. keyboard/gamepad platform
 *  switching) but lets the user browse another family before selecting. */
function useBrowsingFamily(families: NexusFamily[], activePlatform: string) {
  const selFam = familyOfSelection(families, activePlatform);
  const [famId, setFamId] = useState<string>(selFam?.id ?? families[0]?.id ?? "");
  useEffect(() => {
    if (selFam) setFamId(selFam.id);
  }, [selFam?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const fam = families.find((f) => f.id === famId) ?? families[0] ?? null;
  return { fam, setFamId };
}

function sysGlyph(sys: NexusSystemNode, size: number) {
  return sys.icon ? (
    <img className="sr-glyph" src={sys.icon} alt="" style={{ width: size, height: size }} />
  ) : null;
}

/* ═══════ Dos niveles — family row + system row ═══════ */
function RailTwo({ families, activePlatform, navFocused, onSelect }: RailVariantProps) {
  const { fam, setFamId } = useBrowsingFamily(families, activePlatform);
  return (
    <div
      className="sr-two"
      style={{ ["--ct" as string]: fam?.tint ?? "var(--accent)" }}
    >
      <div className="sr-two-fams">
        <button
          className={`sr-two-fam lib${activePlatform === ALL_PLATFORM ? " active" : ""}${
            navFocused && activePlatform === ALL_PLATFORM ? " nav-focused" : ""
          }`}
          onClick={() => onSelect(ALL_PLATFORM)}
        >
          <GridIcon size={15} /> Biblioteca
        </button>
        {families.map((f) => (
          <button
            key={f.id}
            className={`sr-two-fam${fam?.id === f.id ? " active" : ""}${
              navFocused && activePlatform === f.id ? " nav-focused" : ""
            }`}
            style={{ ["--ct" as string]: f.tint }}
            onClick={() => {
              setFamId(f.id);
              onSelect(f.id);
            }}
          >
            <span className="sr-fam-dot" style={{ background: f.tint }} /> {f.name}
          </button>
        ))}
      </div>
      <div className="sr-two-sys">
        {fam?.systems.map((s) => (
          <button
            key={s.id}
            className={`sr-two-pill${activePlatform === s.id ? " active" : ""}${
              navFocused && activePlatform === s.id ? " nav-focused" : ""
            }`}
            style={{ ["--ct" as string]: s.tint }}
            onClick={() => onSelect(s.id)}
          >
            {sysGlyph(s, 14)} {s.name} {s.year && <span className="yr">{s.year}</span>}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ═══════ Breadcrumb + dropdown menus ═══════ */
function RailBreadcrumb({ families, activePlatform, navFocused, onSelect }: RailVariantProps) {
  const [open, setOpen] = useState<"fam" | "sys" | null>(null);
  useEffect(() => {
    const close = () => setOpen(null);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, []);

  const hit = findSystem(families, activePlatform);
  const famSelected = families.find((f) => f.id === activePlatform) ?? null;
  const fam = hit?.fam ?? famSelected ?? families[0] ?? null;
  const curSys = hit?.sys ?? null;
  const allActive = activePlatform === ALL_PLATFORM;

  return (
    <div
      className="sr-bc"
      style={{ ["--ct" as string]: fam?.tint ?? "var(--accent)" }}
      onClick={(e) => e.stopPropagation()}
    >
      <button
        className={`sr-bc-node${allActive ? " here" : ""}${
          navFocused && allActive ? " nav-focused" : ""
        }`}
        onClick={() => onSelect(ALL_PLATFORM)}
      >
        <GridIcon size={15} /> Biblioteca
      </button>
      {fam && (
        <>
          <span className="sr-bc-chev">
            <ChevronRightIcon size={16} />
          </span>
          <div className="sr-dd">
            <button
              className={`sr-bc-node${famSelected ? " here" : ""}${
                navFocused && famSelected ? " nav-focused" : ""
              }`}
              style={{ ["--ct" as string]: fam.tint }}
              onClick={() => setOpen(open === "fam" ? null : "fam")}
            >
              <span className="sr-fam-dot" style={{ background: fam.tint }} /> {fam.name}{" "}
              <ChevronDownIcon size={15} />
            </button>
            {open === "fam" && (
              <div className="sr-dd-menu">
                {families.map((f) => (
                  <button
                    key={f.id}
                    className={`sr-dd-item${fam.id === f.id ? " on" : ""}`}
                    style={{ ["--ct2" as string]: f.tint }}
                    onClick={() => {
                      onSelect(f.id);
                      setOpen(null);
                    }}
                  >
                    <span className="sr-dd-dot" style={{ background: f.tint }} />
                    <span className="nm">{f.name}</span>
                    <span className="yr">{f.systems.length} sist.</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <span className="sr-bc-chev">
            <ChevronRightIcon size={16} />
          </span>
          <div className="sr-dd">
            <button
              className={`sr-bc-node${curSys ? " here" : ""}${
                navFocused && curSys ? " nav-focused" : ""
              }`}
              style={{ ["--ct" as string]: fam.tint }}
              onClick={() => setOpen(open === "sys" ? null : "sys")}
            >
              {curSys ? (
                <>
                  {sysGlyph(curSys, 15)} {curSys.name}{" "}
                  {curSys.year && (
                    <span style={{ color: "var(--text-faint)", fontWeight: 600 }}>
                      {curSys.year}
                    </span>
                  )}
                </>
              ) : (
                "Todos los sistemas"
              )}
              <ChevronDownIcon size={15} />
            </button>
            {open === "sys" && (
              <div className="sr-dd-menu">
                {fam.systems.map((s) => (
                  <button
                    key={s.id}
                    className={`sr-dd-item${activePlatform === s.id ? " on" : ""}`}
                    style={{ ["--ct2" as string]: s.tint }}
                    onClick={() => {
                      onSelect(s.id);
                      setOpen(null);
                    }}
                  >
                    <span className="sr-dd-dot" style={{ background: s.tint }} />
                    <span className="nm">{s.name}</span>
                    {s.year && <span className="yr">{s.year}</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

/* ═══════ Segmentado — compact segmented controls ═══════ */
function RailSeg({ families, activePlatform, navFocused, onSelect, gameCount }: RailVariantProps) {
  const { fam, setFamId } = useBrowsingFamily(families, activePlatform);
  const allActive = activePlatform === ALL_PLATFORM;
  return (
    <div
      className="sr-seg-wrap"
      style={{ ["--ct" as string]: fam?.tint ?? "var(--accent)" }}
    >
      <div className="sr-seg">
        <button
          className={`sr-seg-btn${allActive ? " on" : ""}${
            navFocused && allActive ? " nav-focused" : ""
          }`}
          onClick={() => onSelect(ALL_PLATFORM)}
        >
          <GridIcon size={14} /> Todo
        </button>
        {families.map((f) => (
          <button
            key={f.id}
            className={`sr-seg-btn${fam?.id === f.id && !allActive ? " on" : ""}${
              navFocused && activePlatform === f.id ? " nav-focused" : ""
            }`}
            style={{ ["--ct" as string]: f.tint }}
            onClick={() => {
              setFamId(f.id);
              onSelect(f.id);
            }}
          >
            <span className="sr-fam-dot" style={{ background: f.tint }} /> {f.name}
          </button>
        ))}
      </div>
      {fam && fam.systems.length > 0 && (
        <>
          <div className="sr-seg-div" />
          <div className="sr-seg">
            {fam.systems.map((s) => (
              <button
                key={s.id}
                className={`sr-seg-btn${activePlatform === s.id ? " on" : ""}${
                  navFocused && activePlatform === s.id ? " nav-focused" : ""
                }`}
                style={{ ["--ct" as string]: s.tint }}
                onClick={() => onSelect(s.id)}
              >
                {s.name}
              </button>
            ))}
          </div>
        </>
      )}
      {gameCount != null && (
        <span className="sr-count">
          {gameCount} {gameCount === 1 ? "juego" : "juegos"}
        </span>
      )}
    </div>
  );
}

interface NexusSystemRailProps extends RailVariantProps {
  variant: RailStyle;
}

export function NexusSystemRail({ variant, ...props }: NexusSystemRailProps) {
  switch (variant) {
    case "two":
      return <RailTwo {...props} />;
    case "breadcrumb":
      return <RailBreadcrumb {...props} />;
    case "seg":
      return <RailSeg {...props} />;
    default:
      return (
        <NexusRailNav
          families={props.families}
          activePlatform={props.activePlatform}
          navFocused={props.navFocused}
          onSelect={props.onSelect}
        />
      );
  }
}
