# Architecture

Jugnu Alert moves a bank's payment alert from the account holder's phone to the shop counter in seconds. This page holds the diagrams as images and as editable Mermaid source (GitHub renders the Mermaid blocks directly).

Design rule: **the Screen app never sees bank messages, only payment events.** Alerts are cleaned on the Connector phone, understood by Gemini in the cloud, and only four fields are stored.

## System architecture

![System architecture](images/architecture.png)

```mermaid
flowchart TB
  bank["Bank or wallet<br/>sends SMS and email alerts"]

  subgraph connector["Connector app, on the phone that gets the bank alerts"]
    reader["Reader<br/>SMS or bank-app notifications"] --> parser["Parser and trust filter<br/>trusted senders only,<br/>OTPs and balances dropped"]
  end

  email["Email intake (optional)<br/>cloud mailbox for forwarded bank emails"]

  subgraph cloud["Jugnu cloud (Cloud Run + Firebase)"]
    gemini["Alert understanding (Gemini)<br/>four fields plus a confidence score"]
    relay["Event relay<br/>passes each payment to the Screen live"]
    pairing["Pairing and login<br/>links owner, shop and screen phones"]
    control["Remote control<br/>settings, versions, kill switch"]
    gemini --> relay
  end

  subgraph screen["Screen app, on the counter phone"]
    idle["Idle screen<br/>QR, shop name, account number"]
    alert["Alert screen<br/>chime, voice, 5 s popup"]
    staff["Staff area<br/>PIN-protected history and settings"]
  end

  bank -->|SMS or notification| reader
  bank -->|email forwarding| email
  email --> gemini
  parser -->|cleaned alert text, no OTPs| gemini
  relay -->|live event| alert
```

## Payment flow

![Payment flow](images/payment-flow.png)

```mermaid
sequenceDiagram
  participant C as Customer
  participant B as Bank
  participant K as Connector (account holder phone)
  participant G as Jugnu cloud + Gemini
  participant S as Screen (shop counter)

  C->>B: Scans the shop QR and pays
  B->>K: SMS or email alert
  K->>K: Trusted sender? Remove OTP lines and balances
  alt not trusted or invalid format
    K-->>K: Ignore and log, no sound
  else trusted
    K->>G: Cleaned alert text
    G->>G: Duplicate check, Gemini extracts fields and confidence
    G->>S: Event: amount, sender, reference, time, status
    S->>S: Chime, voice, 5-second popup
  end
```

## Roadmap

![Roadmap](images/roadmap.png)

```mermaid
flowchart LR
  p0["Phase 0<br/>Design sign-off"] -->|G1 design approved| p1["Phase 1<br/>Pilot MVP"]
  p1 -->|G2 pilot shops stop phoning owners| p2["Phase 2<br/>Reliability"]
  p2 -->|G3 policy-safe route and privacy policy ready| p3["Phase 3<br/>Public launch"]
```

## Data stored

Only these four fields are stored per payment, plus a status. The raw alert text is never stored.

| Field | Example (synthetic) | Notes |
|---|---|---|
| Amount | 2,500 | With currency |
| Sender name | Ali Khan | Falls back to the reference if missing |
| Reference | TXN-000123 | Used for duplicate detection |
| Time | 2026-10-17T10:15:00+05:00 | As shown in the alert |
| Status | verified, unverified or rejected | Low Gemini confidence is unverified, never announced as confirmed |
