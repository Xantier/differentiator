const AWS = require('aws-sdk-mock');
const fs = require('fs')
const putObjectMock = (params, callback) => {
    s3Payload = params
    fs.writeFileSync("./__tests__/resources/test.result.html", params.Body)
    return callback(null, {
        httpRequest: {
            headers: {}
        }
    });

}
AWS.mock("S3", "putObject", putObjectMock);

const scraper = require('../../../src/scraper.js');

process.env.BUCKET_NAME = 'test-bucket'
let s3Payload = ""

describe('Test Puppeteer Scraping', function () {
    beforeEach(() => {
        s3Payload = ""
    });
    it('Verifies the site is parsed', async () => {
        const payload = {
            url: "https://travelbubbles.info/country/austria",
            selector: '#app'
        }

        await scraper.scraperHandler(payload, null, (result) => {
            console.log(result)
        })

        console.log(s3Payload.Body)
        expect(s3Payload.Body).not.toBeFalsy()
    }, 15000);
});
