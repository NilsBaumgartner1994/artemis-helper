import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

function withCredentials(repositoryUri: string, username: string, token: string): string {
  const url = new URL(repositoryUri);
  url.username = encodeURIComponent(username);
  url.password = encodeURIComponent(token);
  return url.toString();
}

export async function cloneRepo(
  repositoryUri: string,
  destDir: string,
  username: string,
  token: string
): Promise<void> {
  const authedUrl = withCredentials(repositoryUri, username, token);
  await execFileAsync("git", ["clone", "--quiet", authedUrl, destDir]);
}
