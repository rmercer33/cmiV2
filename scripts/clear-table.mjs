import { Command } from "commander";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, QueryCommand, DeleteCommand } from "@aws-sdk/lib-dynamodb";

const program = new Command();

program
  .name("clear-table")
  .requiredOption("-s, --source <source>", "The partition key value (source)")
  .option("-b, --book <book>", "The book name (optional)")
  .option("-u, --unit <unit>", "The unit name (optional)");

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

    console.log(`Scanning/Querying local DynamoDB table '${tableName}' for items with source="${options.source}"${hasSkPrefix ? ` and sk starting with "${targetPrefix}"` : ""}...`);

    const queryResult = await docClient.send(new QueryCommand(queryParams));
    if (queryResult.Items && queryResult.Items.length > 0) {
      console.log(`Found ${queryResult.Items.length} records to delete. Deleting...`);
      for (const item of queryResult.Items) {
        await docClient.send(new DeleteCommand({
          TableName: tableName,
          Key: {
            source: item.source,
            sk: item.sk
          }
        }));
        console.log(`Deleted: source=${item.source}, sk=${item.sk}`);
      }
      console.log("Cleanup completed successfully.");
    } else {
      console.log("No matching records found to delete.");
    }
  } catch (err) {
    console.error("Error clearing table items:", err);
  }
}

run();
