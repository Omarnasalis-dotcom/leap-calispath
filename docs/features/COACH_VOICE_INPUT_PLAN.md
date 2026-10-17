# AI Coach voice input: plan

Status: planned 2026-10-17, not started. Needs a new app build (iOS and Android).

## Goal

The athlete taps a mic button in the AI Coach chat, speaks, and the words appear in the text box. They check or edit the text, then send it as usual. The coach still receives text only: no audio goes to our servers or to the AI.

## Current state

- The chat input has no voice support. Until 2026-10-17 the send button showed a microphone icon while the box was empty, but it was disabled and did nothing. It now always shows the send arrow.
- `app.json` blocks `android.permission.RECORD_AUDIO` (`android.blockedPermissions`). It was blocked on purpose, because `expo-av` pulls it in without us needing it.
- iOS has no `NSMicrophoneUsageDescription` or `NSSpeechRecognitionUsageDescription`.
- `public/privacy.html` says: "We do not collect camera or microphone data".

## Approach

Use the phone's built-in speech recognition (Apple Speech on iOS, Google's recognizer on Android) through the `expo-speech-recognition` package (config plugin, works in EAS builds).

- Language follows the app language: `en-US` or `ar-EG`, so it uses MSA/Egyptian Arabic recognition. Check Arabic accuracy on real devices.
- Live (interim) results fill the text box while the athlete speaks. A final result stops listening.
- If `requiresOnDeviceRecognition` is available for the language, prefer it. Otherwise audio goes to Apple's or Google's servers, not ours. The privacy text must say this either way.
- No recording is saved or uploaded by the app.

## UI

- A separate mic button next to the text box, not shared with Send:
  - Send stays the coral arrow (dimmed when empty).
  - Mic is a quieter icon button.
- While listening:
  - the mic turns coral and pulses;
  - the placeholder reads "Listening…";
  - tapping again stops.
  - Auto-stops after a few seconds of silence.
- First tap explains why and then shows the OS permission prompt. If permission is denied, show a short note with a "Open Settings" link.
- Hidden on web and on devices where recognition isn't available (`isRecognitionAvailable()`).
- English and Arabic copy, RTL checked.

## Config and store changes

1. `app.json`:
   - Remove `android.permission.RECORD_AUDIO` from `blockedPermissions`.
   - Add the `expo-speech-recognition` plugin with `microphonePermission` and `speechRecognitionPermission` strings in English (iOS shows the Info.plist strings; Arabic needs `InfoPlist.strings` localisation via the plugin or a config plugin).
2. `public/privacy.html`: replace the "no microphone data" line with what's true. Microphone is used only while the athlete holds or taps the mic. Speech is turned into text by Apple or Google. No audio is stored or sent to us.
3. App Store privacy form: review "Audio Data". If recognition happens on Apple/Google and nothing reaches us, it's likely "not collected", but confirm against Apple's definitions.
4. Play Data safety form: same review for "Voice or sound recordings". Re-check after removing the permission block.
5. Release notes mention the new mic permission.

## Testing

- iPhone and Android device, English and Arabic.
- Permission flow: allow, deny, deny then enable in Settings.
- Speaking while the keyboard is open or closed.
- Phone call or audio interruption mid-dictation.
- Free users never see the chat (CoachSetup), so check that the button only appears in the Pro chat.

## Open questions for the owner

- Tap-to-talk (tap start, tap stop) or hold-to-talk? Recommendation: tap-to-talk, it's easier with sweaty hands.
- Should dictated text send automatically when the athlete stops talking, or always wait for Send? Recommendation: wait for Send, so they can fix recognition mistakes.
