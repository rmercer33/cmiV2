#!/usr/bin/env node

import { readFile, writeFile, mkdir, readdir } from "fs/promises";
import fs from "fs";
import path from "path";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkFrontmatter from "remark-frontmatter";
import remarkRehype from "remark-rehype";
import rehypeStringify from "rehype-stringify";
import { visit } from "unist-util-visit";
import { toString } from "mdast-util-to-string";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";

import { parseArguments } from "./cli.mjs";
import { cleanExistingRecords } from "./cleanup.mjs";

const rehypeProcessor = unified()
  .use(remarkRehype)
  .use(rehypeStringify);

/**
 * Safely reads and parses info.json if it exists.
 */
async function readInfoJson(dirPath) {
  const infoPath = path.join(dirPath, "info.json");
  try {
    const data = await readFile(infoPath, "utf8");
    return JSON.parse(data);
  } catch (err) {
    return null;
  }
}

/**
 * Sorts physically found items based on an ordered list, appending remaining items alphabetically.
 */
function sortItems(found, ordered) {
  if (!ordered || !Array.isArray(ordered)) {
    return [...found].sort();
  }
  const orderedSet = new Set(ordered);
  const matched = ordered.filter(item => found.includes(item));
  const remaining = found.filter(item => !orderedSet.has(item)).sort();
  return [...matched, ...remaining];
}

/**
 * Safely calculates sequence of a single file from its parent directory's info.json and directory contents.
 */
async function getSingleFileSequence(filepath) {
  const dirPath = path.dirname(filepath);
  const info = await readInfoJson(dirPath) || {};
  try {
    const entries = await readdir(dirPath, { withFileTypes: true });
    const files = entries.filter(e => e.isFile() && e.name.endsWith(".md")).map(e => e.name);
    const fileBasenames = files.map(f => f.slice(0, -3));
    const sortedBasenames = sortItems(fileBasenames, info.units);
    const basename = path.basename(filepath, ".md");
    const index = sortedBasenames.indexOf(basename);
    if (index !== -1) {
      return String(index + 1).padStart(3, "0");
    }
  } catch (err) {
    // Ignore and fallback
  }
  return "001";
}

/**
 * Traverses directories recursively to find markdown files, respecting any ordering rules in info.json files.
 */
async function getMarkdownFiles(dir) {
  const results = [];
  
  async function traverse(currentDir) {
    const info = await readInfoJson(currentDir) || {};
    const entries = await readdir(currentDir, { withFileTypes: true });

    const dirs = entries.filter(e => e.isDirectory()).map(e => e.name);
    const files = entries.filter(e => e.isFile() && e.name.endsWith(".md")).map(e => e.name);

    const orderRules = info.books || info.groups;
    const sortedDirs = sortItems(dirs, orderRules);

    const fileBasenames = files.map(f => f.slice(0, -3));
    const sortedBasenames = sortItems(fileBasenames, info.units);
    const sortedFiles = sortedBasenames.map(name => `${name}.md`);

    for (const dirName of sortedDirs) {
      await traverse(path.join(currentDir, dirName));
    }
    for (let i = 0; i < sortedFiles.length; i++) {
      const fileName = sortedFiles[i];
      const seqStr = String(i + 1).padStart(3, "0");
      results.push({
        filepath: path.join(currentDir, fileName),
        sequence: seqStr
      });
    }
  }

  await traverse(dir);
  return results;
}

/**
 * Process MDAST, generate keys, and prepare elements for search and HTML render.
 */
function processAst(ast, frontmatter) {
  const items = [];
  let globalSequence = 1;
  let headingSequence = 1;
  let paragraphSequence = 1;
  const nodesToRemove = new Set();

  visit(ast, (node) => {
    if (node.type === "heading" || node.type === "paragraph") {
      let text = toString(node).trim();
      if (!text) {
        nodesToRemove.add(node);
        return;
      }

      const type = node.type === "heading" ? "h" : "p";
      
      // Replace newlines in paragraph nodes with spaces
      if (type === "p") {
        text = text.replace(/\r?\n/g, " ");
      }

      // Perform frontmatter variable substitutions
      text = text.replace(/\{\{\s*page\.([\w\-]+)\s*\}\}/g, (match, key) => {
        return frontmatter[key] !== undefined ? frontmatter[key] : "";
      });

      // Check for directives at the end of the text
      const directiveMatch = text.match(/\{:\s*(.*?)\s*\}$/);
      let htmlClass = "";
      let omitFromDb = false;

      if (directiveMatch) {
        // Strip the directive from the text being rendered/saved
        text = text.replace(/\{:\s*(.*?)\s*\}$/, "").trim();
        
        // Extract the value (e.g. '.omit' or '.custom-class')
        const directive = directiveMatch[1].trim();
        htmlClass = directive.replace(/^\./, "");
        
        if (htmlClass.toLowerCase() === "omit") {
          omitFromDb = true;
        }
      }

      const paddedGlobal = String(globalSequence).padStart(4, "0");
      globalSequence++;

      let key;
      let htmlId;
      if (type === "h") {
        htmlId = `h${headingSequence}`;
        key = `${paddedGlobal}#${htmlId}`;
        headingSequence++;
      } else {
        htmlId = `p${paragraphSequence}`;
        key = `${paddedGlobal}#${htmlId}`;
        paragraphSequence++;
      }

      // In-place AST updates for HTML generation
      node.children = [{ type: "text", value: text }];
      node.data = node.data || {};
      node.data.hProperties = node.data.hProperties || {};
      node.data.hProperties.id = htmlId;
      if (htmlClass) {
        node.data.hProperties.className = [htmlClass];
      }

      if (!omitFromDb) {
        // Strip <sup> and </sup> tags so they don't go to the database
        const cleanText = text.replace(/<\/?sup>/gi, "");
        items.push({
          type,
          key,
          text: cleanText,
        });
      }
    }
  });

  // Remove omitted nodes from AST
  if (nodesToRemove.size > 0) {
    const removeOmitted = (parent) => {
      if (parent.children) {
        parent.children = parent.children.filter(child => !nodesToRemove.has(child));
        parent.children.forEach(removeOmitted);
      }
    };
    removeOmitted(ast);
  }

  return items;
}

async function run() {
  try {
    // 1. Process CLI arguments
    const { filepath, options } = parseArguments(process.argv);

    // 2. Read Parser Configuration (either from CLI or default)
    let config = {
      contentRoot: "../cmiContent/content",
      outputRoot: "./public/content",
      wrapperTag: "div",
      wrapperId: "cmi-content"
    };

    if (options.config) {
      try {
        const configRaw = await readFile(path.resolve(options.config), "utf8");
        config = { ...config, ...JSON.parse(configRaw) };
      } catch (err) {
        if (options.config !== "./parser-config.json" || err.code !== "ENOENT") {
          console.warn(`[Warning] Could not read config file "${options.config}":`, err.message);
        }
      }
    }

    const contentRoot = path.resolve(config.contentRoot);
    const outputRoot = path.resolve(config.outputRoot);
    const wrapperTag = config.wrapperTag || "div";
    const wrapperId = config.wrapperId || "cmi-content";

    // 3. Determine file processing list
    const filesToProcess = [];

    if (filepath) {
      // Single file mode (backward compatibility / direct call)
      if (!fs.existsSync(filepath)) {
        console.error(`Error: The file "${filepath}" does not exist.`);
        process.exit(1);
      }
      const absFilePath = path.resolve(filepath);
      
      // Determine source, book, unit from options or derive from file name/path
      const relPath = path.relative(contentRoot, absFilePath);
      const segments = relPath.split(path.sep);

      let derivedSource = options.source;
      let derivedBook = options.book;
      let derivedUnit = options.unit;

      if (!derivedSource || !derivedBook || !derivedUnit) {
        if (segments.length >= 3) {
          derivedSource = derivedSource || segments[0];
          derivedBook = derivedBook || segments[1];
          if (segments.length === 4) {
            derivedUnit = derivedUnit || segments[3].replace(/\.md$/, "");
          } else {
            derivedUnit = derivedUnit || segments[2].replace(/\.md$/, "");
          }
        } else {
          // If not enough segments, fallback to defaults or input options
          derivedSource = derivedSource || "unknown";
          derivedBook = derivedBook || "unknown";
          derivedUnit = derivedUnit || path.basename(filepath, ".md");
        }
      }

      const fileSeq = await getSingleFileSequence(absFilePath);

      filesToProcess.push({
        filepath: absFilePath,
        source: derivedSource,
        book: derivedBook,
        unit: derivedUnit,
        sequence: fileSeq,
        relPath: path.join(derivedSource, derivedBook, path.basename(filepath))
      });
    } else {
      // Directory Mode
      if (!fs.existsSync(contentRoot)) {
        console.error(`Error: Content directory "${contentRoot}" does not exist.`);
        process.exit(1);
      }

      const allFiles = await getMarkdownFiles(contentRoot);
      
      for (const fileObj of allFiles) {
        const file = fileObj.filepath;
        const relPath = path.relative(contentRoot, file);
        
        // Filter by --path option if specified
        if (options.path) {
          const normFilter = path.normalize(options.path);
          if (!relPath.startsWith(normFilter)) {
            continue;
          }
        }

        const segments = relPath.split(path.sep);
        if (segments.length < 3) {
          // Skip top-level or structurally invalid markdown files
          continue;
        }

        const derivedSource = segments[0];
        const derivedBook = segments[1];
        let derivedUnit;

        if (segments.length === 4) {
          derivedUnit = segments[3].replace(/\.md$/, "");
        } else {
          derivedUnit = segments[2].replace(/\.md$/, "");
        }

        filesToProcess.push({
          filepath: file,
          source: derivedSource,
          book: derivedBook,
          unit: derivedUnit,
          sequence: fileObj.sequence,
          relPath
        });
      }
    }

    if (filesToProcess.length === 0) {
      console.log("No markdown files matched the filters. Nothing to process.");
      return;
    }

    console.log(`Starting processing for ${filesToProcess.length} markdown file(s)...`);

    // Setup DynamoDB client if DB ingestion is requested
    let docClient;
    const tableName = "cmiSearch";
    if (options.db) {
      const dbConfig = { region: options.region };
      if (options.endpoint) {
        dbConfig.endpoint = options.endpoint;
        dbConfig.credentials = {
          accessKeyId: "dummy",
          secretAccessKey: "dummy",
        };
      }
      const client = new DynamoDBClient(dbConfig);
      docClient = DynamoDBDocumentClient.from(client);
    }

    // 4. Process each file
    const processor = unified()
      .use(remarkParse)
      .use(remarkFrontmatter);

    for (const fileInfo of filesToProcess) {
      let content;
      try {
        content = await readFile(fileInfo.filepath, "utf8");
      } catch (err) {
        console.error(`Error reading file "${fileInfo.filepath}":`, err.message);
        continue;
      }

      // Parse markdown to AST
      const ast = processor.parse(content);

      // Extract frontmatter attributes
      const frontmatter = {};
      const yamlNode = ast.children.find(node => node.type === "yaml");
      if (yamlNode && yamlNode.value) {
        const lines = yamlNode.value.split("\n");
        for (const line of lines) {
          const match = line.match(/^\s*([\w\-]+)\s*:\s*["']?(.*?)["']?\s*$/);
          if (match) {
            frontmatter[match[1]] = match[2];
          }
        }
      }

      // Process AST (generates search items and modifies AST in-place with ids)
      const items = processAst(ast, frontmatter);

      // Convert AST to HTML
      const hast = await rehypeProcessor.run(ast);
      const rawHtml = rehypeProcessor.stringify(hast);

      // Wrap in wrapper tag with configured id
      const wrappedHtml = `<${wrapperTag} id="${wrapperId}">\n${rawHtml}\n</${wrapperTag}>\n`;

      // Unescape HTML tags that were escaped by rehype-stringify (e.g. sup, br, b, i, span)
      const cleanedHtml = wrappedHtml.replace(/(?:&#x3C;|&lt;)(\/?\w+(?:\s+[^>]*?)?\/?)(?:&#x3E;|&gt;|>)/gi, (match, tagAndAttrs) => {
        const tagName = tagAndAttrs.replace(/^\//, '').replace(/\/$/, '').trim().split(/\s+/)[0].toLowerCase();
        const allowedTags = new Set(['sup', 'sub', 'br', 'span', 'b', 'i', 'em', 'strong', 'div', 'p', 'a']);
        if (allowedTags.has(tagName)) {
          return `<${tagAndAttrs}>`;
        }
        return match;
      });

      // Determine HTML output file path
      // Mirror the source hierarchy
      let outFilePath;
      const htmRelPath = fileInfo.relPath.replace(/\.md$/, ".html");
      outFilePath = path.join(outputRoot, htmRelPath);

      // Ensure output directory exists and write HTML
      await mkdir(path.dirname(outFilePath), { recursive: true });
      await writeFile(outFilePath, cleanedHtml, "utf8");
      console.log(`Generated HTML: ${outFilePath}`);

      // 5. DynamoDB Insertion (if flag specified)
      if (options.db) {
        // Clean up existing records first
        await cleanExistingRecords(docClient, tableName, {
          source: fileInfo.source,
          book: fileInfo.book,
          unit: fileInfo.unit
        });

        // Insert new records
        for (const item of items) {
          const sk = `${fileInfo.book}/${fileInfo.sequence}:${fileInfo.unit}/${item.key}`;
          const putParams = {
            TableName: tableName,
            Item: {
              source: fileInfo.source,
              sk: sk,
              type: item.type,
              text: item.text,
            }
          };

          const command = new PutCommand(putParams);
          await docClient.send(command);
        }
        console.log(`Ingested ${items.length} items into DynamoDB table cmiSearch for ${fileInfo.source}/${fileInfo.book}/${fileInfo.unit}`);
      }
    }

    console.log("Processing completed successfully.");
  } catch (error) {
    if (error.code !== "commander.missingArgument" && error.code !== "commander.helpDisplayed" && error.code !== "commander.unknownOption") {
      console.error("Error executing parser:", error);
    }
    process.exit(1);
  }
}

run();
