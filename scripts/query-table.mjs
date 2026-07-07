import { Command } from "commander";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, QueryCommand } from "@aws-sdk/lib-dynamodb";

const program = new Command();
program
  .name("query-table")
  .requiredOption("-s, --source <source>", "The partition key value (source)")
  .option("-b, --book <book>", "The book name")
  .option("-u, --unit <unit>", "The unit name");

program.parse(process.argv);
const options = program.opts();

// If unit is specified, book must be specified as well
if (options.unit && !options.book) {
  console.error("Error: Option -u (--unit) requires option -b (--book) to be specified as well.");
  process.exit(1);
}

const client = new DynamoDBClient({
  endpoint: "http://localhost:8000",
  region: "us-east-1",
  credentials: {
    accessKeyId: "dummy",
    secretAccessKey: "dummy"
  }
});
const docClient = DynamoDBDocumentClient.from(client);
const tableName = "cmiSearch";

async function run() {
  try {
    let keyConditionExpression = "#source = :source";
    const expressionAttributeNames = {
      "#source": "source"
    };
    const expressionAttributeValues = {
      ":source": options.source
    };

    if (options.book) {
      expressionAttributeNames["#sk"] = "sk";
      keyConditionExpression += " AND begins_with(#sk, :skPrefix)";
      
      const skPrefix = options.unit ? `${options.book}/${options.unit}/` : `${options.book}/`;
      expressionAttributeValues[":skPrefix"] = skPrefix;
    }

    const queryParams = {
      TableName: tableName,
      KeyConditionExpression: keyConditionExpression,
      ExpressionAttributeNames: expressionAttributeNames,
      ExpressionAttributeValues: expressionAttributeValues
    };

    const hasSkPrefix = options.book ? true : false;
    const targetPrefix = hasSkPrefix ? (options.unit ? `${options.book}/${options.unit}/` : `${options.book}/`) : "";

    console.log(`Querying local table '${tableName}' for source="${options.source}"${hasSkPrefix ? ` and sk starting with "${targetPrefix}"` : ""}...`);
    
    const result = await docClient.send(new QueryCommand(queryParams));

    if (result.Items && result.Items.length > 0) {
      console.log(`\nQuery Results (${result.Items.length} records found):`);
      console.log(JSON.stringify(result.Items, null, 2));
    } else {
      console.log("\nNo matching records found.");
    }
  } catch (err) {
    console.error("Error querying table:", err);
  }
}

run();
