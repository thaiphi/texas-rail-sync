// Use a fresh short copy so tests cannot mutate the working datasets/history.
// Intermittent Windows publication EPERM remains an unresolved environment gate.
import { cp, lstat, mkdir, mkdtemp, readdir, realpath, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = await realpath(resolve(dirname(fileURLToPath(import.meta.url)), ".."));
const tempRoot = resolve(root, "tmp");
await mkdir(tempRoot, { recursive: true });
const tempInfo = await lstat(tempRoot);
if (tempInfo.isSymbolicLink() || !tempInfo.isDirectory())
  throw Error("Unsafe test workspace parent");
async function refuseLinks(path) {
  const info = await lstat(path);
  if (info.isSymbolicLink())
    throw Error(`Linked input cannot enter isolated test workspace: ${path}`);
  if (info.isDirectory()) {
    for (const name of await readdir(path)) await refuseLinks(resolve(path, name));
  }
}
const copy = await mkdtemp(resolve(root, "tmp", "v-"));
for (const name of [
  "src",
  "public",
  "scripts",
  "test",
  "raw",
  "artifacts",
  "runs",
  "supabase",
  "package.json",
]) {
  await refuseLinks(resolve(root, name));
  await cp(resolve(root, name), resolve(copy, name), { recursive: true });
}
const tests = (await readdir(resolve(copy, "test")))
  .filter((name) => name.endsWith(".test.mjs"))
  .sort()
  .map((name) => resolve(copy, "test", name));
if (!tests.length) throw Error("No production Node tests found");
// CLI run-event tests write history while validation tests enumerate it. Keep
// files sequential; each file's explicit concurrency assertions still run.
const result = spawnSync(process.execPath, ["--test", "--test-concurrency=1", ...tests], {
  cwd: copy,
  encoding: "utf8",
  maxBuffer: 20_000_000,
});
const log = resolve(copy, "suite.log");
await writeFile(
  log,
  (result.stdout ?? "") +
    "\n" +
    (result.stderr ?? "") +
    (result.error ? "\n" + result.error.message : ""),
);
console.log(`Isolated workspace: ${copy}\nFull output: ${log}`);
console.log((result.stdout ?? "").split("\n").slice(-14).join("\n"));
process.exitCode = result.status ?? 1;
