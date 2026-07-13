import { ArtemisClient } from "./artemisClient.js";
import type { CliFlags } from "./cliArgs.js";
import { loadConfig, saveConfig } from "./config.js";
import { interactiveLogin, promptBaseUrl } from "./loginPrompts.js";

export interface AuthResult {
  client: ArtemisClient;
  baseUrl: string;
  username?: string;
  vcsToken?: string;
}

/**
 * Resolves credentials in priority order: --token flag, --username/--password flags,
 * stored .env, then an interactive login (which gets persisted for next time).
 */
export async function ensureAuthenticated(flags: CliFlags): Promise<AuthResult> {
  const existing = loadConfig();

  if (flags.token) {
    const baseUrl = (flags.baseUrl ?? existing.baseUrl ?? (await promptBaseUrl(existing.baseUrl))).replace(/\/+$/, "");
    const client = new ArtemisClient(baseUrl);
    client.setToken(flags.token);
    return { client, baseUrl, username: flags.username ?? existing.username, vcsToken: existing.vcsToken };
  }

  if (flags.username && flags.password) {
    const baseUrl = (flags.baseUrl ?? existing.baseUrl ?? (await promptBaseUrl(existing.baseUrl))).replace(/\/+$/, "");
    const client = new ArtemisClient(baseUrl);
    await client.login(flags.username, flags.password);
    return { client, baseUrl, username: flags.username, vcsToken: existing.vcsToken };
  }

  if (existing.baseUrl && existing.username && existing.password) {
    const client = new ArtemisClient(existing.baseUrl);
    await client.login(existing.username, existing.password);
    return { client, baseUrl: existing.baseUrl, username: existing.username, vcsToken: existing.vcsToken };
  }

  console.log("Keine (vollständigen) Zugangsdaten gefunden – bitte einmalig anmelden.");
  const config = await interactiveLogin(existing);
  const client = new ArtemisClient(config.baseUrl);
  await client.login(config.username, config.password);
  saveConfig(config);
  console.log("Zugangsdaten gespeichert in .env für zukünftige Aufrufe.\n");
  return { client, baseUrl: config.baseUrl, username: config.username, vcsToken: config.vcsToken };
}
