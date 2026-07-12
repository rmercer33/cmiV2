// tests/split-config.test.mjs - Integration Tests for Config Splitting Pipeline
import { test, describe } from "node:test";
import assert from "node:assert";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");

describe("Config Splitter Script Integration Tests", () => {
  const outputDir = path.join(projectRoot, "frontend", "public", "config");
  const indexFilePath = path.join(outputDir, "index.json");

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
