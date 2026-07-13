import { confirm, input, select } from "@inquirer/prompts";

export interface ExerciseAdjustments {
  title?: string;
  shortName?: string;
  releaseDate?: string;
  startDate?: string;
  /** `null` explicitly clears the due date ("kein Enddatum"); `undefined` leaves it untouched. */
  dueDate?: string | null;
  maxPoints?: number;
  bonusPoints?: number;
  /** True whenever the user touched any date field, signalling that stale secondary dates should be cleared too. */
  datesChanged?: boolean;
}

export interface CurrentExerciseValues {
  title: string;
  maxPoints?: number;
  bonusPoints?: number;
}

/** Derives a valid Artemis shortName (must start with a letter, then letters/digits, length >= 3) from a title. */
export function suggestShortName(title: string): string {
  let cleaned = title.replace(/[^a-zA-Z0-9]/g, "");
  if (!/^[a-zA-Z]/.test(cleaned)) cleaned = `E${cleaned}`;
  while (cleaned.length < 3) cleaned += "0";
  return cleaned;
}

function parseDate(value: string): Date {
  const trimmed = value.trim();
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? `${trimmed}T00:00:00` : trimmed.replace(" ", "T");
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) throw new Error(`Ungültiges Datum: "${value}" (erwartet z. B. 2026-08-01 oder 2026-08-01 14:00)`);
  return date;
}

/**
 * Interactive prompt sequence for title/shortName, release/due dates, and points.
 * Returns only the fields the user actually chose to change (empty object if none).
 */
export async function promptExerciseAdjustments(
  current: CurrentExerciseValues,
  options: { allowShortNameChange: boolean }
): Promise<ExerciseAdjustments> {
  const wantsChanges = await confirm({
    message: "Möchtest du vor dem Speichern Anpassungen vornehmen (Titel, Termine, Punkte)?",
    default: false,
  });
  if (!wantsChanges) return {};

  const adjustments: ExerciseAdjustments = {};

  const changeTitle = await confirm({ message: `Titel ändern (aktuell: "${current.title}")?`, default: false });
  if (changeTitle) {
    adjustments.title = await input({ message: "Neuer Titel:", default: current.title });
    if (options.allowShortNameChange) {
      adjustments.shortName = await input({
        message: "Short-Name (nur Buchstaben/Zahlen, min. 3 Zeichen, muss im Kurs eindeutig sein):",
        default: suggestShortName(adjustments.title),
      });
    }
  }

  const changeDates = await confirm({ message: "Veröffentlichungs-/Enddatum setzen?", default: false });
  if (changeDates) {
    const releaseDateStr = await input({
      message: "Veröffentlichungsdatum (z. B. 2026-08-01 oder 2026-08-01 14:00, leer = jetzt):",
    });
    const releaseDate = releaseDateStr.trim() ? parseDate(releaseDateStr) : new Date();
    adjustments.releaseDate = releaseDate.toISOString();
    adjustments.startDate = adjustments.releaseDate;

    const dueMode = await select({
      message: "Enddatum festlegen als:",
      choices: [
        { name: "Anzahl Tage nach Veröffentlichung", value: "days" },
        { name: "Festes Datum", value: "fixed" },
        { name: "Kein Enddatum", value: "none" },
      ],
    });
    if (dueMode === "days") {
      const daysStr = await input({ message: "Tage nach Veröffentlichung:", default: "14" });
      const days = Number(daysStr);
      if (!Number.isFinite(days) || days <= 0) throw new Error(`Ungültige Anzahl Tage: "${daysStr}"`);
      adjustments.dueDate = new Date(releaseDate.getTime() + days * 24 * 60 * 60 * 1000).toISOString();
    } else if (dueMode === "fixed") {
      const dueDateStr = await input({ message: "Enddatum (z. B. 2026-08-15 oder 2026-08-15 23:59):" });
      adjustments.dueDate = parseDate(dueDateStr).toISOString();
    } else {
      adjustments.dueDate = null;
    }
    adjustments.datesChanged = true;
  }

  const changePoints = await confirm({
    message: `Punktzahl ändern (aktuell: ${current.maxPoints ?? "unbekannt"})?`,
    default: false,
  });
  if (changePoints) {
    const maxPointsStr = await input({ message: "Maximale Punkte:", default: String(current.maxPoints ?? 10) });
    const maxPoints = Number(maxPointsStr);
    if (!Number.isFinite(maxPoints) || maxPoints <= 0) throw new Error(`Ungültige Punktzahl: "${maxPointsStr}"`);
    adjustments.maxPoints = maxPoints;

    const bonusStr = await input({ message: "Bonuspunkte:", default: String(current.bonusPoints ?? 0) });
    const bonusPoints = Number(bonusStr);
    if (!Number.isFinite(bonusPoints) || bonusPoints < 0) throw new Error(`Ungültige Bonuspunktzahl: "${bonusStr}"`);
    adjustments.bonusPoints = bonusPoints;
  }

  return adjustments;
}

/** Merges adjustments into an exercise payload, clearing stale secondary dates whenever dates were touched. */
export function applyAdjustments(
  payload: Record<string, unknown>,
  adjustments: ExerciseAdjustments
): Record<string, unknown> {
  const result = { ...payload };
  if (adjustments.title !== undefined) result.title = adjustments.title;
  if (adjustments.shortName !== undefined) result.shortName = adjustments.shortName;
  if (adjustments.maxPoints !== undefined) result.maxPoints = adjustments.maxPoints;
  if (adjustments.bonusPoints !== undefined) result.bonusPoints = adjustments.bonusPoints;

  if (adjustments.datesChanged) {
    result.releaseDate = adjustments.releaseDate ?? null;
    result.startDate = adjustments.startDate ?? null;
    result.dueDate = adjustments.dueDate ?? null;
    // Stale relative to the new dueDate/releaseDate and not something we ask about; clearing avoids
    // failing Artemis's date-consistency validation (assessmentDueDate/exampleSolutionPublicationDate
    // must come after dueDate).
    result.assessmentDueDate = null;
    result.exampleSolutionPublicationDate = null;
  }

  return result;
}
