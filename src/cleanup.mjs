import { QueryCommand, DeleteCommand } from "@aws-sdk/lib-dynamodb";

/**
 * Checks and deletes existing records in the database with the same partition key
 * and whose range keys start with `${collection}/${book}/${group}/`.
 *
 * @param {DynamoDBDocumentClient} docClient 
 * @param {string} tableName 
 * @param {object} options - CLI options (source, section, collection, book, group, unit)
 */
export async function cleanExistingRecords(docClient, tableName, options) {
  const pathParts = [];
  if (options.collection) pathParts.push(options.collection);
  pathParts.push(options.book);
  if (options.group) pathParts.push(options.group);

  const skPrefix = pathParts.join('/') + '/';
  console.log(`Checking for existing records under source="${options.source}" with prefix="${skPrefix}" and unit="${options.unit}"...`);

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
    // Filter items in memory to match the target unit (handling optional nested path tiers)
    const itemsToDelete = queryResult.Items.filter(item => {
      const skParts = item.sk.split('/');
      const unitPart = skParts.find(part => part.includes(':') && !part.includes('#'));
      if (unitPart) {
        const cleanUnit = unitPart.split(':')[1];
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
