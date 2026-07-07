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
    .description("Parse Markdown and insert paragraphs and headings into DynamoDB")
    .version("1.0.0")
    .argument("<filepath>", "Path to the markdown file")
    .requiredOption("-s, --source <source>", "The partition key value (source)")
    .requiredOption("-b, --book <book>", "The book name (used in range key)")
    .requiredOption("-u, --unit <unit>", "The unit name (used in range key)")
    .option("-e, --endpoint <endpoint>", "DynamoDB endpoint URL (e.g. http://localhost:8000)")
    .option("-r, --region <region>", "AWS Region", "us-east-1");

  program.parse(argv);

  const options = program.opts();
  const filepath = program.args[0];

  return { filepath, options };
}
