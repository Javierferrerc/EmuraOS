# Retro Launcher

Open-source retro gaming frontend — detect ROMs, map emulators, launch games from the command line.

## Features

- **ROM Scanner** — Automatically detects ROMs organized by system folder
- **Emulator Mapping** — Resolves the best emulator for each system with configurable paths
- **Game Launcher** — Launch any detected ROM with one command
- **Setup Wizard** — Interactive first-run configuration
- **Emulator Auto-Detection** — Scans for installed emulators on your system
- **15 Systems, 12 Emulators** — Nintendo, Sega, and Sony consoles supported out of the box

## Prerequisites

- [Node.js](https://nodejs.org/) v20.0.0 or higher
- One or more emulators installed (see [Supported Emulators](#supported-emulators))
- Your own ROM files (not included)

## Installation

```bash
git clone https://github.com/Javierferrerc/retro-launcher.git
cd retro-launcher
npm install
npm run build
```

## Quick Start

```bash
# First run — interactive setup wizard
node dist/cli/index.js

# Scan for ROMs
node dist/cli/index.js scan

# List all detected ROMs
node dist/cli/index.js list

# Launch a game
node dist/cli/index.js launch "Super Mario Bros.nes"
```

## Usage

### `scan`

Scan the ROMs directory and list detected games by system.

```bash
retro-launcher scan
retro-launcher scan -p /path/to/roms
```

### `list`

List detected ROMs, optionally filtered by system.

```bash
retro-launcher list
retro-launcher list -s nes
retro-launcher list -s snes -p /path/to/roms
```

### `launch <romName>`

Launch a ROM with the appropriate emulator.

```bash
retro-launcher launch "Zelda.nes"
retro-launcher launch "Mario Kart" -e /path/to/emulators
```

### `setup`

Run the interactive setup wizard to configure ROM and emulator paths.

```bash
retro-launcher setup
```

### `config`

View or modify configuration.

```bash
# View current configuration
retro-launcher config

# Set a configuration value
retro-launcher config set romsPath ./my-roms
retro-launcher config set emulatorsPath /opt/emulators

# Auto-detect installed emulators
retro-launcher config --detect

# Re-run the setup wizard
retro-launcher config --wizard
```

## Supported Systems

| ID | System | Manufacturer | Extensions |
|----|--------|-------------|------------|
| `nes` | Nintendo Entertainment System | Nintendo | .nes, .unf, .unif |
| `snes` | Super Nintendo | Nintendo | .sfc, .smc, .fig, .swc |
| `n64` | Nintendo 64 | Nintendo | .n64, .z64, .v64 |
| `gb` | Game Boy | Nintendo | .gb |
| `gbc` | Game Boy Color | Nintendo | .gbc |
| `gba` | Game Boy Advance | Nintendo | .gba |
| `nds` | Nintendo DS | Nintendo | .nds, .dsi |
| `gamecube` | Nintendo GameCube | Nintendo | .iso, .gcm, .gcz, .ciso |
| `wii` | Nintendo Wii | Nintendo | .iso, .wbfs, .wad, .ciso |
| `megadrive` | Sega Mega Drive / Genesis | Sega | .md, .gen, .bin, .smd |
| `mastersystem` | Sega Master System | Sega | .sms |
| `dreamcast` | Sega Dreamcast | Sega | .cdi, .gdi, .chd |
| `psx` | PlayStation | Sony | .bin, .cue, .img, .iso, .pbp, .chd |
| `ps2` | PlayStation 2 | Sony | .iso, .bin, .chd, .cso, .gz |
| `psp` | PlayStation Portable | Sony | .iso, .cso, .pbp |

## Supported Emulators

| ID | Emulator | Systems |
|----|----------|---------|
| `retroarch` | RetroArch | NES, SNES, N64, GB, GBC, GBA, Mega Drive, Master System, PSX |
| `snes9x` | Snes9x | SNES |
| `project64` | Project64 | N64 |
| `mgba` | mGBA | GB, GBC, GBA |
| `desmume` | DeSmuME | NDS |
| `melonds` | melonDS | NDS |
| `dolphin` | Dolphin | GameCube, Wii |
| `pcsx2` | PCSX2 | PS2 |
| `duckstation` | DuckStation | PSX |
| `ppsspp` | PPSSPP | PSP |
| `flycast` | Flycast | Dreamcast |
| `kega-fusion` | Kega Fusion | Mega Drive, Master System |

## ROM Directory Structure

Organize your ROMs into system-specific subfolders:

```
roms/
  nes/
    Super Mario Bros.nes
    Zelda.nes
  snes/
    Super Mario World.sfc
  n64/
    Mario Kart 64.z64
  gba/
    Pokemon Emerald.gba
  psx/
    Final Fantasy VII.bin
```

## GUI (Electron)

Retro Launcher includes a desktop GUI built with Electron + React + Tailwind CSS.

```bash
# Start the Electron GUI (development mode)
npm run start:electron

# Package the app
npm run package

# Build distributable installer
npm run make
```

### GUI Features

- **ROM Grid** — Browse all detected ROMs in a responsive card grid
- **System Sidebar** — Filter by system with ROM count badges
- **Search** — Real-time search with 300ms debounce
- **Click-to-Launch** — Double-click any ROM card to launch with the mapped emulator
- **Settings** — Edit ROM/emulator paths, detect emulators, re-scan ROMs

The GUI uses the same core engine as the CLI — no code duplication.

## Development

```bash
# Install dependencies
npm install

# Build CLI
npm run build

# Run tests
npm test

# Watch mode
npm run dev        # TypeScript watch
npm run test:watch # Test watch

# Electron GUI
npm run start:electron   # Dev mode with hot reload
npm run package          # Package app
npm run make             # Build distributable
```

## License

MIT

## Disclaimer

ROMs are not included. Users must provide their own legally obtained ROM files. This project does not promote or condone piracy.
