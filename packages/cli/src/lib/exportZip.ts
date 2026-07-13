import fs from "node:fs";
import path from "node:path";
import JSZip from "jszip";

/**
 * Extracts a zip buffer into destDir. Any nested .zip files are extracted recursively into a
 * sibling directory named after their basename (mirroring the server's extractZipFileRecursively)
 * and then deleted, so the result is a plain, fully browsable directory tree.
 */
export async function extractZipRecursively(zipData: Buffer, destDir: string): Promise<void> {
  const zip = await JSZip.loadAsync(zipData);
  fs.mkdirSync(destDir, { recursive: true });

  for (const entry of Object.values(zip.files)) {
    const target = path.join(destDir, entry.name);
    if (!path.resolve(target).startsWith(path.resolve(destDir))) {
      throw new Error(`Zip-Eintrag mit unsicherem Pfad übersprungen: ${entry.name}`);
    }
    if (entry.dir) {
      fs.mkdirSync(target, { recursive: true });
      continue;
    }
    fs.mkdirSync(path.dirname(target), { recursive: true });
    const content = await entry.async("nodebuffer");
    if (entry.name.toLowerCase().endsWith(".zip")) {
      const nestedDir = path.join(path.dirname(target), path.basename(entry.name, path.extname(entry.name)));
      await extractZipRecursively(content, nestedDir);
    } else {
      fs.writeFileSync(target, content);
    }
  }
}

function walkFiles(dir: string, skipDirNames: Set<string>): string[] {
  const results: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (skipDirNames.has(entry.name)) continue;
      results.push(...walkFiles(path.join(dir, entry.name), skipDirNames));
    } else if (entry.isFile()) {
      results.push(path.join(dir, entry.name));
    }
  }
  return results;
}

/**
 * Zips a directory tree into a buffer suitable for Artemis's import-from-file endpoint.
 * The server extracts recursively and then only looks for the Exercise-Details*.json file and
 * directories whose names end in -exercise / -solution / -tests, ignoring .git folders - so a
 * flat zip of the extracted tree (without .git) is a valid upload.
 */
export async function zipDirectory(dir: string): Promise<Buffer> {
  const zip = new JSZip();
  for (const file of walkFiles(dir, new Set([".git"]))) {
    const relative = path.relative(dir, file).split(path.sep).join("/");
    zip.file(relative, fs.readFileSync(file));
  }
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}

function findFilesByPredicate(dir: string, predicate: (name: string) => boolean): string[] {
  return walkFiles(dir, new Set([".git"])).filter((file) => predicate(path.basename(file)));
}

/** Finds and parses the single Exercise-Details*.json in an extracted export directory. */
export function readExerciseDetailsFromDir(dir: string): Record<string, unknown> {
  const matches = findFilesByPredicate(dir, (name) => name.startsWith("Exercise-Details") && name.endsWith(".json"));
  if (matches.length !== 1) {
    throw new Error(`Erwartet genau eine Exercise-Details*.json in ${dir}, gefunden: ${matches.length}`);
  }
  return JSON.parse(fs.readFileSync(matches[0], "utf-8")) as Record<string, unknown>;
}

/**
 * Extracts the single root-level "Exercise-Details-*.json" from an Artemis programming-exercise
 * export zip buffer (legacy path for exports that still exist as .zip files).
 */
export async function extractExerciseJsonFromZip(zipData: Buffer): Promise<Record<string, unknown>> {
  const zip = await JSZip.loadAsync(zipData);
  const jsonEntries = Object.values(zip.files).filter(
    (entry) => !entry.dir && /\.json$/i.test(entry.name) && !entry.name.includes("/")
  );
  if (jsonEntries.length !== 1) {
    throw new Error(
      `Erwartet genau eine JSON-Datei auf oberster Ebene im Export-Zip, gefunden: ${jsonEntries.length}`
    );
  }
  const content = await jsonEntries[0].async("string");
  return JSON.parse(content) as Record<string, unknown>;
}
