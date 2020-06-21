package differ


import com.amazonaws.services.lambda.runtime.events.DynamodbEvent
import org.junit.Test
import software.amazon.awssdk.auth.credentials.AwsCredentialsProvider
import software.amazon.awssdk.auth.credentials.ProfileCredentialsProvider
import software.amazon.awssdk.core.sync.ResponseTransformer
import software.amazon.awssdk.services.dynamodb.DynamoDbClient
import software.amazon.awssdk.services.dynamodb.model.AttributeValue
import software.amazon.awssdk.services.dynamodb.model.ComparisonOperator
import software.amazon.awssdk.services.dynamodb.model.Condition
import software.amazon.awssdk.services.dynamodb.model.QueryRequest
import software.amazon.awssdk.services.s3.S3Client
import software.amazon.awssdk.services.s3.model.GetObjectRequest


class AppTest {

    data class ScraperRecord(val hash: String, val scrapeTime: Long, val url: String, val user: String)

    @Test
    fun ddbQueryTest() {
        val scraperRecord = ScraperRecord("aHR0cHM6Ly90cmF2ZWxidWJibGVzLmluZm8v", 1592197632, "https://travelbubbles.info/", "jussi")
        val ddbClient = DynamoDbClient.builder()
                .region(region)
                .credentialsProvider(ProfileCredentialsProvider.builder().profileName("sam").build())
                .build()
        val hashCondition = Condition
                .builder()
                .comparisonOperator(ComparisonOperator.EQ)
                .attributeValueList(AttributeValue.builder()
                        .s(scraperRecord.hash)
                        .build()
                ).build()
        val sortCondition = Condition
                .builder()
                .comparisonOperator(ComparisonOperator.LE)
                .attributeValueList(AttributeValue.builder()
                        .n(scraperRecord.scrapeTime.toString())
                        .build()
                ).build()

        println("Query building successful")
        val query = ddbClient.query(QueryRequest.builder()
                .tableName("scraped-sites-ddb-678d2ad")
                .keyConditions(mutableMapOf(
                        "h" to hashCondition,
                        "sort" to sortCondition
                ))
                .limit(2)
                .build())
        println("Query successful")

        println("Received ${query.items().count()} items")
        query.items().forEach {
            println(it)
        }
    }


    @Test
    @Throws(Exception::class)
    fun s3QueryTest() {

        val s3: S3Client = S3Client.builder().region(region).build()
        val key = "jussi/aHR0cDovL2Z1dGlzZm9ydW0yLm9yZw==-1592551515"

        val s3Object = s3.getObject(GetObjectRequest.builder().bucket(bucket).key(key).build(),
                ResponseTransformer.toInputStream())
                .bufferedReader().use { it.readText() }
        println(s3Object)
    }
}
