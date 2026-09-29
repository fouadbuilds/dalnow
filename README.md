

<div align="center">

<img src="media/logo.png" width="96" alt="logo">

# DALnow &nbsp;<a href="https://chromewebstore.google.com/category/extensions"><img src="https://img.shields.io/badge/Chrome%20Web%20Store-Add%20to%20Chrome-FFE45C?style=flat-square&labelColor=17181C&logo=googlechrome&logoColor=white" alt="Add to Chrome from the Chrome Web Store"></a>

**Every Brightspace deadline, kept up to date when profs move them.**


A Chrome extension for Dalhousie University students.
<br>
**Stop Playing Find My Assignment With Your Profs**

[Chrome Web Store](https://chromewebstore.google.com/category/extensions) &nbsp;·&nbsp; [Website](weblink) &nbsp;·&nbsp; [Privacy policy](privacylink)

![manifest v3](https://img.shields.io/badge/Chrome-Manifest_V3-FFE45C?style=flat-square&labelColor=17181C)
![license](https://img.shields.io/badge/license-MIT-FFE45C?style=flat-square&labelColor=17181C)
![installs](https://img.shields.io/badge/installs-289-FFE45C?style=flat-square&labelColor=17181C)

</div>


https://github.com/user-attachments/assets/2e6e0f07-e620-4507-a87f-d79e06273169

---

## What you get

- Every dated thing across your courses sits in one list, sorted into Today, This week, Next week and Later. Click an item and it opens on Brightspace.
- DALnow rereads Learn every 30 minutes while Chrome is open. When a prof pushes a due date, the item shows the new date highlighted with the old one crossed out underneath, so you never have to go back and correct a calendar by hand.
- Assignments, labs, quizzes and discussions each get their own reminder lead time, anywhere from seven days before the due date to the morning it's due. Reminders stop once Learn shows you submitted, or once you tick the item off yourself.
- The panel still works when Learn is down or your laptop is offline. It keeps showing the list it last read and keeps your reminders, then tries again at the next check.

## What it looks like

<table>
<tr>
<td width="50%"><img src="docs/media/moved-date.png" alt="The side panel with a STAT 230 assignment that moved to today, the new date on a yellow pill and the old date crossed out in red underneath."></td>
<td width="50%"><img src="docs/media/demo-settings.png" alt="The reminder settings, with a slider for assignments, labs and quizzes running from seven days before the due date to the morning of."></td>
</tr>
<tr>
<td>A prof pushed Assignment 1 to today. The new date sits on a yellow pill and the date it used to be is crossed out underneath.</td>
<td>Every kind of deadline gets its own lead time, and you can switch a kind off completely.</td>
</tr>
<tr>
<td><img src="docs/media/demo-list-light.png" alt="The side panel in light mode, listing deadlines under Overdue, Today and This week."></td>
<td><img src="docs/media/demo-list-dark.png" alt="The same list in dark mode."></td>
</tr>
<tr>
<td>The list runs from overdue items down to the weeks ahead, and the card at the top says how much is actually due.</td>
<td>The panel follows your Chrome theme, or you can pin it to light or dark.</td>
</tr>
</table>


## Usage

These numbers come from the anonymous install counts described under "What it does with your data". They were last updated on September 27, 2026.

- 861 people have installed DALnow.
- 735 of them opened it in the last 7 days.
- 37% opened it again the day after they installed it, and 54% came back on some later day.

The user count on the Chrome Web Store runs a few days behind these numbers.

## Install

Install DALnow from the [Chrome Web Store](weblink). Then sign in to dal.brightspace.com, click the DALnow icon in your toolbar, and the panel fills itself in.

## What it does with your data

This repo is public so you can read exactly what the extension does with your Brightspace account before you install it.

- It reads Learn from inside your browser, using the session you're already signed in with. It never sees your password.
- It only sends GET requests to `dal.brightspace/d2l/api/`, so it can't change anything on Brightspace.
- Your courses, deadlines and settings are saved in your browser's extension storage on your own computer.


The full policy is at [privacypage](privacylink).

## Running it from this repo

This section is for developers :) Most people should use the Chrome Web Store link above, which also keeps the extension updated.

`extension/` is the same build that goes to the Chrome Web Store: it reads live Brightspace only. Open `chrome://extensions`, turn on Developer mode, and use **Load unpacked** on the `extension/` folder.

---

DALnow is not affiliated with or endorsed by D2l Brightspace or Dalhousie University.

Made by Fouad Adeniran. Questions go to [adeniranfouado@gmail.com](mailto:adeniranfoaudo@gmail.com).
