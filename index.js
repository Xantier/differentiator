"use strict";

const pulumi = require("@pulumi/pulumi");
const aws = require("@pulumi/aws");
const { fanoutFn } = require('./function/fanout');

const siteDiffDDB = new aws.dynamodb.Table("site-diff-ddb", {
    attributes: [
        {
            name: "m",
            type: "S",
        },
        {
            name: "url",
            type: "S",
        }
    ],
    billingMode: "PAY_PER_REQUEST",
    hashKey: "m",
    rangeKey: "url",
    streamEnabled: true,
    streamViewType: 'NEW_IMAGE',
    tags: {
        Environment: "production",
        Name: "site-diff-ddb",
    },
    ttl: {
        attributeName: "ttl",
        enabled: true,
    },
});

const scrapedSitesTable = new aws.dynamodb.Table("scraped-sites-ddb", {
    attributes: [
        {
            name: "h",
            type: "S",
        },
        {
            name: "sort",
            type: "N",
        }
    ],
    billingMode: "PAY_PER_REQUEST",
    hashKey: "h",
    rangeKey: "sort",
    streamEnabled: true,
    streamViewType: 'NEW_IMAGE',
    tags: {
        Environment: "production",
        Name: "scraped-sites-ddb",
    },
    ttl: {
        attributeName: "ttl",
        enabled: true,
    },
});

const lambdaRole = name => new aws.iam.Role(name, {
    assumeRolePolicy: JSON.stringify({
        Version: "2012-10-17",
        Statement: [
            {
                Action: "sts:AssumeRole",
                Principal: {
                    Service: "lambda.amazonaws.com"
                },
                Effect: "Allow",
                Sid: ""
            }
        ]
    }),
});

const differentiatorRole = lambdaRole("site-diff-differ-lambda-role")
const siteScraperRole = lambdaRole("site-diff-fanoutLambdaRole", [])

const scraperTableStreamPolicy = new aws.iam.Policy("scraper-table-stream-policy", {
    policy: scrapedSitesTable.streamArn.apply(streamArn => JSON.stringify({
        Version: "2012-10-17",
        Statement: [{
            Sid: "HandleStreams",
            Effect: "Allow",
            Action: [
                "dynamodb:GetRecords",
                "dynamodb:GetShardIterator",
                "dynamodb:DescribeStream",
                "dynamodb:ListStreams"
            ],
            Resource: streamArn
        }]
    }))
})


const siteScraperDdbReadWritePolicy = new aws.iam.Policy("scraper-table-policy", {
    policy: pulumi.all([scrapedSitesTable.name, siteScraperRole.arn]).apply(siteScraperTableReadwritePolicy)
})

function siteScraperTableReadwritePolicy([ddb]) {
    return JSON.stringify({
        Version: "2012-10-17",
        Statement: [{
            Sid: "ReadWriteTable",
            Effect: "Allow",
            Action: [
                "dynamodb:BatchGetItem",
                "dynamodb:GetItem",
                "dynamodb:Query",
                "dynamodb:Scan",
                "dynamodb:BatchWriteItem",
                "dynamodb:PutItem",
                "dynamodb:UpdateItem"
            ],
            Resource: `arn:aws:dynamodb:*:*:table/${ddb}`
        }]
    });
}

const siteScraperDdbReadWritePolicyAttachment = new aws.iam.PolicyAttachment("site-scraper-ddb-readwrite-policy-attachment", {
    roles: [siteScraperRole, differentiatorRole],
    policyArn: siteScraperDdbReadWritePolicy.arn
});
const siteScraperDdbStreamPolicyAttachment = new aws.iam.PolicyAttachment("site-scraper-ddb-stream-policy-attachment", {
    roles: [differentiatorRole],
    policyArn: scraperTableStreamPolicy.arn
});

const lambdaExecutionPolicyAttachment = new aws.iam.PolicyAttachment("lambda-execution-policy-attachment", {
    roles: [siteScraperRole, differentiatorRole],
    policyArn: aws.iam.ManagedPolicies.AWSLambdaBasicExecutionRole
});


// Create an AWS resource (S3 Bucket)
const bucket = new aws.s3.Bucket("site-diff.ilities.dev");

const bucketPolicy = new aws.s3.BucketPolicy("site-diff-bucket-policy", {
    bucket: bucket.bucket,
    policy: pulumi.all([bucket.bucket, siteScraperRole.arn, differentiatorRole.arn]).apply(diffBucketPutPolicy)
})

function diffBucketPutPolicy([bucketName, scraperRoleArn, differRoleArn]) {
    return JSON.stringify({
        Version: "2012-10-17",
        Statement: [{
            Effect: "Allow",
            Principal: { AWS: [scraperRoleArn, differRoleArn] },
            Action: ["s3:PutObject", "s3:PutObjectAcl", "s3:PutObjectTagging"],
            Resource: [`arn:aws:s3:::${bucketName}/*`]
        }, {
            Effect: "Allow",
            Principal: { AWS: [scraperRoleArn, differRoleArn] },
            Action: ["s3:GetObject", "s3:GetObjectAcl", "s3:GetObjectTagging"],
            Resource: [`arn:aws:s3:::${bucketName}/*`]
        }, {
            Effect: "Allow",
            Principal: { AWS: [differRoleArn] },
            Action: [
                "s3:ListBucket"
            ],
            Resource: [
                `arn:aws:s3:::${bucketName}`
            ]
        }]
    });
}

const lambdaLayer = new aws.lambda.LayerVersion("lambda_layer", {
    compatibleRuntimes: ["nodejs12.x"],
    code: new pulumi.asset.FileArchive("./function/chrome-lambda-layer/chrome_aws_lambda.zip"),
    layerName: "lambda_layer_name",
});

const siteScraperLambda = new aws.lambda.Function("site-scraper", {
    code: new pulumi.asset.FileArchive("./function/scraper/package.zip"),
    handler: "src/scraper.scraperHandler",
    role: siteScraperRole.arn,
    timeout: 30,
    layers: [lambdaLayer.arn],
    memorySize: 1600,
    runtime: "nodejs12.x",
    environment: {
        variables: {
            BUCKET_NAME: bucket.bucket,
            SCRAPED_SITES_TABLE: scrapedSitesTable.name
        }
    }
});


const siteDiffFanOutFunction = new aws.lambda.CallbackFunction("site-diff-DdbEvent-fanout-func", {
    memorySize: 128,
    callback: fanoutFn,
    environment: {
        variables: {
            DDB_TABLE_NAME: siteDiffDDB.name,
            DOWNSTREAM_LAMBDA_NAME: siteScraperLambda.arn
        }
    }
});

const eventSubscription = siteDiffDDB.onEvent("site-diff-ddb-event", siteDiffFanOutFunction, {
    batchSize: 1,
    maximumRecordAgeInSeconds: 180,
    startingPosition: 'TRIM_HORIZON',
});


const siteDifferLambda = new aws.lambda.Function("site-differ", {
    code: new pulumi.asset.AssetArchive({
        "lib/package.jar": new pulumi.asset.FileAsset("./function/differ/package.jar"),
    }),
    runtime: aws.lambda.Java11Runtime,
    timeout: 90,
    handler: "differ.App::handleRequest",
    memorySize: 512,
    role: differentiatorRole.arn,
    environment: {
        variables: {
            AWS_BUCKET_NAME: bucket.bucket
        }
    }
});

scrapedSitesTable.onEvent("scraped-record-ddb-event", siteDifferLambda, {
    batchSize: 1,
    maximumRecordAgeInSeconds: 120,
    startingPosition: 'TRIM_HORIZON',
})


const cloudWatchSiteDiffEventRule = new aws.cloudwatch.EventRule('site-diff-event-rule', {
    scheduleExpression: 'rate(1 minute)'
});
new aws.cloudwatch.EventRuleEventSubscription('site-diff-fanout-trigger', cloudWatchSiteDiffEventRule, siteDiffFanOutFunction)

exports.bucketName = bucket.id;
exports.siteScraperFunction = siteScraperLambda.id;
exports.siteDifferFunction = siteDifferLambda.id;
exports.siteDiffTable = siteDiffDDB.name
exports.scrapedSitesTable = scrapedSitesTable.name
