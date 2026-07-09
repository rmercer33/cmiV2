import { test } from "node:test";
import assert from "node:assert";
import { execSync } from "child_process";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, ScanCommand, DeleteCommand } from "@aws-sdk/lib-dynamodb";

const client = new DynamoDBClient({
  endpoint: "http://localhost:8000",
  region: "us-east-1",
  credentials: {
    accessKeyId: "dummy",
    secretAccessKey: "dummy"
  }
});
const docClient = DynamoDBDocumentClient.from(client);

test("Integration Test - Parse and Insert to Local DynamoDB", async () => {
  // 1. Clear any existing records for source = wom
  const scanRes = await docClient.send(new ScanCommand({ TableName: "cmiSearch" }));
  for (const item of scanRes.Items || []) {
    if (item.source === "wom") {
      await docClient.send(new DeleteCommand({
        TableName: "cmiSearch",
        Key: {
          source: item.source,
          sk: item.sk
        }
      }));
    }
  }

  // 2. Run the parser script via run-parser.sh (First execution)
  const cmd = "./run-parser.sh sample.md -s wom -b wok -u l01";
  console.log(`Executing first run: ${cmd}`);
  const output1 = execSync(cmd).toString();
  console.log(output1);
  assert.match(output1, /No existing records found to clean up/);

  // 3. Run the parser script again (Second execution)
  console.log(`Executing second run to test duplicate prevention: ${cmd}`);
  const output2 = execSync(cmd).toString();
  console.log(output2);
  assert.match(output2, /Found 5 existing records for unit "l01"\. Deleting\.\.\./);

  // 4. Scan the database to verify insertions
  const finalScan = await docClient.send(new ScanCommand({ TableName: "cmiSearch" }));
  const womItems = finalScan.Items.filter(item => item.source === "wom");

  // There should be exactly 5 items from sample.md
  assert.strictEqual(womItems.length, 5);

  // Validate sk values and structure
  const headings = womItems.filter(item => item.type === "h").sort((a, b) => a.sk.localeCompare(b.sk));
  const paragraphs = womItems.filter(item => item.type === "p").sort((a, b) => a.sk.localeCompare(b.sk));

  assert.strictEqual(headings.length, 2);
  assert.strictEqual(paragraphs.length, 3);

  assert.strictEqual(headings[0].sk, "wok/002:l01/0001#h1");
  assert.strictEqual(headings[0].text, "Heading Level 1 (My Special Title)");

  // Heading level 2 is after the omitted paragraph (sequence 3), so its sequence is 4 (h2)
  assert.strictEqual(headings[1].sk, "wok/002:l01/0004#h2");
  assert.strictEqual(headings[1].text, "Heading Level 2");

  assert.strictEqual(paragraphs[0].sk, "wok/002:l01/0002#p1");
  assert.strictEqual(paragraphs[0].text, "This is the first paragraph by Author Name. It is quite interesting.");

  // Sequence 3 is consumed by the omitted paragraph (p2)
  assert.strictEqual(paragraphs[1].sk, "wok/002:l01/0005#p3");
  assert.strictEqual(paragraphs[1].text, "This is the second paragraph. It contains more exciting details.");

  assert.strictEqual(paragraphs[2].sk, "wok/002:l01/0006#p4");
  assert.strictEqual(paragraphs[2].text, "This is the third paragraph, following immediately after the second paragraph.");
});

test("Integration Test - Fail Gracefully on Missing Markdown File", () => {
  const cmd = "./run-parser.sh non-existent-file.md -s wom -b wok -u l01";
  console.log(`Executing expected-to-fail command: ${cmd}`);
  
  let threw = false;
  try {
    execSync(cmd, { stdio: "pipe" });
  } catch (error) {
    threw = true;
    const stderr = error.stderr.toString();
    console.log("Captured stderr:", stderr);
    assert.match(stderr, /Error: The file "non-existent-file.md" does not exist/);
    assert.strictEqual(error.status, 1);
  }
  
  assert.strictEqual(threw, true, "Expected command to fail but it succeeded");
});
