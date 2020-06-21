const AWS = require("aws-sdk");

const tableName = 'site-diff-ddb-f8dddec'
const ddb = new AWS.DynamoDB({
    region: "eu-west-1",

})

const date = new Date()
const day = date.getDay()
const hours = date.getHours()
const mins = date.getMinutes()
console.log(`Querying records with values day: ${day}, hour: ${hours}, min: ${mins}`)

async function a() {
    try {

        const params = {
            RequestItems: {
                [tableName]: {
                    Keys: [
                        { 'm': { 'S': `* * 57` } },
                        { 'm': { 'S': `* ${hours} ${mins}` } },
                        { 'm': { 'S': `${day} ${hours} ${mins}` } }
                    ]
                }
            }
        };
        const data = await ddb.batchGetItem(params).promise()
        console.log(`Query succeeded. Received ${data.Responses[tableName].length} items`);
        const items = data.Responses[tableName]
            .filter(it => it.active === "true")
            .map(it => ({ url: it.url.S, selector: it.selector.S, user: it.user.S }));
        console.log(items)
    } catch (e) {
        console.error(e)
    }
}

a()
