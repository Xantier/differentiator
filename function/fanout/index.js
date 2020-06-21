const AWS = require("aws-sdk");

function triggerDownstream(items) {
    const lambda = new AWS.Lambda({
        region: "eu-west-1"
    });
    for (const it of items) {
        const functionName = process.env.DOWNSTREAM_LAMBDA_NAME;
        const params = {
            FunctionName: functionName,
            InvokeArgs: JSON.stringify({ url: it.url, selector: it.selector, user: it.user })
        };
        console.log(`Triggering ${functionName}\n with param: ${params.InvokeArgs}`)
        lambda.invokeAsync(params).send()

    }
}

exports.fanoutFn = async (e) => {
    const tableName = process.env.DDB_TABLE_NAME
    const ddb = new AWS.DynamoDB({
        region: "eu-west-1"
    })


    if (e.Records) {
        const items = e.Records
            .filter(it => it.eventName === "INSERT",)
            .map(it => {
            console.log(JSON.stringify(it))
            console.log(JSON.stringify(it.dynamodb))
            return {
                url: it.dynamodb.NewImage.url.S,
                selector: it.dynamodb.NewImage.selector.S,
                user: it.dynamodb.NewImage.user.S
            }
        });
        triggerDownstream(items)
    } else {
        const date = new Date()
        const day = date.getDay()
        const hours = date.getHours()
        const mins = date.getMinutes()
        console.log(`Querying records with day: ${day}, hour: ${hours}, minute: ${mins}`)
        try {
            const queries = [`* * ${mins}`, `* ${hours} ${mins}`, `${day} ${hours} ${mins}`].map(condition => ({
                ExpressionAttributeValues: {
                    ':m': { S: condition }
                },
                KeyConditionExpression: 'm = :m',
                TableName: tableName
            }));

            const data = await Promise.all([ddb.query(queries[0]).promise(), ddb.query(queries[1]).promise(), ddb.query(queries[2]).promise()])
            console.log(`Query succeeded. Received ${data[0].Items.length + data[1].Items.length + data[2].Items.length} items`);
            console.log(JSON.stringify(data))
            const items = data
                .flatMap(it => it.Items)
                .filter(it => it.active.BOOL)
                .map(it => ({ url: it.url.S, selector: it.selector.S, user: it.user.S }));
            triggerDownstream(items)
        } catch (e) {
            console.error("Unable to query. Error:", JSON.stringify(e, null, 2));
            console.log(e)
            return null
        }
    }
}
