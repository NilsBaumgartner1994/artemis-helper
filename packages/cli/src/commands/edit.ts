import { confirm, select } from "@inquirer/prompts";
import { describeError } from "../lib/artemisClient.js";
import { ensureAuthenticated } from "../lib/auth.js";
import { parseCliArgs } from "../lib/cliArgs.js";
import { applyAdjustments, promptExerciseAdjustments } from "../lib/exerciseAdjustments.js";
import type { Course, Exercise } from "../lib/types.js";

async function main() {
  const flags = parseCliArgs(process.argv.slice(2));
  const { client } = await ensureAuthenticated(flags);

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

  const exercise = await select<Exercise>({
    message: "Welche Aufgabe bearbeiten?",
    choices: exercises.map((e, i) => ({ name: `${i + 1}. ${e.title} [${e.type}]`, value: e })),
  });

  if (exercise.type === "quiz") {
    console.log("Quiz-Aufgaben unterstützt Artemis nicht für ein Update über die API.");
    return;
  }

  const details =
    exercise.type === "programming"
      ? await client.getProgrammingExerciseWithParticipations(exercise.id)
      : await client.getExerciseDetails(exercise.type, exercise.id);

  const adjustments = await promptExerciseAdjustments(
    {
      title: details.title,
      maxPoints: details.maxPoints as number | undefined,
      bonusPoints: details.bonusPoints as number | undefined,
    },
    { allowShortNameChange: exercise.type !== "programming" }
  );

  if (Object.keys(adjustments).length === 0) {
    console.log("Keine Änderungen ausgewählt.");
    return;
  }

  const updatedPayload = applyAdjustments(details, adjustments);

  console.log("\nGeplante Änderungen:");
  if (adjustments.title !== undefined) console.log(`  Titel: "${details.title}" → "${adjustments.title}"`);
  if (adjustments.shortName !== undefined) console.log(`  Short-Name: → "${adjustments.shortName}"`);
  if (adjustments.datesChanged) {
    console.log(`  Veröffentlichung: ${adjustments.releaseDate}`);
    console.log(`  Ende: ${adjustments.dueDate ?? "(kein Enddatum)"}`);
  }
  if (adjustments.maxPoints !== undefined) console.log(`  Punkte: ${details.maxPoints} → ${adjustments.maxPoints}`);
  if (adjustments.bonusPoints !== undefined) console.log(`  Bonuspunkte: → ${adjustments.bonusPoints}`);

  const proceed = await confirm({
    message: `Änderungen an "${details.title}" jetzt speichern (Studierende können benachrichtigt werden)?`,
    default: false,
  });
  if (!proceed) {
    console.log("Abgebrochen, keine Änderungen gespeichert.");
    return;
  }

  const updated = await client.updateExercise(exercise.type, updatedPayload);
  console.log(`Gespeichert (id: ${updated.id}).`);
}

main().catch((error) => {
  console.error(`Bearbeiten fehlgeschlagen: ${describeError(error)}`);
  process.exitCode = 1;
});
