import { QueryCommand, DeleteCommand } from "@aws-sdk/lib-dynamodb";

/**
 * Checks and deletes existing records in the database with the same partition key
 * and whose range keys start with `${book}/${unit}/`.
 *
 * @param {DynamoDBDocumentClient} docClient 
 * @param {string} tableName 
 * @param {object} options - CLI options (source, book, unit)
 */
export async function cleanExistingRecords(docClient, tableName, options) {
  const skPrefix = `${options.book}/${options.unit}/`;
  console.log(`Checking for existing records under source="${options.source}" with prefix "${skPrefix}"...`);

  const queryParams = {
    TableName: tableName,
    KeyConditionExpression: "#source = :source AND begins_with(#sk, :skPrefix)",
    ExpressionAttributeNames: {
      "#source": "source",
      "#sk": "sk"
    },
    ExpressionAttributeValues: {
      ":source": options.source,
      ":skPrefix": skPrefix
    }
  };
  
  const queryResult = await docClient.send(new QueryCommand(queryParams));
  if (queryResult.Items && queryResult.Items.length > 0) {
    console.log(`Found ${queryResult.Items.length} existing records. Deleting...`);
    for (const item of queryResult.Items) {
      await docClient.send(new DeleteCommand({
        TableName: tableName,
        Key: {
          source: item.source,
          sk: item.sk
        }
      }));
      console.log(`Deleted existing record: ${item.sk}`);
    }
  } else {
    console.log("No existing records found to clean up.");
  }
}
