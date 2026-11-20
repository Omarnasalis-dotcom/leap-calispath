// Android-only: mark the hardware the manifest implies as optional.
//
// Play Console (1.2.20, 2026-11-20): "Required hardware feature declarations
// are restricting your app's availability" for android.hardware.screen.portrait
// (implied by "orientation": "portrait") and android.hardware.wifi (implied by
// NetInfo's ACCESS_WIFI_STATE permission). The app needs neither to install:
// it runs fine in a landscape-only window and on mobile data. Declaring them
// with required="false" keeps the permission and the portrait lock as they
// are and only stops Play filtering devices out. Touches nothing on iOS.
const { withAndroidManifest } = require('expo/config-plugins');

const OPTIONAL_FEATURES = ['android.hardware.screen.portrait', 'android.hardware.wifi'];

module.exports = function withOptionalHardware(config) {
  return withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults.manifest;
    const features = (manifest['uses-feature'] ?? []).filter(
      (f) => !OPTIONAL_FEATURES.includes(f.$?.['android:name']),
    );
    for (const name of OPTIONAL_FEATURES) {
      features.push({ $: { 'android:name': name, 'android:required': 'false' } });
    }
    manifest['uses-feature'] = features;
    return cfg;
  });
};
