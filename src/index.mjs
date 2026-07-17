#!/usr/bin/env node

import { readFile, writeFile, mkdir, readdir, copyFile } from "fs/promises";
import fs from "fs";
import path from "path";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkFrontmatter from "remark-frontmatter";
import remarkRehype from "remark-rehype";
import rehypeStringify from "rehype-stringify";
import { visit } from "unist-util-visit";
import { toString } from "mdast-util-to-string";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";

import { parseArguments } from "./cli.mjs";
import { cleanExistingRecords } from "./cleanup.mjs";
import Handlebars from "handlebars";

const rehypeProcessor = unified().use(remarkRehype, {allowDangerousHtml: true}).use(rehypeStringify, {allowDangerousHtml: true});

const templateCache = {};

async function getTemplate(templateName) {
  if (templateCache[templateName]) {
    return templateCache[templateName];
  }
  try {
    const templatePath = path.join("templates", `${templateName}.hbs`);
    const templateSource = await readFile(templatePath, "utf8");
    const compiled = Handlebars.compile(templateSource);
    templateCache[templateName] = compiled;
    return compiled;
  } catch (err) {
    console.warn(`Warning: Template "${templateName}" not found or failed to compile. Falling back to default raw HTML.`, err.message);
    return null;
  }
}

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
  const matched = ordered.filter((item) => found.includes(item));
  const remaining = found.filter((item) => !orderedSet.has(item)).sort();
  return [...matched, ...remaining];
}

/**
 * Safely calculates sequence of a single file from its parent directory's info.json and directory contents.
 */
async function getSingleFileSequence(filepath) {
  const dirPath = path.dirname(filepath);
  const info = (await readInfoJson(dirPath)) || {};
  try {
    const entries = await readdir(dirPath, { withFileTypes: true });
    const files = entries
      .filter((e) => e.isFile() && e.name.endsWith(".md"))
      .map((e) => e.name);
    const fileBasenames = files.map((f) => f.slice(0, -3));
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
 * Re-built to handle optional sections and collections recursively with 100% backward compatibility.
 */
async function getMarkdownFiles(contentRoot) {
  const results = [];

  async function traverse(currentDir, context) {
    const info = (await readInfoJson(currentDir)) || {};
    const entries = await readdir(currentDir, { withFileTypes: true });

    const dirs = entries
      .filter((e) => e.isDirectory() && e.name !== "images" && e.name !== "assets")
      .map((e) => e.name);
    const files = entries
      .filter((e) => e.isFile() && e.name.endsWith(".md"))
      .map((e) => e.name);

    // Identify what this folder represents and how we sort its subdirectories
    let orderRules;
    let nextContextBuilder = (dirName) => ({ ...context });

    if (context.isRoot) {
      const sectionsList = Array.isArray(info.sections) ? info.sections : [];
      nextContextBuilder = (dirName) => {
        if (sectionsList.includes(dirName)) {
          return {
            ...context,
            isRoot: false,
            section: dirName,
          };
        } else {
          return {
            ...context,
            isRoot: false,
            source: dirName,
          };
        }
      };
      orderRules = sectionsList.concat(
        Array.isArray(info.sources) ? info.sources : [],
      );
    } else if (context.section && !context.source) {
      orderRules = info.sources;
      nextContextBuilder = (dirName) => ({
        ...context,
        source: dirName,
      });
    } else if (context.source && !context.collection && !context.book) {
      const collectionsList = Array.isArray(info.collections)
        ? info.collections
        : [];
      nextContextBuilder = (dirName) => {
        if (collectionsList.includes(dirName)) {
          return {
            ...context,
            collection: dirName,
          };
        } else {
          return {
            ...context,
            book: dirName,
          };
        }
      };
      orderRules = collectionsList.concat(
        Array.isArray(info.books) ? info.books : [],
      );
    } else if (context.collection && !context.book) {
      orderRules = info.books;
      nextContextBuilder = (dirName) => ({
        ...context,
        book: dirName,
      });
    } else if (context.book && !context.group) {
      orderRules = info.groups;
      nextContextBuilder = (dirName) => ({
        ...context,
        group: dirName,
      });
    }

    const sortedDirs = sortItems(dirs, orderRules);

    const fileBasenames = files.map((f) => f.slice(0, -3));
    const sortedBasenames = sortItems(fileBasenames, info.units);
    const sortedFiles = sortedBasenames.map((name) => `${name}.md`);

    // Depth-first traversal
    for (const dirName of sortedDirs) {
      await traverse(
        path.join(currentDir, dirName),
        nextContextBuilder(dirName),
      );
    }

    // Process files in this directory (only if it represents a valid unit inside a book)
    if (context.source && context.book) {
      for (let i = 0; i < sortedFiles.length; i++) {
        const fileName = sortedFiles[i];
        const seqStr = String(i + 1).padStart(3, "0");
        const unitId = fileName.slice(0, -3);

        const fileContext = { ...context, unit: unitId };
        delete fileContext.isRoot;

        const filepath = path.join(currentDir, fileName);
        const relPath = path.relative(contentRoot, filepath);

        results.push({
          filepath,
          sequence: seqStr,
          relPath,
          ...fileContext,
        });
      }
    }
  }

  await traverse(contentRoot, { isRoot: true });
  return results;
}

/**
 * Recursively find the last text-yielding node in the subtree of the given node.
 */
function findLastTextNode(node) {
  if (node.type === "text") {
    return node;
  }
  if (node.children && node.children.length > 0) {
    for (let i = node.children.length - 1; i >= 0; i--) {
      const found = findLastTextNode(node.children[i]);
      if (found) return found;
    }
  }
  return null;
}

/**
 * Recursively perform newlines to spaces and frontmatter substitutions on all text nodes in a subtree.
 * Also converts raw "html" nodes to "text" nodes so they are preserved through rehype and unescaped by regex.
 */
function processSubtreeTextNodes(currentNode, type, frontmatter) {
  if (currentNode.type === "html") {
    currentNode.type = "text";
  }

  if (currentNode.type === "text") {
    let val = currentNode.value;

    // Replace newlines in paragraph text nodes with spaces
    if (type === "p") {
      val = val.replace(/\r?\n/g, " ");
    }

    // Perform frontmatter variable substitutions
    val = val.replace(/\{\{\s*page\.([\w\-]+)\s*\}\}/g, (match, key) => {
      return frontmatter[key] !== undefined ? frontmatter[key] : "";
    });

    currentNode.value = val;
  }

  if (currentNode.children && currentNode.children.length > 0) {
    for (const child of currentNode.children) {
      processSubtreeTextNodes(child, type, frontmatter);
    }
  }
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
      const initialText = toString(node).trim();
      if (!initialText) {
        nodesToRemove.add(node);
        return;
      }

      const type = node.type === "heading" ? "h" : "p";

      // Check for directives at the end of the text and extract/strip them in-place
      let htmlClass = "";
      let omitFromDb = false;

      const lastTextNode = findLastTextNode(node);
      if (lastTextNode) {
        const directiveMatch = lastTextNode.value.match(/\{:\s*(.*?)\s*\}$/);
        if (directiveMatch) {
          // Extract the value (e.g. '.omit' or '.custom-class')
          const directive = directiveMatch[1].trim();
          htmlClass = directive.replace(/^\./, "");

          if (htmlClass.toLowerCase() === "omit") {
            omitFromDb = true;
          }

          // Strip the directive from the last text node's value in-place
          lastTextNode.value = lastTextNode.value.replace(/\{:\s*(.*?)\s*\}$/, "").trim();
        }
      }

      // Process newlines and frontmatter substitutions in-place on all text-yielding descendant nodes
      processSubtreeTextNodes(node, type, frontmatter);

      const paddedGlobal = String(globalSequence).padStart(4, "0");
      globalSequence++;

      let key;
      let htmlId;
      if (type === "h") {
        htmlId = `h${headingSequence}`;
        key = `${paddedGlobal}#${htmlId}`;
        headingSequence++;

        // Generate standard slug for internal markdown links
        const slug = toString(node).toLowerCase().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-');
        if (slug) {
          node.children.unshift({
            type: "html",
            value: `<a id="${slug}"></a>`
          });
        }
      } else {
        htmlId = `p${paragraphSequence}`;
        key = `${paddedGlobal}#${htmlId}`;
        paragraphSequence++;
      }

      // In-place AST updates for HTML generation attributes
      node.data = node.data || {};
      node.data.hProperties = node.data.hProperties || {};
      node.data.hProperties.id = htmlId;
      if (htmlClass) {
        node.data.hProperties.className = [htmlClass];
      }

      if (!omitFromDb) {
        // Strip <sup> and </sup> tags so they don't go to the database
        // Also get the fully substituted, stripped plain text of this node
        const nodeText = toString(node).trim();
        const cleanText = nodeText.replace(/<\/?sup>/gi, "");
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
        parent.children = parent.children.filter(
          (child) => !nodesToRemove.has(child),
        );
        parent.children.forEach(removeOmitted);
      }
    };
    removeOmitted(ast);
  }

  return items;
}

/**
 * Recursively copies static assets (images) from contentRoot to outputRoot.
 * Respects Options filter if specified.
 */
async function copyStaticAssets(contentRoot, outputRoot, options) {
  async function traverse(currentDir) {
    const entries = await readdir(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      const relPath = path.relative(contentRoot, fullPath);

      if (options.path) {
        const normFilter = path.normalize(options.path);
        // Only recurse/copy if it starts with filter, or filter is a subpath of it
        if (!relPath.startsWith(normFilter) && !normFilter.startsWith(relPath)) {
          continue;
        }
      }

      if (entry.isDirectory()) {
        await traverse(fullPath);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        const staticExts = new Set([".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp"]);
        if (staticExts.has(ext)) {
          const destPath = path.join(outputRoot, relPath);
          await mkdir(path.dirname(destPath), { recursive: true });
          await copyFile(fullPath, destPath);
          console.log(`Copied static asset: ${destPath}`);
        }
      }
    }
  }
  await traverse(contentRoot);
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
      wrapperId: "cmi-content",
    };

    if (options.config) {
      try {
        const configRaw = await readFile(path.resolve(options.config), "utf8");
        config = { ...config, ...JSON.parse(configRaw) };
      } catch (err) {
        if (
          options.config !== "./parser-config.json" ||
          err.code !== "ENOENT"
        ) {
          console.warn(
            `[Warning] Could not read config file "${options.config}":`,
            err.message,
          );
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

      let fileObj = null;
      try {
        const allFiles = await getMarkdownFiles(contentRoot);
        fileObj = allFiles.find((f) => f.filepath === absFilePath);
      } catch (err) {
        // Fallback or ignore
      }

      if (fileObj) {
        filesToProcess.push({
          ...fileObj,
          section: options.section || fileObj.section,
          source: options.source || fileObj.source,
          collection: options.collection || fileObj.collection,
          book: options.book || fileObj.book,
          group: options.group || fileObj.group,
          unit: options.unit || fileObj.unit,
        });
      } else {
        // Fallback for files outside content root or missing metadata
        const fileSeq = await getSingleFileSequence(absFilePath);
        const relPath = path.relative(contentRoot, absFilePath);
        const basename = path.basename(absFilePath, ".md");
        filesToProcess.push({
          filepath: absFilePath,
          source: options.source || "unknown",
          book: options.book || "unknown",
          unit: options.unit || basename,
          sequence: fileSeq,
          relPath,
        });
      }
    } else {
      // Directory Mode
      if (!fs.existsSync(contentRoot)) {
        console.error(
          `Error: Content directory "${contentRoot}" does not exist.`,
        );
        process.exit(1);
      }

      const allFiles = await getMarkdownFiles(contentRoot);

      for (const fileObj of allFiles) {
        // Filter by --path option if specified
        if (options.path) {
          const normFilter = path.normalize(options.path);
          if (!fileObj.relPath.startsWith(normFilter)) {
            continue;
          }
        }

        filesToProcess.push(fileObj);
      }
    }

    if (filesToProcess.length === 0) {
      console.log("No markdown files matched the filters. Nothing to process.");
      return;
    }

    console.log(
      `Starting processing for ${filesToProcess.length} markdown file(s)...`,
    );

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
    const processor = unified().use(remarkParse).use(remarkGfm).use(remarkFrontmatter);

    for (const fileInfo of filesToProcess) {
      let content;
      try {
        content = await readFile(fileInfo.filepath, "utf8");
      } catch (err) {
        console.error(
          `Error reading file "${fileInfo.filepath}":`,
          err.message,
        );
        continue;
      }

      // Parse markdown to AST
      const ast = processor.parse(content);

      // Extract frontmatter attributes
      const frontmatter = {};
      const yamlNode = ast.children.find((node) => node.type === "yaml");
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

      // Apply template if specified in frontmatter
      let contentHtml = rawHtml;
      if (frontmatter.template) {
        const templateFn = await getTemplate(frontmatter.template);
        if (templateFn) {
          contentHtml = templateFn({
            content: rawHtml,
            ...frontmatter
          });
        }
      }

      // Wrap in wrapper tag with configured id
      const wrappedHtml = `<${wrapperTag} id="${wrapperId}">\n${contentHtml}\n</${wrapperTag}>\n`;

      // Unescape HTML tags that were escaped by rehype-stringify (e.g. sup, br, b, i, span)
      const cleanedHtml = wrappedHtml.replace(
        /(?:&#x3C;|&lt;)(\/?\w+(?:\s+[^>]*?)?\/?)(?:&#x3E;|&gt;|>)/gi,
        (match, tagAndAttrs) => {
          const tagName = tagAndAttrs
            .replace(/^\//, "")
            .replace(/\/$/, "")
            .trim()
            .split(/\s+/)[0]
            .toLowerCase();
          const allowedTags = new Set([
            "sup",
            "sub",
            "br",
            "span",
            "b",
            "i",
            "em",
            "strong",
            "div",
            "p",
            "a",
            "img",
          ]);
          if (allowedTags.has(tagName)) {
            return `<${tagAndAttrs}>`;
          }
          return match;
        },
      );

      // Determine HTML output file path (using relPath to perfectly mirror source hierarchy)
      const htmRelPath = fileInfo.relPath.replace(/\.md$/, ".html");
      const outFilePath = path.join(outputRoot, htmRelPath);

      // Ensure output directory exists and write HTML
      await mkdir(path.dirname(outFilePath), { recursive: true });
      await writeFile(outFilePath, cleanedHtml, "utf8");
      console.log(`Generated HTML: ${outFilePath}`);

      // 5. DynamoDB Insertion (if flag specified)
      if (options.db) {
        // Clean up existing records first
        await cleanExistingRecords(docClient, tableName, {
          source: fileInfo.source,
          section: fileInfo.section,
          collection: fileInfo.collection,
          book: fileInfo.book,
          group: fileInfo.group,
          unit: fileInfo.unit,
        });

        // Insert new records
        for (const item of items) {
          // Construct the fully-qualified path Sort Key (SK) after source
          const skParts = [];
          if (fileInfo.collection) skParts.push(fileInfo.collection);
          skParts.push(fileInfo.book);
          if (fileInfo.group) skParts.push(fileInfo.group);
          skParts.push(`${fileInfo.sequence}:${fileInfo.unit}`);
          skParts.push(item.key);

          const sk = skParts.join("/");

          const putItem = {
            source: fileInfo.source,
            sk: sk,
            type: item.type,
            text: item.text,
            book: fileInfo.book,
            unit: fileInfo.unit,
          };

          if (fileInfo.section) putItem.section = fileInfo.section;
          if (fileInfo.collection) putItem.collection = fileInfo.collection;
          if (fileInfo.group) putItem.group = fileInfo.group;

          const putParams = {
            TableName: tableName,
            Item: putItem,
          };

          const command = new PutCommand(putParams);
          await docClient.send(command);
        }
        console.log(
          `Ingested ${items.length} items into DynamoDB table cmiSearch for ${fileInfo.source}/${fileInfo.book}/${fileInfo.unit}`,
        );
      }
    }

    // 6. Copy static assets (like images) automatically
    if (fs.existsSync(contentRoot)) {
      await copyStaticAssets(contentRoot, outputRoot, options);
    }

    console.log("Processing completed successfully.");
  } catch (error) {
    if (
      error.code !== "commander.missingArgument" &&
      error.code !== "commander.helpDisplayed" &&
      error.code !== "commander.unknownOption"
    ) {
      console.error("Error executing parser:", error);
    }
    process.exit(1);
  }
}

run();
