package differ

import org.junit.Test
import java.nio.file.Files
import java.nio.file.Path

class DiffTest {

    @Test
    fun inputTest() {
        val one = Files.readString(Path.of("src/test/resources/aHR0cDovL2Z1dGlzZm9ydW0yLm9yZw==-1592551515"))
        val two = Files.readString(Path.of("src/test/resources/aHR0cDovL2Z1dGlzZm9ydW0yLm9yZw==-1592555114"))
        val diff = generateDff(one.trim(), two.trim())
        println(diff)
        Files.writeString(Path.of("src/test/resources/diff-result.html"), """
            <html>
                <head>
                    <link rel="stylesheet" type="text/css" href="https://cdn.jsdelivr.net/gh/DaisyDiff/DaisyDiff@5f7a3960f531179f59b0abdf6947efb0b72eaaa6/css/diff.css"></link>
                </head>
            $diff
            </html>
        """.trimIndent())
    }

}
