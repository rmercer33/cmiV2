#!/usr/bin/env node

import fs from "fs";
import path from "path";
import * as yaml from "js-yaml";

// Helper to convert standard glob pattern into JavaScript RegExp
function globToRegex(glob) {
  let regexStr = glob
    .replace(/[.+^${}()|[\]\\]/g, "\\$&") // Escape regex special chars except * and ?
    .replace(/\*\*/g, "TEMP_DOUBLE_STAR")
    .replace(/\*/g, "[^/]*")
    .replace(/TEMP_DOUBLE_STAR/g, ".*")
    .replace(/\?/g, ".");
  return new RegExp("^" + regexStr + "$");
}

// Helper to get the base directory of a glob (the static directory path before the first wildcard)
function getBaseDir(glob) {
  const parts = glob.split("/");
  const baseParts = [];
  for (const part of parts) {
    if (part.includes("*") || part.includes("?")) {
      break;
    }
    baseParts.push(part);
  }
  // If the glob has no wildcards, remove the filename to get directory
  if (baseParts.length === parts.length) {
    baseParts.pop();
  }
  return baseParts.join("/") || ".";
}

// Recursively find files matching a glob pattern
function findFiles(globPattern) {
  const regex = globToRegex(globPattern);
  const baseDir = getBaseDir(globPattern);
  const matchedFiles = [];

  function walk(dir) {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (err) {
      return; // Directory doesn't exist or is unreadable
    }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const normalizedPath = fullPath.replace(/\\/g, "/"); // Normalize Windows separators

      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile()) {
        if (regex.test(normalizedPath)) {
          matchedFiles.push(fullPath);
        }
      }
    }
  }

  walk(baseDir);
  return matchedFiles;
}

// Update frontmatter block in a markdown file
function modifyMarkdown(filePath, basename, setRules, replaceRules, deleteRules) {
  const content = fs.readFileSync(filePath, "utf8");
  
  // Match YAML frontmatter block
  const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/m);
  
  let frontmatter = {};
  let body = content;
  let hasFm = false;
  
  if (fmMatch) {
    hasFm = true;
    try {
      frontmatter = yaml.load(fmMatch[1]) || {};
    } catch (err) {
      console.warn(`\x1b[33mWarning: Could not parse frontmatter in ${filePath}: ${err.message}\x1b[0m`);
      return false; // Skip malformed files
    }
    body = fmMatch[2];
  }

  let changed = false;

  // 1. Process deletes
  if (Array.isArray(deleteRules)) {
    for (const key of deleteRules) {
      if (key in frontmatter) {
        delete frontmatter[key];
        changed = true;
      }
    }
  }

  // Token replacement helper
  const substitute = (val) => {
    if (typeof val === "string") {
      return val.replace(/<basename>/g, basename);
    }
    return val;
  };

  // 2. Process sets (only add if absent)
  if (setRules) {
    for (const [key, val] of Object.entries(setRules)) {
      if (!(key in frontmatter)) {
        frontmatter[key] = substitute(val);
        changed = true;
      }
    }
  }

  // 3. Process replaces (always overwrites)
  if (replaceRules) {
    for (const [key, val] of Object.entries(replaceRules)) {
      const newVal = substitute(val);
      if (frontmatter[key] !== newVal) {
        frontmatter[key] = newVal;
        changed = true;
      }
    }
  }

  if (changed) {
    // Serialize back to YAML frontmatter
    const newFmText = yaml.dump(frontmatter).trim();
    const newContent = `---\n${newFmText}\n---\n${body}`;
    fs.writeFileSync(filePath, newContent, "utf8");
    return true;
  }

  return false;
}

// Update JSON attributes in a json file
function modifyJson(filePath, basename, setRules, replaceRules, deleteRules) {
  const content = fs.readFileSync(filePath, "utf8");
  let data;
  try {
    data = JSON.parse(content);
  } catch (err) {
    console.warn(`\x1b[33mWarning: Could not parse JSON in ${filePath}: ${err.message}\x1b[0m`);
    return false;
  }

  let changed = false;

  // 1. Process deletes
  if (Array.isArray(deleteRules)) {
    for (const key of deleteRules) {
      if (key in data) {
        delete data[key];
        changed = true;
      }
    }
  }

  // Token replacement helper
  const substitute = (val) => {
    if (typeof val === "string") {
      return val.replace(/<basename>/g, basename);
    }
    return val;
  };

  // 2. Process sets (only add if absent)
  if (setRules) {
    for (const [key, val] of Object.entries(setRules)) {
      if (!(key in data)) {
        data[key] = substitute(val);
        changed = true;
      }
    }
  }

  // 3. Process replaces (always overwrites)
  if (replaceRules) {
    for (const [key, val] of Object.entries(replaceRules)) {
      const newVal = substitute(val);
      if (data[key] !== newVal) {
        data[key] = newVal;
        changed = true;
      }
    }
  }

  if (changed) {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + "\n", "utf8");
    return true;
  }

  return false;
}

// Main runner execution
function main() {
  const args = process.argv.slice(2);
  if (args.length < 1) {
    console.log("Usage: node scripts/bulk-modifier.mjs <tasks-json-file>");
    process.exit(1);
  }

  const taskFilePath = args[0];
  if (!fs.existsSync(taskFilePath)) {
    console.error(`Error: Configuration file "${taskFilePath}" not found.`);
    process.exit(1);
  }

  let tasks;
  try {
    tasks = JSON.parse(fs.readFileSync(taskFilePath, "utf8"));
  } catch (err) {
    console.error(`Error: Failed to parse tasks JSON: ${err.message}`);
    process.exit(1);
  }

  if (!Array.isArray(tasks)) {
    tasks = [tasks]; // Convert single task object to array
  }

  console.log(`==========================================================`);
  console.log(`            Bulk Metadata Modifier Script Started          `);
  console.log(`==========================================================\n`);

  let totalUpdated = 0;

  for (const task of tasks) {
    const globPattern = task.match;
    if (!globPattern) {
      console.warn("\x1b[33mWarning: Task is missing \"match\" pattern. Skipping.\x1b[0m");
      continue;
    }

    console.log(`Processing match pattern: \x1b[36m"${globPattern}"\x1b[0m...`);
    const files = findFiles(globPattern);
    console.log(`Found \x1b[32m${files.length}\x1b[0m matching files.\n`);

    let taskUpdated = 0;

    for (const file of files) {
      const ext = path.extname(file).toLowerCase();
      const basename = path.basename(file, ext);

      let success = false;
      if (ext === ".md") {
        success = modifyMarkdown(file, basename, task.set, task.replace, task.delete);
      } else if (ext === ".json") {
        success = modifyJson(file, basename, task.set, task.replace, task.delete);
      }

      if (success) {
        console.log(`  \x1b[32m[UPDATED]\x1b[0m ${file}`);
        taskUpdated++;
        totalUpdated++;
      }
    }

    console.log(`\nFinished task. Modified \x1b[32m${taskUpdated}\x1b[0m files.\n----------------------------------------------------------\n`);
  }

  console.log(`\x1b[32mBulk metadata modification completed successfully!\x1b[0m`);
  console.log(`Total files modified across all patterns: \x1b[32m${totalUpdated}\x1b[0m\n`);
}

main();
