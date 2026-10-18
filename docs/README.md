# Jugnu Alert: documentation

Jugnu Alert is a shop payment-alert screen. The account holder's phone reads the bank's SMS or email alert, Gemini extracts the payment, and the shop's counter phone chimes, speaks and shows the amount, so the cashier never has to phone the owner to confirm a payment.

Built by **Team Jugnu** for the Google Cloud AI Builder Cup 2026.

## Read in this order

| File | What it is | Read it for |
|---|---|---|
| [design-proposal.md](design-proposal.md) | The full design proposal: problem, background, solution, flows, always-online design, trust and privacy, Android publishing, control, roadmap, risks | The why and the what. Start with the one-page summary |
| [architecture.md](architecture.md) | System architecture, payment flow and roadmap as images and Mermaid source, plus what data is stored | How the parts fit together |
| [pitch-deck.md](pitch-deck.md) | Slide-by-slide content and speaker notes of the 15-slide pitch deck | The story in five minutes |
| [images/](images) | PNG exports of the three diagrams | Embedding in slides or docs |

## Key decisions

- **Two modes in one app.** Connector mode (account holder's phone) reads alerts; Screen mode (shop counter) announces them.
- **Gemini reads the alerts.** One prompt replaces hand-written per-bank parsers for unseen formats; low confidence is shown as Unverified and never announced as confirmed.
- **Only four fields are stored.** Amount, sender name, reference and time. The raw alert text is never stored, and OTP lines and balances are removed on the phone first.
- **Jugnu Alert never touches money.** It reports that a bank alert arrived; it is not proof of settlement.
- **Two Android builds.** Google Play restricts SMS access, so the Play build starts with email forwarding and the direct APK build can read SMS.

## Cup prototype

The Cup entry is a live web version of Screen mode with an alert console standing in for the Connector phone, built on Gemini, Cloud Run and Firebase. See [Google Cloud AI Builder Cup plan](design-proposal.md#google-cloud-ai-builder-cup-plan) for scope, demo storyline and schedule. How to run and deploy the code is in the repository's top-level README.

## Status

Snapshot from 17 October 2026: design proposal and pitch content drafted; web prototype in progress; final pitch deck waiting for the Cup's prescribed template.
