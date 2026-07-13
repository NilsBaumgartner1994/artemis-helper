export interface CliFlags {
  username?: string;
  password?: string;
  token?: string;
  baseUrl?: string;
  dir?: string;
  positionals: string[];
}

const FLAG_KEYS: Record<string, keyof Omit<CliFlags, "positionals">> = {
  "--username": "username",
  "--password": "password",
  "--token": "token",
  "--base-url": "baseUrl",
  "--dir": "dir",
  "--folder": "dir",
};

export function parseCliArgs(argv: string[]): CliFlags {
  const flags: CliFlags = { positionals: [] };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const key = FLAG_KEYS[arg];
    if (!key) {
      flags.positionals.push(arg);
      continue;
    }
    const value = argv[i + 1];
    if (value === undefined) {
      throw new Error(`Flag ${arg} benötigt einen Wert.`);
    }
    flags[key] = value;
    i++;
  }
  return flags;
}
