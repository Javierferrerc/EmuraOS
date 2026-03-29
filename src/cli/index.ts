#!/usr/bin/env node

import { Command } from "commander";
import { registerScanCommand } from "./commands/scan.js";

const program = new Command();

program
  .name("retro-launcher")
  .description("Open-source retro gaming frontend — detect ROMs, map emulators, launch games")
  .version("0.1.0");

registerScanCommand(program);

program.parse();
