# Content sheet: Record clearing

- pack: crime
- packs: crime,core-loop,karma,dating,gambling,relocation,vacations
- profile: criminal
- lives: 3000

> Chain 10 of the crime outline (#236, #237). Two paid actions in `assets/legal`. Each resolves through a 0% ruling step reached by `next`.
> `crime_record` is a flag. Clear it with `= false`. Clearing it drops the `hiring_blocked` contribution (`quality.crime_record`), so the professional `apply-*` jobs reopen. Entry jobs always hire.
> Appeal: one filing per conviction. `crime_appeals` counts filings. Gate: `crime_convictions > crime_appeals`.
> Expungement: 7 clean years (threshold chosen in this sheet, [INFERENCE]), age 18+, not wanted, $500 fee. Cooldown 2 so a denied petition can be refiled later.
> Neither action is `custody-ok`. Confinement hides them, so no filings from prison. Clearing starts after release.
> `crime_years_clean` is owned here. Its yearly increment is a ternary assignment in crime's `on_age_up_post` hook (effects cannot branch), declared as the hook `needs` line under `record-expunge`. Court resets it to 0 at sentencing, matching its "years since the last sentence ended" meaning.
> Rate bands for the formula-weighted outcomes cover 1 to 5 convictions. Lint can only check constant weights. The reviewer judges the rest.
> `opens` bands are [INFERENCE], measured on the criminal profile. Assumed: an action's `opens` counts any resolution of it, including the "let it go" choice.

## record-appeal

- trigger: action
- menu: assets/legal
- label: Appeal a conviction
- icon: 📑
- tags: crime
- when: quality.crime_record and quality.crime_convictions > quality.crime_appeals and money >= 300000
- text: The conviction is still on your file. A lawyer will look at it for $3,000.
- opens: 0.01..0.05 per life
- needs: quality crime_appeals: integer 0.., default 0: paid appeal filings this life; one per conviction (this chain increments it)
- needs: quality crime_convictions: integer 0.., default 0: convictions the player has, a counter

### choice: Pay for a lawyer and appeal

- outcome: 1
  - text: You hand over $3,000. The lawyer promises to read the whole file this time.
  - effect: money -= 300000
  - effect: quality.crime_appeals += 1
  - next: record-appeal-ruling
  - rate: 100..100%

### choice: Let it go

- outcome: 1
  - text: You put the paperwork in a drawer and get on with your life.
  - rate: 100..100%

## record-appeal-ruling

- trigger: event
- icon: ⚖️
- chance: 0%
- text: The appeals court takes another look at your file.
- opens: 0.01..0.05 per life

### outcomes

- outcome: 40 - 4 * min(quality.crime_convictions, 5)
  - text: The appeal is upheld and the conviction is thrown out. Your file is clean.
  - effect: quality.crime_record = false
  - effect: stat.happiness += 5
  - effect: journal("An appeal overturned your conviction at age {age}.")
  - rate: 20..36%
- outcome: 60 + 4 * min(quality.crime_convictions, 5)
  - text: The appeal is denied. The conviction stands, and the lawyer's invoice arrives anyway.
  - effect: stat.happiness -= 3
  - effect: journal("Your appeal was denied at age {age}.")
  - rate: 64..80%

## record-expunge

- trigger: action
- menu: assets/legal
- label: Apply to seal your record
- icon: 🧾
- tags: crime
- cooldown: 2
- when: quality.crime_record and quality.crime_years_clean >= 7 and age >= 18 and not quality.crime_wanted and money >= 50000
- text: You have stayed out of trouble for seven years. A judge can seal the file for a fee.
- opens: 0.01..0.04 per life
- needs: quality crime_years_clean: integer 0.., default 0: years since the last sentence ended, reset to 0 at sentencing; record clearing reads it
- needs: hook on_age_up_post: each age-up, if `quality.crime_record` and not `confined` and not `quality.crime_on_parole`, add 1 to `quality.crime_years_clean`. Write it as `quality.crime_years_clean = (quality.crime_record and not confined and not quality.crime_on_parole) ? quality.crime_years_clean + 1 : quality.crime_years_clean`. Runs after settlement, before events; not droppable by the yearly cap

### choice: File the petition

- outcome: 1
  - text: You pay the $500 filing fee and the clerk stamps the petition.
  - effect: money -= 50000
  - next: record-expunge-ruling
  - rate: 100..100%

### choice: Not worth the fee

- outcome: 1
  - text: You decide the old file can stay where it is.
  - rate: 100..100%

## record-expunge-ruling

- trigger: event
- icon: 📂
- chance: 0%
- text: The judge reads the petition and the old file.
- opens: 0.01..0.04 per life

### outcomes

- outcome: 90 - 10 * min(quality.crime_convictions, 5)
  - text: The judge seals the record. The old conviction is gone from the file.
  - effect: quality.crime_record = false
  - effect: stat.happiness += 4
  - effect: journal("A judge sealed your record at age {age}.")
  - rate: 40..80%
- outcome: 10 * min(quality.crime_convictions, 5)
  - text: The judge refuses. Your history is too long to forget.
  - effect: stat.happiness -= 2
  - effect: journal("A judge refused to seal your record at age {age}.")
  - rate: 20..60%
