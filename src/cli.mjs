import { Command } from "commander";

/**
 * Parses command-line arguments using commander.
 *
 * @param {string[]} argv - Command-line arguments
 * @returns {{ filepath: string, options: object }} The parsed file path and options
 */
export function parseArguments(argv) {
  const program = new Command();
  
  program
    .name("cmi-data-generator")
    .description("Parse Markdown, generate HTML fragments, and optionally insert paragraphs and headings into DynamoDB")
    .version("1.0.0")
    .argument("[filepath]", "Path to a single markdown file to parse (bypasses directory processing)")
    .option("-s, --source <source>", "The partition key value (source)")
    .option("-b, --book <book>", "The book name (used in range key)")
    .option("-u, --unit <unit>", "The unit name (used in range key)")
    .option("-p, --path <path>", "Limit directory processing to a specific path relative to the content root (e.g., oe/workbook)")
    .option("-d, --db", "Ingest parsed search items into DynamoDB (opt-in)", false)
    .option("-c, --config <configPath>", "Path to the parser config file", "./parser-config.json")
    .option("-e, --endpoint <endpoint>", "DynamoDB endpoint URL (e.g. http://localhost:8000)")
    .option("-r, --region <region>", "AWS Region", "us-east-1");

  program.parse(argv);

  const options = program.opts();
  const filepath = program.args[0];

  if (options.db && !options.endpoint) {
    program.error("error: Option -e, --endpoint <endpoint> is required when -d, --db is specified. This is enforced to prevent accidental modification of real AWS cloud databases.");
  }

  return { filepath, options };
}
