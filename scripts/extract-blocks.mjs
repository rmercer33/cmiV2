#!/usr/bin/env node

import { readFile } from "fs/promises";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkFrontmatter from "remark-frontmatter";
import { visit } from "unist-util-visit";
import { toString } from "mdast-util-to-string";

async function main() {
  const filepath = process.argv[2];
  if (!filepath) {
    console.error("Error: Please provide a markdown file path.");
    process.exit(1);
  }

  let content;
  try {
    content = await readFile(filepath, "utf8");
  } catch (err) {
    console.error(`Error reading file: ${err.message}`);
    process.exit(1);
  }

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
        frontmatter[match[1]] = match[2];
      }
    }
  }

  const blocks = [];
  let headingSequence = 1;
  let paragraphSequence = 1;

  visit(ast, (node) => {
    if (node.type === "heading" || node.type === "paragraph") {
      let text = toString(node).trim();
      if (!text) {
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
      let isOmitted = false;

      if (directiveMatch) {
        text = text.replace(/\{:\s*(.*?)\s*\}$/, "").trim();
        const directive = directiveMatch[1].trim();
        const htmlClass = directive.replace(/^\./, "");
        if (htmlClass.toLowerCase() === "omit") {
          isOmitted = true;
        }
      }

      let htmlId;
      if (type === "h") {
        htmlId = `h${headingSequence}`;
        headingSequence++;
      } else {
        htmlId = `p${paragraphSequence}`;
        paragraphSequence++;
      }

      // Strip <sup> and </sup> tags
      const cleanText = text.replace(/<\/?sup>/gi, "");

      // We only emit paragraphs that are NOT omitted
      if (type === "p" && !isOmitted) {
        blocks.push({
          id: htmlId,
          text: cleanText
        });
      }
    }
  });

  console.log(JSON.stringify(blocks, null, 2));
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
