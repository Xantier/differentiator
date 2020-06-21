plugins {
    id("com.github.johnrengelman.shadow").version("5.0.0")
    kotlin("jvm") version "1.3.72"
}

repositories {
    jcenter()
}

val compileKotlin: org.jetbrains.kotlin.gradle.tasks.KotlinCompile by tasks

dependencies {
    implementation(project(path = ":differ", configuration = "shadow"))
    implementation("org.jetbrains.kotlin:kotlin-stdlib-jdk8")
    implementation("com.amazonaws:aws-lambda-java-core:1.2.0")
    implementation("io.symphonia:lambda-logging:1.0.3")
}

allprojects {
    tasks.withType<org.jetbrains.kotlin.gradle.tasks.KotlinCompile>().configureEach {
        kotlinOptions.suppressWarnings = true
        compileKotlin.targetCompatibility = "11"
        kotlinOptions.jvmTarget = "11"
    }

    apply {
        plugin("org.jetbrains.kotlin.jvm")
    }
    repositories {
        jcenter()
        maven("https://maven.nuxeo.org/nexus/content/repositories/vendor-snapshots")
        maven("https://maven.nuxeo.org/nexus/content/repositories/vendor-releases")
        maven("https://maven.nuxeo.org/nexus/content/groups/public")
        maven("https://maven.nuxeo.org/nexus/content/groups/public-snapshot")
    }
}
