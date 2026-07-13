import fs from "node:fs";
import path from "node:path";
import { repoRoot } from "./paths.js";
import type { Course, ExerciseManifest } from "./types.js";

/**
 * Writes a short per-export README that orients readers (humans and AI assistants) and points
 * to the central EXERCISE_GUIDE.md in the artemis-helper repo, where all editing rules live.
 */
export function writeExportReadme(folder: string, manifest: ExerciseManifest, course: Course): void {
  const guideAbsolute = path.join(repoRoot, "EXERCISE_GUIDE.md");
  const guideRelative = path.relative(folder, guideAbsolute);

  const bundleSection = manifest.hasBundle
    ? `## Struktur

- \`export/\` – entpacktes Artemis-Export-Bundle. **Nur Änderungen hier landen beim Re-Import in Artemis.**
  - \`Exercise-Details-*.json\` – Aufgaben-Konfiguration (Punkte, Termine, Problemstellung, Build-Config)
  - \`Problem-Statement-*.md\` – Problemstellung
  - \`*-exercise/\` – Template-Repo (Startpunkt der Studierenden)
  - \`*-solution/\` – Musterlösungs-Repo
  - \`*-tests/\` – Test-Repo (bestimmt die Bewertung)
- \`exercise.json\` – vollständige API-Antwort, nur Referenz
- \`manifest.json\` – CLI-Metadaten, nicht bearbeiten
${manifest.clonedRepos.length > 0 ? `- \`repos/\` – direkte Git-Klone (${manifest.clonedRepos.join(", ")}) mit Remote zur Quell-Instanz\n` : ""}`
    : `## Struktur

- \`exercise.json\` – Aufgaben-Konfiguration (bei diesem Aufgabentyp gibt es kein Datei-Bundle; Import erfolgt "by reference")
- \`manifest.json\` – CLI-Metadaten, nicht bearbeiten
`;

  const content = `# ${manifest.title}

Export einer Artemis-Aufgabe, erstellt mit \`yarn exercise-export\` (artemis-helper).

| | |
|---|---|
| Typ | ${manifest.type} |
| Quell-Aufgabe | ${manifest.exerciseId} |
| Quell-Kurs | ${course.title} (${manifest.sourceCourseId}) |
| Instanz | ${manifest.sourceBaseUrl} |
| Exportiert | ${manifest.exportedAt} |

${bundleSection}
## Bearbeiten & Re-Import

**Bevor du hier etwas änderst, lies die zentrale Anleitung** – sie erklärt, wie Bewertung, Struktur-Orakel (\`test.json\`), Behavior-Tests und Task-Verknüpfungen funktionieren und was konsistent gehalten werden muss:

- \`${guideRelative}\`
- (absolut: \`${guideAbsolute}\`)

Re-Import mit \`yarn exercise-import\` im artemis-helper-Projekt.
`;

  fs.writeFileSync(path.join(folder, "README.md"), content);
}
