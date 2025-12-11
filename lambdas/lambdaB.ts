import { SQSHandler } from "aws-lambda";

export const handler: SQSHandler = async (event) => {
  for (const record of event.Records) {
    const body = record.body;
    let faultyItem: any = null;
    try {
      faultyItem = JSON.parse(body);
    } catch (err) {
      // If the body is an SNS-wrapped message, try to parse that
      try {
        const maybeSns = JSON.parse(body);
        if (maybeSns?.Message) {
          faultyItem = JSON.parse(maybeSns.Message);
        }
      } catch (e) {
        // leave faultyItem null
      }
    }

    if (faultyItem) {
      console.error("Faulty stock item received:", JSON.stringify(faultyItem));
      console.error("Reason: marketValue is less than minimumPrice");
    } else {
      console.error("Faulty stock item received (unparseable):", body);
    }
  }
};
