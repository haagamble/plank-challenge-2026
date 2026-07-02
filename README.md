# Plank Challenge

A small group app for completing a six-week plank challenge. Participants can
track their own progress, view the group leaderboard, and install the site on
their phone like an app.

## Features

- 42-day plank schedule with rest days
- Built-in countdown timer for each participant's next incomplete day
- Shared progress stored in Firebase Realtime Database
- Group leaderboard
- Anonymous Firebase identity with owner-only writes
- Browser-only test mode that does not change Firebase data
- Installable Progressive Web App (PWA)
- Light and dark color schemes

## Run locally

The site has no build step. Serve the project folder with a local web server:

```powershell
py -m http.server 8000
```

Then open:

```text
http://localhost:8000/
```

Using a local server is recommended because service workers do not run when the
HTML file is opened directly with a `file://` address.

## Test mode

Add `?test=1` to the URL:

```text
http://localhost:8000/?test=1
```

Test mode stores participants and progress only in that browser. It does not
read or write the live Firebase group data. Use **Reset test data** to start
over.

## Invite participants

After deployment, share the site URL with the join parameter:

```text
https://YOUR-SITE-URL/?join=plank26
```

Firebase anonymously identifies each device. A participant can edit only the
record owned by that Firebase user ID; other participants' plans are
server-enforced as read-only. Clearing the site's browser data creates a new
identity, so do not clear it during the challenge.

## Firebase setup

Complete these steps before publishing the live app:

1. In Firebase Console, open **Project settings → General → Your apps**.
   Register a Web app if one is not already present.
2. Copy its Web API key into `firebase-config.js`, replacing
   `REPLACE_WITH_FIREBASE_WEB_API_KEY`. Firebase Web API keys identify the
   project; they are not secret credentials.
3. Open **Authentication → Sign-in method** and enable **Anonymous**.
   Do not enable automatic cleanup of anonymous accounts during this 42-day
   challenge.
4. Open **Realtime Database → Rules**, paste the contents of
   `database.rules.json`, and publish the rules.
5. In **Realtime Database → Data**, delete the old `/plank` test data.
6. At the database root, create `/settings/joinOpen` with the Boolean value
   `true`.

Once every participant has joined, change `/settings/joinOpen` to `false` in
Firebase Console. Existing participants can continue updating their own
progress, but the database rules will reject new participant records.

The rules may instead be deployed with Firebase CLI:

```powershell
firebase deploy --only database
```

Live participant data is stored under `/plank/{firebaseUserId}`.

## Deploy with GitHub Pages

1. Push the project to a GitHub repository.
2. Enable GitHub Pages for the repository's main branch and root folder.
3. Open the published URL and confirm Firebase loads correctly.
4. Verify that anonymous authentication is enabled, the database rules are
   published, and `/settings/joinOpen` is `true`.
5. Test joining, updating progress, viewing another participant, and installing
   the app before sharing the invitation link.

All project files, including `firebase-config.js`, `manifest.webmanifest`,
`service-worker.js`, and the `icons/` folder, must be included in the
repository.

## Install on a phone

- **iPhone:** Open the invitation link in Safari or Chrome, tap **Share**,
  select **Add to Home Screen**, and enable **Open as Web App**. Open the new
  Home Screen app and join the challenge there, not in the browser.
- **Android:** Open the site in the browser and choose **Install app** or
  **Add to Home screen**, then open the installed app and join there.

The interface is cached for quicker loading, but Firebase progress syncing
still requires an internet connection.

## Security note

Firebase Authentication and Realtime Database Rules enforce ownership on the
server. Editing HTML or JavaScript in browser developer tools does not grant
permission to modify another participant's record.

This is still a small-group design:

- The invitation code is client-side and is not a secret.
- Authenticated visitors can read names and challenge progress for the
  leaderboard.
- A visitor can create their own participant record while `joinOpen` is true.
- App Check can be added later as an additional abuse-prevention layer, but it
  does not replace Authentication or Security Rules.
