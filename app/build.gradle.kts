import java.util.Properties

plugins {
    id("com.android.application")
}

// 摸鱼团子 1.6 · 本地 Android 工程
// 网页资源 src/main/assets | 原生能力 src/main/java/com/dango | 清单与资源 src/main
// JS 与原生通过 MainActivity 注册的 DangoNative 桥接，不依赖任何外部运行器。

// release 签名配置从 keystore/keystore.properties 读取（该目录已在 .gitignore 中，绝不入库）。
// 文件不存在时（例如他人克隆仓库、CI 只构建 debug）自动跳过签名，构建仍可进行。
val keystorePropertiesFile = rootProject.file("keystore/keystore.properties")
val keystoreProperties = Properties().apply {
    if (keystorePropertiesFile.exists()) {
        keystorePropertiesFile.inputStream().use { load(it) }
    }
}
val hasReleaseSigning = keystorePropertiesFile.exists()

android {
    namespace = "com.dango.moyu"
    compileSdk = 34
    buildToolsVersion = "35.0.0"

    defaultConfig {
        applicationId = "com.dango.moyu"
        minSdk = 23
        targetSdk = 34
        // 约定：100000 + 版本标识
        versionCode = 100007
        versionName = "1.6"

        ndk {
            // 当前依赖（androidx.core / material）不携带原生库，APK 实测无 lib/，并未锁定 ABI。
            // 保留过滤是为了将来引入带 .so 的依赖时自动只产出 arm64；需要多架构时调整此处。
            abiFilters += "arm64-v8a"
        }
    }

    signingConfigs {
        if (hasReleaseSigning) {
            create("release") {
                storeFile = rootProject.file(keystoreProperties.getProperty("storeFile"))
                storePassword = keystoreProperties.getProperty("storePassword")
                keyAlias = keystoreProperties.getProperty("keyAlias")
                keyPassword = keystoreProperties.getProperty("keyPassword")
                storeType = keystoreProperties.getProperty("storeType") ?: "PKCS12"
            }
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            if (hasReleaseSigning) {
                signingConfig = signingConfigs.getByName("release")
            }
        }
    }
}

dependencies {
    // Material3 主题（res/values/styles.xml 的 AppBaseTheme）及其 androidx 依赖链。
    // 显式声明 androidx.core 以免版本随 material 漂移。
    implementation("androidx.core:core:1.13.1")
    implementation("com.google.android.material:material:1.12.0")
}
