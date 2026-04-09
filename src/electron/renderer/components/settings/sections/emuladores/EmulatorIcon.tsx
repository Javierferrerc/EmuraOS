/**
 * Emulator icon using real SVG logos.
 */
import retroarch from "../../../../assets/emulators/retroarch.svg";
import snes9x from "../../../../assets/emulators/snes9x.svg";
import project64 from "../../../../assets/emulators/project64.svg";
import mgba from "../../../../assets/emulators/mgba.svg";
import desmume from "../../../../assets/emulators/desmume.svg";
import melonds from "../../../../assets/emulators/melonds.svg";
import dolphin from "../../../../assets/emulators/dolphin.svg";
import pcsx2 from "../../../../assets/emulators/pcsx2.svg";
import duckstation from "../../../../assets/emulators/duckstation.svg";
import ppsspp from "../../../../assets/emulators/ppsspp.svg";
import flycast from "../../../../assets/emulators/flycast.svg";
import kegaFusion from "../../../../assets/emulators/kega-fusion.svg";
import citra from "../../../../assets/emulators/citra.svg";
import ryujinx from "../../../../assets/emulators/ryujinx.svg";
import cemu from "../../../../assets/emulators/cemu.svg";
import rpcs3 from "../../../../assets/emulators/rpcs3.svg";

const EMULATOR_ICONS: Record<string, string> = {
  retroarch,
  snes9x,
  project64,
  mgba,
  desmume,
  melonds,
  dolphin,
  pcsx2,
  duckstation,
  ppsspp,
  flycast,
  "kega-fusion": kegaFusion,
  citra,
  ryujinx,
  cemu,
  rpcs3,
};

export function EmulatorIcon({ id, className }: { id: string; className?: string }) {
  const src = EMULATOR_ICONS[id];

  if (!src) {
    return (
      <div
        className={`flex shrink-0 items-center justify-center rounded-lg bg-white/10 font-bold text-white ${className ?? ""}`}
        style={{ aspectRatio: "1" }}
      >
        <span className="text-[0.55em] leading-none">{id.slice(0, 2).toUpperCase()}</span>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={id}
      className={`shrink-0 rounded-lg object-contain ${className ?? ""}`}
    />
  );
}
