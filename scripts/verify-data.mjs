import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, ScanCommand } from "@aws-sdk/lib-dynamodb";

const client = new DynamoDBClient({
  endpoint: "http://localhost:8000",
  region: "us-east-1",
  credentials: {
    accessKeyId: "dummy",
    secretAccessKey: "dummy"
  }
});
const docClient = DynamoDBDocumentClient.from(client);

async function run() {
  try {
    const result = await docClient.send(new ScanCommand({ TableName: "cmiSearch" }));
    console.log("Scan Result:");
    console.log(JSON.stringify(result.Items, null, 2));
  } catch (err) {
    console.error("Error scanning table:", err);
  }
}

run();
