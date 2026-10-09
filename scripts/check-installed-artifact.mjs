import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = realpathSync(fileURLToPath(new URL("../", import.meta.url)));
const argument = name => process.argv.find(value => value.startsWith("--" + name + "="))?.slice(name.length + 3);
const archiveFile = argument("archives-file") ?? process.env.DEV_CONSUMER_ARCHIVES;
if (!archiveFile) throw new Error("Exact Dev/TypeScript/jsdom closure archives required: --archives-file=<owner build manifest> or DEV_CONSUMER_ARCHIVES. This harness never packs ancestor tools.");
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
const build = path.join(root, "build");
mkdirSync(build, { recursive: true });
const buildReal = realpathSync(build);
function existingOwnerBuild(file, label) {
  const absolute = path.resolve(file);
  if (lstatSync(absolute).isSymbolicLink() || !lstatSync(absolute).isFile()) throw new Error(label + " must be an actual retained file, not a source link.");
  const actual = realpathSync(absolute);
  if (!actual.startsWith(buildReal + path.sep)) throw new Error(label + " must be staged under this owner's ignored build/.");
  return actual;
}
const manifestPath = existingOwnerBuild(archiveFile, "Consumer archive manifest");
const planPath = path.join(root, "fixtures/consumer/dependency-plan.json"), planBytes = readFileSync(planPath), plan = JSON.parse(planBytes);
const manifestBytes = readFileSync(manifestPath), manifest = JSON.parse(manifestBytes);
if (manifest.schemaVersion !== 1 || manifest.planSha256 !== hash(planBytes) || !Array.isArray(manifest.packages)) throw new Error("Archive input manifest must seal this exact dependency metadata plan.");
const expected = new Map();
for (const item of plan.packages) { if (expected.has(item.name)) throw new Error("Plan has multiple versions of one package; a separately reviewed nested-closure plan is required."); expected.set(item.name, item); }
if (manifest.packages.length !== expected.size) throw new Error("Manifest must contain the complete exact owner/compiler/jsdom closure, without additional peers.");
const runId = new Date().toISOString().replace(/[:.]/g, "-");
const output = path.join(build, "consumer", runId), workspace = path.join(output, "workspace"), inputs = path.join(output, "inputs"), cache = path.join(output, "npm-cache"), temporary = path.join(output, "tmp");
for (const directory of [workspace, inputs, cache, temporary]) mkdirSync(directory, { recursive: true });
const env = { ...process.env, NODE_PATH: "", NODE_OPTIONS: "", npm_config_cache: cache, npm_config_userconfig: path.join(output, "empty-npmrc"), npm_config_globalconfig: path.join(output, "empty-global-npmrc"), TMPDIR: temporary };
writeFileSync(env.npm_config_userconfig, ""); writeFileSync(env.npm_config_globalconfig, "");
function command(label, executable, args, cwd = workspace) {
  const result = spawnSync(executable, args, { cwd, env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  writeFileSync(path.join(output, label + ".log"), String(result.stdout ?? "") + String(result.stderr ?? result.error ?? ""));
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(label + " exited " + result.status + "; see retained owner log.");
  return result.stdout;
}
const archives = new Map(), visited = new Set(), archiveMetadata = new Map();
for (const item of manifest.packages) {
  const specification = expected.get(item.name);
  if (!specification || visited.has(item.name) || item.version !== specification.version || !/^[a-f0-9]{64}$/.test(item.sha256) || !Number.isSafeInteger(item.sizeBytes) || item.sizeBytes <= 0 || typeof item.archive !== "string") throw new Error("Invalid or unexpected archive record: " + item.name);
  visited.add(item.name);
  const original = existingOwnerBuild(path.resolve(path.dirname(manifestPath), item.archive), "Dependency archive " + item.name);
  const bytes = readFileSync(original);
  if (bytes.length !== item.sizeBytes || hash(bytes) !== item.sha256) throw new Error("Archive size/digest mismatch: " + item.name);
  const local = path.join(inputs, item.name.replaceAll("/", "_") + "-" + item.version + ".tgz");
  copyFileSync(original, local); if (hash(readFileSync(local)) !== item.sha256) throw new Error("Staged archive changed: " + item.name);
  const label = item.name.replaceAll("/", "_");
  const members = command(label + "-members", "tar", ["-tzf", local]).trim().split(/\r?\n/);
  for (const member of members) if (!member.startsWith("package/") || member.split("/").includes("..") || member.includes("\\") || member.includes("\0")) throw new Error("Archive member escaped package root: " + item.name);
  const entries = command(label + "-entries", "tar", ["-tvzf", local]).split(/\r?\n/).filter(Boolean);
  if (entries.some(entry => /^[lh]/.test(entry))) throw new Error("Archive contains a symbolic/hard source link: " + item.name);
  const metadata = JSON.parse(command(label + "-metadata", "tar", ["-xOzf", local, "package/package.json"]));
  if (metadata.name !== item.name || metadata.version !== item.version || metadata.bundledDependencies?.length || metadata.bundleDependencies?.length) throw new Error("Archive metadata mismatch/bundled unreviewed closure: " + item.name);
  const requiredPeers = Object.fromEntries(Object.entries(metadata.peerDependencies ?? {}).filter(([name]) => !metadata.peerDependenciesMeta?.[name]?.optional));
  const canonical = value => JSON.stringify(Object.fromEntries(Object.entries(value ?? {}).sort(([a], [b]) => a.localeCompare(b))));
  if (canonical(metadata.dependencies) !== canonical(specification.dependencies) || canonical(requiredPeers) !== canonical(specification.requiredPeers)) throw new Error("Archive required dependency metadata differs from reviewed plan: " + item.name);
  for (const [dependency, range] of [...Object.entries(metadata.dependencies ?? {}), ...Object.entries(requiredPeers)]) {
    if (!expected.has(dependency) || typeof range !== "string" || /(?:file:|link:|workspace:|git|https?:|\.\.\/|^\/)/.test(range)) throw new Error("Missing or non-registry closure dependency: " + item.name + " -> " + dependency);
  }
  archives.set(item.name, local); archiveMetadata.set(item.name, metadata);
}
const devArchive = archives.get("@foss-earth/dev"), devMetadata = archiveMetadata.get("@foss-earth/dev");
if (!devArchive || !archives.has("typescript") || !archives.has("jsdom")) throw new Error("Dev, TypeScript and jsdom archive prerequisites are mandatory.");
const publicEntries = [".", "./browser", "./panel.css"];
if (JSON.stringify(Object.keys(devMetadata.exports).sort()) !== JSON.stringify(publicEntries.slice().sort()) || Object.keys(devMetadata.peerDependencies ?? {}).length) throw new Error("Unexpected Dev public entries or runtime peers.");
// The explicit archive must be the already-built current candidate; comparing bytes
// prevents an old 0.1.0 archive from silently qualifying newly edited source.
const currentArchiveFiles = ["package.json", "SOURCE_PROVENANCE.json", "SOURCE_LINEAGE.json", "SOURCE_RECEIPT.json", "AGENTS.md", "CONTRIBUTING.md", "CODE_OF_CONDUCT.md", "SECURITY.md", "LICENSE", "README.md", "tsconfig.json"];
function currentFiles(directory) {
  if (lstatSync(directory).isSymbolicLink()) throw new Error("Candidate source/build follows a source link.");
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error("Candidate contains a source link.");
    if (entry.isDirectory()) currentFiles(file);
    else if (entry.isFile()) currentArchiveFiles.push(path.relative(root, file).split(path.sep).join("/"));
  }
}
for (const directory of ["dist", "styles", "docs", "src"]) currentFiles(path.join(root, directory));
for (const file of currentArchiveFiles) {
  const archiveBytes = spawnSync("tar", ["-xOzf", devArchive, "package/" + file], { cwd: workspace, env, stdio: ["ignore", "pipe", "pipe"] });
  if (archiveBytes.error || archiveBytes.status !== 0 || hash(archiveBytes.stdout) !== hash(readFileSync(path.join(root, file)))) throw new Error("Explicit Dev archive is not current built source: " + file);
}
writeFileSync(path.join(output, "input-receipt.json"), JSON.stringify({ manifestSha256: hash(manifestBytes), planSha256: hash(planBytes), archives: manifest.packages, status: "archive inputs sealed; not a consumer result" }, null, 2) + "\n");
const packagePath = path.join(workspace, "package.json");
const packageJson = { name: "dev-isolated-artifact-consumer", private: true, version: "1.0.0", type: "module", dependencies: { "@foss-earth/dev": "file:" + devArchive, typescript: "file:" + archives.get("typescript") } };
writeFileSync(packagePath, JSON.stringify(packageJson, null, 2));
const installArgs = ["install", "--offline", "--ignore-scripts", "--omit=dev", "--omit=optional", "--no-audit", "--no-fund", "--cache", cache, "--userconfig", env.npm_config_userconfig, "--globalconfig", env.npm_config_globalconfig];
command("pure-install", "npm", installArgs);
for (const file of ["guard.mjs", "negative.mjs", "pure.mjs", "public.ts", "browser.mjs"]) copyFileSync(path.join(root, "fixtures/consumer", file), path.join(workspace, file));
writeFileSync(path.join(output, "outside.mjs"), "export const denied = true;\n");
writeFileSync(path.join(output, "outside.d.ts"), "export interface Outside { escaped: true }\n");
const ancestor = path.join(output, "node_modules/@foss-earth/forbidden-owner-fixture"); mkdirSync(ancestor, { recursive: true }); writeFileSync(path.join(ancestor, "package.json"), JSON.stringify({ name: "@foss-earth/forbidden-owner-fixture", version: "0.0.0", type: "module", exports: "./index.mjs" })); writeFileSync(path.join(ancestor, "index.mjs"), "export const denied = true;\n");
const workspaceRoot = realpathSync(workspace) + path.sep;
function installedPackages(directory, result = []) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    const destination = path.join(directory, entry.name);
    if (!realpathSync(destination).startsWith(workspaceRoot)) throw new Error("Installed dependency follows outside source link.");
    if (entry.name.startsWith("@")) { installedPackages(destination, result); continue; }
    const metadata = JSON.parse(readFileSync(path.join(destination, "package.json"), "utf8"));
    if (!expected.has(metadata.name) || expected.get(metadata.name).version !== metadata.version) throw new Error("Undeclared installed package/version: " + metadata.name);
    result.push({ name: metadata.name, version: metadata.version });
    const nested = path.join(destination, "node_modules"); if (existsSync(nested)) installedPackages(nested, result);
  }
  return result;
}
const pureInstalled = installedPackages(path.join(workspace, "node_modules"));
if (pureInstalled.some(item => !["@foss-earth/dev", "typescript"].includes(item.name))) throw new Error("Pure consumer installed undeclared browser/peer tooling.");
command("runtime-negative-control", process.execPath, ["--import", "./guard.mjs", "negative.mjs"]);
command("pure-root-browser-css", process.execPath, ["--import", "./guard.mjs", "pure.mjs"]);
const compiler = path.join(workspace, "node_modules/typescript/bin/tsc");
const compilerLibrary = realpathSync(path.join(workspace, "node_modules/typescript/lib")) + path.sep;
function assertDeclarations(text) {
  for (const line of text.split(/\r?\n/).filter(line => path.isAbsolute(line))) {
    const actual = realpathSync(line);
    if (actual.startsWith(compilerLibrary) && /^lib\..*\.d\.ts$/.test(path.basename(actual))) continue;
    if (actual.startsWith(workspaceRoot)) continue;
    throw new Error("Declaration escaped isolated installed workspace: " + actual);
  }
}
const config = { compilerOptions: { target: "ES2023", module: "NodeNext", moduleResolution: "NodeNext", lib: ["ES2023", "DOM"], types: [], strict: true, skipLibCheck: false, noEmit: true, incremental: true, tsBuildInfoFile: "./node_modules/.tmp/public-consumer.tsbuildinfo" }, files: ["public.ts"] };
writeFileSync(path.join(workspace, "tsconfig.json"), JSON.stringify(config, null, 2));
assertDeclarations(command("public-declarations", process.execPath, [compiler, "-p", "tsconfig.json", "--listFiles"]));
writeFileSync(path.join(workspace, "outside.ts"), 'import type { Outside } from "../outside.js"; export type Negative = Outside;\n');
writeFileSync(path.join(workspace, "negative.json"), JSON.stringify({ ...config, compilerOptions: { ...config.compilerOptions, tsBuildInfoFile: "./node_modules/.tmp/negative.tsbuildinfo" }, files: ["outside.ts"] }));
let declarationRejected = false;
try { assertDeclarations(command("declaration-negative-control", process.execPath, [compiler, "-p", "negative.json", "--listFiles"])); }
catch (error) { if (!String(error).includes("Declaration escaped")) throw error; declarationRejected = true; }
if (!declarationRejected) throw new Error("Declaration isolation accepted an outside-file negative control.");
for (const [name, archive] of archives) packageJson.dependencies[name] = "file:" + archive;
writeFileSync(packagePath, JSON.stringify(packageJson, null, 2)); command("complete-closure-install", "npm", installArgs);
const installed = installedPackages(path.join(workspace, "node_modules"));
for (const name of expected.keys()) if (!installed.some(item => item.name === name)) throw new Error("Exact closure package was not installed: " + name);
command("installed-browser-lifecycle", process.execPath, ["--import", "./guard.mjs", "browser.mjs"]);
const receipt = { schemaVersion: 1, package: "@foss-earth/dev", version: "0.1.0", devArchiveSha256: manifest.packages.find(item => item.name === "@foss-earth/dev").sha256, archiveManifestSha256: hash(manifestBytes), dependencyPlanSha256: hash(planBytes), publicEntries, installed, guards: ["explicit exact archive name/version/SHA256/size/required dependency closure", "no source links or archive traversal", "sanitized process/npm settings; fresh owner build workspace/cache/temp", "realpath runtime/transitive declaration isolation", "ancestor file/package runtime and outside declaration negative controls"], cases: ["root/browser no DOM or implementation peer", "disabled and exact single dev=1 activation", "host contributions lazy; close/reopen/late-dispose", "no implicit render/server/capture/benchmark/simulation actions", "strict public declarations and public CSS"], environment: { node: process.version, platform: process.platform, architecture: process.arch }, result: "passed", qualification: "Node/jsdom source consumer only; no real browser/device/host adoption or publication admission" };
writeFileSync(path.join(output, "receipt.json"), JSON.stringify(receipt, null, 2) + "\n"); process.stdout.write("Retained Dev consumer receipt: " + path.join(output, "receipt.json") + "\n");
