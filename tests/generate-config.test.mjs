import { test, describe, before, after } from "node:test";
import assert from "node:assert";
import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const tempContentDir = path.join(__dirname, "temp-test-content");
const tempOutputFile = path.join(__dirname, "temp-config.json");

describe("Config Generator Script Integration Tests", () => {
  before(() => {
    // 1. Create a fresh temporary directory structure
    fs.mkdirSync(tempContentDir, { recursive: true });

    // Root info.json
    fs.writeFileSync(
      path.join(tempContentDir, "info.json"),
      JSON.stringify({
        title: "Test Library",
        description: "A test library configuration",
        contact: "Test Contact",
        email: "test@example.com",
        sources: ["src1", "src2"] // Explicit sorting
      }, null, 2)
    );

    // Source 1 (src1) - has a flat book
    const src1Dir = path.join(tempContentDir, "src1");
    fs.mkdirSync(src1Dir, { recursive: true });
    fs.writeFileSync(
      path.join(src1Dir, "info.json"),
      JSON.stringify({
        title: "Source One",
        description: "First test source",
        books: ["flatbook"]
      }, null, 2)
    );

    // Book 1 in Source 1 (flatbook) - no subdirectories, just .md files
    const flatbookDir = path.join(src1Dir, "flatbook");
    fs.mkdirSync(flatbookDir, { recursive: true });
    fs.writeFileSync(
      path.join(flatbookDir, "info.json"),
      JSON.stringify({
        title: "Flat Book",
        description: "A flat book without groups",
        units: ["unitB", "unitA"] // Explicit sorting
      }, null, 2)
    );

    fs.writeFileSync(
      path.join(flatbookDir, "unitA.md"),
      `---
title: "Unit A Title"
customField: "customValA"
---
# Unit A Header
Some content for Unit A.`
    );

    fs.writeFileSync(
      path.join(flatbookDir, "unitB.md"),
      `---
title: "Unit B Title"
customField: "customValB"
---
# Unit B Header
Some content for Unit B.`
    );

    // Source 2 (src2) - has a grouped book
    const src2Dir = path.join(tempContentDir, "src2");
    fs.mkdirSync(src2Dir, { recursive: true });
    fs.writeFileSync(
      path.join(src2Dir, "info.json"),
      JSON.stringify({
        title: "Source Two",
        books: ["groupedbook"]
      }, null, 2)
    );

    // Book 2 in Source 2 (groupedbook) - has groups
    const groupedbookDir = path.join(src2Dir, "groupedbook");
    fs.mkdirSync(groupedbookDir, { recursive: true });
    fs.writeFileSync(
      path.join(groupedbookDir, "info.json"),
      JSON.stringify({
        title: "Grouped Book",
        groups: ["group2", "group1"] // Explicit group sorting
      }, null, 2)
    );

    // Group 1 in Grouped Book (group1)
    const group1Dir = path.join(groupedbookDir, "group1");
    fs.mkdirSync(group1Dir, { recursive: true });
    fs.writeFileSync(
      path.join(group1Dir, "info.json"),
      JSON.stringify({
        title: "Group One Title",
        units: ["g1unit1"]
      }, null, 2)
    );
    fs.writeFileSync(
      path.join(group1Dir, "g1unit1.md"),
      `---
title: "Group 1 Unit 1"
---
Content.`
    );

    // Group 2 in Grouped Book (group2) - no title in info.json, should fallback to first unit frontmatter
    const group2Dir = path.join(groupedbookDir, "group2");
    fs.mkdirSync(group2Dir, { recursive: true });
    fs.writeFileSync(
      path.join(group2Dir, "info.json"),
      JSON.stringify({
        units: ["g2unit1"]
      }, null, 2)
    );
    fs.writeFileSync(
      path.join(group2Dir, "g2unit1.md"),
      `---
title: "Group 2 Unit 1"
chapter: "Fallback Chapter Name"
---
Content.`
    );
  });

  after(() => {
    // Clean up temporary files and directories
    if (fs.existsSync(tempContentDir)) {
      fs.rmSync(tempContentDir, { recursive: true, force: true });
    }
    if (fs.existsSync(tempOutputFile)) {
      fs.rmSync(tempOutputFile, { force: true });
    }
  });

  test("Should parse frontmatter, info.json, sort correctly and output valid config.json", () => {
    const cmd = `node scripts/generate-config.js "${tempContentDir}" "${tempOutputFile}"`;
    const execOutput = execSync(cmd).toString();
    
    assert.match(execOutput, /Success! Configuration generated and saved to/);
    assert.strictEqual(fs.existsSync(tempOutputFile), true);

    const generatedConfig = JSON.parse(fs.readFileSync(tempOutputFile, "utf8"));

    // Verify root metadata
    assert.strictEqual(generatedConfig.title, "Test Library");
    assert.strictEqual(generatedConfig.description, "A test library configuration");
    assert.strictEqual(generatedConfig.contact, "Test Contact");
    assert.strictEqual(generatedConfig.email, "test@example.com");

    // Verify sources list and explicit sorting
    assert.deepStrictEqual(generatedConfig.sources, ["src1", "src2"]);

    // Verify Source 1 structure (flat book)
    const src1Info = generatedConfig.sourceInfo.src1;
    assert.strictEqual(src1Info.title, "Source One");
    assert.strictEqual(src1Info.description, "First test source");
    assert.deepStrictEqual(src1Info.books, ["flatbook"]);

    const flatbookInfo = src1Info.bookInfo.flatbook;
    assert.strictEqual(flatbookInfo.title, "Flat Book");
    assert.strictEqual(flatbookInfo.description, "A flat book without groups");
    // Verify explicit sorting of units from info.json: ["unitB", "unitA"]
    assert.deepStrictEqual(flatbookInfo.units, ["unitB", "unitA"]);

    // Verify flatbook units metadata (with frontmatter fields)
    const unitA = flatbookInfo.unitInfo.unitA;
    assert.strictEqual(unitA.title, "Unit A Title");
    assert.strictEqual(unitA.url, "src1/flatbook/unitA");
    assert.strictEqual(unitA.customField, "customValA");

    const unitB = flatbookInfo.unitInfo.unitB;
    assert.strictEqual(unitB.title, "Unit B Title");
    assert.strictEqual(unitB.url, "src1/flatbook/unitB");
    assert.strictEqual(unitB.customField, "customValB");

    // Verify Source 2 structure (grouped book)
    const src2Info = generatedConfig.sourceInfo.src2;
    assert.strictEqual(src2Info.title, "Source Two");
    assert.deepStrictEqual(src2Info.books, ["groupedbook"]);

    const groupedbookInfo = src2Info.bookInfo.groupedbook;
    assert.strictEqual(groupedbookInfo.title, "Grouped Book");
    // Verify group sorting from info.json: ["group2", "group1"]
    assert.deepStrictEqual(groupedbookInfo.groups, ["group2", "group1"]);

    // Verify group1 info (has explicit title)
    const group1 = groupedbookInfo.groupInfo.group1;
    assert.strictEqual(group1.title, "Group One Title");
    assert.deepStrictEqual(group1.units, ["g1unit1"]);
    assert.strictEqual(group1.unitInfo.g1unit1.title, "Group 1 Unit 1");
    assert.strictEqual(group1.unitInfo.g1unit1.url, "src2/groupedbook/group1/g1unit1");

    // Verify group2 info (title fallback using first unit's chapter frontmatter)
    const group2 = groupedbookInfo.groupInfo.group2;
    assert.strictEqual(group2.title, "Fallback Chapter Name"); // Fallback trigger
    assert.deepStrictEqual(group2.units, ["g2unit1"]);
    assert.strictEqual(group2.unitInfo.g2unit1.title, "Group 2 Unit 1");
    assert.strictEqual(group2.unitInfo.g2unit1.url, "src2/groupedbook/group2/g2unit1");
  });
});
