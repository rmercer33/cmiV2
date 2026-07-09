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
      
      // Always query by book prefix to fetch items, as unit names have a dynamic sequence number prepended
      expressionAttributeValues[":skPrefix"] = `${options.book}/`;
    }

    const queryParams = {
      TableName: tableName,
      KeyConditionExpression: keyConditionExpression,
      ExpressionAttributeNames: expressionAttributeNames,
      ExpressionAttributeValues: expressionAttributeValues
    };

    console.log(`Querying local table '${tableName}' for source="${options.source}"${options.book ? ` and book="${options.book}"${options.unit ? ` (filtering for unit="${options.unit}")` : ""}` : ""}...`);
    
    const result = await docClient.send(new QueryCommand(queryParams));

    let items = result.Items || [];
    if (options.book && options.unit) {
      items = items.filter(item => {
        const skParts = item.sk.split('/');
        if (skParts.length >= 2) {
          const unitPart = skParts[1];
          const cleanUnit = unitPart.includes(':') ? unitPart.split(':')[1] : unitPart;
          return cleanUnit === options.unit;
        }
        return false;
      });
    }

    if (items.length > 0) {
      console.log(`\nQuery Results (${items.length} records found):`);
      console.log(JSON.stringify(items, null, 2));
    } else {
      console.log("\nNo matching records found.");
    }
  } catch (err) {
    console.error("Error querying table:", err);
  }
}

run();
