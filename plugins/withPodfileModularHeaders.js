const { withDangerousMod } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

// GoogleSignIn pulls in AppCheckCore, which depends on GoogleUtilities and
// RecaptchaInterop — neither defines a modulemap, so `pod install` fails
// with "cannot yet be integrated as static libraries" unless the Podfile
// opts every pod into modular headers. Podfile itself is regenerated from
// scratch on every `expo prebuild` (and EAS ignores the committed ios/
// folder entirely, prebuilding fresh from this config), so the directive
// has to be injected here rather than hand-edited into ios/Podfile.
function withPodfileModularHeaders(config) {
  return withDangerousMod(config, [
    'ios',
    (config) => {
      const podfilePath = path.join(config.modRequest.platformProjectRoot, 'Podfile');
      const contents = fs.readFileSync(podfilePath, 'utf-8');

      if (!contents.includes('use_modular_headers!')) {
        const updated = contents.replace(
          /^(platform :ios,.*)$/m,
          '$1\nuse_modular_headers!'
        );
        if (updated === contents) {
          throw new Error(
            'withPodfileModularHeaders: could not find "platform :ios" line in Podfile to anchor the insertion.'
          );
        }
        fs.writeFileSync(podfilePath, updated);
      }

      return config;
    },
  ]);
}

module.exports = withPodfileModularHeaders;
