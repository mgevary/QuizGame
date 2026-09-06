# iOS and Android, with almost no new code

The question was: what is the path to the app stores that reuses the most of
what exists, keeps the no-backend rule, and still lets us sell subscriptions
or modules. The answer is short, and the reasoning matters more than the name.

## The decision: Capacitor, not React Native

**React Native is the wrong tool here**, and the reason is exactly what makes
this codebase good. Everything a child touches is DOM and canvas: the item
renderers, the teach cards, the track. React Native has neither — it renders
native views. Moving to it means rewriting the entire UI layer and keeping
only the pure modules (`learn/`, `sync/`, `content/`, `track/model.js`). That
is a rewrite with a reuse figure of perhaps 40%, and every future item type
would need writing twice.

**Capacitor** wraps the existing web app in a native shell — WKWebView on iOS,
the Chromium WebView on Android — and exposes native capabilities as plugins
called from JavaScript. The reuse figure is effectively 100%: the web assets
ship *inside* the app bundle, unchanged. There is still no build step for the
app itself; `npx cap sync` copies the folder into the native projects.

| Option | Code reuse | Store presence | IAP | Verdict |
|---|---|---|---|---|
| **Capacitor** | ~100% | both stores | native plugins | **adopt** |
| PWA only | 100% | Android via TWA; iOS installable but not listed | **none on iOS** — Apple forbids it | keep as the free web path |
| React Native (+ webview) | ~100% inside a webview, but RN adds nothing | both | yes | more machinery for the same result |
| React Native (rewrite) | ~40% | both | yes | reject |
| Flutter / Tauri Mobile | ~40% / immature | both | yes | reject |

So the product becomes **one codebase, two front doors**: the web app on
GitHub Pages (free, no store), and the identical code in a Capacitor shell on
the stores (paid content, haptics, proper audio session).

## What changes, and what does not

Nothing in `js/` needs to know it is inside an app. A single `js/native.js`
adapter detects Capacitor and routes to a plugin when one exists, falling back
to the web API otherwise:

```js
// native.js — the only file that knows whether we are inside Capacitor.
var cap = window.Capacitor && window.Capacitor.isNativePlatform() ? window.Capacitor : null;
export function haptic(kind) {
  if (cap && cap.Plugins.Haptics) return cap.Plugins.Haptics.impact({ style: kind });
  return navigator.vibrate && navigator.vibrate(HAPTIC[kind]);
}
```

Plugins worth adopting, in order of how much they add:

| Plugin | Why |
|---|---|
| **Haptics** | iOS Safari has no `navigator.vibrate`; the countdown is where it matters most, and it only works natively |
| **In-app purchase** (`@capgo/native-purchases` or `capacitor-plugin-purchase`) | see below |
| **App** | pause the music and the countdown when the app goes to the background |
| **Filesystem + Share** | the finish-replay image to the family group chat; export a profile |
| **Keep Awake** | the arena screen on a TV must not dim |
| **Status Bar / Splash** | polish |

**The Safari 12 rule interacts with this.** Capacitor 6 requires iOS 13 and
Capacitor 7 requires iOS 14, so the native app cannot reach an iOS 12 iPad
anyway. The ES2018 rule is still worth keeping: it is what makes the *web*
path work on those hand-me-down devices, and the native app inherits its
discipline for free.

## Purchases with no backend

This is the part that has to be argued rather than assumed. Both stores now
support **on-device verification**, which is what makes a serverless
purchase flow honest rather than merely convenient.

- **iOS — StoreKit 2.** Every `Transaction` is a JWS signed by Apple, and
  StoreKit 2 verifies the signature on the device before handing it to you.
  `Transaction.currentEntitlements` yields what the user owns right now,
  including active subscriptions and revocations. Apple documents client-side
  verification as a supported path.
- **Android — Play Billing.** Each `Purchase` carries a signature over its
  JSON, verifiable on-device against the app's RSA public key from the Play
  Console. Subscriptions surface with their state.

Neither needs a server to decide "does this device own this". The threat
model is a determined adult defeating a £3 module pack on a rooted device,
not fraud at scale, and that is a trade worth making to keep the architecture.

### Entitlements ride the family log

This is where the existing design pays off. A purchase becomes an event:

```js
{ k: 'ent', u: null, product: 'pack.times-tables', platform: 'ios',
  txid: '2000000123456789', expires: null | 1790000000000 }
```

It folds into `state.entitlements`, and because it is an event it **gossips
to every paired device in the family**. Buy on the iPad; the phone unlocks the
next time the two meet. That is family sharing implemented by the thing that
already exists, with no account and no server. (Apple Family Sharing can
layer on top for households that use it.)

`entitlements` gate only *content*: whether a module is offered. The learning
engine never reads them.

### What to sell, and what never to

The learning research this app is built on is explicit about rewards that
undermine the wish to learn, and a store makes that a design constraint, not a
preference:

| Sell | Never sell |
|---|---|
| **Module packs** — content, priced like a book | boosts, lives, energy, skips |
| **A supporter subscription** that unlocks all packs and future ones | progress, track distance, a faster race |
| Racer colourways — cosmetic, unexpected-reward tier stays free | anything a child could feel they *need* to keep up |
| A goal-mission pack (an exam blueprint as modules) | a child's own data back to them |

Selling a boost would be the overjustification effect with a receipt, and it
is also the exact dark pattern the Kids Category rules exist to stop.

### Apple's Kids Category, and COPPA

Listing for children brings rules that this design already satisfies, which is
worth stating because the review is strict:

- **A parental gate before any purchase.** The arithmetic gate exists; it
  fronts every purchase and every settings change that costs money.
- **No third-party analytics or advertising SDKs.** There are none, and the
  no-backend rule means there is nothing to send.
- **No personal data collection.** Profiles are a first name and an age, on
  device. There is no account. The privacy policy is one paragraph.
- **No links out of the app** except behind the gate.
- **No free text between devices**, no chat, no user-generated content that
  crosses households. Reactions are four fixed marks.

## The minimal Cloudflare surface

The Worker stays what it was designed to be: a **relay and a mailbox**, never
a source of truth.

| Endpoint | What it does | State |
|---|---|---|
| `wss://…/room/:code` | the same protocol as `scripts/lan-server.mjs`, so `net/lan.js` connects with a different URL and no new code | a Durable Object per room, gone in an hour |
| `POST/GET /mailbox/:campaignId` | paired devices push events and pull others', so they converge without meeting | an unordered bag of immutable facts, TTL 30 days |
| `POST /receipt` (optional, later) | server-side receipt check for a refund/fraud dispute | stateless |

Nothing there stores a child's questions, answers or ability. The mailbox
holds the same events the devices hold, encrypted at rest under the
campaign's pairing secret, and cannot resolve a conflict because there are no
conflicts to resolve.

## The release pipeline

```
web app (this repo)  ──copy──▶  native shell  ──▶  App Store / Play Store
      │
      └── GitHub Pages (the free web version, unchanged)
```

1. `npm i @capacitor/core @capacitor/cli`, `npx cap init`, `npx cap add ios android`.
   The `webDir` is the repo root; there is nothing to build first.
2. `js/native.js` adapter; the four plugins above.
3. Products configured in App Store Connect and the Play Console; the IAP
   plugin lists them; a purchase writes an `ent` event.
4. Content packs ship in the bundle. New packs can also be fetched from the
   site — Apple permits downloadable **content**, and modules are JSON with no
   code in them, which is the rule the validator has enforced from day one.
5. `npx cap sync`, open in Xcode / Android Studio, archive, submit.

## Honest risks

- **Kids Category review is unforgiving** and slow. Budget a rejection cycle.
- **StoreKit 2 verification is on-device.** A jailbroken device can lie. For
  a family app that is an acceptable loss; if it ever is not, the optional
  receipt endpoint is a day's work.
- **Cross-platform restore.** A purchase on iOS does not unlock on Android
  through the stores. Through the family log it does — but only for paired
  devices, and only once they meet or share a mailbox.
- **Subscriptions and refunds** surface through `currentEntitlements` on
  iOS and purchase state on Android, so the fold must treat an `ent` as
  *current only while the platform still says so* — re-checked at launch,
  never trusted forever.
- **WebView audio** is stricter than the browser's: the first sound must
  follow a gesture, which the countdown already guarantees.
