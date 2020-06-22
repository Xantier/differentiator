# Serverless HTML site differ application

## Tech

* Infrastructure as code: Pulumi
* Functions: Kotlin, Node.js
* Web scraper: AWS Lambda Chrome Layer
* Diffing functionality: DaisyDiff

## Functionality

Spins up a set of lambda functions, DynamoDB tables and an S3 bucket in AWS. Adds a Cloudwatch event rule that triggers fanout function every minute. Fanout function queries `site-diff-ddb` DynamoDB table that contains three character cron statements (day hour minute). Fanout function is also triggered when a new record is added to `site-diff-ddb` table. Fanout function triggers downstream `site-scraper` lambda which uses AWS Lambda Chrome layer to spin up a headless Chrome instance and retrieve defined url. After website has been fetched, the `site-scraper` saves the received HTML into S3 bucket and writes its information into `scraped-sites-ddb` table. This table has a streaming event which trigger `site-differ` lambda function. `site-differ` retrieves the information of the scraped site and the previous scraped site from the DynamoDB table and based on that information downloads the saved HTML. After retrieving the HTML, it compares the two and if they are different, saves the diff (with some extra CSS) into the same S3 table under a folder indicating the site name. 


## Configuration

The stack can be spun up with Pulumi by using the command `pulumi up`. For more information how to install Pulumi, take a look at https://www.pulumi.com/.

To trigger the diffing flow, insert a new record into `site-diff-ddb` table. See record schema below. The scraped site will be saved in a format `base64_encoded_URL-timestamp` into the S3 bucket, prefixed by username. The diffed HTML will be saved into the same S3 bucket prefixed with a folder name `base64_encoded_url`.  

### site-diff-ddb DynamoDB table schema
```
{
 m: String, // Required, cron expression in a format `day-of-week hour minute`, Eg. `4 17 5` (Thur 5:05 pm) to indicate when site should be scraped
 url: String, // Required, the url of the site we are scraping
 active: Boolean, // Required, a flag to turn sites on/off
 user: String, // Required, username of scraper. Used as a folder name in S3
 selector: String, // Required, CSS selector to indicate which part of the site is scraped/diffed
 ttl: timestamp // Optional, timestamp in epoch format to indicate when to delete the record from the DDB table 
}
```


# License

MIT, do whatever you want.
