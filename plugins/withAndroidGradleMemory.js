// Android-only: raise the Gradle JVM heap for release builds.
//
// R8 (enabled via expo-build-properties `enableMinifyInReleaseBuilds` so Play's
// DEX obfuscation check passes) runs out of memory under the template's default
// `-Xmx2048m` ("R8: java.lang.OutOfMemoryError: Java heap space"). EAS prebuilds
// android/ from app.json, so the value has to be set here, not in the committed
// android/gradle.properties. Touches nothing on iOS.
const { withGradleProperties } = require('expo/config-plugins');

const JVM_ARGS = '-Xmx4096m -XX:MaxMetaspaceSize=1024m';

module.exports = function withAndroidGradleMemory(config) {
  return withGradleProperties(config, (cfg) => {
    const props = cfg.modResults.filter(
      (item) => !(item.type === 'property' && item.key === 'org.gradle.jvmargs'),
    );
    props.push({ type: 'property', key: 'org.gradle.jvmargs', value: JVM_ARGS });
    cfg.modResults = props;
    return cfg;
  });
};
