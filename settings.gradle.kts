import org.gradle.api.initialization.resolve.RepositoriesMode

// 国内网络默认优先走阿里云镜像加速；CI 环境（GitHub Actions 会设置 CI=true）改用官方仓库，
// 避免境外 runner 访问国内镜像反而更慢。官方仓库始终作为兜底存在。

pluginManagement {
    repositories {
        if (System.getenv("CI").isNullOrEmpty()) {
            maven { url = uri("https://maven.aliyun.com/repository/google") }
            maven { url = uri("https://maven.aliyun.com/repository/gradle-plugin") }
            maven { url = uri("https://maven.aliyun.com/repository/central") }
            maven { url = uri("https://maven.aliyun.com/repository/public") }
        }
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}

dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        if (System.getenv("CI").isNullOrEmpty()) {
            maven { url = uri("https://maven.aliyun.com/repository/google") }
            maven { url = uri("https://maven.aliyun.com/repository/public") }
        }
        google()
        mavenCentral()
    }
}

rootProject.name = "摸鱼团子"
include(":app")
