# Dayflow

A phone-first daily planner prototype for Android. Dayflow combines flexible tasks with optional time blocks, upcoming plans, and a simple completion view.

## Included

- Add tasks for today or a future date
- Leave a task flexible or give it a time
- Start from editable shortcuts for focus time, breaks, lunch, movement, and planning
- Rename, retime, add, or remove shortcuts; tap one to fill the task form, then adjust it
- See timed tasks in order, with open-ended tasks kept separate
- Check off tasks, view completed work, and delete tasks
- Save tasks on this device with browser storage
- Cache the app shell so it can open offline after the first visit
- Install to an Android home screen as a Progressive Web App

## Install on Android

The project must be hosted at an HTTPS address before Android Chrome can install it. To publish with GitHub Pages, put these files at the repository root, then choose **Settings → Pages → Deploy from a branch**, select the `main` branch and `/(root)`, and save. After Pages provides the HTTPS site address, open it in Chrome on the phone and choose **Install app** or **Add to Home screen** from the browser menu.

This is a web app installed from a website, not a Play Store listing or a standalone APK. The current prototype stores data on one device and does not sync between phones.

## Project files

- \`index.html\`: app interface
- \`styles.css\`: responsive phone-first styling
- \`app.js\`: task behavior and local storage
- \`manifest.webmanifest\`: install metadata
- \`service-worker.js\`: offline app shell
- \`icons/\`: app icons


