import fs from "node:fs";
import path from "node:path";
import { checkbox, input, select } from "@inquirer/prompts";
import { ArtemisClient, describeError } from "../lib/artemisClient.js";
import { ensureAuthenticated } from "../lib/auth.js";
import { parseCliArgs } from "../lib/cliArgs.js";
import { applyAdjustments, promptExerciseAdjustments, suggestShortName } from "../lib/exerciseAdjustments.js";
import { resolveExportDir } from "../lib/exportDir.js";
import { extractExerciseJsonFromZip, readExerciseDetailsFromDir, zipDirectory } from "../lib/exportZip.js";
import { listStoredExports, type StoredExport } from "../lib/storage.js";
import type { Course, Exercise } from "../lib/types.js";

function parseIndexArgs(args: string[]): number[] {
  const nums: number[] = [];
  for (const arg of args) {
    for (const part of arg.split(",")) {
      const n = Number(part.trim());
      if (Number.isInteger(n) && n > 0) nums.push(n);
    }
  }
  return [...new Set(nums)];
}

function preparePayload(metadata: Record<string, unknown>, targetCourse: Course): Record<string, unknown> {
  const payload = { ...metadata };
  // Must include shortName, not just id: the server derives the new VCS project key from
  // course.shortName + exercise.shortName directly off this request body (it does not
  // re-fetch the course), so an id-only course object silently produces a "NULL..." project
  // key and broken repository URLs.
  payload.course = { id: targetCourse.id, shortName: targetCourse.shortName, title: targetCourse.title };
  delete payload.exerciseGroup;
  delete payload.id;
  // Stale identifiers tied to the source exercise's own repos/build plans/participations -
  // Artemis (re)computes fresh ones for the imported copy.
  delete payload.templateParticipation;
  delete payload.solutionParticipation;
  delete payload.projectKey;
  delete payload.buildPlanId;
  delete payload.testRepositoryUri;
  delete payload.vcsTestRepositoryUri;
  delete payload.userIndependentRepositoryUri;

  // buildConfig itself must stay (the server 500s without it), but its id belongs to the
  // source exercise's row and must not be reused for the imported copy.
  const buildConfig = payload.buildConfig as Record<string, unknown> | undefined;
  if (buildConfig) {
    payload.buildConfig = { ...buildConfig, id: undefined };
  }

  const auxiliaryRepositories = payload.auxiliaryRepositories as Record<string, unknown>[] | undefined;
  if (Array.isArray(auxiliaryRepositories)) {
    payload.auxiliaryRepositories = auxiliaryRepositories.map((repo) => ({ ...repo, id: undefined }));
  }

  return payload;
}

type ConflictResolution = { title: string; shortName?: string } | "cancel";

async function resolveTitleConflict(
  client: ArtemisClient,
  targetCourse: Course,
  desiredTitle: string,
  desiredShortName: string | undefined,
  existingExercises: Exercise[]
): Promise<ConflictResolution> {
  const conflict = existingExercises.find((e) => e.title === desiredTitle);
  if (!conflict) return { title: desiredTitle, shortName: desiredShortName };

  console.warn(
    `\nEs existiert bereits eine Aufgabe "${conflict.title}" (id ${conflict.id}, [${conflict.type}]) in "${targetCourse.title}".`
  );
  const action = await select({
    message: "Wie möchtest du vorgehen?",
    choices: [
      { name: "Neuen Namen für die importierte Aufgabe vergeben", value: "rename" },
      { name: "Bestehende Aufgabe löschen und dann importieren", value: "delete" },
      { name: "Abbrechen", value: "cancel" },
    ],
  });

  if (action === "cancel") return "cancel";

  if (action === "delete") {
    const typed = await input({ message: `Zum Bestätigen exakt eintippen: "${conflict.title}"` });
    if (typed !== conflict.title) {
      console.warn("Eingabe stimmt nicht überein, Löschen abgebrochen.");
      return "cancel";
    }
    await client.deleteExercise(conflict.type, conflict.id);
    console.log(`  "${conflict.title}" gelöscht.`);
    return { title: desiredTitle, shortName: desiredShortName };
  }

  const newTitle = await input({ message: "Neuer Titel für die importierte Aufgabe:" });
  const newShortName = await input({
    message: "Short-Name (nur Buchstaben/Zahlen, min. 3 Zeichen):",
    default: suggestShortName(newTitle),
  });
  return resolveTitleConflict(client, targetCourse, newTitle, newShortName, existingExercises);
}

async function importOne(
  client: ArtemisClient,
  targetCourse: Course,
  baseUrl: string,
  stored: StoredExport
): Promise<void> {
  const { manifest, folder } = stored;
  const metadataPath = path.join(folder, "exercise.json");
  const metadata = fs.existsSync(metadataPath)
    ? (JSON.parse(fs.readFileSync(metadataPath, "utf-8")) as Record<string, unknown>)
    : {};

  if (manifest.type === "quiz") {
    console.warn(
      `"${manifest.title}" ist eine Quiz-Aufgabe – Artemis unterstützt hierfür keinen Import über die API. Gespeicherte Konfiguration zur manuellen Nachbildung: ${metadataPath}`
    );
    return;
  }

  // Artemis's own export bundle contains a purpose-built, already-sanitized re-import JSON
  // (no stale nested-entity ids like teamAssignmentConfig) - use that as the payload base
  // instead of our separately-fetched full GET response.
  let zipExerciseJson: Record<string, unknown> | undefined;
  let bundleZipData: Buffer | undefined;
  if (manifest.type === "programming") {
    const bundleDir = path.join(folder, "export");
    const legacyZipPath = path.join(folder, "export.zip");
    if (fs.existsSync(bundleDir)) {
      zipExerciseJson = readExerciseDetailsFromDir(bundleDir);
      console.log(`  Packe export/-Ordner (inkl. lokaler Änderungen) für den Upload …`);
      bundleZipData = await zipDirectory(bundleDir);
    } else if (fs.existsSync(legacyZipPath)) {
      zipExerciseJson = await extractExerciseJsonFromZip(fs.readFileSync(legacyZipPath));
      bundleZipData = fs.readFileSync(legacyZipPath);
    } else {
      console.warn(`Kein Export-Bundle (export/ oder export.zip) für "${manifest.title}" vorhanden, überspringe.`);
      return;
    }
  }

  console.log(`\n--- "${manifest.title}" ---`);

  const existingExercises = await client.listCourseExercises(targetCourse.id);
  const desiredTitle = (metadata.title as string | undefined) ?? manifest.title;
  const resolution = await resolveTitleConflict(
    client,
    targetCourse,
    desiredTitle,
    metadata.shortName as string | undefined,
    existingExercises
  );
  if (resolution === "cancel") {
    console.log("  Übersprungen.");
    return;
  }

  let payload = preparePayload(zipExerciseJson ?? metadata, targetCourse);
  payload.title = resolution.title;
  if (resolution.shortName) payload.shortName = resolution.shortName;

  const adjustments = await promptExerciseAdjustments(
    {
      title: resolution.title,
      maxPoints: metadata.maxPoints as number | undefined,
      bonusPoints: metadata.bonusPoints as number | undefined,
    },
    { allowShortNameChange: false }
  );
  payload = applyAdjustments(payload, adjustments);

  if (manifest.type === "programming") {
    console.log(`Importiere "${payload.title}" nach "${targetCourse.title}" (aus Datei) …`);
    const result = await client.importProgrammingExerciseFromFile(
      targetCourse.id,
      payload,
      bundleZipData!,
      `${manifest.exerciseId}-export.zip`
    );
    console.log(`  Importiert als neue Aufgabe (id: ${result.id}).`);
    return;
  }

  // text / modeling / file-upload: import-by-reference, requires the source exercise to
  // still exist on the same Artemis instance we're currently logged into.
  if (manifest.sourceBaseUrl !== baseUrl) {
    console.warn(
      `"${manifest.title}" wurde von einer anderen Artemis-Instanz exportiert (${manifest.sourceBaseUrl}). Import-by-reference funktioniert nur, wenn die Original-Aufgabe auf der aktuellen Instanz (${baseUrl}) noch existiert.`
    );
  }
  console.log(`Importiere "${payload.title}" nach "${targetCourse.title}" (by reference) …`);
  const result = await client.importExerciseByReference(manifest.type, manifest.exerciseId, payload);
  console.log(`  Importiert als neue Aufgabe (id: ${result.id}).`);
}

async function main() {
  const flags = parseCliArgs(process.argv.slice(2));
  const { client, baseUrl } = await ensureAuthenticated(flags);
  const exportDir = await resolveExportDir(flags);

  const stored = listStoredExports(exportDir);
  if (stored.length === 0) {
    console.log(`Keine exportierten Aufgaben in ${exportDir} gefunden. Führe zuerst \`yarn exercise-export\` aus.`);
    return;
  }

  console.log("\nExportierte Aufgaben:");
  stored.forEach((s, i) =>
    console.log(`  ${i + 1}. ${s.manifest.title} [${s.manifest.type}] (exportiert ${s.manifest.exportedAt})`)
  );
  console.log("");

  const argNumbers = parseIndexArgs(flags.positionals);
  let selected: StoredExport[];

  if (argNumbers.length > 0) {
    selected = [];
    for (const n of argNumbers) {
      const item = stored[n - 1];
      if (!item) {
        console.warn(`Nummer ${n} existiert nicht in dieser Liste, wird ignoriert.`);
        continue;
      }
      selected.push(item);
    }
  } else {
    selected = await checkbox<StoredExport>({
      message: "Welche Aufgaben importieren (Leertaste zum Markieren, Enter zum Bestätigen)?",
      choices: stored.map((s, i) => ({
        name: `${i + 1}. ${s.manifest.title} [${s.manifest.type}]`,
        value: s,
      })),
    });
  }

  if (selected.length === 0) {
    console.log("Keine Aufgaben ausgewählt.");
    return;
  }

  const courses = await client.listCourses();
  if (courses.length === 0) {
    console.log("Keine Kurse zum Importieren gefunden.");
    return;
  }
  const targetCourse = await select<Course>({
    message: "In welchen Kurs importieren?",
    choices: courses.map((c) => ({ name: `${c.title} (${c.shortName})`, value: c })),
  });

  for (const item of selected) {
    try {
      await importOne(client, targetCourse, baseUrl, item);
    } catch (error) {
      console.error(`Import von "${item.manifest.title}" fehlgeschlagen: ${describeError(error)}`);
    }
  }

  console.log("\nFertig.");
}

main().catch((error) => {
  console.error(`Import fehlgeschlagen: ${describeError(error)}`);
  process.exitCode = 1;
});
