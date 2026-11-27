# Deal flow UX checklist

Found by walking Sell High and Buy Low on a 375 × 812 viewport (2026-11-27). Out of scope for now: SpaceX showing "Live" with a stale price.

- [x] **1. Direction gets lost.** Users pick Sell High / Buy Low up to three times (Home tile, Earn toggle, asset page), and inside the 3-step wizard only the small header title says which one it is. The wizard cannot switch direction.
  - Fix: a sticky summary bar in the wizard ("⬆️ Sell High · SOL · 25 Dec · $80") that fills in as you go; tapping the direction chip switches Sell High ↔ Buy Low without leaving.
- [x] **2. Sell High without the token.** Earn lists every asset in Sell High mode; with 0 SOL you only find out on step 3, and "Review deal" is still enabled.
  - Fix: Earn and asset page show "You hold X"; the asset page warns before the wizard when you hold none; step 3 blocks "Review deal" over balance and points to practice money.
- [x] **3. Units and numbers change between screens.** Earn shows a range, the asset page and date step show "about $X on $100", step 2 of Sell High switches to "per 1 SOL".
  - Fix: show pay "per $100" everywhere, and label the Earn range as a range across targets.
- [x] **4. A picked date can disappear.** End dates roll daily and the board refreshes every 30 s; if the picked date drops out, steps 2–3 render blank with a disabled button.
  - Fix: detect it, say "That date just closed", and send the user back to step 1 with the nearest date selected. The same applies when a picked target drops out of the list. Not triggered live yet (it needs a date to roll over while the wizard is open); checked in code only.
- [x] **5. Too many dates.** QQQ and SPY list 16 dates (3–84 days).
  - Fix: show quick picks (about 1 week / 1 month / 3 months) first and the rest under "More dates".
- [x] **6. Disabled Next with no reason.** The date is preselected but the target is not, so step 2's Next is grey with no hint; the "no offers" card sits under the legend.
  - Fix: preselect the second-closest target (same as the asset page example), show why Next is disabled, move the empty state to the top.
- [x] **7. Earn sort order.** Alphabetical, so Solana sits far down.
  - Fix: Solana and assets you hold first.

## Round 2 (branch ux/paused-prices-and-no-holdings)

- [x] **8. Stale prices still showed "Live".** `fresh: false` from `/health` was stored but never read, so SpaceX showed "Live" with price "—", let you continue, and its board returned 400 every minute.
  - Fix: a "Paused" badge on Earn and the asset page, a "Paused for now" note with the button disabled, paused assets sort after open ones, and their boards are no longer requested. The wizard blocks too.
- [x] **9. With none of the token, the big button still said "Continue with Sell High".** The warning card was only a hint, and "Get practice money" showed even for tokens the practice page cannot give (SOL, QQQ…).
  - Fix: the main button becomes "Get practice TSLA" when the practice page has that token, otherwise "Switch to Buy Low"; "Just see the offers" stays as a small option. The wizard shows "Preview · you hold 0 SOL", and step 3's button becomes "Get practice TSLA" or explains why the deal can't open. The practice token list now lives in `src/data/practice.ts`, shared by the practice page and these checks.
