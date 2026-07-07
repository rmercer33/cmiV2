#!/usr/bin/env node

import { readFile } from "fs/promises";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkFrontmatter from "remark-frontmatter";
import { visit } from "unist-util-visit";
import { toString } from "mdast-util-to-string";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";

import { parseArguments } from "./cli.mjs";
import { cleanExistingRecords } from "./cleanup.mjs";

async function run() {
  try {
    // 1. Process CLI arguments
    const { filepath, options } = parseArguments(process.argv);

    // 2. Read Markdown file
    let content;
    try {
      content = await readFile(filepath, "utf8");
    } catch (fsError) {
      if (fsError.code === "ENOENT") {
        console.error(`Error: The file "${filepath}" does not exist.`);
      } else {
        console.error(`Error reading file "${filepath}":`, fsError.message);
      }
      process.exit(1);
    }

    // 3. Parse Markdown to AST
    const processor = unified()
      .use(remarkParse)
      .use(remarkFrontmatter);
    const ast = processor.parse(content);

    // Extract frontmatter attributes
    const frontmatter = {};
    const yamlNode = ast.children.find(node => node.type === "yaml");
    if (yamlNode && yamlNode.value) {
      const lines = yamlNode.value.split("\n");
      for (const line of lines) {
        const match = line.match(/^\s*([\w\-]+)\s*:\s*["']?(.*?)["']?\s*$/);
        if (match) {
          const key = match[1];
          const val = match[2];
          frontmatter[key] = val;
        }
      }
    }

    // 4. Extract Headings and Paragraphs
    const items = [];
    let globalSequence = 1;
    let headingSequence = 1;
    let paragraphSequence = 1;

    visit(ast, (node) => {
      if (node.type === "heading" || node.type === "paragraph") {
        let text = toString(node).trim();
        if (!text) {
          // Skip empty headings/paragraphs if any
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
        if (directiveMatch) {
          const directive = directiveMatch[1].toLowerCase().replace(/^\./, "").trim();
          if (directive === "omit") {
            return; // Skip this node completely
          }
        }

        const paddedGlobal = String(globalSequence).padStart(4, "0");
        globalSequence++;

        let key;
        if (type === "h") {
          key = `${paddedGlobal}#h${headingSequence}`;
          headingSequence++;
        } else {
          key = `${paddedGlobal}#p${paragraphSequence}`;
          paragraphSequence++;
        }
        
        items.push({
          type,
          key,
          text,
        });
      }
    });

    console.log(`Parsed ${items.length} items from ${filepath}.`);

    // 5. Configure DynamoDB Client
    const dbConfig = {
      region: options.region,
    };
    if (options.endpoint) {
      dbConfig.endpoint = options.endpoint;
      dbConfig.credentials = {
        accessKeyId: "dummy",
        secretAccessKey: "dummy",
      };
    }
    const client = new DynamoDBClient(dbConfig);
    const docClient = DynamoDBDocumentClient.from(client);
    const tableName = "cmiSearch";

    // 6. Clean up existing records for this book/unit prefix
    await cleanExistingRecords(docClient, tableName, options);

    // 7. Insert Items into DynamoDB
    for (const item of items) {
      // Range Key: concatenated values of 'book', 'unit', 'key' delimited by '/'
      // e.g., woh/chap01/#p10
      const sk = `${options.book}/${options.unit}/${item.key}`;

      const putParams = {
        TableName: tableName,
        Item: {
          source: options.source,
          sk: sk,
          type: item.type,
          text: item.text,
        }
      };

      const command = new PutCommand(putParams);
      await docClient.send(command);
      console.log(`Inserted: source=${options.source}, sk=${sk}`);
    }

    console.log("All items inserted successfully.");
  } catch (error) {
    // Check if error is commander-specific (e.g. invalid arguments or help requested)
    // Commander displays errors and helper text on its own, so we only handle unexpected errors
    if (error.code !== "commander.missingArgument" && error.code !== "commander.helpDisplayed" && error.code !== "commander.unknownOption") {
      console.error("Error executing parser:", error);
    }
    process.exit(1);
  }
}

run();
