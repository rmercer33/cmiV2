import { DynamoDBClient, CreateTableCommand } from "@aws-sdk/client-dynamodb";

const client = new DynamoDBClient({
  endpoint: "http://localhost:8000",
  region: "us-east-1",
  credentials: {
    accessKeyId: "dummy",
    secretAccessKey: "dummy"
  }
});

async function run() {
  const command = new CreateTableCommand({
    TableName: "cmiSearch",
    AttributeDefinitions: [
      { AttributeName: "source", AttributeType: "S" },
      { AttributeName: "sk", AttributeType: "S" }
    ],
    KeySchema: [
      { AttributeName: "source", KeyType: "HASH" },
      { AttributeName: "sk", KeyType: "RANGE" }
    ],
    ProvisionedThroughput: {
      ReadCapacityUnits: 5,
      WriteCapacityUnits: 5
    }
  });

  try {
    const response = await client.send(command);
    console.log("Table created successfully:", response.TableDescription.TableStatus);
  } catch (err) {
    if (err.name === 'ResourceInUseException') {
      console.log("Table already exists.");
    } else {
      console.error("Error creating table:", err);
    }
  }
}

run();
