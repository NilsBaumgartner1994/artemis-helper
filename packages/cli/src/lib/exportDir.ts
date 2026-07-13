import path from "node:path";
import { input } from "@inquirer/prompts";
import type { CliFlags } from "./cliArgs.js";
import { loadConfig, saveConfig } from "./config.js";
import { defaultExportsDir } from "./paths.js";

/** Resolves the export/import folder: --dir flag, else stored .env value, else an interactive prompt (which gets persisted). */
export async function resolveExportDir(flags: CliFlags): Promise<string> {
  if (flags.dir) return path.resolve(flags.dir);

  const existing = loadConfig();
  if (existing.exportDir) return existing.exportDir;

  const answer = await input({
    message: "In welchem Ordner sollen Aufgaben-Exporte gespeichert/gelesen werden?",
    default: defaultExportsDir,
  });
  const resolved = path.resolve(answer);
  saveConfig({ exportDir: resolved });
  console.log(`Export-Ordner gespeichert in .env für zukünftige Aufrufe.\n`);
  return resolved;
}
