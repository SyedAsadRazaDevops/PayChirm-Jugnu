# AI Builder Cup 2026: submission pack

Deadline: 18 October 2026, 11:59 PM IST. Aim to submit by 6 PM IST.

## Brief description (paste into the form)

**Jugnu Alert** is a payment-alert screen for shop counters. In many shops the QR code or account belongs to the owner or a third party, so the alert that proves a payment arrived goes to that person's phone, not to the cashier. Staff screenshot the customer's phone, call the owner and wait, while the queue stalls.

Jugnu Alert moves the bank's alert to the counter in seconds. The account holder's phone (or, in this prototype, an alert console) sends the bank SMS or email text to our Cloud Run service. The service applies rules first (trusted sender, OTP and balance removal, duplicate check, optional expected-amount match), then asks Gemini to read the text and return structured fields: amount, currency, sender, reference, time, credit or debit, language, and a confidence score. Verified payments are relayed through Firestore to the Screen page on the counter, which plays a chime, speaks the amount and sender, and shows a large 5-second popup. Low-confidence or mismatched alerts show as Unverified and are never announced as confirmed.

Gemini lets one prompt read alerts from any bank, in English, Urdu, Hindi or Roman script, without hand-written parsers. Only amount, sender, reference and time are stored; raw alert text is not.

Built with: Gemini (Vertex AI or Gemini API), Cloud Run, Firestore, Firebase Hosting and Authentication.

## Submission checklist

- [ ] Live link: `https://<PROJECT_ID>.web.app` (deploy with `make gcp-setup firebase-setup deploy PROJECT_ID=...`, then `make check-live`)
- [ ] Open the link and `/console` in a private window before submitting
- [ ] Demo video recorded against the live link (check the length limit in the guidelines)
- [ ] Pitch deck on the prescribed template (content: [pitch-deck.md](pitch-deck.md))
- [ ] GitHub repository public, and the branch judges see (default branch) has the code
- [ ] Description pasted (above)

## Demo video shot list (about 3 minutes)

1. **0:00** Say the problem in one sentence: the counter cannot see the payment.
2. **0:15** Open the Screen in landscape on the live link, join `JUGNU-DEMO`, turn on sound.
3. **0:35** Console: send the English sample. Show chime, voice, popup, and the rule steps.
4. **1:05** Send the Urdu, Hindi and Roman samples. Open "What Gemini saw" to show OTP and balance removed.
5. **1:50** Send the fake alert (rejected) and the same alert twice (duplicate).
6. **2:15** Set expected amount: matching is confirmed, different shows Unverified.
7. **2:40** Show the architecture diagram and the Google Cloud services used. Close on the repo link.

Full click-by-click version: the Demo script section of the README.
