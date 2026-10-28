# Price increase + first-time 50% offer — build plan

Owner decisions (2026-10-14): raise all subscription prices by **about 50%** (exact numbers decided later) · then add a **50% off offer for first-time subscribers only, on Pro and Max** (First is not discounted), shown as a pop-up while people use the app · no real paying users today (current subscribers are friends), so existing-subscriber handling is not a concern.

Pro 1 month goes to **1,200 EGP** first (owner, 2026-10-15, raised from 750 after confirming Apple takes **30%**, not 15%); the offer comes after. Owner update 2026-10-15: applied to Apple's Small Business Program; **if approved (Apple 15%), Pro 1 month will be 900 EGP instead** (offer → 450). Other plans still to decide.

Status: **Part 1 in progress (2026-10-18), prices final.** Part 1 needs no app build. Part 2 needs a build.

---

## Prices (to confirm)

+50% on today's prices, rounded. With the 50% offer (Pro and Max only), a new subscriber's first period costs about what it costs today.

**Starting targets (2026-10-18), superseded by the iOS FINAL table below:**

| Plan | Today | New | First period with offer (−50%) |
|---|---|---|---|
| First · 1 month | 299 EGP | **719** | no offer |
| Pro · 1 month | 499 EGP | **1,200** | 600 |
| Pro · 2 months | 899 EGP | **2,149** | ~1,075 |
| Max · 1 month | 999 EGP | **2,399** | ~1,200 |
| Max · 2 months | 1,899 EGP | **4,549** | ~2,275 |

- **Progress (2026-10-18):** iOS Pro 1 month set to **1,149 EGP** (closest Apple price point), applied to **all countries** (owner chose worldwide, roughly 2× outside Egypt), existing subscribers preserved at the old price, effective **Nov 1, 2026**.
- **Offer change (owner, 2026-10-18):** the intro offer is now **20% off** the first period (not 50%), plus **offer codes at 30% off** (new subscribers only, so one first-time discount per person: intro or code, never both). Intro lasts **2 billing periods** (Pay as you go). Pro 1 month: intro ≈ 919 EGP × 2 months, code ≈ 804 EGP. Both start Nov 1, 2026 with the new price.
- **Done (2026-10-18):** iOS Pro 1 month intro offer saved: Pay as you go, 2 months, **E£899.99** (~22% off 1,149), all countries, Australia lowered to A$24.99 (the auto A$29.99 equalled the new price), starts Nov 1, no end date. **On/after Nov 1:** reopen it and fix any country still flagged "same as or more than the subscription price".
- **Done (2026-10-18):** iOS Pro 1 month offer-code offer "Pro 1M - 30% off 2 months - new": Pay as you go 2 months, New subscribers only, "No, only this offer code" (no stacking with the intro), auto-renews. 0 codes yet: **don't create or share codes before Nov 1** (until then 30% off the new price is above today's 499). Redeem link: `https://apps.apple.com/redeem?ctx=offercodes&id=6779574061&code=CODE`.
- **iOS FINAL prices, all set in App Store Connect (2026-10-18)**, all starting Nov 1, existing subscribers preserved (Egypt EGP; 2-month plans ~17% cheaper per month than 1-month):

  | Product | New price | Intro offer | Code offer | Status |
  |---|---|---|---|---|
  | Pro 1 month | **1,299** (US $24.99; raised from 1,149 because the intro converted to $19.99 = the US price) | 999.99 × 2 periods (~23% off; US $19.99) | 799.99 × 2 periods (~38% off; US $14.99) | done |
  | Pro 2 months | 2,149 (US $39.99) | 1,799 × 1 period (~16% off; US $34.99) | 1,499 × 2 periods = 4 months (~30% off; US $29.99; changed from 1 period 2026-10-27 to match Android) | done |
  | Max 1 month | 2,399 (US $44.99) | 1,999 × 2 periods (~17% off; US $39.99) | 1,699 × 2 periods (~29% off; US $29.99) | done |
  | Max 2 months | **3,999** (was 4,599: only 4% cheaper per month than Max 1 month; now 17%, like Pro) | **3,399** × 1 period (~15% off; US $59.99) | **2,899** × 2 periods = 4 months (~28% off; US $49.99; changed from 1 period 2026-10-27 to match Android) | done (US price $69.99) |
  | First 1 month | **699** (US $12.99) | none | **499** × 2 periods (~29% off; US $9.99), code only (owner, 2026-10-18; 2 months checked in ASC 2026-10-26) | done |

- **iOS per-country check: MENA fixed 2026-10-18** (Bahrain Pro 2M intro → $34.99; Qatar Max 1M intro → QAR 129.99; Morocco Max 1M intro → $39.99). **Rest OPEN (to tackle later, before Nov 1 2026):** Apple converts the Egypt price to every currency and rounds to fixed price points, so a small discount can round to the same price as the regular one (then Apple silently doesn't give the offer in that country). Checked by downloading the regular (Nov 1) and offer CSVs and comparing; ignore Apple's "same as or more than the current price" note, it compares to today's price, not Nov 1.
  - Pro 1 month intro: 174/175 fine. **Fix Poland** (regular zł 99.99 = intro zł 99.99 → set intro to zł 79.99/89.99).
  - Max 1 month intro (17% off): **32 countries tie** (22 USD $49.99 countries incl. Morocco, plus Qatar, Montenegro, Chile, China, Colombia, Malaysia, Nigeria, Poland, Singapore, Thailand). Fix: raise the discount (intro 1,899, ~21%) or edit those rows.
  - Pro 2 month intro (16% off): **18 countries tie**: USD $39.99 in Bahamas, Bahrain, Cambodia, Kyrgyzstan, Laos, Suriname, Tajikistan, Uzbekistan; plus Australia A$59.99, Canada C$49.99, Czech Kč999, Hong Kong HK$288, Japan ¥6,000, Pakistan Rs9,900, Romania lei199.99, Sweden kr499, Tanzania 99,900, Türkiye ₺1,999.99. Egypt, US, Saudi, UAE, Qatar, EUR, UK fine.
  - Max 2 month intro (15% off): **7 countries tie**: Australia A$99.99, Colombia 299,900, Israel ₪199.90, Malaysia RM299.90, Nigeria ₦99,900, Poland zł299.99, Vietnam ₫1,999,000. All USD/EUR/Gulf countries fine.
  - Not checked yet: all 5 code offers. A ≥20% gap avoids almost all ties.
- **Google Play plan (agreed 2026-10-19, NOT STARTED; owner will do it a few days before Nov 1):** Play has no scheduled price change (a saved price hits new buyers within hours) and no draft base-plan price, so: create all offers a few days before Nov 1 and **leave them inactive** (offers stay off until Activate), then on Nov 1 change the 5 base-plan prices to the iOS table and activate the offers. Use **percentage** offers (a fixed 999.99 offer is above today's 499 and Play may reject it; % follows the base price per country): intro Pro 1M 23% × 2, Pro 2M 16% × 1, Max 1M 17% (or 20%) × 2, Max 2M 15% × 1, First none; code Pro 1M 38% × 2, Pro 2M 30% × 1, Max 1M 29% × 2, Max 2M 28% × 1, First 29% × 1. Eligibility **"Never had any subscription"** (Android has 3 separate subscriptions `first`/`pro`/`max`, unlike Apple's one group). Developer-determined code offers need tag **`rc-ignore-offer`** or RevenueCat may auto-apply them to everyone. First step: Subscriptions → `pro` → `pro-1month` → Add offer `pro-1month-intro`, Save (don't Activate).
- **Android 2-month bug found 2026-10-24:** Play's `pro-2month` and `max-2month` base plans bill **monthly** ("Monthly, auto-renewing" in Play; the old `membership` plans prove the label is the real period: "Every 3 months"). The 2-month price is charged every month. 0 Android transactions, so nobody was overcharged. Fix: new base plans `pro-2months` / `max-2months` (every 2 months, today's price until Nov 1), mapped in `revenuecat-webhook` + `confirm-entitlement` (old IDs kept), imported in RevenueCat and swapped into the `tiers_2026` 2-month packages, then the old base plans deactivated. Build the 2-month offers on the new base plans.
- **Android progress 2026-10-24 (owner chose to go live NOW, not Nov 1):** Pro DONE: `pro-1month` 1,299 EGP live (existing subs on legacy price) + `pro-1month-intro` 23% × 2 (Egypt ~1,000) active; `pro-2months` created at 2,149 + `pro-2months-intro` 16% × 1 active; webhook + confirm-entitlement deployed with the new IDs (verified live == repo); RevenueCat `pro:pro-2months` imported, entitlement attached, swapped into `tiers_2026` pro_2month package; old `pro-2month` deactivated. Offers are % only (Play's per-country pencil takes a %, not a fixed price). Max DONE same day: `max-1month` 2,399 + `max-1month-intro` 17% × 2 (Egypt ~1,999); `max-2months` 3,999 + `max-2months-intro` 15% × 1; RC swapped; old `max-2month` deactivated. First DONE: `first-1month` 699. TODO: paywall check on a real Android phone (EN + AR), then code offers (eligibility "Developer determined" + tag `rc-ignore-offer`, then Play Promo codes; Play doesn't enforce new-customer-only for these).
- Apple and Google only allow fixed price points per country. Pick the nearest Egypt price point in each console. The table is a target, not exact.
- **Decide:** does a discounted first period still get the full AI Coach $ budget (Pro $4/$8, Max $10/$20)? The webhook gives the full budget per product today. At 50% revenue minus store fees, check Pro and Max still cover their budget. If not, lower the budget for the offer period.
  Rough worst case (user spends the whole budget; ~48 EGP per $1; 14% VAT and 15% store fee taken off the price; recheck all three before deciding). **Apple currently takes 30%, not 15%** — the rows below are the Google figures; Pro 1 month is shown for both stores:

  | Plan | Offer price | You receive | AI budget | Left over |
  |---|---|---|---|---|
  | Pro · 1 month (Google, 15%) | 600 EGP | ~$9.3 | $4 | ~$5.3 |
  | Pro · 1 month (Apple, 30%) | 600 EGP | ~$7.7 | $4 | ~$3.7 |
  | Pro · 1 month at 900 (both stores, 15%) | 450 EGP | ~$7.0 | $4 | ~$3.0 |
  | Pro · 2 months | ~675 EGP | ~$10.5 | $8 | ~$2.5 |
  | Max · 1 month | ~750 EGP | ~$11.6 | $10 | ~$1.6 |
  | Max · 2 months | ~1,425 EGP | ~$22 | $20 | ~$2 |

  None of them loses money, but Max 1 month is the tightest. Options: keep the full budget (simplest; most users don't use all of it), or give a smaller budget for the discounted period (the RevenueCat webhook marks intro purchases with `period_type = "INTRO"`, so `revenuecat-webhook` could choose the budget from that).

---

## Part 1 — Raise prices (no code, no build)

1. **App Store Connect** → Subscriptions → each of the 5 products → Subscription Prices → set the new **Egypt** price directly. Don't rely on automatic conversion from another country. When asked about existing subscribers, choose **keep current price**. They're friends, and this avoids Apple's price-increase notice.
2. **Play Console** → Monetize → Subscriptions → each base plan (`first-1month`, `pro-1month`, `pro-2month`, `max-1month`, `max-2month`) → Prices → update Egypt → keep existing subscribers at the legacy price.
3. **RevenueCat:** nothing to change. Prices come from the stores. Re-read the paywall descriptions in the dashboard (EN + AR) in case any text mentions a price.
4. **Outside the app:** update any price on the landing page (`public/download.html`), social posts or the store listing text.
5. **Check:** wait a few hours, then open the paywall on an iPhone and an Android phone, in English and Arabic, and confirm the new prices.

Do **not** change product IDs. `PRODUCT_TIER_MAP` in `supabase/functions/revenuecat-webhook/index.ts` and `supabase/functions/confirm-entitlement/index.ts` keys on them.

---

## Part 2 — First-time 50% offer pop-up

### Step 1 — Store offers (no code)
Set the offer against the **new** prices, on the **existing** products, so product IDs and the webhook stay unchanged.
- **Apple:** each product → Introductory Offers → "Pay as you go", 1 period, at ~50% of the new price. Only people who have never subscribed in that subscription group qualify. Check that all 5 products are in **one** subscription group, so a user gets the intro price only once overall.
- **Google:** each base plan → Add offer → eligibility "New customer acquisition", one discounted phase of 1 billing period at 50%. Give every offer the same tag (e.g. `first-time-50`).
- **Offer is on Pro and Max only** (owner decision 2026-10-14): `pro.1month`, `pro.2month`, `max.1month.v2`, `max.2month` on iOS; `pro-1month`, `pro-2month`, `max-1month`, `max-2month` on Android. First gets no offer.

### Step 2 — RevenueCat (no code)
- New offering `first_time_offer` with only the Pro and Max packages (no First).
- Its own paywall design, separate from the main one: one clear headline ("50% off your first month"), the offer price, **the renewal price after it**, and a visible close button. EN + AR.
- New **Placement** `special_offer` that serves `first_time_offer`. The offer can then be switched or changed from the dashboard with no app release.
- Users who aren't eligible (subscribed before) automatically see the normal price.

### Step 3 — Server switch (one migration)
- `app_config.first_time_offer_enabled boolean NOT NULL DEFAULT false`, per platform, like `paywall_enabled`. Add it to the readable columns.
- Optional: `first_time_offer_cooldown_days int DEFAULT 3`.
- Optional: an admin-web toggle (follow the admin RPC checklist).

### Step 4 — Paywall shows a chosen offering (small code change)
- `src/screens/PaywallScreen.tsx`: read an optional `placement` param (`/paywall?placement=special_offer`). When it's present, fetch `Purchases.getCurrentOfferingForPlacement(placement)` and call `RevenueCatUI.presentPaywall({ offering })`. Otherwise keep today's behaviour.
- Fall back to the default offering if the placement returns nothing.
- Everything else is reused: purchase/restore handling, `pollForAccess`, the `confirm-entitlement` fallback, return on cancel.

### Step 5 — When the pop-up appears (one small helper + 2–3 call sites)
- New `src/lib/offerPrompt.ts`. It contains a **pure** `shouldShowOffer(...)` function (unit-tested) and a small wrapper that records "last shown" on the device.
- **Show only if all of these are true:**
  - `paywall_enabled` and `first_time_offer_enabled` are on for this platform
  - the user is on Free and has never had a subscription (`subscription_tier` / `access_expires_at` empty)
  - onboarding is complete
  - not shown in the last `cooldown_days`
  - not already shown in this app session
- **Moments to show it, after the user has had a win:**
  - after the Workout Complete card is closed
  - after a PR celebration is closed
  - on the 3rd app open
- **Never show it** during onboarding, a live workout, a trial, a Team attempt, or on top of another celebration.
- On iOS, `Purchases.checkTrialOrIntroductoryPriceEligibility` can skip users the store says aren't eligible. On Android it returns "unknown". There, rely on the "never subscribed" check, and Play applies eligibility at purchase.

### Step 6 — Tracking
- Reuse the existing `paywall_viewed` / `purchase_completed` / `purchase_cancelled` events and add a `placement` property (`special_offer` vs. default), plus the trigger (`workout_complete`, `pr`, `app_open`). No new event types are needed.
- On the admin Growth page, split the paywall funnel by `placement` to see whether the offer converts.

### Step 7 — Tests and device pass
- Jest: `shouldShowOffer` cases (eligible, already subscribed, cooldown, flag off, mid-workout). `tsc --noEmit` clean.
- Device: fresh **Apple sandbox tester** and **Google license tester** accounts. Accounts that subscribed before won't see the intro price, which is correct and not a bug.
- Check:
  - the discount appears
  - buying it gives the right tier through the webhook
  - closing it returns to where the user was
  - it doesn't reappear inside the cooldown
- Test in English and Arabic (RTL), dark and light.

---

## Store rules to respect
- The close button is always visible, and closing never blocks the app.
- Show the offer price **and** the price it renews at.
- No fake countdown timers. If the copy says "limited", the limit must be real: first-time only, enforced by the stores.

## Order
1. Decide final prices → Part 1 (stores only, any time).
2. Part 2 Steps 1–2 in the consoles, set against the new prices.
3. Steps 3–7 in code → ship in a build with `first_time_offer_enabled = false` → turn it on after the device pass.

---

## Android discount codes (built 2026-10-26)

Google Play promo codes can only give a free trial, so Android codes are Leap's own: admin panel → Promo codes → code points to a Play offer; the app (Settings → Redeem a Code) asks `claim_promo_code`, then buys that offer with Google's sheet. Tested end to end on 2026-10-26 (license tester, code LEAPTEST).

Play code offers (all Developer determined, tag `rc-ignore-offer`, active): `pro-1month-code` 38.42% × 2, `pro-2months-code` 30% × 2 periods (4 months), `max-1month-code` 29% × 2, `max-2months-code` 28% × 2 periods (4 months), `first-1month-code` 29% × 2. The two 2-month plans give 4 discounted months on Android vs 2 on iPhone (owner OK; Play rejects 1 period for 'Discounted recurring payment', use 'Single payment, 2 months' to match). Ships with 1.2.16.

2026-10-27: owner chose 4 discounted months for both 2-month code offers on both stores. iOS: new offers 'Pro 2M - 30% off 2 periods - new' and 'Max 2M - 28% off 2 periods - new' (Pay as you go, 4 months), old 1-period offers deactivated (0 codes existed). Moving the iOS price date earlier was considered and dropped (earliest Oct 29). iOS intro + codes can only be tested from Nov 1 (offer price is above today's price, Apple won't apply it, sandbox included).

---

## Welcome offer screen (built 2026-10-27, replaces Part 2's pop-up idea)

`/welcome-offer` (`src/screens/WelcomeOfferScreen.tsx`, rules in `src/lib/offerPrompt.ts`). Features the store's Pro 1 month intro (prices, % off and months read from RevenueCat, iOS eligibility checked with Apple; leaves at once if there's no offer). Buttons: CLAIM MY OFFER → `/paywall`, "Have a code?" → `/redeem-code`, Maybe later / ✕ → back.

Shown, each once per device and user: after the first assessment's tier reveal (MilestoneLaneScreen `dismissReveal`), after finishing the last day of the program (WarriorProgramScreen, session-complete close; for a never-subscribed user that's the free 2-week program), and from a Profile banner (`OfferBanner`) for people who saw the screen, until they close the banner. Audience: iOS/Android, `paywall_enabled` and new `app_config.first_time_offer_enabled` (migration `20261027120000`, default off) on, not admin/coach, never had a plan. AuthGuard rule 5b exempts `welcome-offer` and `redeem-code`. Events: `offer_screen_viewed`, `offer_claim_tapped`, `offer_code_tapped`, `offer_dismissed`, `offer_banner_tapped`, `offer_banner_dismissed` (with `trigger`).
