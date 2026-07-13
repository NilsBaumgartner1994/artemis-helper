import fs from "node:fs";
import path from "node:path";
import type { ExerciseManifest } from "./types.js";

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export function exerciseFolder(baseDir: string, exerciseId: number, title: string): string {
  return path.join(baseDir, `${exerciseId}-${slugify(title)}`);
}

export function manifestPath(folder: string): string {
  return path.join(folder, "manifest.json");
}

export function writeManifest(folder: string, manifest: ExerciseManifest): void {
  fs.mkdirSync(folder, { recursive: true });
  fs.writeFileSync(manifestPath(folder), JSON.stringify(manifest, null, 2));
}

export interface StoredExport {
  folder: string;
  manifest: ExerciseManifest;
}

export function listStoredExports(baseDir: string): StoredExport[] {
  if (!fs.existsSync(baseDir)) return [];
  const entries = fs.readdirSync(baseDir, { withFileTypes: true });
  const stored: StoredExport[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const folder = path.join(baseDir, entry.name);
    const manifestFile = manifestPath(folder);
    if (!fs.existsSync(manifestFile)) continue;
    const manifest = JSON.parse(fs.readFileSync(manifestFile, "utf-8")) as ExerciseManifest;
    stored.push({ folder, manifest });
  }
  return stored.sort((a, b) => a.manifest.exportedAt.localeCompare(b.manifest.exportedAt));
}
