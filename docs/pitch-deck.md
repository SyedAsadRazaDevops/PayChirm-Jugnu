# Pitch deck: Jugnu Alert

Slide-by-slide content of the 15-slide pitch deck, with speaker notes. This is the content draft. The Google Cloud AI Builder Cup requires its own prescribed template, so the final submission deck is built from this text on that template.

Theme: deep navy and warm amber (a firefly glow), DM Sans.

## 1. Cover

**Jugnu Alert**
Instant payment confirmation for every shop counter
Team Jugnu · Android app · Design proposal and pitch · October 2026

*Notes:* Jugnu is the Urdu and Hindi word for firefly: a small light that appears the moment a payment lands. Open with the one-line promise: the counter hears the payment seconds after the bank's alert.

## 2. Jugnu Alert on one page

| | |
|---|---|
| **The problem** | At many shops the bank alert goes to someone else's phone, so the counter cannot confirm a payment and the queue stalls. |
| **The solution** | One Android app. The account holder's phone reads the bank alert; the shop's phone chimes, speaks and shows the amount. |
| **Why it can be trusted** | Trusted senders only, optional expected-amount matching, and only four fields are ever stored. |
| **What we need next** | Choose the first country and banks, share sample alerts, and approve a pilot in a few shops. |

## 3. The counter cannot see the payment

Today's workaround: a screenshot, a phone call, and a wait.

1. **Third-party account.** The QR belongs to a relative or partner, so the alert lands on their phone.
2. **Queue stall.** One unconfirmed payment holds up everyone waiting behind it.
3. **Fake proof.** A screenshot cannot prove that money arrived, and nobody can tell quickly.

*Notes:* The alert exists, but it goes to the account holder, not to the person at the counter. The cost falls on the customer who waits, the cashier who is stressed, the owner who gets calls, and the shop that loses sales.

## 4. The moment money lands, the counter lights up

Jugnu Alert moves the bank's alert from the account holder's phone to the shop counter in seconds.

*Notes:* The promise in one sentence. Here the light is a chime, a spoken line and a big popup on the counter screen.

## 5. One app, two modes

| Connector mode (owner's phone) | Screen mode (shop counter) |
|---|---|
| Reads the bank SMS or email | Shows the shop QR, name and account number |
| Accepts trusted senders only | Chime, voice and a 5-second popup |
| Sends amount, sender, reference and time | PIN-protected history and settings |

*Notes:* Same app, installed twice. A shop that owns its own account can run both modes on one phone.

## 6. From bank alert to chime

1. **Customer pays.** Scans the shop's QR code in their own banking app.
2. **Bank alerts.** An SMS or email reaches the account holder.
3. **Connector checks.** Trusted sender, valid format, no duplicate.
4. **Screen announces.** Chime, voice and a 5-second popup.

Alerts from untrusted senders are ignored and logged, with no sound.

## 7. Built on Gemini and Google Cloud

- **Gemini (understands).** Reads any bank's alert and returns amount, sender, reference and time, with a confidence score.
- **Cloud Run (runs).** Runs the alert service: trusted senders, duplicate checks and expected-amount matching.
- **Firebase (relays).** Hosts the Screen page and passes each payment to the counter live.

The Cup prototype is a live web version of Screen mode, with an alert console standing in for the Connector phone.

*Notes:* Gemini replaces hand-written per-bank parsers for formats we have not seen, and low confidence is shown as Unverified.

## 8. What the shop sees

- **Idle.** QR code, shop name and account number on a white landscape screen.
- **Payment.** "Payment received", the amount in very large type, and the sender's name, for 5 seconds, with a chime and a spoken line.

Example values only: the amount and name in the mock-up are placeholders.

## 9. Built so a fake alert does not pass

- **Trusted senders only.** Only the chosen bank's sender IDs count; all else is ignored.
- **Expected amount match.** The cashier enters the bill; only a matching payment confirms.
- **Four fields stored.** Amount, sender, reference, time. OTP lines are removed on the phone.
- **No money handled.** Jugnu Alert only reports alerts. It never holds or moves funds.

An alert is not settlement: Jugnu Alert reports that the bank's alert arrived.

## 10. Always online, and honest when it is not

- **Always-on service.** Both modes run as a foreground service and restart after a reboot.
- **Live status.** A small dot on the counter screen shows the link at a glance: Live, Reconnecting, Offline.
- **Nothing is lost.** Offline payments are saved and sent on reconnect, marked delayed.

## 11. Two ways onto Android phones

| Direct install (APK), for pilot shops | Google Play build, for public launch |
|---|---|
| Can read SMS alerts | Google restricts SMS access for apps that are not the default SMS app |
| Installed by the team in person | So the Play build starts with email forwarding |
| Fastest way to test with real shops | New personal accounts need a closed test: 12 testers, 14 days |

Source: Google Play Console Help, SMS policy and testing rules, 17 Oct 2026.

## 12. We control it from the cloud

| Control | What it does |
|---|---|
| Kill switch | Disable a shop or block an old app version |
| Feature flags | Turn voice, expected amount or history on per shop |
| Bank rules as data | Fix a bank's message format without an app update |
| Staged rollout | Release to a small share first, widen if stable |
| Monitoring | Alert-to-chime delay, parse failures, heartbeat gaps |

Owners can pause the Connector, remove paired screens and delete their data at any time.

## 13. Four phases, three gates

| Phase | Contents |
|---|---|
| 0. Design sign-off | Final scope, sample alerts, screen mock-ups |
| 1. Pilot MVP | Both modes, SMS, 1–2 banks, pilot shops |
| 2. Reliability | Email forwarding, expected amount, remote control |
| 3. Public launch | Play Store build, more banks, admin console |

Gates: **G1** design approved · **G2** pilot shops stop phoning owners · **G3** policy-safe route and privacy policy ready.

## 14. Team Jugnu

Jugnu is the Urdu and Hindi word for firefly: a small light that appears exactly when it is needed.

Founding team: Asad, Bilal. More members joining as the product grows.

## 15. What we need next

1. Choose the first country and banks
2. Share sample bank alerts, with names and numbers removed
3. Approve a pilot in a few shops

Let's light up the counter.
