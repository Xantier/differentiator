const AWS = require("aws-sdk");
const chromium = require('chrome-aws-lambda');

AWS.config.update({
    region: "eu-west-1",
});
const s3 = new AWS.S3({
    apiVersion: '2006-03-01',
});

const docClient = new AWS.DynamoDB.DocumentClient();

async function saveFile(e, body) {
    try {
        const now = Date.now();
        const nowDate = new Date(now);
        const scrapeTime = Math.floor(now / 1000);
        const filename = Buffer.from(`${e.url}`, 'binary').toString('base64')
        const destparams = {
            Bucket: process.env.BUCKET_NAME,
            Key: `${e.user}/${filename}-${scrapeTime}`,
            Body: body,
            ContentType: 'text/html; charset=utf-8',
            ACL: 'public-read',
            Metadata: {
                'Access-Control-Allow-Origin': '*',
                'Date': nowDate.toISOString(),
                "Url": e.url
            },

            Tagging: `url=${e.url}&user=${e.user}`
        };

        const request = s3.putObject(destparams);
        const putResult = await request.promise();
        console.log("Upload Success", putResult);
        return await saveDdbRecord({
            h: filename,
            sort: scrapeTime,
            user: e.user,
            url: e.url
        })
    } catch (error) {
        console.log('Failed to upload file');
        console.log(error);
    }
}

async function saveDdbRecord(record) {
    const params = {
        TableName: process.env.SCRAPED_SITES_TABLE,
        Item: record
    };
    try {
        const ddbResponse = await docClient.put(params).promise()
        console.log("Added item:", JSON.stringify(ddbResponse, null, 2));
    } catch (err) {
        console.error("Unable to add item. Error JSON:", JSON.stringify(err, null, 2));
    }
}

exports.scraperHandler = async (e, context, callback) => {

    console.log(e)

    let result = null;
    let browser = null;

    try {
        browser = await chromium.puppeteer.launch({
            args: chromium.args,
            defaultViewport: chromium.defaultViewport,
            executablePath: await chromium.executablePath,
            headless: chromium.headless,
            ignoreHTTPSErrors: true,
        });

        let page = await browser.newPage();

        await page.goto(e.url || 'https://example.com', { waitUntil: 'networkidle2' });
        const innerHTML = await page.evaluate((selector) => document.querySelector(selector).innerHTML, e.selector);
        await saveFile(e, innerHTML)

    } catch (error) {
        return callback(error);
    } finally {
        if (browser !== null) {
            await browser.close();
        }
    }

    return callback(null, result);
};
