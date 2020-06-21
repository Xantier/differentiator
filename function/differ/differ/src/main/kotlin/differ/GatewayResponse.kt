package differ

import java.util.*

/**
 * POJO containing response object for API Gateway.
 */
class GatewayResponse(val body: String, headers: Map<String, String>?, val statusCode: Int) {
    val headers: Map<String, String>

    init {
        this.headers = Collections.unmodifiableMap(HashMap(headers))
    }
}
