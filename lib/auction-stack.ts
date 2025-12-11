import * as cdk from "aws-cdk-lib";
import * as lambdanode from "aws-cdk-lib/aws-lambda-nodejs";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as events from "aws-cdk-lib/aws-lambda-event-sources";
import * as sqs from "aws-cdk-lib/aws-sqs";
import * as sns from "aws-cdk-lib/aws-sns";
import * as subs from "aws-cdk-lib/aws-sns-subscriptions";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import { items } from "../seed/auctionStock";
import { generateBatch } from "../shared/util";
import * as custom from "aws-cdk-lib/custom-resources";
import { Construct } from "constructs";

export class AuctionStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const auctioStock = new dynamodb.Table(this, "StockTable", {
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      partitionKey: { name: "id", type: dynamodb.AttributeType.STRING },
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      tableName: "Stock",
    });

    const bids = new dynamodb.Table(this, "BidsTable", {
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      partitionKey: { name: "bidId", type: dynamodb.AttributeType.NUMBER },
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      tableName: "Bids",
    });

    new custom.AwsCustomResource(this, "itemsddbInitData", {
      onCreate: {
        service: "DynamoDB",
        action: "batchWriteItem",
        parameters: {
          RequestItems: {
            [auctioStock.tableName]: generateBatch(items),
          },
        },
        physicalResourceId: custom.PhysicalResourceId.of("itemsddbInitData"), //.of(Date.now().toString()),
      },
      policy: custom.AwsCustomResourcePolicy.fromSdkCalls({
        resources: [auctioStock.tableArn],
      }),
    });

    // Integration infrastructure

    const queue = new sqs.Queue(this, "AuctionQ", {
      receiveMessageWaitTime: cdk.Duration.seconds(10),
    });

    const topic = new sns.Topic(this, "AuctionTopic", {
      displayName: "New Image topic",
    });

    // updated, with filter policy
    // application processing add stock item messages whos item attribute
    // is public, private or online
    topic.addSubscription(
      new subs.SqsSubscription(queue, {
      rawMessageDelivery: true,
      filterPolicy: {
        auctionType: sns.SubscriptionFilter.stringFilter({
        allowlist: ["Public", "Private", "Online"],
        }),
      },
      })
    );

    // Lambda functions

    const lambdaA = new lambdanode.NodejsFunction(this, "lambdaA", {
      runtime: lambda.Runtime.NODEJS_22_X,
      entry: `${__dirname}/../lambdas/lambdaA.ts`,
      timeout: cdk.Duration.seconds(15),
      memorySize: 128,
      environment: {
        TABLE_NAME: auctioStock.tableName,
        REGION: "eu-west-1",
      },
    });

    const lambdaB = new lambdanode.NodejsFunction(this, "lambdaB", {
      runtime: lambda.Runtime.NODEJS_22_X,
      entry: `${__dirname}/../lambdas/lambdaB.ts`,
      timeout: cdk.Duration.seconds(15),
      memorySize: 128,
      environment: {
        REGION: "eu-west-1",
      },
    });

    const lambdaC = new lambdanode.NodejsFunction(this, "lambdaC", {
      runtime: lambda.Runtime.NODEJS_22_X,
      entry: `${__dirname}/../lambdas/lambdaC.ts`,
      timeout: cdk.Duration.seconds(15),
      memorySize: 128,
      environment: {
        REGION: "eu-west-1",
      },
    });

    // Subscriptions

    topic.addSubscription(
      new subs.SqsSubscription(queue, {
        rawMessageDelivery: true,
      })
    );

    lambdaA.addEventSource(
      new events.SqsEventSource(queue, {
        batchSize: 5,
        maxBatchingWindow: cdk.Duration.seconds(6),
      })
    );

    // Permissions

    auctioStock.grantReadWriteData(lambdaA);
    
    // Output

    new cdk.CfnOutput(this, "SNS Topic ARN", {
      value: topic.topicArn,
    });
  }
}
