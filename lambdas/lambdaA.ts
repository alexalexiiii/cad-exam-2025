/* eslint-disable import/extensions, import/no-absolute-path */
import { SQSHandler } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";
import { DBAuctionItem , AuctionItem } from "../shared/types";
const ddbDocClient = createDDbDocClient();

export const handler: SQSHandler = async (event) => {
  console.log("Event ", JSON.stringify(event));

  for (const record of event.Records) {
    const auctionItem = JSON.parse(record.body) as AuctionItem;
    const messageAttributes = JSON.parse(record.body).MessageAttributes || {};
    const auctionType = messageAttributes.auctionType?.Value;

    // Only process messages that explicitly set auctionType to a known value
    const allowed = new Set(["Public", "Private", "Online"]);
    if (!auctionType || !allowed.has(auctionType)) {
      console.log(`Ignoring add-stock-item message. auctionType='${auctionType ?? "<missing>"}'`);
      continue;
    }

    // https://docs.aws.amazon.com/lambda/latest/dg/with-sqs.html
    // If marketValue is less than minimumPrice, throw so message will be moved to DLQ
    // stringify auctionItem for cloudwatch logging
    if (
      typeof auctionItem.marketValue === "number" &&
      typeof auctionItem.minimumPrice === "number" &&
      auctionItem.marketValue < auctionItem.minimumPrice
    ) {
      console.error("Rejecting faulty add-stock-item: marketValue < minimumPrice", JSON.stringify(auctionItem));
      throw new Error("marketValue is less than minimumPrice");
    }

    const dbItem: DBAuctionItem = {
      ...auctionItem,
      auctionType: auctionType,
    };

    await ddbDocClient.send(
      new PutCommand({
        TableName: process.env.TABLE_NAME,
        Item: {
          ...dbItem,
        },
      })
    );
  }
};

function createDDbDocClient() {
  const ddbClient = new DynamoDBClient({ region: process.env.REGION });
  const marshallOptions = {
    convertEmptyValues: true,
    removeUndefinedValues: true,
    convertClassInstanceToMap: true,
  };
  const unmarshallOptions = {
    wrapNumbers: false,
  };
  const translateConfig = { marshallOptions, unmarshallOptions };
  return DynamoDBDocumentClient.from(ddbClient, translateConfig);
}
