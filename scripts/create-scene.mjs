import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const scenesDir = path.resolve("src/demo/scenes");
const scenesJsonPath = path.join(scenesDir, "scenes.json");

const defaultSourceSceneId = "sdf-experiment";

function usage() {
  console.log("Usage: npm run scene:create -- <scene-id-or-name> [title] [--from <source-scene>]");
  console.log("Example: npm run scene:create -- crystal-field \"Crystal Field\"");
  console.log("Example: npm run scene:create -- crystal-field \"Crystal Field\" --from simple-scene");
}

function toKebabCase(value) {
  return value
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

function toPascalCase(value) {
  return value
    .trim()
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
}

function titleFromId(id) {
  return id
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function stringifyScenes(scenes) {
  return `${JSON.stringify(scenes, null, 2).replace(/\[\n((?:\s+-?\d+(?:\.\d+)?(?:e[+-]?\d+)?,?\n)+)\s+\]/gi, (_match, values) => {
    const compactValues = values
      .trim()
      .split("\n")
      .map((line) => line.trim().replace(/,$/, ""))
      .join(", ");

    return `[${compactValues}]`;
  })}\n`;
}

function sceneNameFromModule(modulePath) {
  return path.basename(modulePath, path.extname(modulePath));
}

function renameSceneSource(source, fromSceneName, toSceneName) {
  return source.split(fromSceneName).join(toSceneName);
}

function parseArgs(args) {
  let rawName = "";
  let sourceSceneSelector = "";
  const titleParts = [];

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--from" || arg === "-f") {
      sourceSceneSelector = args[index + 1] ?? "";
      if (!sourceSceneSelector) {
        throw new Error(`${arg} requires a source scene id, module path, or file name.`);
      }
      index += 1;
      continue;
    }

    if (arg.startsWith("--from=")) {
      sourceSceneSelector = arg.slice("--from=".length);
      if (!sourceSceneSelector) {
        throw new Error("--from requires a source scene id, module path, or file name.");
      }
      continue;
    }

    if (arg.startsWith("-")) {
      throw new Error(`Unknown option: ${arg}`);
    }

    if (!rawName) {
      rawName = arg;
      continue;
    }

    titleParts.push(arg);
  }

  return { rawName, titleParts, sourceSceneSelector };
}

function modulePathToFilePath(modulePath) {
  return path.resolve(scenesDir, modulePath);
}

function sourceSceneAliases(scene) {
  const moduleSceneName = sceneNameFromModule(scene.module);
  const moduleFileName = path.basename(scene.module);

  return new Set([
    scene.id,
    scene.title,
    scene.module,
    moduleFileName,
    moduleSceneName,
    toKebabCase(moduleSceneName),
  ]);
}

function resolveSourceScene(scenes, selector) {
  const sourceSelector = selector || defaultSourceSceneId;
  const normalizedSelector = toKebabCase(sourceSelector);
  const sourceScene = scenes.find((scene) => {
    const aliases = sourceSceneAliases(scene);
    return aliases.has(sourceSelector) || aliases.has(normalizedSelector);
  });

  if (!sourceScene) {
    throw new Error(`Source scene was not found in scenes.json: ${sourceSelector}`);
  }

  return sourceScene;
}

const args = process.argv.slice(2);

if (args.includes("--help") || args.includes("-h")) {
  usage();
  process.exit(0);
}

const { rawName, titleParts, sourceSceneSelector } = parseArgs(args);

if (!rawName) {
  usage();
  process.exit(1);
}

const sceneId = toKebabCase(rawName);

if (!sceneId) {
  throw new Error("Scene id must contain at least one letter or number.");
}

const componentBaseName = toPascalCase(sceneId);
const sceneFileBaseName = componentBaseName.endsWith("Scene") ? componentBaseName : `${componentBaseName}Scene`;
const fileName = `${sceneFileBaseName}.tsx`;
const modulePath = `./${fileName}`;
const targetPath = path.join(scenesDir, fileName);
const title = titleParts.join(" ").trim() || titleFromId(sceneId);

const scenes = JSON.parse(await readFile(scenesJsonPath, "utf8"));

if (!Array.isArray(scenes)) {
  throw new Error(`${scenesJsonPath} must contain an array.`);
}

if (scenes.some((scene) => scene.id === sceneId)) {
  throw new Error(`Scene id already exists in scenes.json: ${sceneId}`);
}

if (scenes.some((scene) => scene.module === modulePath)) {
  throw new Error(`Scene module already exists in scenes.json: ${modulePath}`);
}

const sourceScene = resolveSourceScene(scenes, sourceSceneSelector);
const sourcePath = modulePathToFilePath(sourceScene.module);
const sourceSceneName = sceneNameFromModule(sourceScene.module);
const source = await readFile(sourcePath, "utf8");
const sceneSource = renameSceneSource(source, sourceSceneName, sceneFileBaseName);

try {
  await writeFile(targetPath, sceneSource, { flag: "wx" });
} catch (error) {
  if (error?.code === "EEXIST") {
    throw new Error(`Scene file already exists: ${targetPath}`);
  }

  throw error;
}

const nextScene = {
  id: sceneId,
  title,
  description: `Scene copied from ${sourceScene.title}.`,
  module: modulePath,
};

scenes.push(nextScene);
await writeFile(scenesJsonPath, stringifyScenes(scenes));

console.log(`Created ${modulePath}`);
console.log(`Added ${sceneId} to src/demo/scenes/scenes.json`);
