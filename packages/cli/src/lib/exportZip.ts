import JSZip from "jszip";

/**
 * Extracts the single root-level "Exercise-Details-*.json" from an Artemis programming-exercise
 * export zip. This is Artemis's own purpose-built re-import format (used by its "import from
 * file" UI) - it's already sanitized of the stale nested-entity ids (e.g. teamAssignmentConfig)
 * that a plain GET .../programming-exercises/{id} response still carries, which the import
 * endpoint rejects with a Hibernate "detached entity" error.
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
