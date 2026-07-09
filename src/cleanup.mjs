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
  const bookPrefix = `${options.book}/`;
  console.log(`Checking for existing records under source="${options.source}" for book="${options.book}" and unit="${options.unit}"...`);

  const queryParams = {
    TableName: tableName,
    KeyConditionExpression: "#source = :source AND begins_with(#sk, :skPrefix)",
    ExpressionAttributeNames: {
      "#source": "source",
      "#sk": "sk"
    },
    ExpressionAttributeValues: {
      ":source": options.source,
      ":skPrefix": bookPrefix
    }
  };
  
  const queryResult = await docClient.send(new QueryCommand(queryParams));
  if (queryResult.Items && queryResult.Items.length > 0) {
    // Filter items in memory to match the target unit (handling optional sequence prefix)
    const itemsToDelete = queryResult.Items.filter(item => {
      const skParts = item.sk.split('/');
      if (skParts.length >= 2) {
        const unitPart = skParts[1];
        const cleanUnit = unitPart.includes(':') ? unitPart.split(':')[1] : unitPart;
        return cleanUnit === options.unit;
      }
      return false;
    });

    if (itemsToDelete.length > 0) {
      console.log(`Found ${itemsToDelete.length} existing records for unit "${options.unit}". Deleting...`);
      for (const item of itemsToDelete) {
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
  } else {
    console.log("No existing records found to clean up.");
  }
}
