# `@epireels/mobile`

React Native app built with **Expo SDK 53 + expo-router**.

## Run

```bash
pnpm --filter @epireels/mobile dev
```

Then press <kbd>i</kbd> for iOS, <kbd>a</kbd> for Android, or scan the QR code
with the Expo Go app on your phone.

## EAS Build

This starter does **not** commit EAS config. When you are ready to ship:

```bash
cd apps/mobile
pnpm dlx eas-cli init
```

## Pointing at the API

Copy the environment template and set `EXPO_PUBLIC_API_BASE_URL` before
starting Expo:

```bash
cp apps/mobile/.env.example apps/mobile/.env
```

For a physical device on the same Wi-Fi, set the variable to your machine's
LAN IP. The Android emulator can use `http://10.0.2.2:4000`:

```dotenv
EXPO_PUBLIC_API_BASE_URL=http://192.168.1.42:4000
```

Restart Expo after changing environment variables so the client bundle is
rebuilt.

## Conventions

- Routes live in `app/` (expo-router file-based routing).
- Shared types come from `@epireels/types`; never re-declare a DTO locally.
