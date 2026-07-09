import { test, describe, before, after } from "node:test";
import assert from "node:assert";
import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, ScanCommand, DeleteCommand } from "@aws-sdk/lib-dynamodb";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const tempContentDir = path.join(__dirname, "temp-content");
const tempOutputDir = path.join(__dirname, "temp-output-html");
const tempConfigFile = path.join(__dirname, "temp-parser-config.json");

const client = new DynamoDBClient({
  endpoint: "http://localhost:8000",
  region: "us-east-1",
  credentials: {
    accessKeyId: "dummy",
    secretAccessKey: "dummy"
  }
});
const docClient = DynamoDBDocumentClient.from(client);

describe("Unified Parser (HTML Generation & Search Indexing) Tests", () => {
  before(() => {
    // 1. Create content directory structure
    fs.mkdirSync(path.join(tempContentDir, "oe/workbook"), { recursive: true });
    fs.mkdirSync(path.join(tempContentDir, "oe/text"), { recursive: true });

    // 2. Create mock Markdown files
    fs.writeFileSync(
      path.join(tempContentDir, "oe/workbook/l001.md"),
      `---
title: "Lesson One Title"
author: "Scribe Name"
---
# First Heading Level 1 ({{page.title}})

This is the first paragraph by {{page.author}}.

This should be completely omitted.
{: .omit}

## Second Heading Level 2 {: .custom-style}

This is paragraph 2<sup>1</sup>.`
    );

    fs.writeFileSync(
      path.join(tempContentDir, "oe/workbook/l002.md"),
      `---
title: "Lesson Two Title"
---
# Lesson Two ({{page.title}})
Paragraph inside lesson two.`
    );

    fs.writeFileSync(
      path.join(tempContentDir, "oe/text/chap01.md"),
      `---
title: "Text Chapter One"
---
# Chapter One ({{page.title}})
Paragraph inside chapter one.`
    );

    // 3. Create parser config JSON
    fs.writeFileSync(
      tempConfigFile,
      JSON.stringify({
        contentRoot: tempContentDir,
        outputRoot: tempOutputDir,
        wrapperTag: "section",
        wrapperId: "custom-wrapper-id"
      }, null, 2)
    );
  });

  after(async () => {
    // Clean up temporary files
    if (fs.existsSync(tempContentDir)) {
      fs.rmSync(tempContentDir, { recursive: true, force: true });
    }
    if (fs.existsSync(tempOutputDir)) {
      fs.rmSync(tempOutputDir, { recursive: true, force: true });
    }
    if (fs.existsSync(tempConfigFile)) {
      fs.rmSync(tempConfigFile, { force: true });
    }

    // Clean up DynamoDB items we added
    try {
      const scanRes = await docClient.send(new ScanCommand({ TableName: "cmiSearch" }));
      for (const item of scanRes.Items || []) {
        if (item.source === "oe" && (item.sk.startsWith("workbook/") || item.sk.startsWith("text/"))) {
          await docClient.send(new DeleteCommand({
            TableName: "cmiSearch",
            Key: {
              source: item.source,
              sk: item.sk
            }
          }));
        }
      }
    } catch (dbError) {
      // DynamoDB might not be running or table might not exist in some run environments, ignore
    }
  });

  test("Should generate HTML fragments matching config, including wrapper tags and stripped key IDs", () => {
    const cmd = `node src/index.mjs --config "${tempConfigFile}"`;
    const output = execSync(cmd).toString();

    assert.match(output, /Starting processing for 3 markdown file\(s\)/);
    assert.match(output, /Generated HTML:/);

    // Check that HTML output files exist in the outputRoot directory
    const html1Path = path.join(tempOutputDir, "oe/workbook/l001.html");
    const html2Path = path.join(tempOutputDir, "oe/workbook/l002.html");
    const html3Path = path.join(tempOutputDir, "oe/text/chap01.html");

    assert.strictEqual(fs.existsSync(html1Path), true, "l001.html should exist");
    assert.strictEqual(fs.existsSync(html2Path), true, "l002.html should exist");
    assert.strictEqual(fs.existsSync(html3Path), true, "chap01.html should exist");

    // Read l001.html and verify its contents
    const html1 = fs.readFileSync(html1Path, "utf8");

    // Wrapper verification
    assert.match(html1, /^<section id="custom-wrapper-id">/);
    assert.match(html1, /<\/section>\s*$/);

    // Frontmatter template replacement verification
    assert.match(html1, /<h1 id="h1">First Heading Level 1 \(Lesson One Title\)<\/h1>/);
    assert.match(html1, /<p id="p1">This is the first paragraph by Scribe Name.<\/p>/);

    // Omit directive HTML verification (omitted paragraph should be rendered with class="omit" and stripped directive)
    assert.match(html1, /<p id="p2" class="omit">This should be completely omitted.<\/p>/);

    // Verification of custom classes, sequence stripping, and sequential DOM IDs
    assert.match(html1, /<h2 id="h2" class="custom-style">Second Heading Level 2<\/h2>/);
    assert.match(html1, /<p id="p3">This is paragraph 2&#x3C;sup>1&#x3C;\/sup>\.<\/p>/);
  });

  test("Should support path filtering (e.g. limiting to oe/workbook)", () => {
    // Delete existing output directory to start fresh
    if (fs.existsSync(tempOutputDir)) {
      fs.rmSync(tempOutputDir, { recursive: true, force: true });
    }

    const cmd = `node src/index.mjs --config "${tempConfigFile}" --path "oe/workbook"`;
    const output = execSync(cmd).toString();

    assert.match(output, /Starting processing for 2 markdown file\(s\)/);

    const html1Path = path.join(tempOutputDir, "oe/workbook/l001.html");
    const html2Path = path.join(tempOutputDir, "oe/workbook/l002.html");
    const html3Path = path.join(tempOutputDir, "oe/text/chap01.html");

    assert.strictEqual(fs.existsSync(html1Path), true, "l001.html should be processed");
    assert.strictEqual(fs.existsSync(html2Path), true, "l002.html should be processed");
    assert.strictEqual(fs.existsSync(html3Path), false, "chap01.html should NOT be processed due to filter");
  });

  test("Should support highly specific path filtering for a single file/unit", () => {
    if (fs.existsSync(tempOutputDir)) {
      fs.rmSync(tempOutputDir, { recursive: true, force: true });
    }

    const cmd = `node src/index.mjs --config "${tempConfigFile}" --path "oe/workbook/l001"`;
    const output = execSync(cmd).toString();

    assert.match(output, /Starting processing for 1 markdown file\(s\)/);

    const html1Path = path.join(tempOutputDir, "oe/workbook/l001.html");
    const html2Path = path.join(tempOutputDir, "oe/workbook/l002.html");

    assert.strictEqual(fs.existsSync(html1Path), true, "l001.html should be processed");
    assert.strictEqual(fs.existsSync(html2Path), false, "l002.html should NOT be processed");
  });

  test("Should optionally ingest search items into DynamoDB when opt-in flag --db is specified", async () => {
    // 1. Run the parser with directory scanning and opt-in --db flag
    const cmd = `node src/index.mjs --config "${tempConfigFile}" --path "oe/workbook/l001" --db -e http://localhost:8000`;
    const output = execSync(cmd).toString();

    assert.match(output, /Ingested 4 items into DynamoDB table cmiSearch for oe\/workbook\/l001/);

    // 2. Scan the DynamoDB table and verify the ingested records
    const scanRes = await docClient.send(new ScanCommand({ TableName: "cmiSearch" }));
    const l001Items = scanRes.Items.filter(item => item.source === "oe" && item.sk.startsWith("workbook/001:l001/"));

    assert.strictEqual(l001Items.length, 4);

    const headings = l001Items.filter(item => item.type === "h").sort((a, b) => a.sk.localeCompare(b.sk));
    const paragraphs = l001Items.filter(item => item.type === "p").sort((a, b) => a.sk.localeCompare(b.sk));

    assert.strictEqual(headings.length, 2);
    assert.strictEqual(paragraphs.length, 2);

    // Full key verification in SK (e.g., workbook/001:l001/0001#h1)
    assert.strictEqual(headings[0].sk, "workbook/001:l001/0001#h1");
    assert.strictEqual(headings[0].text, "First Heading Level 1 (Lesson One Title)");

    assert.strictEqual(paragraphs[0].sk, "workbook/001:l001/0002#p1");
    assert.strictEqual(paragraphs[0].text, "This is the first paragraph by Scribe Name.");

    // Sequence 3 is consumed by the omitted paragraph (p2) which is skipped in DB, so heading 2 has sequence 4 (h2)
    assert.strictEqual(headings[1].sk, "workbook/001:l001/0004#h2");
    assert.strictEqual(headings[1].text, "Second Heading Level 2");

    // Sequence 5 is consumed by paragraph 2 (p3)
    assert.strictEqual(paragraphs[1].sk, "workbook/001:l001/0005#p3");
    assert.strictEqual(paragraphs[1].text, "This is paragraph 21.");
  });

  test("Should fail when --db is specified without --endpoint to prevent accidental AWS ingestion", () => {
    const cmd = `node src/index.mjs --config "${tempConfigFile}" --path "oe/workbook/l001" --db`;
    let threw = false;
    try {
      execSync(cmd, { stdio: "pipe" });
    } catch (error) {
      threw = true;
      const stderr = error.stderr.toString();
      assert.match(stderr, /error: Option -e, --endpoint <endpoint> is required when -d, --db is specified/);
    }
    assert.strictEqual(threw, true, "Expected command to fail when --db is specified without --endpoint");
  });

  test("Should traverse directories and files according to info.json order (books, groups, units)", () => {
    const orderedDir = path.join(__dirname, "ordered-test-content");
    const orderedOutDir = path.join(__dirname, "ordered-test-output-html");
    const orderedConfig = path.join(__dirname, "ordered-test-parser-config.json");

    try {
      // 1. Setup nested structures with info.json files
      fs.mkdirSync(path.join(orderedDir, "source1/bookB"), { recursive: true });
      fs.mkdirSync(path.join(orderedDir, "source1/bookA"), { recursive: true });

      // source1 has books order: ["bookB", "bookA"]
      fs.writeFileSync(
        path.join(orderedDir, "source1/info.json"),
        JSON.stringify({ books: ["bookB", "bookA"] }, null, 2)
      );

      // bookB has units order: ["unit02", "unit01"]
      fs.writeFileSync(
        path.join(orderedDir, "source1/bookB/info.json"),
        JSON.stringify({ units: ["unit02", "unit01"] }, null, 2)
      );

      fs.writeFileSync(path.join(orderedDir, "source1/bookB/unit01.md"), "# Unit 01\nText 01");
      fs.writeFileSync(path.join(orderedDir, "source1/bookB/unit02.md"), "# Unit 02\nText 02");
      fs.writeFileSync(path.join(orderedDir, "source1/bookA/unit01.md"), "# Unit 01\nText 01");

      fs.writeFileSync(
        orderedConfig,
        JSON.stringify({
          contentRoot: orderedDir,
          outputRoot: orderedOutDir,
          wrapperTag: "div",
          wrapperId: "cmi-content"
        }, null, 2)
      );

      const cmd = `node src/index.mjs --config "${orderedConfig}"`;
      const output = execSync(cmd).toString();

      // We expect the log messages "Generated HTML: ..." to show in the specific sorted order:
      // 1. bookB/unit02 (bookB is listed before bookA, and unit02 before unit01)
      // 2. bookB/unit01
      // 3. bookA/unit01
      const lines = output.split("\n");
      const generatedHtmlLines = lines.filter(line => line.includes("Generated HTML:"));

      assert.strictEqual(generatedHtmlLines.length, 3);
      assert.match(generatedHtmlLines[0], /bookB\/unit02\.html/);
      assert.match(generatedHtmlLines[1], /bookB\/unit01\.html/);
      assert.match(generatedHtmlLines[2], /bookA\/unit01\.html/);

    } finally {
      // Clean up
      if (fs.existsSync(orderedDir)) fs.rmSync(orderedDir, { recursive: true, force: true });
      if (fs.existsSync(orderedOutDir)) fs.rmSync(orderedOutDir, { recursive: true, force: true });
      if (fs.existsSync(orderedConfig)) fs.rmSync(orderedConfig, { force: true });
    }
  });
});
