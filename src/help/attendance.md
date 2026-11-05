---
title: Attendance
group: Settings
order: 5
summary: Each person's days from their timers and where they started from, one day at a glance, time using Flow, and a report per person.
---
Attendance shows each person's days and time using Flow. Everyone sees their own (**My attendance** in your menu). People who can see everyone's timers see everyone; a project's manager sees the people on their projects.

![Attendance, Days](attendance.jpg "A new IP or device is marked in amber")

## Days come from timers

There's no check-in. A person's day is made of the timers they started that day:

- **In** is the first timer's start.
- **Out** is the last timer's end. While a timer runs, it says "Timer running".
- **Hours** is the time on those timers. Time added by hand counts as time, but doesn't make or change a day.

## What's recorded

Each timer start and resume records the time, the IP address and browser, and the location if the browser allows it ("Location blocked" when it doesn't, "No location" when the device has none). A day shows where its first timer started from. The location opens in Google Maps.

While Flow is on screen and you used it in the last 5 minutes, it counts a minute of app time each minute. A tab in the background, or a computer left on, doesn't count.

> In the prototype the IP address is made up for each browser: a browser can't see its own. The real server records the real one.

## The views

- **Days**: a row per person per day: in, out, hours, and where the first timer started from. An IP or device that differs from that person's day before is marked in amber with "new".
- **Day view**: one day, a row per person: in, out, hours and app time.
- **Activity log**: each stretch of time using Flow.
- **Report**: per person, days in, average in and out, late arrivals, early leaves, hours and app time.

Pick a person and a period (today, 7, 30 or 90 days) at the top.

## Working hours

Late is in after the start of a working day; left early is out before its end. A day whose last timer Flow ended (a task done or archived, the 12-hour limit) is marked "By Flow", and one the timer timeout ended "Timed out". Neither counts as leaving early, nor does today while a timer runs or is paused. People who can change settings set the working days and hours with **Change**.

## Timer timeout

A timer that runs too long pauses itself and asks **Still working?**, so a forgotten timer doesn't keep counting.

- **Continue** carries the count on. The time in between isn't counted.
- **Keep paused** leaves it paused.
- The default is 4 hours. People who can change settings set it with **Change**, from 1 to 12 hours.
