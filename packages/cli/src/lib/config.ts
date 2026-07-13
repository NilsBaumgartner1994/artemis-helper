import fs from "node:fs";
import dotenv from "dotenv";
import { envPath } from "./paths.js";

export const DEFAULT_BASE_URL = "https://artemis.informatik.uni-osnabrueck.de";

export interface ArtemisConfig {
  baseUrl?: string;
  username?: string;
  password?: string;
  vcsToken?: string;
  exportDir?: string;
}

export function loadConfig(): ArtemisConfig {
  if (!fs.existsSync(envPath)) return {};
  const parsed = dotenv.parse(fs.readFileSync(envPath));
  return {
    baseUrl: parsed.ARTEMIS_BASE_URL || undefined,
    username: parsed.ARTEMIS_USERNAME || undefined,
    password: parsed.ARTEMIS_PASSWORD || undefined,
    vcsToken: parsed.ARTEMIS_VCS_TOKEN || undefined,
    exportDir: parsed.ARTEMIS_EXPORT_DIR || undefined,
  };
}

function escapeEnvValue(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/** Merges the given fields into the existing .env, leaving untouched fields as-is. */
export function saveConfig(partial: ArtemisConfig): void {
  const merged: ArtemisConfig = { ...loadConfig(), ...partial };
  const lines: string[] = [];
  if (merged.baseUrl) lines.push(`ARTEMIS_BASE_URL=${escapeEnvValue(merged.baseUrl)}`);
  if (merged.username) lines.push(`ARTEMIS_USERNAME=${escapeEnvValue(merged.username)}`);
  if (merged.password) lines.push(`ARTEMIS_PASSWORD=${escapeEnvValue(merged.password)}`);
  if (merged.vcsToken) lines.push(`ARTEMIS_VCS_TOKEN=${escapeEnvValue(merged.vcsToken)}`);
  if (merged.exportDir) lines.push(`ARTEMIS_EXPORT_DIR=${escapeEnvValue(merged.exportDir)}`);
  fs.writeFileSync(envPath, lines.join("\n") + "\n", { mode: 0o600 });
  fs.chmodSync(envPath, 0o600);
}
