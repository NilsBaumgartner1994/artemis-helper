import { input, password } from "@inquirer/prompts";
import { ArtemisClient, describeError } from "../lib/artemisClient.js";
import { parseCliArgs } from "../lib/cliArgs.js";
import { loadConfig, saveConfig } from "../lib/config.js";
import { promptBaseUrl, promptVcsToken } from "../lib/loginPrompts.js";

async function main() {
  const flags = parseCliArgs(process.argv.slice(2));
  const existing = loadConfig();

  const baseUrl = (flags.baseUrl ?? (await promptBaseUrl(existing.baseUrl))).replace(/\/+$/, "");
  const username = flags.username ?? (await input({ message: "Benutzername:", default: existing.username }));
  const pw = flags.password ?? (await password({ message: "Passwort:", mask: "*" }));

  console.log("Prüfe Zugangsdaten …");
  const client = new ArtemisClient(baseUrl);
  await client.login(username, pw);
  console.log("Login erfolgreich.");

  const vcsToken = await promptVcsToken(baseUrl, Boolean(existing.vcsToken));

  saveConfig({ baseUrl, username, password: pw, vcsToken });
  console.log("Zugangsdaten gespeichert in .env (nicht in Git eingecheckt).");
}

main().catch((error) => {
  console.error(`Login fehlgeschlagen: ${describeError(error)}`);
  process.exitCode = 1;
});
