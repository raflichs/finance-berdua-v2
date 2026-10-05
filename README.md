# Finance Berdua

Private shared finance app for tracking transactions and household money movement with Firebase Realtime Database.

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create `.env.local` with the Firebase client configuration:

   ```env
   VITE_FIREBASE_API_KEY=
   VITE_FIREBASE_AUTH_DOMAIN=
   VITE_FIREBASE_DATABASE_URL=
   VITE_FIREBASE_PROJECT_ID=
   VITE_FIREBASE_STORAGE_BUCKET=
   VITE_FIREBASE_MESSAGING_SENDER_ID=
   VITE_FIREBASE_APP_ID=
   ```

## Development

```bash
npm run dev
npm run build
npm run lint
```

## Firebase Rules

Deploy the Realtime Database rules in `firebase.rules.json` with the Firebase CLI:

```bash
npx firebase deploy --only database
```

## Backup

Use the app's backup export to download a JSON backup. Import a previously exported JSON file from the app. Backups support transactions, debts, and wedding settings and are limited to 10 MB. Keep exported files private.

## Offline behavior

Changes made while offline are stored in a local queue. The queue is flushed automatically when the app is online again; failed operations remain queued for a later retry.

## Navigation

Debt and Savings remain Dashboard shortcuts.
