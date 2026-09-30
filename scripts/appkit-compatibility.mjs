import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

export async function inspectAppKitCompatibility(root, { execute = spawnSync } = {}) {
  const results = [];
  const report = (status, name, detail) => results.push({ status, name, detail });
  let record;
  try { record = JSON.parse(await readFile(join(root, "config/appkit-compatibility.json"), "utf8")); }
  catch { report("warn", "Compatibilité AppKit", "Registre absent ou invalide."); return results; }
  const pkg = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
  const lock = JSON.parse(await readFile(join(root, "package-lock.json"), "utf8"));
  for (const [name, version] of Object.entries(record.packages)) {
    let installed;
    try { installed = JSON.parse(await readFile(join(root, "node_modules", name, "package.json"), "utf8")).version; }
    catch { /* A checkout without npm ci remains inspectable. */ }
    const matches = pkg.dependencies?.[name] === version && lock.packages?.[`node_modules/${name}`]?.version === version;
    report(matches && installed === version ? "pass" : "warn", `Compatibilité ${name}`,
      matches && installed === version ? `Version testée ${version}.` : `Écart avec la version testée ${version}. Relire le registre et npm ci.`);
  }
  const cli = execute("databricks", ["--version"], { encoding: "utf8" });
  const version = cli.status === 0 ? cli.stdout?.match(/\bv?(\d+\.\d+\.\d+)\b/)?.[1] : undefined;
  report(record.databricksCli.includes(version) ? "pass" : "warn", "Matrice CLI",
    record.databricksCli.includes(version) ? `Version testée ${version}.` : "CLI absent ou hors de la matrice testée.");
  report("pass", "Référence guidance Databricks",
    `Révision de référence : ${record.skills.release} (${record.skills.reviewedRevision}). L’installation est examinée séparément.`);
  return results;
}
