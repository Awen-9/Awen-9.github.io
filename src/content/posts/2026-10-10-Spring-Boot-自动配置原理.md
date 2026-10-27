---
title: "Spring Boot 自动配置到底是怎么生效的"
description: "从 @SpringBootApplication 一路拆到 AutoConfiguration.imports，把「加个 starter 就能用」这件事说清楚。"
date: 2026-10-10T13:40:00.000Z
updated: 2026-10-10T16:23:42.830Z
category: "源码笔记"
tags: ["Spring Boot", "Java", "源码"]
---

刚开始用 Spring Boot 的时候，最好奇的就是：为什么往 `pom.xml` 里丢一个 starter，重启之后那些 Bean 就自己冒出来了？没人写 `@Bean`，也没人 import 什么。这篇就把这条链路从头到尾捋一遍。

## 一切的入口：@SpringBootApplication

平时我们只在启动类上写一个注解，但它其实是个「三合一」：

```java
@SpringBootConfiguration   // 本质是 @Configuration
@EnableAutoConfiguration   // 自动配置的开关
@ComponentScan             // 扫描启动类所在包及子包
public @interface SpringBootApplication { }
```

真正和自动配置有关的是中间那个 `@EnableAutoConfiguration`。点进去看：

```java
@Import(AutoConfigurationImportSelector.class)
public @interface EnableAutoConfiguration { }
```

`@Import` 把一个 `ImportSelector` 塞进了容器。Spring 在处理 `@Import` 时，会调用这个 selector 的 `selectImports()`，把返回的类名数组当成配置类全部注册进去。自动配置的「魔法」就发生在这个方法里。

## 配置文件从 spring.factories 换成了 .imports

`selectImports()` 做的事很朴素：找出所有依赖 jar 里「声明的自动配置类全名」。早期（Spring Boot 2.6 及以前）这个清单放在工程的 `META-INF/spring.factories` 里：

```properties
org.springframework.boot.autoconfigure.EnableAutoConfiguration=\
com.example.FooAutoConfiguration,\
com.example.BarAutoConfiguration
```

2.7 之后官方觉得 `spring.factories` 这个文件被各种功能混用太乱，于是拆出一个专用文件 `META-INF/spring/org.springframework.boot.autoconfigure.AutoConfiguration.imports`，一行一个类名：

```
com.example.FooAutoConfiguration
com.example.BarAutoConfiguration
```

两种格式在过渡期是都认的，但新项目直接写 `.imports` 就好。

## 关键在「条件注解」：加了不等于生效

注意，上面只是把**候选**类都注册成配置类了，并不代表每个都真的创建 Bean。每个 `XxxAutoConfiguration` 上都挂着一堆条件注解，条件不满足就整体跳过：

```java
@AutoConfiguration
@ConditionalOnClass(DataSource.class)          // classpath 里得有这个类
@ConditionalOnMissingBean(DataSource.class)    // 用户没自己定义过才生效
@EnableConfigurationProperties(DataSourceProperties.class)
public class DataSourceAutoConfiguration {
    @Bean
    @ConditionalOnProperty(name = "spring.datasource.url")
    public DataSource dataSource(DataSourceProperties props) {
        return props.initializeDataSourceBuilder().build();
    }
}
```

常用的几个条件：

注解

判断内容

`@ConditionalOnClass`

classpath 里**存在**某个类

`@ConditionalOnMissingClass`

classpath 里**不存在**某个类

`@ConditionalOnBean` / `OnMissingBean`

容器里**有没有**某个 Bean

`@ConditionalOnProperty`

某个配置项的值 / 是否存在

`@ConditionalOnWebApplication`

当前是不是 Web 环境

这套组合下来，就实现了「你引了依赖、又没自己配，我才兜底」的效果——这也是为什么你一旦自己 `new` 了一个 `DataSource`，自动配置的就会自动让位。

## 自己写一个 starter

理解了机制，写 starter 就是照葫芦画瓢。目录：

```
hello-spring-boot-starter/
├── pom.xml
└── src/main/
    ├── java/com/example/hello/
    │   ├── HelloAutoConfiguration.java
    │   └── HelloService.java
    └── resources/META-INF/spring/
        └── org.springframework.boot.autoconfigure.AutoConfiguration.imports
```

```java
@AutoConfiguration
@ConditionalOnClass(HelloService.class)
@EnableConfigurationProperties(HelloProperties.class)
public class HelloAutoConfiguration {

    @Bean
    @ConditionalOnMissingBean
    public HelloService helloService(HelloProperties props) {
        return new HelloService(props.getPrefix());
    }
}
```

`HelloProperties` 用 `@ConfigurationProperties("hello")` 绑定 `hello.prefix`，这样使用方在 `application.yml` 里写一行就能改行为。最后别忘了一个「空」的启动模块把 `autoconfigure` 模块和需要的依赖打进去。

## 出问题时的救命开关：debug 报告

条件注解很优雅，但「为什么我的 Bean 没生效」也特别难查。这时候打开：

```bash
java -jar app.jar --debug
```

或者在 `application.yml` 里写 `debug: true`，启动日志里会打印一份 **CONDITIONS EVALUATION REPORT**，正面（Positive matches）是生效的、反面（Negative matches）是被跳过的，以及**为什么被跳过**。我第一次靠它定位到「自己的 Bean 比自动配置先注册了，导致自动配置整块让位」，从此每次引入新依赖都习惯先看它一眼。

## 小结

一句话概括整条链路：

> `@SpringBootApplication` → `@EnableAutoConfiguration` → `ImportSelector` 读取所有 jar 的 `.imports` 清单 → 把候选配置类注册进容器 → 条件注解决定谁真生效。

所谓「约定优于配置」，底层其实就是「先给一堆带条件的默认值，你再按需覆盖」。
