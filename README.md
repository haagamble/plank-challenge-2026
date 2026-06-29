# Plank Challenge

A small group app for completing a six-week plank challenge. Participants can
track their own progress, view the group leaderboard, and install the site on
their phone like an app.

## Features

- 42-day plank schedule with rest days
- Shared progress stored in Firebase Realtime Database
- Group leaderboard
- Device-linked participant identity
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

The first participant selected on a device is remembered as that device's user.
Their plan is editable, while other participants' plans are view-only. The
**Change user** option supports shared devices.

## Firebase

The Firebase Realtime Database URL and join code are configured near the top of
`plank-challenge.js`. Live participant data is stored under the `/plank` node.

To clear live test data, open Firebase Console, go to **Realtime Database →
Data**, and delete the `/plank` node. Delete only that node, not the database.

## Deploy with GitHub Pages

1. Push the project to a GitHub repository.
2. Enable GitHub Pages for the repository's main branch and root folder.
3. Open the published URL and confirm Firebase loads correctly.
4. Test joining, updating progress, viewing another participant, and installing
   the app before sharing the invitation link.

All project files, including `manifest.webmanifest`, `service-worker.js`, and
the `icons/` folder, must be included in the repository.

## Install on a phone

- **iPhone:** Open the site in Safari, tap **Share**, select
  **Add to Home Screen**, and enable **Open as Web App**.
- **Android:** Open the site in the browser and choose **Install app** or
  **Add to Home screen**.

The interface is cached for quicker loading, but Firebase progress syncing
still requires an internet connection.

## Security note

This app is designed for a trusted small group. Remembering a participant on
their device prevents accidental edits to someone else's plan, but it is not
authentication. Anyone deliberately bypassing the interface may still be able
to access Firebase if the database rules allow public reads and writes.
