# Dayflow

A phone-first daily planner prototype for Android. Dayflow combines flexible tasks with optional time blocks, upcoming plans, and a simple completion view.

## Included

- Add tasks for today or a future date
- Edit a task's title, date, or time without recreating it
- Set a task to repeat weekly on any combination of days, with separate completion and reminder tracking for each occurrence
- Leave a task flexible or give it a time
- Start from editable shortcuts for focus time, breaks, lunch, movement, and planning
- Rename, retime, add, or remove shortcuts
- View timed tasks in order, complete them, and see finished work
- Save tasks and preferences on this device
- Install to an Android home screen as a Progressive Web App
- Cache the app shell so it can open offline after the first visit

## Optional reminders and quiet hours

Task reminders are off by default. Turn them on in **App options → Task reminders** and allow browser notifications. Dayflow checks timed tasks while the app is open. Android may pause the browser in the background, and reminders do not run after Dayflow is closed, so they are not guaranteed alarms.

Quiet hours are also off by default. They can silence Dayflow reminders during a chosen time range. They do not silence notifications from other apps or change Android's system-wide Do Not Disturb setting; use Android Quick Settings for that.

## Install on Android

Open the HTTPS site in Chrome on the phone and choose **Install app** or **Add to Home screen** from the browser menu. This is a web app installed from a website, not a Play Store listing or a standalone APK.

The current prototype stores data on one device and does not sync between phones. Reliable reminders while the app is closed and system-wide Do Not Disturb control would require a native Android app.

## Project files

- `index.html`: app interface
- `styles.css`: responsive phone-first styling
- `app.js`: task behavior, local storage, reminders, and quiet hours
- `manifest.webmanifest`: install metadata
- `service-worker.js`: offline app shell and notification clicks
- `icons/`: app icons
