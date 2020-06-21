plugins {
  id("com.github.johnrengelman.shadow")
}

dependencies {
  implementation(project(":daisydiff"))
  implementation("com.amazonaws:aws-lambda-java-core:1.2.0")
  implementation("com.amazonaws:aws-lambda-java-events:3.1.0")
  implementation("com.amazonaws:aws-lambda-java-events-sdk-transformer:2.0.0")
  implementation("software.amazon.awssdk:s3:2.13.35")
  implementation("software.amazon.awssdk:dynamodb:2.13.35")
  implementation("org.jetbrains.kotlin:kotlin-stdlib-jdk8:1.3.72")
  implementation("com.fasterxml.jackson.module:jackson-module-kotlin:2.11.+")
  testImplementation("junit:junit:4.12")
  testImplementation("org.jetbrains.kotlin:kotlin-test:1.3.72")
  testImplementation("org.jsoup:jsoup:1.12.1")
}
