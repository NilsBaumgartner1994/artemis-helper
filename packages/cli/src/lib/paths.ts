import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));

// packages/cli/src/lib -> repo root is four levels up
export const repoRoot = path.resolve(here, "../../../..");
export const envPath = path.join(repoRoot, ".env");
export const defaultExportsDir = path.join(repoRoot, "exports");
