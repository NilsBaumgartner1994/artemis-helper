import type { Course, Exercise, ExerciseType } from "./types.js";

interface TypeApiInfo {
  prefix: string;
  segment: string;
  /** PUT .../{segment}/{exerciseId} (file-upload) vs PUT .../{segment} with id in the body (all others). */
  updateUsesIdInPath: boolean;
}

// Verified against the exact deployed commit (artemis.informatik.uni-osnabrueck.de, v8.3.4,
// commit b31e657) via the Artemis GitHub source, not just the `develop` HEAD.
const EXERCISE_TYPE_API: Partial<Record<ExerciseType, TypeApiInfo>> = {
  programming: { prefix: "programming", segment: "programming-exercises", updateUsesIdInPath: false },
  text: { prefix: "text", segment: "text-exercises", updateUsesIdInPath: false },
  modeling: { prefix: "modeling", segment: "modeling-exercises", updateUsesIdInPath: false },
  "file-upload": { prefix: "fileupload", segment: "file-upload-exercises", updateUsesIdInPath: true },
};

export class ArtemisApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body: string
  ) {
    super(message);
    this.name = "ArtemisApiError";
  }
}

/** Formats an error for CLI output, including the raw Artemis response body for API errors. */
export function describeError(error: unknown): string {
  if (error instanceof ArtemisApiError) {
    const bodyPreview = error.body.trim().slice(0, 2000);
    return bodyPreview ? `${error.message}: ${bodyPreview}` : error.message;
  }
  return error instanceof Error ? error.message : String(error);
}

export class ArtemisClient {
  private token: string | undefined;

  constructor(private readonly baseUrl: string) {}

  async login(username: string, password: string): Promise<void> {
    const res = await fetch(`${this.baseUrl}/api/core/public/authenticate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password, rememberMe: true }),
    });
    if (!res.ok) {
      throw new ArtemisApiError(
        `Login fehlgeschlagen (${res.status})`,
        res.status,
        await res.text()
      );
    }
    const data = (await res.json()) as { access_token: string };
    this.token = data.access_token;
  }

  /** Sets a pre-obtained bearer token directly, skipping the password login call. */
  setToken(token: string): void {
    this.token = token;
  }

  private authHeaders(extra: Record<string, string> = {}): Record<string, string> {
    if (!this.token) throw new Error("Nicht eingeloggt (ArtemisClient.login() zuerst aufrufen).");
    return { Authorization: `Bearer ${this.token}`, ...extra };
  }

  private async requestJson<T>(pathname: string, init: RequestInit = {}): Promise<T> {
    const res = await fetch(`${this.baseUrl}${pathname}`, {
      ...init,
      headers: this.authHeaders(
        init.body ? { "Content-Type": "application/json", ...(init.headers as Record<string, string>) } : (init.headers as Record<string, string>)
      ),
    });
    if (!res.ok) {
      throw new ArtemisApiError(
        `Anfrage an ${pathname} fehlgeschlagen (${res.status})`,
        res.status,
        await res.text()
      );
    }
    return (await res.json()) as T;
  }

  async listCourses(): Promise<Course[]> {
    const data = await this.requestJson<{ courses: { course: Course }[] }>(
      "/api/core/courses/for-dashboard"
    );
    return data.courses.map((entry) => entry.course);
  }

  async listCourseExercises(courseId: number): Promise<Exercise[]> {
    const course = await this.requestJson<Course & { exercises?: Exercise[] }>(
      `/api/core/courses/${courseId}/with-exercises`
    );
    return course.exercises ?? [];
  }

  async getExerciseDetails(type: ExerciseType, exerciseId: number): Promise<Exercise> {
    const info = EXERCISE_TYPE_API[type];
    if (!info) throw new Error(`Aufgabentyp "${type}" wird von der Artemis-API nicht unterstützt.`);
    return this.requestJson<Exercise>(`/api/${info.prefix}/${info.segment}/${exerciseId}`);
  }

  /**
   * The plain GET .../programming-exercises/{id} eager-loads both buildConfig and the template/solution
   * participations (needed for repo URIs and for a working import-from-file payload) - unlike
   * .../with-participations, which omits buildConfig and 500s the server-side import.
   */
  async getProgrammingExerciseWithParticipations(exerciseId: number): Promise<Exercise> {
    return this.getExerciseDetails("programming", exerciseId);
  }

  async exportInstructorExercise(exerciseId: number): Promise<{ filename: string; data: Buffer }> {
    const res = await fetch(
      `${this.baseUrl}/api/programming/programming-exercises/${exerciseId}/export-instructor-exercise`,
      { headers: this.authHeaders() }
    );
    if (!res.ok) {
      throw new ArtemisApiError(
        `Export der Aufgabe ${exerciseId} fehlgeschlagen (${res.status})`,
        res.status,
        await res.text()
      );
    }
    const filename = res.headers.get("filename") ?? `programming-exercise-${exerciseId}.zip`;
    const data = Buffer.from(await res.arrayBuffer());
    return { filename, data };
  }

  async importProgrammingExerciseFromFile(
    courseId: number,
    exerciseMetadata: unknown,
    zipData: Buffer,
    zipFilename: string
  ): Promise<Exercise> {
    const form = new FormData();
    form.append(
      "programmingExercise",
      new Blob([JSON.stringify(exerciseMetadata)], { type: "application/json" })
    );
    form.append("file", new Blob([zipData]), zipFilename);

    const res = await fetch(
      `${this.baseUrl}/api/programming/courses/${courseId}/programming-exercises/import-from-file`,
      { method: "POST", headers: this.authHeaders(), body: form }
    );
    if (!res.ok) {
      throw new ArtemisApiError(
        `Import (aus Datei) fehlgeschlagen (${res.status})`,
        res.status,
        await res.text()
      );
    }
    return (await res.json()) as Exercise;
  }

  async importExerciseByReference(
    type: ExerciseType,
    sourceExerciseId: number,
    exercisePayload: unknown
  ): Promise<Exercise> {
    const info = EXERCISE_TYPE_API[type];
    if (!info) throw new Error(`Aufgabentyp "${type}" unterstützt keinen Import über die Artemis-API.`);
    return this.requestJson<Exercise>(
      `/api/${info.prefix}/${info.segment}/import/${sourceExerciseId}`,
      { method: "POST", body: JSON.stringify(exercisePayload) }
    );
  }

  /** Full-entity update (PUT). `payload` must include a valid `id`; for programming exercises the shortName may not change. */
  async updateExercise(type: ExerciseType, payload: Record<string, unknown>): Promise<Exercise> {
    const info = EXERCISE_TYPE_API[type];
    if (!info) throw new Error(`Aufgabentyp "${type}" unterstützt kein Update über die Artemis-API.`);
    const pathname = info.updateUsesIdInPath
      ? `/api/${info.prefix}/${info.segment}/${payload.id}`
      : `/api/${info.prefix}/${info.segment}`;
    return this.requestJson<Exercise>(pathname, { method: "PUT", body: JSON.stringify(payload) });
  }

  async deleteExercise(type: ExerciseType, exerciseId: number): Promise<void> {
    const info = EXERCISE_TYPE_API[type];
    if (!info) throw new Error(`Aufgabentyp "${type}" unterstützt kein Löschen über die Artemis-API.`);
    const query = type === "programming" ? "?deleteBaseReposBuildPlans=true" : "";
    const res = await fetch(`${this.baseUrl}/api/${info.prefix}/${info.segment}/${exerciseId}${query}`, {
      method: "DELETE",
      headers: this.authHeaders(),
    });
    if (!res.ok) {
      throw new ArtemisApiError(
        `Löschen der Aufgabe ${exerciseId} fehlgeschlagen (${res.status})`,
        res.status,
        await res.text()
      );
    }
  }
}
