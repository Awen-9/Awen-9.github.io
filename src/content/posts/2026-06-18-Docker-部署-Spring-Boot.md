---
title: "Docker 部署 Spring Boot 的三种方式对比"
description: "fat jar、分层镜像、buildpacks 三条路，从镜像体积和构建速度两个维度实测对比，附可抄的 Dockerfile。"
date: 2026-06-18T13:45:00.000Z
updated: 2026-10-10T16:24:06.714Z
category: "工具链"
tags: ["Docker", "部署", "Spring Boot"]
---

把 Spring Boot 打进 Docker，最少有三条路子。镜像体积从 300M 到 80M 都算正常，选法不同，CI 的痛苦程度差很多。

## 方式一：最朴素的 fat jar

先 `mvn package` 打出可执行 jar，再拷进镜像：

```dockerfile
FROM eclipse-temurin:21-jre
WORKDIR /app
COPY target/app.jar app.jar
ENTRYPOINT ["java", "-jar", "app.jar"]
```

能跑，但有两个毛病：

1.  **应用代码和依赖全糊在一个 jar 里**，改一行代码整个层就得重传，每次 CI 推上去都是几百 MB
2.  基础镜像带了一堆用不上的东西，体积偏大

## 方式二：分层镜像（layertools）—— 推荐

Spring Boot 打出的 jar 本身就是分层的，只是默认被压平了。用官方的 `layertools` 把它拆开：

```dockerfile
FROM eclipse-temurin:21-jre AS builder
WORKDIR /build
COPY target/app.jar app.jar
RUN java -Djarmode=layertools -jar app.jar extract

FROM eclipse-temurin:21-jre
WORKDIR /app
# 按「变化频率从低到高」的顺序拷贝，充分利用层缓存
COPY --from=builder /build/dependencies/ ./
COPY --from=builder /build/spring-boot-loader/ ./
COPY --from=builder /build/snapshot-dependencies/ ./
COPY --from=builder /build/application/ ./
ENTRYPOINT ["java", "org.springframework.boot.loader.launch.JarLauncher"]
```

关键在**分层顺序**：`dependencies/` 放最前面，它几乎只在改 `pom.xml` 时才变。日常改业务代码只动最后的 `application/` 层，前面几百 MB 的依赖层直接命中缓存。实测一次推送从 240MB 降到 **两三 MB**。

## 方式三：Buildpacks —— 最省事

连 Dockerfile 都不用写，Spring Boot 集成了 Cloud Native Buildpacks：

```bash
mvn spring-boot:build-image -Dspring-boot.build-image.imageName=myapp:1.0
```

它会自动探测 JDK 版本、自动分层、自动生成优化的启动命令。代价是需要联网拉 builder 镜像、首次构建慢，对国内网络不太友好，自定义也受限。

## 两种方式实测对比

同一份代码，21-temurin 基础镜像：

方式

镜像体积

首次构建

改代码后重建推送

上手成本

fat jar

~310 MB

最快

~240 MB（整层重传）

最低

分层

~285 MB

稍慢

**~3 MB**

中

Buildpacks

~300 MB

最慢

中等

最低（但要联网）

体积差异不大（主要是基础镜像占的），真正的分水岭在**改代码后的重建成本**。所以日常开发迭代，分层是性价比最高的。

## 别忘了这些运行时优化

不管哪种方式，`ENTRYPOINT` 里都建议加上容器友好的 JVM 参数：

```dockerfile
ENV JAVA_OPTS="-XX:MaxRAMPercentage=75.0 -XX:+UseG1GC \
               -XX:+HeapDumpOnOutOfMemoryError -XX:HeapDumpPath=/data/dump"
ENTRYPOINT ["sh", "-c", "java $JAVA_OPTS -jar app.jar"]
```

-   `MaxRAMPercentage=75`：让 JVM 按容器内存上限算堆，而不是按宿主机
-   `HeapDumpOnOutOfMemoryError`：OOM 时留现场，省得事后重建
-   `UseG1GC`：多核容器里比默认更稳

## 用 .dockerignore 再瘦一点

构建上下文传得太大会拖慢每一步：

```
target/
.git/
.idea/
*.iml
node_modules/
README.md
```

## 小结

-   只求能跑：fat jar
-   **要迭代快（推荐）**：`layertools` 分层
-   要全自动且网络允许：buildpacks
-   无论哪种：容器里记得用 `MaxRAMPercentage` 管内存，别让 JVM 误判宿主机内存
