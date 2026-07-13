import { confirm, input, password } from "@inquirer/prompts";
import { DEFAULT_BASE_URL, type ArtemisConfig } from "./config.js";

export async function promptBaseUrl(defaultValue?: string): Promise<string> {
  const value = await input({
    message: "Artemis-URL:",
    default: defaultValue ?? DEFAULT_BASE_URL,
  });
  return value.replace(/\/+$/, "");
}

export async function promptVcsToken(baseUrl: string, hadTokenBefore: boolean): Promise<string | undefined> {
  const wantsVcsToken = await confirm({
    message:
      "VCS-Zugriffstoken hinterlegen (wird zum Klonen von Repositories bei Programmieraufgaben benötigt)?",
    default: hadTokenBefore || true,
  });
  if (!wantsVcsToken) return undefined;
  console.log(`Token generieren/kopieren unter: ${baseUrl}/user-settings/vcs-token`);
  return password({ message: "VCS-Zugriffstoken:", mask: "*" });
}

/** Runs the full interactive login prompt sequence, pre-filling from `existing` where possible. */
export async function interactiveLogin(existing: ArtemisConfig): Promise<Required<Pick<ArtemisConfig, "baseUrl" | "username" | "password">> & Pick<ArtemisConfig, "vcsToken">> {
  const baseUrl = await promptBaseUrl(existing.baseUrl);
  const username = await input({ message: "Benutzername:", default: existing.username });
  const pw = await password({ message: "Passwort:", mask: "*" });
  const vcsToken = await promptVcsToken(baseUrl, Boolean(existing.vcsToken));
  return { baseUrl, username, password: pw, vcsToken };
}
