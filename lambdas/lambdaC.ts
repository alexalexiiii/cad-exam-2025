/* eslint-disable import/extensions, import/no-absolute-path */
import { SNSEvent, Context } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";

const ddbDocClient = createDDbDocClient();

// Lambda handler
export const handler = async (event: SNSEvent, _ctx: Context) => {
  console.log("Event ", JSON.stringify(event));

  // for each SNS record (should be only one in this setup)
  for (const record of event.Records) {
    const message = record.Sns?.Message || record.Sns?.Message;

    // parse the bid message
    // https://docs.aws.amazon.com/sns/latest/dg/sns-message-and-json-formats.html
    let bid: any;
    try {
      bid = JSON.parse(message);
    } catch (err) {
      console.error("Failed to parse bid message", message);
      continue;
    }

    // attach timestamp
    bid.timestamp = new Date().toString();

    // use a try catch to log any DynamoDB errors
    // and re-throw to indicate failure to lambd;a 
    try {
      await ddbDocClient.send(
        new PutCommand({
          TableName: process.env.BIDS_TABLE,
          Item: bid,
        })
      );
      console.log("Wrote bid to table", JSON.stringify(bid));
    } catch (err) {
      console.error("Failed to write bid to table", err);
      throw err;
    }
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
