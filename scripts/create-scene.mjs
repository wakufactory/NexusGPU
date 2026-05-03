import { constants as fsConstants } from "node:fs";
import { copyFile, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const scenesDir = path.resolve("src/scenes");
const scenesJsonPath = path.join(scenesDir, "scenes.json");

const template = {
  id: "sdf-experiment",
  module: "./SdfExperimentScene.tsx",
  path: path.join(scenesDir, "SdfExperimentScene.tsx"),
};

function usage() {
  console.log("Usage: npm run scene:create -- <scene-id-or-name> [title]");
  console.log("Example: npm run scene:create -- crystal-field \"Crystal Field\"");
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

const [rawName, ...titleParts] = process.argv.slice(2);

if (!rawName || rawName === "--help" || rawName === "-h") {
  usage();
  process.exit(rawName ? 0 : 1);
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

const templateScene = scenes.find((scene) => scene.id === template.id);

if (!templateScene) {
  throw new Error(`Template scene was not found in scenes.json: ${template.id}`);
}

try {
  await copyFile(template.path, targetPath, fsConstants.COPYFILE_EXCL);
} catch (error) {
  if (error?.code === "EEXIST") {
    throw new Error(`Scene file already exists: ${targetPath}`);
  }

  throw error;
}

const nextScene = {
  id: sceneId,
  title,
  description: `Scene copied from ${templateScene.title}.`,
  module: modulePath,
};

scenes.push(nextScene);
await writeFile(scenesJsonPath, stringifyScenes(scenes));

console.log(`Created ${modulePath}`);
console.log(`Added ${sceneId} to src/scenes/scenes.json`);
