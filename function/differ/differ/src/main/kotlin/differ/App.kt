package differ

import com.amazonaws.services.lambda.runtime.Context
import com.amazonaws.services.lambda.runtime.RequestHandler
import com.amazonaws.services.lambda.runtime.events.DynamodbEvent
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import org.outerj.daisy.diff.helper.NekoHtmlParser
import org.outerj.daisy.diff.html.HTMLDiffer
import org.outerj.daisy.diff.html.HtmlSaxDiffOutput
import org.outerj.daisy.diff.html.TextNodeComparator
import org.outerj.daisy.diff.html.dom.DomTreeBuilder
import org.xml.sax.ContentHandler
import org.xml.sax.InputSource
import org.xml.sax.SAXException
import software.amazon.awssdk.core.sync.RequestBody
import software.amazon.awssdk.core.sync.ResponseTransformer
import software.amazon.awssdk.regions.Region
import software.amazon.awssdk.services.dynamodb.DynamoDbClient
import software.amazon.awssdk.services.dynamodb.model.ComparisonOperator
import software.amazon.awssdk.services.dynamodb.model.Condition
import software.amazon.awssdk.services.dynamodb.model.QueryRequest
import software.amazon.awssdk.services.s3.S3Client
import software.amazon.awssdk.services.s3.model.DeleteObjectRequest
import software.amazon.awssdk.services.s3.model.GetObjectRequest
import software.amazon.awssdk.services.s3.model.PutObjectRequest
import java.io.IOException
import java.io.StringReader
import java.io.StringWriter
import java.lang.Exception
import java.util.*
import javax.xml.transform.OutputKeys
import javax.xml.transform.sax.SAXTransformerFactory
import javax.xml.transform.stream.StreamResult
import com.amazonaws.services.lambda.runtime.events.models.dynamodb.AttributeValue as EventAttributeValue

val mapper = jacksonObjectMapper()
val region: Region = Region.EU_WEST_1
val bucket: String = System.getenv("AWS_BUCKET_NAME")

val headers = mapOf("Content-Type" to "application/json", "X-Custom-Header" to "application/json")


class App : RequestHandler<DynamodbEvent, Any> {
    override fun handleRequest(input: DynamodbEvent, context: Context?): Any {
        try {
            println(mapper.writeValueAsString(input))

            val scraperRecord = input.records
                    .filter { it.eventName != "REMOVE" }
                    .map {
                        val img: MutableMap<String, EventAttributeValue> = it.dynamodb.newImage
                        ScraperRecord(img["h"]!!.s, img["sort"]!!.n.toLong(), img["url"]!!.s, img["user"]!!.s)
                    }.firstOrNull()
                    ?: return GatewayResponse(String.format("{ \"message\": \"Non actionable event\""), headers, 200)

            println(mapper.writeValueAsString(scraperRecord))


            val s3: S3Client = S3Client.builder().region(region).build()


            val items = retrieveDdbRecords(scraperRecord)

            val siteRecord = items
                    .map { ob ->
                        val key = constructObjectKey(ob)
                        println("Querying for S3 Object: $key")
                        val s3Object = s3.getObject(GetObjectRequest.builder().bucket(bucket).key(key).build(),
                                ResponseTransformer.toInputStream())
                                .bufferedReader().use { it.readText() }
                        println("Received S3 Object.")
                        SiteRecord(ob, s3Object)
                    }
            println("Received S3 objects")

            if (siteRecord[0].content == siteRecord[1].content) {
                println("Matching string, removing records")

                val ob = siteRecord[0].scraperRecord
                s3.deleteObject(DeleteObjectRequest.builder().bucket(bucket).key(constructObjectKey(ob)).build())
                return GatewayResponse(String.format("{ \"message\": \"No diffs found, deleting duplicate record\""), headers, 200)
            }
            println("Calculating diff for records")
            val diff = generateDff(siteRecord[0].content, siteRecord[1].content)
            println("Diffs calculated successfully")
            if (diff != "") {
                val ob = siteRecord[0].scraperRecord
                println("Saving diff object into S3.")
                val response = s3.putObject(PutObjectRequest.builder()
                        .bucket(bucket)
                        .key("${ob.user}/${ob.hash}-diff/${ob.hash}-${ob.scrapeTime}")
                        .contentType("text/html")
                        .build(),
                        RequestBody.fromString(constructDiffHtml(diff))
                )

                val output = String.format("{ \"message\": \"Diffs found\", \"location\": \"%s\" }", response.eTag())
                return GatewayResponse(output, headers, 200)
            } else {
                println("Failed to construct diff.")
                return GatewayResponse("{ \"message\": \"Failed to construct diff\"}", headers, 500)
            }

        } catch (e: Exception) {
            e.printStackTrace()
            return GatewayResponse("{}", headers, 500)
        }
    }

    private fun constructObjectKey(ob: ScraperRecord): String = "${ob.user}/${ob.hash}-${ob.scrapeTime}"
    private fun constructDiffHtml(diff: String) =
            """
            <html>
                <head>
                    <link rel="stylesheet" type="text/css" href="https://cdn.jsdelivr.net/gh/DaisyDiff/DaisyDiff@5f7a3960f531179f59b0abdf6947efb0b72eaaa6/css/diff.css"></link>
                </head>
            $diff
            </html>
        """

    private fun retrieveDdbRecords(scraperRecord: ScraperRecord): List<ScraperRecord> {

        println("Querying DDB")
        val ddbClient = DynamoDbClient.builder().region(region).build()
        val hashCondition = Condition
                .builder()
                .comparisonOperator(ComparisonOperator.EQ)
                .attributeValueList(software.amazon.awssdk.services.dynamodb.model.AttributeValue.builder()
                        .s(scraperRecord.hash)
                        .build()
                ).build()
        val sortCondition = Condition
                .builder()
                .comparisonOperator(ComparisonOperator.LE)
                .attributeValueList(software.amazon.awssdk.services.dynamodb.model.AttributeValue.builder()
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
        return query.items()!!.map {
            ScraperRecord(it["h"]!!.s(), it["sort"]!!.n().toLong(), it["url"]!!.s(), it["user"]!!.s())
        }
    }
}


fun generateDff(html1: String, html2: String): String {
    try {
        val finalResult = StringWriter()
        val tf = SAXTransformerFactory.newInstance() as SAXTransformerFactory
        val result = tf.newTransformerHandler()
        result.transformer.setOutputProperty(OutputKeys.OMIT_XML_DECLARATION, "yes")
        result.transformer.setOutputProperty(OutputKeys.INDENT, "yes")
        result.transformer.setOutputProperty(OutputKeys.METHOD, "html")
        result.transformer.setOutputProperty(OutputKeys.ENCODING, "UTF-8")
        result.setResult(StreamResult(finalResult))
        val postProcess: ContentHandler = result

        val locale = Locale.getDefault()
        val prefix = "diff"

        val cleaner = NekoHtmlParser()

        val oldSource = InputSource(StringReader(
                html1))
        val newSource = InputSource(StringReader(
                html2))

        val oldHandler = DomTreeBuilder()
        cleaner.parse(oldSource, oldHandler)
        val leftComparator = TextNodeComparator(
                oldHandler, locale)

        val newHandler = DomTreeBuilder()
        cleaner.parse(newSource, newHandler)
        val rightComparator = TextNodeComparator(
                newHandler, locale)

        val output = HtmlSaxDiffOutput(postProcess,
                prefix)
        val differ = HTMLDiffer(output)
        differ.diff(leftComparator, rightComparator)
        return finalResult.toString()
    } catch (e: SAXException) {
        println("SAX exception. Something wrong with daisy init")
        e.printStackTrace()
    } catch (e: IOException) {
        println("IOException. Something wrong with daisy init")
        e.printStackTrace()
    }
    return ""
}


data class SiteRecord(val scraperRecord: ScraperRecord, val content: String)


data class ScraperRecord(val hash: String, val scrapeTime: Long, val url: String, val user: String)
