# MusicOne iOS App Shell (Capacitor)

This directory contains the lightweight native iOS wrapper shell for MusicOne built with [Capacitor](https://capacitorjs.com).

## Architecture

Instead of duplicating the React web app codebase in React Native, the iOS shell loads the deployed web app directly from `https://themusic.one`:

- **Zero UI Duplication**: The web app in `/ui` powers the interface, state, and player logic.
- **Instant Deployments**: Any web changes deployed to `https://themusic.one` automatically appear in the mobile app without an App Store update.
- **Background Audio Support**:
  - `UIBackgroundModes` is configured for `audio` in `ios/App/App/Info.plist`.
  - `AVAudioSession` category is initialized to `.playback` in `ios/App/App/AppDelegate.swift`.
  - `useMediaSession` in `/ui` coordinates playback state and lock-screen controls.
- **Offline / Fallback Shell**: If the network is unavailable on app launch, `www/index.html` provides a graceful fallback screen with a retry button.

## Prerequisites

- macOS with Xcode installed (via Mac App Store or Apple Developer portal)
- Node.js >= 18 & npm
- CocoaPods (`brew install cocoapods` or gem)

## Getting Started

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy web configuration:
   ```bash
   npm run cap:copy
   ```

3. Sync native plugins and configuration:
   ```bash
   npm run cap:sync
   ```

4. Open the project in Xcode:
   ```bash
   npm run cap:open
   ```
   Or open `ios/App/App.xcworkspace` directly in Xcode.

## Running on Simulator / Device

1. Open `ios/App/App.xcworkspace` in Xcode.
2. Select your development team under **Signing & Capabilities**.
3. Select a target simulator (e.g. iPhone 16) or connected iOS device.
4. Press **Cmd + R** to build and run.

## Useful Scripts

- `npm run cap:copy`: Copies `capacitor.config.json` and fallback assets to the iOS project.
- `npm run cap:sync`: Syncs Capacitor plugins and runs CocoaPods pod install.
- `npm run cap:open`: Launches Xcode with the iOS workspace.
- `npm run cap:doctor`: Diagnoses Capacitor setup and dependencies.
