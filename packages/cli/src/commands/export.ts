import fs from "node:fs";
import path from "node:path";
import { checkbox, select } from "@inquirer/prompts";
import { ensureAuthenticated } from "../lib/auth.js";
import { ArtemisClient, describeError } from "../lib/artemisClient.js";
import { parseCliArgs } from "../lib/cliArgs.js";
import { loadConfig } from "../lib/config.js";
import { resolveExportDir } from "../lib/exportDir.js";
import { cloneRepo } from "../lib/git.js";
import { exerciseFolder, writeManifest } from "../lib/storage.js";
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

async function exportProgrammingExercise(
  client: ArtemisClient,
  cloneCredentials: { username?: string; vcsToken?: string },
  folder: string,
  exercise: Exercise
): Promise<{ hasZip: boolean; clonedRepos: string[] }> {
  console.log(`Exportiere Programmieraufgabe "${exercise.title}" …`);
  const { data } = await client.exportInstructorExercise(exercise.id);
  fs.writeFileSync(path.join(folder, "export.zip"), data);

  const details = await client.getProgrammingExerciseWithParticipations(exercise.id);
  fs.writeFileSync(path.join(folder, "exercise.json"), JSON.stringify(details, null, 2));

  const clonedRepos: string[] = [];
  if (!cloneCredentials.vcsToken || !cloneCredentials.username) {
    console.warn(
      "  Kein VCS-Token/Benutzername verfügbar, Repositories werden nicht geklont (siehe `yarn artemis-login`)."
    );
    return { hasZip: true, clonedRepos };
  }

  const templateParticipation = details.templateParticipation as { repositoryUri?: string } | undefined;
  const solutionParticipation = details.solutionParticipation as { repositoryUri?: string } | undefined;
  const testRepositoryUri = (details.testRepositoryUri ?? details.vcsTestRepositoryUri) as string | undefined;

  const repos: Array<[string, string | undefined]> = [
    ["template", templateParticipation?.repositoryUri],
    ["solution", solutionParticipation?.repositoryUri],
    ["tests", testRepositoryUri],
  ];

  for (const [name, uri] of repos) {
    if (!uri) {
      console.warn(`  Repository-URL für "${name}" nicht gefunden, überspringe Klonen.`);
      continue;
    }
    const dest = path.join(folder, "repos", name);
    try {
      await cloneRepo(uri, dest, cloneCredentials.username, cloneCredentials.vcsToken);
      clonedRepos.push(name);
      console.log(`  Repository "${name}" geklont.`);
    } catch (error) {
      console.warn(`  Klonen von "${name}" fehlgeschlagen: ${error instanceof Error ? error.message : error}`);
    }
  }

  return { hasZip: true, clonedRepos };
}

async function exportExercise(
  client: ArtemisClient,
  cloneCredentials: { username?: string; vcsToken?: string },
  baseUrl: string,
  exportDir: string,
  course: Course,
  exercise: Exercise
): Promise<void> {
  const folder = exerciseFolder(exportDir, exercise.id, exercise.title);
  fs.mkdirSync(folder, { recursive: true });

  let hasZip = false;
  let clonedRepos: string[] = [];

  if (exercise.type === "programming") {
    ({ hasZip, clonedRepos } = await exportProgrammingExercise(client, cloneCredentials, folder, exercise));
  } else if (exercise.type === "quiz") {
    console.log(
      `Quiz-Aufgabe "${exercise.title}": Artemis unterstützt keinen Export/Import über die API. Speichere nur die Konfiguration als Referenz.`
    );
    fs.writeFileSync(path.join(folder, "exercise.json"), JSON.stringify(exercise, null, 2));
  } else {
    console.log(
      `Exportiere Aufgabe "${exercise.title}" [${exercise.type}] (nur Konfiguration – Re-Import erfordert, dass die Original-Aufgabe auf derselben Artemis-Instanz erhalten bleibt) …`
    );
    const details = await client.getExerciseDetails(exercise.type, exercise.id);
    fs.writeFileSync(path.join(folder, "exercise.json"), JSON.stringify(details, null, 2));
  }

  writeManifest(folder, {
    exerciseId: exercise.id,
    type: exercise.type,
    title: exercise.title,
    shortName: exercise.shortName,
    sourceCourseId: course.id,
    sourceBaseUrl: baseUrl,
    exportedAt: new Date().toISOString(),
    hasZip,
    clonedRepos,
  });

  console.log(`  Gespeichert in ${folder}`);
}

async function main() {
  const flags = parseCliArgs(process.argv.slice(2));
  const { client, baseUrl, username, vcsToken } = await ensureAuthenticated(flags);
  const exportDir = await resolveExportDir(flags);
  const cloneCredentials = { username: flags.username ?? username ?? loadConfig().username, vcsToken };

  const courses = await client.listCourses();
  if (courses.length === 0) {
    console.log("Keine Kurse gefunden.");
    return;
  }

  const course = await select<Course>({
    message: "Welcher Kurs?",
    choices: courses.map((c) => ({ name: `${c.title} (${c.shortName})`, value: c })),
  });

  const exercises = await client.listCourseExercises(course.id);
  if (exercises.length === 0) {
    console.log("Dieser Kurs enthält keine Aufgaben.");
    return;
  }

  console.log("\nAufgaben in diesem Kurs:");
  exercises.forEach((e, i) => console.log(`  ${i + 1}. ${e.title} [${e.type}]`));
  console.log("");

  const argNumbers = parseIndexArgs(flags.positionals);
  let selected: Exercise[];

  if (argNumbers.length > 0) {
    selected = [];
    for (const n of argNumbers) {
      const exercise = exercises[n - 1];
      if (!exercise) {
        console.warn(`Nummer ${n} existiert nicht in dieser Liste, wird ignoriert.`);
        continue;
      }
      selected.push(exercise);
    }
  } else {
    const mode = await select({
      message: "Welche Aufgaben exportieren?",
      choices: [
        { name: "Alle Aufgaben", value: "all" },
        { name: "Auswahl treffen", value: "choose" },
      ],
    });

    if (mode === "all") {
      selected = exercises;
    } else {
      selected = await checkbox<Exercise>({
        message: "Aufgaben auswählen (Leertaste zum Markieren, Enter zum Bestätigen):",
        choices: exercises.map((e, i) => ({ name: `${i + 1}. ${e.title} [${e.type}]`, value: e })),
      });
    }
  }

  if (selected.length === 0) {
    console.log("Keine Aufgaben ausgewählt.");
    return;
  }

  for (const exercise of selected) {
    await exportExercise(client, cloneCredentials, baseUrl, exportDir, course, exercise);
  }

  console.log(`\nFertig. ${selected.length} Aufgabe(n) exportiert.`);
}

main().catch((error) => {
  console.error(`Export fehlgeschlagen: ${describeError(error)}`);
  process.exitCode = 1;
});
