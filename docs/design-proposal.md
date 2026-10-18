# Jugnu Alert — Design Proposal (Android)

Team Jugnu · 17 October 2026 · working draft

This is the product design for Jugnu Alert. The prototype in this repository implements the web subset described in [Google Cloud AI Builder Cup plan](#google-cloud-ai-builder-cup-plan). Diagram sources are in [architecture.md](architecture.md); the pitch content is in [pitch-deck.md](pitch-deck.md).

## One-page summary

Jugnu Alert turns any Android phone into a shop payment-alert screen, so the person at the counter hears "payment received" seconds after the bank's alert, without calling the account owner.

**The problem.** Many shops show a QR code or account number that belongs to the owner or to a third party. The alert that proves money arrived goes to that account holder's phone, not to the counter. Staff screenshot the customer's phone, call the owner and wait, while the queue stalls.

**The solution.** One Android app with two modes. *Connector mode* runs on the account holder's phone, reads the bank's SMS or email alert and extracts the payment. *Screen mode* runs on the shop's phone: it shows the shop's QR code, then plays a chime, speaks the amount and sender, and shows a large 5-second popup.

**How it stays trustworthy.** Only trusted bank senders are accepted and duplicates are blocked. The shopkeeper can also enter an expected amount, so only a matching payment confirms. Gemini reads each cleaned alert in the cloud; only the amount, sender name, reference and time are stored, and passwords and OTPs are never read or sent.

**How it stays online.** Both phones run as always-on services with live status, automatic reconnection and a clear warning when the link drops.

**Built for the Cup.** Gemini understands each alert, Cloud Run and Firebase carry it to the counter, and the Google Cloud AI Builder Cup entry is a live web version of Screen mode (see the Cup plan below).

**How it ships.** Android only. Pilot with direct APK installs in a few shops, then publish on Google Play through a permission-light route, because Play restricts SMS access.

**Decisions needed.** The first country and banks, sample alert messages, and approval of the pilot scope in the roadmap section.

## Google Cloud AI Builder Cup plan

The Cup entry is a live web prototype of Jugnu Alert built on Gemini, Cloud Run and Firebase, submitted by 6 PM IST on 18 October, about six hours before the 11:59 PM IST close. The Android Connector stays in the design and roadmap; the prototype proves the part judges can run: an alert goes in, Gemini reads it, and the counter screen chimes.

### What a complete entry needs

The organisers say an entry missing any of these five items is not evaluated. Status is a snapshot from 17 October 2026.

| Required item | Our answer | Status |
|---|---|---|
| Live prototype on Cloud Run or Firebase, up through evaluation | Web version of Screen mode and an alert console, on Firebase Hosting with a Cloud Run service behind it | Not started |
| Demo video of the solution running | Screen recording of the real flow: alert in, Gemini reads it, counter chimes, fake alert rejected. Check the length limit in the guidelines | Not started |
| Pitch deck on the prescribed template | Content drafted as a 15-slide deck (see [pitch-deck.md](pitch-deck.md)); waiting for the template | Waiting for template |
| Public GitHub repository | One repo: web app, Cloud Run service, sample alerts, README | In progress |
| Brief description | What it is, the problem, how it works, drawn from this document | Not started |

### Gemini: reading any bank's alert

Gemini replaces hand-written per-bank parsers for formats we have not seen, so one prompt can read alerts in different layouts and languages. It is tested on real sample alerts before anyone relies on it.

| Job | Input | Output |
|---|---|---|
| Extract | Cleaned alert text from a trusted sender | Amount, currency, sender name, reference, time, credit or debit, language |
| Judge | The same text | A confidence score and a reason: genuine credit alert, promotion, one-time password or scam |
| Announce (optional) | The four stored fields | A short spoken line in the shop's language |

- The Cloud Run service calls a Gemini model with a fixed output schema, so the answer is machine-readable. The model is chosen at build time; a fast, low-cost one is enough for short alerts.
- Rules run first: trusted sender, duplicate check, expected-amount match. A low Gemini score shows as Unverified and is never announced as confirmed.
- The raw text is not stored. Only amount, sender name, reference and time are kept.
- Voice uses Google Cloud Text-to-Speech where the language is supported, with the browser's built-in speech as the fallback.

### The Cup prototype

The alert console stands in for the Connector phone, so the demo shows the whole path without needing an Android build.

| In scope | Out of scope |
|---|---|
| Screen page: landscape white screen, QR from shop details, status dot, chime, spoken line, 5-second popup, payment queue | Android Connector app (a stretch goal only if time remains) |
| Alert console: paste an alert or pick a sample; it calls the same endpoint a real Connector would | Real SMS reading and the Play Store build |
| Cloud Run alert service: trusted senders, duplicates, expected-amount match, Gemini extraction | Admin console and production bank parsers |
| Firestore live relay and a pairing code between console and Screen | Accounts and logins beyond the pairing code |
| Expected-amount mode and a fake-alert rejection demo | Payments, bank access or any money movement |

**Demo storyline**

1. The problem in one sentence: the counter cannot see the payment.
2. The Screen page open in landscape on a phone or laptop.
3. Send a realistic alert from one bank: chime, voice and popup.
4. Send an alert in a different format and language: same result.
5. Send a fake alert from an untrusted sender: it is rejected.
6. Enter an expected amount, then show a match and a mismatch.
7. Show the architecture and the Google Cloud services used.

### Plan to submission

Times are IST. Dates and the 6 PM advice come from the organisers' reminder email.

| When | Work | Output |
|---|---|---|
| Sat 17 Oct, evening | Create the Google Cloud and Firebase projects, get Gemini access, write the extraction prompt and test it on sample alerts | Alert service answers with the four fields |
| Sat 17 Oct, night | Build the Screen page and live relay, then deploy | Live link opens in a private window |
| Sun 18 Oct, morning | Expected-amount mode, fake-alert rejection, polish; then record the demo | Demo video |
| Sun 18 Oct, afternoon | Fill the deck template, write the description, make the repo public, check every link while signed out | All five items ready |
| Sun 18 Oct, 6 PM | Submit | The team's deadline |
| Sun 18 Oct, 11:59 PM | Cup closes | Buffer only |

### What the team needs to provide

Deployment runs from the team's own Google accounts.

- [ ] Google Cloud project ID with billing or credits enabled
- [ ] Gemini access (API key or Vertex AI)
- [ ] A Firebase project on the same Google Cloud project
- [x] A public GitHub repository
- [ ] The prescribed deck template
- [ ] The submission guidelines: video length limit and description limit
- [ ] Three or four real sample bank alerts, with names and numbers removed

## Background

Online payments reached small shops faster than the tools to confirm them. A shop can put up a QR code or an account number in minutes, but the alert that proves the money arrived goes to whoever owns the account, not to the person at the counter.

The gap is widest when the account belongs to a family member, a business partner or an accountant, or when one owner runs several counters. Staff cope in five ways today:

| Method | What happens | Where it breaks |
|---|---|---|
| Customer's payment screenshot | Cashier looks at the customer's phone | Screenshots can be faked or reused, and do not prove money arrived |
| Phone call to the owner | Owner checks the bank app or SMS and confirms | The customer waits; the owner may not pick up |
| Owner forwards the alert by chat | Owner sends the SMS or a screenshot to the counter | Depends on the owner watching their phone at that moment |
| Cashier checks the banking app | Works only if the shop controls the account | Slow, one person at a time, impossible for a third-party account |
| Provider speaker box | A small device announces payments | Usually tied to one provider's hardware and merchant account |

Jugnu Alert starts from this history: the counter and the account holder are often different people, so the fix is to move the bank's alert to the counter instantly.

## The problem

The cashier cannot see proof of payment, and every doubt freezes the counter. Three situations show it.

1. **Third-party account.** The QR code belongs to a relative or partner. The alert lands on their phone, so the cashier photographs the customer's screen and phones them.
2. **Queue stall.** While one payment is being checked, the next customer waits, or the cashier moves on and must remember who is still pending.
3. **Fake proof.** A customer shows a screenshot of a transfer that failed, is pending or went to another account, and the cashier cannot tell quickly.

The cost falls on everyone at the counter:

| Person | Cost today |
|---|---|
| Customer | Waits at the counter and may feel suspected |
| Cashier | Stress, disputes, and the risk of releasing goods without payment |
| Account owner | Constant calls and interruptions |
| Shop | Slower queue, lost sales, losses from fake proof |

**Problem statement:** how can a shop confirm, within seconds and without calling anyone, that money reached an account it does not control?

## The solution

Jugnu Alert is one Android app, installed on two phones, that moves the bank's alert from the account holder's phone to the shop counter in seconds. The same app runs in two modes.

| Aspect | Screen mode | Connector mode |
|---|---|---|
| Runs on | The shop's phone, placed on the counter in landscape | The account holder's phone, the one that gets the bank SMS or email |
| Job | Show the shop's QR code and announce payments | Detect incoming payments from bank alerts |
| Shows | White screen, small centred QR code, shop name, account number | Setup, link status, last payment detected |
| On a payment | Chime, spoken announcement, large popup for 5 seconds | Sends the cleaned alert to the cloud |
| Needs | Internet, screen kept on, sound on | Internet, permission to read alerts, always running |

Customers keep paying with their own banking app or wallet, and the shop's existing QR code or account number does not change. A shop that owns its account can run both modes on one phone.

Jugnu Alert is not a payment processor. It never holds or moves money and never asks for bank passwords or card details. It only reports that an alert arrived.

## Users and roles

Four kinds of people touch the product, and only two of them ever open the app.

| Role | Goal | Uses |
|---|---|---|
| Customer | Pay quickly and leave | Their own banking app or wallet; sees only the counter screen and hears the chime |
| Cashier or shopkeeper | Know instantly that a payment arrived | Screen mode on the counter phone |
| Account owner | Keep control of the account without being interrupted | Connector mode on their own phone |
| Team Jugnu (admin) | Keep every shop connected and safe | Admin console and remote configuration |

The owner and the shopkeeper can be the same person, and one shop can have several cashiers.

## Product design

The design rule is one glance from two metres away. Screen mode is mostly empty on purpose, so a payment cannot be missed. *Jugnu* is the Urdu and Hindi word for firefly, and the brand idea is the same: a small light that appears the moment something arrives.

**Screen mode (shop phone)**

| Screen | What it shows |
|---|---|
| Idle | Pure white, landscape locked. A small centred square with the shop's QR code, the shop name below it and the account number below that. A tiny corner dot shows link status: green live, amber reconnecting, red offline. |
| Payment popup | For 5 seconds: "Payment received" over the amount in very large type, with the sender's name below (or the reference if there is no name). A soft firefly glow plays behind the amount, then the screen returns to Idle. |
| Waiting for amount (optional) | The cashier types the bill amount. The screen shows "Waiting for" and that amount until a matching payment arrives or the time runs out. |
| History | PIN-protected list of today's payments with a running total. |
| Settings | PIN-protected: volume, announcement language, test sound, shop details. |

**Connector mode (account holder's phone)**

| Screen | What it shows |
|---|---|
| Setup wizard | Email, account holder name, account number, bank or wallet, shop name, permission to read alerts, and pairing with Screen phones. |
| Status | Link state, last payment detected, alerts read today, and a warning if the phone's battery saver could stop the app. |
| Trusted senders | The banks and wallets whose alerts count. Everything else is ignored. |
| Pairing | A short code or QR code that links a Screen phone to the shop. |

**Sound and voice.** One memorable chime, then a short spoken line: payment received, the sender's name and the amount. Language and currency follow the shop's country setting. If several payments arrive close together, they queue and play in order so none is missed.

## End-to-end flow

Nothing is announced unless the alert passes the trust check on the Connector. Setup happens once; the payment flow repeats for every sale.

**One-time setup**

1. The account holder installs the app, picks Connector mode and enters email, account name and number, bank or wallet, and shop name.
2. They allow the app to read alerts and exempt it from battery saver.
3. The app shows a pairing code or QR code.
4. The shopkeeper installs the app on the counter phone, picks Screen mode and scans the code. The screen then shows the shop's QR code.

**Each payment**

![Payment flow: customer pays, bank alerts, Connector reads, trust check, Gemini extracts, Screen announces](images/payment-flow.png)

In the cloud, Gemini turns the cleaned alert into four fields and a confidence score, and low scores are shown as Unverified. If the cashier set an expected amount, the Screen confirms only when the payment matches it. If the Screen phone is offline when the event is relayed, the cloud holds it and the phone shows it on reconnect (see Always-online design).

## Always-online design

Both phones keep a live, monitored connection to the cloud, and each side tells the shopkeeper within seconds if the other drops. Five design choices make that work.

1. **Always-on service.** Both modes run as a foreground service with a visible notification and restart automatically after a reboot.
2. **Battery-saver guidance.** Setup walks the user through exempting the app from battery optimisation, with model-specific steps for phones that stop background apps aggressively.
3. **Live link plus backup.** A persistent real-time connection carries events. A high-priority push message wakes the phone if that connection was cut.
4. **Heartbeat.** The Connector sends a short heartbeat at a fixed interval, to be tuned in testing. When heartbeats stop, the cloud marks the Connector offline.
5. **Counter phone stays awake.** Screen mode keeps the display on and locked to landscape while charging, and never dims below the level where the QR code can still be scanned.

Every failure has a visible state and a defined recovery:

| What fails | What the shopkeeper sees | What the system does |
|---|---|---|
| Connector phone loses internet | Red dot and a banner: payments may not be announced, check the owner's phone | The Connector stores detected payments and sends them when back online, marked "delayed" |
| Phone's battery saver stops the Connector | The same banner after missed heartbeats | The owner gets a push or email asking them to reopen the app; the app also restarts on boot |
| Screen phone loses internet | Nothing while offline; on return, a list of missed payments | The cloud holds the events; on reconnect the phone plays one summary chime instead of one per payment |
| Cloud outage | Amber dot | Both phones keep retrying with growing gaps and events flow again when the cloud returns |
| Bank alert arrives late | The payment appears late, with its original time | Shown as "delayed"; bank delays are outside our control |
| Same alert received twice | One announcement | Duplicates are dropped by reference, amount and time |

## Trust, fraud and privacy

Jugnu Alert announces that a bank alert arrived; it is not proof that funds have settled. The design therefore makes fake or mismatched alerts hard to pass off as real payments. The biggest threat is a customer sending a fake "you received" SMS to the Connector phone to trigger the chime.

| Threat | Safeguard |
|---|---|
| Fake SMS from an ordinary number | Only messages from the trusted sender IDs of the chosen bank or wallet are accepted; everything else is ignored |
| Spoofed sender ID or copied format | The bank's message pattern and reference format are checked, emails are checked for sender-domain signatures, and each payment is labelled Verified or Unverified, and Gemini scores whether the text reads like a genuine credit alert |
| Replayed or duplicate alert | Duplicates are dropped by reference, amount and time |
| Wrong amount or wrong payer | Optional expected-amount mode: only a matching payment inside a time window confirms the bill |
| Reversed or failed transfer | A reversal or failure alert cancels the earlier announcement and shows a notice |
| Staff tampering with history | History is PIN-protected, and the owner can see the cloud copy |

**Privacy principles**

- The Connector reads alerts on the owner's own phone, with the owner's consent.
- Only messages from trusted senders are processed. Personal chats are never read. One-time password lines and balances are removed on the phone before anything is sent.
- Known bank formats are parsed on the phone, so only four fields leave it: amount, sender name, reference and time. For other formats, the cleaned alert text goes to Jugnu cloud, Gemini extracts the four fields, and the text is discarded. Only those four fields are stored.
- Bank logins, card details and PINs are never collected, and the app cannot move money.
- The owner can delete their data at any time. The retention period is an open decision.
- Consent screens use plain language, and a public privacy policy is published before any store release.

## System architecture

Alerts are cleaned on the Connector phone and understood by Gemini in the cloud, and only four fields are stored and passed on, so the Screen app only ever receives payment events.

![Architecture: bank alerts reach the Connector, Jugnu cloud with Gemini, and the Screen app](images/architecture.png)

Technology choices are deliberately left for the implementation phase, after this design is approved. Editable Mermaid versions of this diagram and the flow are in [architecture.md](architecture.md).

## Publishing on Android

Google Play is unlikely to approve an app that reads SMS for payment alerts, so Jugnu Alert needs two release tracks: a direct install that can read SMS, and a Play Store build that does not. Google's [SMS and Call Log policy](https://support.google.com/googleplay/android-developer/answer/9047303) limits the SMS permission group to apps registered as the default SMS, Phone or Assistant handler. It allows temporary exceptions for listed uses such as backup and restore, caller ID or spam blocking, and connected-device companions. It also lists "SMS or phone notification enhancement and alerts" as an invalid use for other apps.

That gives three ways to receive bank alerts, with different store prospects:

| Alert route | How it works | Google Play build | Direct APK build |
|---|---|---|---|
| SMS reading | The Connector receives the bank SMS on the owner's phone | Not expected to pass review | Works; the user allows installs from outside the store |
| Email forwarding | The owner forwards bank alert emails to a Jugnu mailbox; the cloud parses them | Fine; no sensitive Android permission | Fine |
| Notification access | The user turns on special access so the app can read bank-app notifications | Unclear: the policy page does not address it directly, so test it early on an internal track | Works |

The design consequence is two builds of one app, a **Play build** without SMS permission and a **Direct build** with it. Email forwarding comes first for the Play route.

**Release path**

1. Register a Google Play developer account for Team Jugnu. Registration carries a one-time fee; confirm the current amount in Play Console.
2. Prepare the store listing: name, icon, screenshots, descriptions, a privacy policy link, the data-safety form (it declares what the app sends: cleaned alert text for Gemini and the four stored fields), and the content rating.
3. Run an internal test track on the team's own phones.
4. Run a closed test. For personal accounts created after 13 November 2023, Google [requires](https://support.google.com/googleplay/android-developer/answer/14151465) at least 12 testers opted in continuously for 14 days before you can apply for production. That page does not mention organization accounts, so check which rule applies to Team Jugnu in Play Console.
5. Apply for production and roll out in stages, starting with a small share of users.
6. In parallel, hand the Direct build to pilot shops from the team's website or a test-distribution service, with an in-app update check.

Sources: [Google Play SMS and Call Log policy](https://support.google.com/googleplay/android-developer/answer/9047303), [Google Play testing requirements for new personal accounts](https://support.google.com/googleplay/android-developer/answer/14151465), both opened on 17 October 2026.

## Control and operations

Team Jugnu controls the product from the cloud, not from the phones: a small admin console and remote configuration decide what each shop and each app version can do.

| Control | What it does | Who uses it |
|---|---|---|
| Shop and device registry | Shows each shop, its paired phones, link status and last heartbeat | Team Jugnu support |
| Feature flags | Turn voice, expected-amount mode or history on and off per shop or per app version | Team Jugnu |
| Parser rules as data | Bank message patterns arrive as configuration, so a bank format change is a config update, not an app update. Rules are data, never downloaded code | Team Jugnu |
| Kill switch and minimum version | Disable a shop, block old app versions, or force an update when a fix is critical | Team Jugnu |
| Staged rollout | Release to a small share of devices and widen only while failure numbers stay clean | Team Jugnu |
| Owner controls | Pause the Connector, remove paired Screen phones, delete data | Account owner |
| Shop controls | PIN, volume, announcement language, expected-amount mode | Shopkeeper |

**What we monitor:** the delay from bank alert to chime, the share of alerts parsed correctly, heartbeat gaps per shop, crash-free sessions, and fraud flags such as unverified or duplicate alerts.

**Support:** an in-app "send diagnostics" button shares link status and error codes, never message content. A shop or sender reported for fraud can be blocked from the admin console.

## Roadmap, risks and open questions

The pilot is the make-or-break test: if shops stop phoning owners to confirm payments, the product works, and everything after it is scaling. Durations are set after design sign-off, once Team Jugnu knows how many people are building.

![Roadmap: four phases, three gates](images/roadmap.png)

**Risks**

| Risk | Why it matters | Mitigation |
|---|---|---|
| Play Store rejects SMS reading | The main alert route is unavailable in the store | Two builds: email forwarding first for Play, direct APK for pilots |
| Phone stops the app in the background | Payments are not announced | Foreground service, battery-saver guidance, heartbeat and offline banner |
| Fake alerts trigger the chime | The shop releases goods unpaid | Trusted senders, expected-amount mode, Verified or Unverified labels |
| Bank changes its message format | Alerts stop parsing | Parser rules as remote data and parse-failure monitoring |
| Owners worry about privacy | They refuse to install the Connector | Four stored fields only, no OTPs, plain-language consent, deletion on request |
| Name clash | "Jugnu" is a common word and other products may already use it | Check trademark and store names before launch |

**Open questions for Team Jugnu**

- [ ] Which country, and which banks or wallets, come first? Sample alert messages with names and numbers removed are needed for each.
- [ ] Is Android-only acceptable for both modes in the pilot?
- [ ] How will it earn: free during the pilot, then a monthly fee per shop or per screen?
- [ ] Which language and voice should announcements use: Urdu, Hindi, English or a mix?
- [ ] Should one shop support several Screen phones and several cashiers from the start?
- [ ] Which Play developer account type will Team Jugnu use, and who holds it?
- [ ] Who in Team Jugnu owns the Android build, the cloud, the bank parsers, and shop onboarding and support?
