plugins {
    id("com.android.application")
}

// 摸鱼团子 1.6 · 本地 Android 工程
// 网页资源 src/main/assets | 原生能力 src/main/java/com/dango | 清单与资源 src/main
// JS 与原生通过 MainActivity 注册的 DangoNative 桥接，不依赖任何外部运行器。
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
            // 只发布 ARM64：不过滤会把依赖 AAR 携带的 x86/x86_64 原生库打进 APK
            abiFilters += "arm64-v8a"
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    buildTypes {
        release {
            isMinifyEnabled = false
        }
    }
}

dependencies {
    // Material3 主题（res/values/styles.xml 的 AppBaseTheme）及其 androidx 依赖链。
    // 显式声明 androidx.core 以免版本随 material 漂移。
    implementation("androidx.core:core:1.13.1")
    implementation("com.google.android.material:material:1.12.0")
}
