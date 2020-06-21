#!/bin/bash

./gradlew clean shadowJar -DskipTests
mv build/libs/differ-parent-all.jar ./package.jar
