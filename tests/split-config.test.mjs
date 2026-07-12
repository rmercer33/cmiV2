// tests/split-config.test.mjs - Integration Tests for Config Splitting Pipeline
import { test, describe, before, after } from "node:test";
import assert from "node:assert";
import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");

describe("Config Splitter Script Integration Tests", () => {
  const outputDir = path.join(projectRoot, "frontend", "public", "config");
  const indexFilePath = path.join(outputDir, "index.json");

  before(() => {
    // Ensure we start with a clean split of the original config.json
    execSync("node scripts/split-config.mjs", { cwd: projectRoot });
  });

  test("Should verify the output files exist", () => {
    assert.ok(fs.existsSync(indexFilePath), "index.json must exist in frontend public config");

    // Check that we generated the source specific configurations
    const rawIndex = fs.readFileSync(indexFilePath, "utf-8");
    const indexConfig = JSON.parse(rawIndex);

    assert.ok(Array.isArray(indexConfig.sources), "sources must be an array in index.json");
    assert.ok(indexConfig.sources.length > 0, "sources must not be empty");

    for (const sourceId of indexConfig.sources) {
      const sourcePath = path.join(outputDir, `${sourceId}.json`);
      assert.ok(fs.existsSync(sourcePath), `Source configuration for "${sourceId}" must exist`);
    }
  });

  test("Should verify index.json has minimized metadata structure", () => {
    const rawIndex = fs.readFileSync(indexFilePath, "utf-8");
    const indexConfig = JSON.parse(rawIndex);

    assert.strictEqual(indexConfig.title, "Library of Christ Mind Teachings");
    assert.ok(indexConfig.sourceInfo, "index.json must contain sourceInfo metadata map");

    // Ensure it is light (no bookInfo / deep hierarchical content)
    for (const sourceId of indexConfig.sources) {
      const sourceMeta = indexConfig.sourceInfo[sourceId];
      assert.ok(sourceMeta, `index.json sourceInfo must have meta for ${sourceId}`);
      assert.ok(sourceMeta.title, "Source metadata must have a title");
      assert.ok(Array.isArray(sourceMeta.books), "Source metadata must have a books list");
      
      // CRITICAL: Ensure bookInfo is excluded from index.json for optimization
      assert.strictEqual(sourceMeta.bookInfo, undefined, "index.json must omit heavy bookInfo content tree");
    }
  });

  test("Should verify individual source configs contain full detailed hierarchy", () => {
    const rawIndex = fs.readFileSync(indexFilePath, "utf-8");
    const indexConfig = JSON.parse(rawIndex);
    const firstSourceId = indexConfig.sources[0]; // e.g. "oe"

    const sourcePath = path.join(outputDir, `${firstSourceId}.json`);
    const rawSource = fs.readFileSync(sourcePath, "utf-8");
    const sourceConfig = JSON.parse(rawSource);

    assert.ok(sourceConfig.title, "Source config must contain title");
    assert.ok(Array.isArray(sourceConfig.books), "Source config must list its books");
    assert.ok(sourceConfig.bookInfo, "Source config must contain the full bookInfo content tree");

    // Traverse down one level to verify correctness
    const firstBookId = sourceConfig.books[0];
    const bookMeta = sourceConfig.bookInfo[firstBookId];
    assert.ok(bookMeta, "Source config bookInfo must have details for its first book");
    assert.ok(bookMeta.title, "Book metadata must have a title");
    assert.ok(Array.isArray(bookMeta.groups), "Book metadata must list its groups");
    assert.ok(bookMeta.groupInfo, "Book metadata must contain groupInfo mapping");
  });
});

describe("Config Splitter - Sections & Collections Integration Tests", () => {
  const configPath = path.resolve(projectRoot, "config.json");
  const backupConfigPath = path.resolve(projectRoot, "config.json.bak");
  const outputDir = path.join(projectRoot, "frontend", "public", "config");
  
  const indexFilePath = path.join(outputDir, "index.json");
  const backupIndexFilePath = path.join(outputDir, "index.json.bak");
  
  const acimFilePath = path.join(outputDir, "acim.json");
  const backupAcimFilePath = path.join(outputDir, "acim.json.bak");

  let originalConfigExists = false;
  let originalIndexExists = false;
  let originalAcimExists = false;

  before(() => {
    // 1. Backup original config.json if it exists
    if (fs.existsSync(configPath)) {
      fs.renameSync(configPath, backupConfigPath);
      originalConfigExists = true;
    }

    // 2. Backup output index.json and acim.json to avoid test pollution
    if (fs.existsSync(indexFilePath)) {
      fs.copyFileSync(indexFilePath, backupIndexFilePath);
      originalIndexExists = true;
    }
    if (fs.existsSync(acimFilePath)) {
      fs.copyFileSync(acimFilePath, backupAcimFilePath);
      originalAcimExists = true;
    }

    // 3. Write a mock sectioned config.json
    const mockSectionedConfig = {
      title: "Sectioned Library Config",
      description: "A sectioned config for testing splitter",
      sections: ["classical"],
      sectionInfo: {
        classical: {
          title: "Classical Works",
          description: "Ancient writings",
          sources: ["acim"],
          sourceInfo: {
            acim: {
              title: "A Course in Miracles",
              description: "Full Course",
              image: "acim_cover.jpg",
              collections: ["core"],
              collectionInfo: {
                core: {
                  title: "Core Volumes",
                  books: ["text"],
                  bookInfo: {
                    text: {
                      title: "Text Volume",
                      description: "The main text",
                      units: ["ch1"],
                      unitInfo: {
                        ch1: {
                          title: "Chapter 1",
                          url: "classical/acim/core/text/ch1"
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    };

    fs.writeFileSync(configPath, JSON.stringify(mockSectionedConfig, null, 2), "utf8");
  });

  after(() => {
    // Clean up temporary config.json
    if (fs.existsSync(configPath)) {
      fs.rmSync(configPath, { force: true });
    }

    // Restore original config.json
    if (originalConfigExists && fs.existsSync(backupConfigPath)) {
      fs.renameSync(backupConfigPath, configPath);
    }

    // Restore original index.json
    if (originalIndexExists && fs.existsSync(backupIndexFilePath)) {
      fs.renameSync(backupIndexFilePath, indexFilePath);
    } else if (fs.existsSync(indexFilePath)) {
      fs.rmSync(indexFilePath, { force: true });
    }

    // Restore original acim.json
    if (originalAcimExists && fs.existsSync(backupAcimFilePath)) {
      fs.renameSync(backupAcimFilePath, acimFilePath);
    } else if (fs.existsSync(acimFilePath)) {
      fs.rmSync(acimFilePath, { force: true });
    }
  });

  test("Should split sectioned config correctly", () => {
    // Run the splitter
    execSync("node scripts/split-config.mjs", { cwd: projectRoot });

    // Verify index.json structure
    const rawIndex = fs.readFileSync(indexFilePath, "utf8");
    const indexConfig = JSON.parse(rawIndex);

    assert.strictEqual(indexConfig.title, "Sectioned Library Config");
    assert.deepStrictEqual(indexConfig.sections, ["classical"]);
    assert.ok(indexConfig.sectionInfo.classical, "classical section metadata must be present");
    assert.strictEqual(indexConfig.sectionInfo.classical.title, "Classical Works");

    // Verify metadata stub has collections and stripped heavy payload
    const acimStub = indexConfig.sectionInfo.classical.sourceInfo.acim;
    assert.ok(acimStub, "acim source stub must be in index.json sectionInfo");
    assert.strictEqual(acimStub.title, "A Course in Miracles");
    assert.deepStrictEqual(acimStub.collections, ["core"]);
    assert.strictEqual(acimStub.collectionInfo, undefined, "index.json must omit heavy collectionInfo content tree");

    // Verify that frontend/public/config/acim.json exists and contains full data
    const sourceFilePath = path.join(outputDir, "acim.json");
    assert.ok(fs.existsSync(sourceFilePath), "acim.json must be split out successfully");

    const sourceConfig = JSON.parse(fs.readFileSync(sourceFilePath, "utf8"));
    assert.strictEqual(sourceConfig.title, "A Course in Miracles");
    assert.ok(sourceConfig.collectionInfo, "Source config must contain collectionInfo content tree");
    assert.ok(sourceConfig.collectionInfo.core.bookInfo.text, "Source config must contain deep bookInfo nested inside collections");
  });
});
