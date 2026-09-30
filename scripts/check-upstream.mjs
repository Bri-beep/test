import { appendFile, readFile } from "node:fs/promises";

// Read-only GitHub API calls. This script never installs, commits or advances a revision.
const record = JSON.parse(await readFile("config/appkit-compatibility.json", "utf8"));
const headers = { accept: "application/vnd.github+json",
  ...(process.env.GITHUB_TOKEN ? { authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}) };
const output = ["# Revue amont AppKit et skills", "", "Toute mise à jour demande une revue humaine et les tests de compatibilité.", ""];
for (const key of ["templates", "skills"]) {
  const source = record[key];
  if (!/^[\w.-]+\/[\w.-]+$/.test(source.repository) || !/^[a-f0-9]{40}$/.test(source.reviewedRevision)) {
    throw new Error("Invalid upstream compatibility record");
  }
  const base = `https://api.github.com/repos/${source.repository}`;
  const repoResponse = await fetch(base, { headers, signal: AbortSignal.timeout(30_000) });
  if (!repoResponse.ok) throw new Error(`Upstream repository lookup failed (${repoResponse.status})`);
  const repo = await repoResponse.json();
  const response = await fetch(`${base}/compare/${source.reviewedRevision}...${encodeURIComponent(repo.default_branch)}`, {
    headers, signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`Upstream comparison failed (${response.status})`);
  const diff = await response.json();
  output.push(`## ${key}`, "", `[${diff.total_commits} commits depuis la révision revue](${diff.html_url})`, "");
  const files = diff.files ?? [];
  const relevant = source.paths ? files.filter((file) => source.paths.some((path) => file.filename.startsWith(path))) : files;
  for (const file of relevant) output.push(`- ${file.status}: \`${file.filename.replaceAll("`", "")}\``);
  output.push("", "La comparaison GitHub limite la liste à 300 fichiers ; examiner le lien pour la revue complète.", "");
}
const summary = output.join("\n");
process.stdout.write(summary + "\n");
if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, summary);
