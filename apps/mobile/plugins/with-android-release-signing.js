const { withAppBuildGradle } = require('expo/config-plugins');

/**
 * Ký bản RELEASE bằng upload key thật, thay cho debug key của template.
 *
 * Template Expo sinh ra `buildTypes.release { signingConfig signingConfigs.debug }` kèm đúng một
 * dòng comment "Caution!". Google Play TỪ CHỐI mọi file ký bằng debug key, nên dòng đó phải đổi
 * trước bản nộp đầu tiên.
 *
 * Vì sao là config plugin chứ không sửa thẳng `android/app/build.gradle`: `apps/mobile/.gitignore`
 * bỏ qua `/android`. Thư mục đó do `expo prebuild` sinh ra, nên mọi sửa tay trong đó biến mất ở
 * lần `prebuild --clean` kế tiếp — cùng loại bẫy với cờ `--enable-native-access` (xem
 * `with-android-gradle-jvmargs`). Sửa ở đây thì mỗi lần sinh lại native là cấu hình ký tự quay về.
 *
 * Bí mật KHÔNG nằm trong repo. Bốn giá trị dưới đây đọc từ Gradle property, nguồn tuỳ nơi chạy:
 *
 *   - Máy dev:  `C:/Users/<ten>/.gradle/gradle.properties` (ngoài repo, ngoài mọi commit)
 *   - CI/EAS:   biến môi trường `ORG_GRADLE_PROJECT_XEPRIME_UPLOAD_*` hoặc cờ `-P`
 *
 *   XEPRIME_UPLOAD_STORE_FILE=C:/Users/<ten>/keystores/xeprime-upload.jks
 *   XEPRIME_UPLOAD_STORE_PASSWORD=...
 *   XEPRIME_UPLOAD_KEY_ALIAS=xeprime-upload
 *   XEPRIME_UPLOAD_KEY_PASSWORD=...
 *
 * Thiếu chúng thì bản DEBUG vẫn build bình thường (máy của người chỉ chạy `expo run:android`
 * không cần biết upload key tồn tại), còn bản RELEASE dừng ngay ở bước cấu hình với thông báo
 * chỉ đúng chỗ thiếu — xem chốt chặn `taskGraph.whenReady` ở cuối file này. Chốt chặn đó tồn tại
 * vì hỏng ở đây là loại hỏng IM LẶNG: không có nó, một bản `.aab` ký bằng debug key vẫn build
 * thành công sau 15 phút và chỉ bị chặn lúc upload lên Play.
 */

/** Khối `signingConfigs.release`, chèn ngay đầu khối `signingConfigs` sẵn có. */
const RELEASE_SIGNING_CONFIG = `signingConfigs {
        release {
            if (project.hasProperty('XEPRIME_UPLOAD_STORE_FILE')) {
                storeFile file(project.property('XEPRIME_UPLOAD_STORE_FILE'))
                storePassword project.property('XEPRIME_UPLOAD_STORE_PASSWORD')
                keyAlias project.property('XEPRIME_UPLOAD_KEY_ALIAS')
                keyPassword project.property('XEPRIME_UPLOAD_KEY_PASSWORD')
            }
        }`;

/**
 * Dòng chọn key cho `buildTypes.release`.
 *
 * Ba lệnh của template (hai dòng comment + `signingConfig signingConfigs.debug`) bị thay trọn gói:
 * giữ lại comment "Caution!" là để lại một lời cảnh báo đã hết đúng.
 */
const RELEASE_SIGNING_SELECTOR = `signingConfig project.hasProperty('XEPRIME_UPLOAD_STORE_FILE') ? signingConfigs.release : signingConfigs.debug`;

/** Regex bắt đúng ba dòng đó — tolerant với thụt lề, chặt với nội dung. */
const TEMPLATE_DEBUG_SIGNING = /\/\/ Caution! In production[\s\S]*?signingConfig signingConfigs\.debug/;

/**
 * Chốt chặn chạy lúc Gradle dựng xong task graph: biết chắc bản đang build là release hay không,
 * điều mà khối `signingConfigs` (chạy ở pha cấu hình, trước khi biết task nào sẽ chạy) không biết.
 */
const RELEASE_KEY_GUARD = `
// === XePrime: chốt chặn upload key (sinh bởi plugins/with-android-release-signing.js) ===
gradle.taskGraph.whenReady { graph ->
    def buildingRelease = graph.allTasks.any { t ->
        t.project == project && t.name ==~ /(?i)(bundle|assemble|package)Release.*/
    }
    if (buildingRelease && !project.hasProperty('XEPRIME_UPLOAD_STORE_FILE')) {
        throw new GradleException("""
Thiếu upload key: không tìm thấy Gradle property XEPRIME_UPLOAD_STORE_FILE.
Bản release sẽ bị ký bằng DEBUG key, và Google Play từ chối mọi file ký kiểu đó.
Khai 4 giá trị XEPRIME_UPLOAD_* trong ~/.gradle/gradle.properties — xem docblock của
apps/mobile/plugins/with-android-release-signing.js. Chỉ cần bản debug thì dùng assembleDebug.
""".stripIndent().trim())
    }
}
`;

module.exports = function withAndroidReleaseSigning(config) {
  return withAppBuildGradle(config, (cfg) => {
    const gradle = cfg.modResults;

    if (gradle.language !== 'groovy') {
      throw new Error(
        `[with-android-release-signing] app/build.gradle dang o ${gradle.language}, plugin nay chi vá được bản Groovy.`,
      );
    }

    // Prebuild có thể chạy lại trên thư mục android đã vá; đừng chèn hai lần.
    if (gradle.contents.includes('XEPRIME_UPLOAD_STORE_FILE')) return cfg;

    let contents = gradle.contents;

    /*
     * Cả hai phép thay dưới đây đều PHẢI khớp. Template Expo đổi cách viết là chuyện có thật ở
     * mỗi bản SDK, và hỏng ở đây không hiện ra như một lỗi build — nó hiện ra ba tuần sau, dưới
     * dạng một file `.aab` bị Play từ chối. Nên ném lỗi ngay thay vì `return cfg` im lặng.
     */
    if (!contents.includes('signingConfigs {')) {
      throw new Error(
        '[with-android-release-signing] Khong tim thay khoi `signingConfigs {` trong app/build.gradle.',
      );
    }
    contents = contents.replace('signingConfigs {', RELEASE_SIGNING_CONFIG);

    if (!TEMPLATE_DEBUG_SIGNING.test(contents)) {
      throw new Error(
        '[with-android-release-signing] Khong tim thay `signingConfig signingConfigs.debug` cua buildTypes.release.',
      );
    }
    contents = contents.replace(TEMPLATE_DEBUG_SIGNING, RELEASE_SIGNING_SELECTOR);

    gradle.contents = contents + RELEASE_KEY_GUARD;
    return cfg;
  });
};
