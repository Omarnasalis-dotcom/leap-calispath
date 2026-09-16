# Leap AI Coach · Program Design Spec

**For:** the AI code agent working on the Leap AI Coach
**Purpose:** a reference for how a Leap coach builds a program. Compare it with
the current system prompt (`supabase/functions/ai-coach/system-prompt.ts`),
find the gaps, and propose changes so the in-app coach builds better programs.

This is not a replacement prompt. It describes **how to decide**, not what to
copy. Where it gives numbers, treat them as defaults that the coach can tune.

Sources: `coaching_methodology.md`, `training_types_guide.md`,
`master_template_guidelines.md`, `knowledge_base_patch_v1.md`,
`skill_selection_guidelines.md`, `strength_tier_reference.md`,
`coach_notes_style_guide.md`, `exercise_library.md`,
`quick_workout_timing_patterns.md`.

---

## 0. How to use this document (instructions for the code agent)

1. Read the current system prompt from start to finish.
2. For each section of this spec (§1 to §9), find where the prompt covers
   the same decision. Mark it as one of:
   - **Covered**: the prompt says the same thing clearly.
   - **Partial**: mentioned, but vague, or missing the reasoning or the numbers.
   - **Missing**: not in the prompt.
   - **Conflict**: the prompt says something different.
3. Produce a gap table:
   `| Spec § | Decision | Status | Prompt location | Proposed change |`
4. Propose edits as small, targeted diffs to the prompt. Keep the prompt's
   existing part structure (Core → Context → Reference → Workflows → Craft →
   Examples). Put build logic in **Craft**, not at the bottom.
5. Prefer turning rules into **decision steps** the model follows in order
   (§1). Models build better programs from a procedure than from a list of
   facts.
6. Anything that can be checked in code (field types, required metadata,
   exercise names, phase order) should also be **validated server-side** (§9).
   Don't rely on the prompt alone.
7. Add or update eval cases (§10) for every change you make.
8. Don't change: tier integrity, Power World / Static World gating, the
   rule that a tool call must be in the same reply, or safety rules.

---

## 1. The build procedure (the order decisions are made in)

The in-app coach should build every program by making these decisions in
this order. Each step uses what earlier steps decided.

```
1. Athlete profile     tier → level band, goal, days/week, equipment,
                       injuries, skill checkpoint (if the goal names a skill)
2. Weekly split        days/week + level → which day types, in what order
3. Day template        each day type → which blocks, in phase order
4. Block role          each block → its job (activate, skill, main strength,
                       secondary strength, accessory, conditioning, recover)
5. Structure + timing  role + level → single/superset/circuit/ladder and
                       straight_set/amrap/fortime/tabata
6. Exercise selection  role + pattern + level + equipment + weak point
                       → exact library exercise
7. Dose                goal + role + level → sets, reps/hold, rest,
                       rounds, time cap
8. Week balance check  total volume, pattern balance, intensity spread
9. Notes + naming      coach_notes (rules §8), program name
10. Validate           §9 checklist before calling the tool
```

**Common failure to check for in the current prompt:** the model picks
exercises first and makes up the structure around them. Steps 4 and 5 must
come before step 6.

---

## 2. Athlete profile → level band

Tier is the main input. Three level bands decide how hard everything is.

| Band | Tiers | Who they are | Library difficulty to draw from |
|---|---|---|---|
| **Beginner** (Foundation) | 0 to 2 | Building basic pull, push, dip and leg patterns. Assisted variations. | mostly `beginner`, some `intermediate` |
| **Intermediate** (Intermediate B) | 3 to 5 | Strict pull-ups and dips coming in, muscle-up progression, first weighted work | mostly `intermediate`, `beginner` for warm-up and accessories, a few `advanced` skill drills |
| **Advanced** (Advanced / Athletes Pro) | 6 to 9 | Muscle-ups, weighted strength, advanced skills | `intermediate` and `advanced` |

Rules:
- **Start one step below their max.** If they can do 6 strict pull-ups, the
  main block should not ask for 6 on every set.
- **When patterns don't match, use the weakest one.** If pulling is at tier 4
  and dips are at tier 2, program from tier 2 and bring dips up.
- **Skill checkpoint is separate from tier.** Tier decides if a skill is
  allowed. The checkpoint decides which exercise to use. A skill claim far
  above the tier is a question, not a green light.
- **Equipment filters everything.** No rings means no Ring exercises. No
  weights means no `is_weighted`. No bands means no Banded variations: use
  negatives or easier leverage instead.
- **An injured pattern is left out** and the others are trained (see safety
  rules in the prompt).

---

## 3. Weekly split

| Days/week | Level name | 7-day layout |
|---|---|---|
| 3 | Foundation | Pull · Rest · Push · Rest · Legs · Rest · Rest (skills go inside strength days) |
| 4 | Intermediate B | Pull & Muscle-Up · Legs · Push · Rest · Rest · Weighted Strength · Rest |
| 5 | Advanced | Pull & Muscle-Up · Recovery · Push & Handstand · Recovery · Legs · Conditioning & Mobility · Weighted Strength |
| 6 | Athletes Pro | Pull Strength & Front Lever · Handstand & Push · Lower Body · Rest · Conditioning · Skills & Core · Weighted Strength |

Principles behind the table (so the model can adapt it rather than copy it):
- **Don't put the same pattern on two days in a row.** Pull, then legs or
  rest, then push.
- **A skill goal is trained at least 2× per week**, in its own block.
- **Weighted Strength day** only when days ≥ 4 **and** the athlete does Dips
  and Pull Ups (Normal Grip) without a band. Otherwise use the bodyweight
  version of that day.
- **Recovery days** are light mobility, not training.
- **Match days to the athlete's level:** a beginner who asks for 5 days
  should get 3 or 4 training days plus recovery, not 5 hard days. Say why.
- If the athlete asks for a plain Pull / Push / Legs / Skills / Full Body
  split, that's fine. Confirm which one they mean first.

---

## 4. Day template: blocks and phase order

```
Warm-Up (required) → Mobility (optional) → Skills (optional)
→ Strength - 1 (required) → Strength - 2 → Strength - 3
→ Accessories → Finisher (optional) → Cool-Down (required)
```

How many blocks, by level:

| Band | Typical day | Session length target |
|---|---|---|
| Beginner | Warm-Up · Strength - 1 · Strength - 2 · Accessories or Finisher · Cool-Down | ~40 to 50 min |
| Intermediate | Warm-Up · Skills · Strength - 1 · Strength - 2 · Accessories · Finisher · Cool-Down | ~55 to 70 min |
| Advanced | Warm-Up · Mobility · Skills · Strength - 1 · Strength - 2 · Strength - 3 · Accessories · Finisher · Cool-Down | ~70 to 90 min |

Rules:
- Skill work comes **before** strength, while the athlete is fresh.
- The hardest strength block comes first (Strength - 1).
- **Don't use the same timing system for every block in a day.**
- A skill goal gets its **own** Skills block. Don't hide it inside strength.
- Push and Handstand days get a shoulder and wrist **Mobility** block after
  the warm-up.

**Gap to check:** does the current prompt give the model a way to estimate
session length or block count by level? If not, add the table above.

---

## 5. Block role → structure and timing

Decide what each block is **for**, then choose how it runs.

| Block role | Structure | timing_system | Why |
|---|---|---|---|
| Warm-Up | circuit | straight_set | Light, continuous activation |
| Mobility | circuit or single | straight_set, or tabata (long work / short rest) | Controlled range of motion, holds |
| Skill (reps) | single or superset | straight_set | Quality over fatigue, full rest |
| Skill (holds) | single | tabata (short work / short rest) | The timer runs the holds |
| Main strength (bodyweight) | single, or descending ladder | straight_set, or fortime + ladder | Heavy effort with volume control |
| Main strength (weighted) | single, or ascending ladder | straight_set | Full rest, load is the focus |
| Secondary strength | superset | straight_set | Time-efficient, pairs opposite muscles |
| Accessories | circuit or superset | straight_set | Volume, short rest |
| Conditioning / Finisher | circuit or ladder | amrap or fortime | A score to beat (rounds or time) |
| Power / speed | single | tabata (short work / long rest) | Every rep at full quality |
| Cool-Down | single or circuit | straight_set or tabata | Holds, breathing |

How it changes by level:
- **Beginner:** mostly `straight_set` with `single` / `superset`. Circuits
  only in the warm-up, accessories and a short finisher. Avoid long For Time
  ladders; fatigue ruins their form.
- **Intermediate:** add descending ladders on pull, push and dip work. Short
  AMRAP / For Time finishers. Tabata for skill holds.
- **Advanced:** combined ladders (descending + ascending together), longer
  For Time conditioning, AMRAP on skill volume (for example Muscle Up
  AMRAP 10 min), ascending ladders on weighted work.

Required metadata per choice (validate in code as well):

| Choice | Required fields |
|---|---|
| `amrap`, `fortime` | `time_cap_min` |
| `ladder` structure | `ladder_start`, `ladder_sub`, `ladder_direction` |
| `tabata` | `tabata_work_seconds`, `tabata_rest_seconds`, `tabata_rounds` |
| any block with rounds | `rounds` (string), `rest_after_round` (int); each exercise `sets: "1"` |

---

## 6. Exercise selection

For each block, pick exercises by filtering in this order:

```
1. Pattern     what the block trains (PULL / PUSH / LEGS / CORE / SKILL)
2. Library     exercise_library category + subcategory
               (e.g. PULL — Strength, PUSH — Skill, FLEXIBILITY)
3. Equipment   remove anything they don't have
4. Level       library difficulty that fits the band (§2)
5. Role        main = the hardest variation they can do cleanly
               accessory = easier, higher-rep friendly
               warm-up = beginner-level, low load
6. Weak point  of the options left, prefer the one that fixes their weak link
7. Variety     not the same exercise twice in one day; the same main lift
               can repeat across the week only if it is the focus
```

### 6.1 The variation ladder (easiest to hardest, same pattern)

The model moves the athlete along these when progressing (lever C, §7.3).
The names are library names; resolve every one with `search_exercises`.

| Pattern | Easier → harder |
|---|---|
| Horizontal pull | Inverted Row Hold → Negative Inverted Row → Inverted Row → Inverted Rows (Narrow Grip) / Inverted row Wide Grip → Ring Row → Ring Row Single Arm |
| Vertical pull | Scapula Pulls / Deadhang → Jump Pull Up → Banded Pull Ups → Pull Ups Negative / Hold 5s Negative pull ups → Pull Ups (Normal Grip) → Chest to bar Pull Up / High Pull Ups → Archer Pull Ups → Pull Ups (Single Arm) |
| Chin-up | Banded chin Up → Chin Ups Negative → Chin Ups → Chin Ups Hold / 5s Hold Negative Chin Ups |
| Horizontal push | wide knee push ups / knee push ups → Incline Push Ups → push ups → Narrow push ups / Decline Push ups → Pesudo push ups / archer push ups → Ring Push Ups → single arm push ups |
| Dip | Triceps box dips → Dips → Ring Dips / Single bar dips → Dips + is_weighted |
| Vertical push | Pike Push Ups → Elvated Pike Push Ups → Strict Box Handstand Push Up kneeling → HandStand Push ups → Strict Handstand Push Up |
| Squat | Asisted Squat → Air Squat → Goblet Squat (weighted) → Asisted Pistol Negatives → Asisted Pistol Squat → Elevated Heel Pistol |
| Lunge | Reverse Lunges → Box Step Up → Bulgarin Lunges → Jumping Lunges → Bulgarin Jumping Lunges |
| Hip | Glutes Bridge → Single leg Glutes Bridg → Hip Extension → Single Leg Deadlift / Deadlift |
| Core (flexion) | Reverse Crunches → Hanging Knee Raises → Hanging Leg Rasies → Toes To Bar |
| Core (anti-extension) | deadbug → Hollow Hold → DeadBug to Hollow → V- Ups → Sliding Pike Ups |
| Muscle-up | jump muscle up / Muscle Swing to Box → Banded High Pull Up → Negative Muscle Up → Muscle Up (with band) → Muscle Up → 1 Pull Up 1 Muscle Up |

Skill lines (Front Lever, Back Lever, Planche as a grid of position × method;
Handstand, L-Sit, Pistol as a straight line) are in the v3 prompt §3.2.

**Gap to check:** does the current prompt give the model pattern ladders
like this for **non-skill** strength work? v2 only had skill lines, so the
model had no clear "next harder variation" for basic pulling or pushing.

### 6.2 Pairing rules
- **Superset:** opposite muscles (pull + push, or hip + core) for secondary
  strength, or two related skills for skill blocks.
- **Circuit:** 3 to 5 exercises; the hardest goes first; alternate body parts.
- **Skill + support:** put the skill in the Skills block and its support
  exercise in Strength or Accessories on the **same day**.
- **Don't pair two grip-heavy pulls** in one superset for beginners.

### 6.3 Selection guardrails
- Only library exercises, with the exact name from `search_exercises`.
- Weighted = plain name + `is_weighted: true`. Never "Weighted X".
- No machine exercises (Leg press machine, Lat Pull Down, Seated Row…)
  unless the athlete said they train in a gym.
- Cardio-only items (Run, Treadmill (Steady)) go in conditioning or recovery
  days only.

---

## 7. Dose: sets, reps, holds, rest

### 7.1 Base table by goal

| Goal | Sets × Reps | Rest | Target RPE |
|---|---|---|---|
| Strength | 4 to 5 × 4 to 8 | 90 to 120 s | 7 to 8 |
| Hypertrophy | 3 to 4 × 10 to 15 | 60 to 90 s | 7 to 9 |
| Skill (reps) | 2 to 3 × 3 to 6 | 90 to 120 s | 6 to 7, clean form |
| Skill (holds) | 3 to 6 × max hold or a fixed time | 60 to 120 s | stop before form breaks |
| Endurance / circuit | 2 to 3 × 12 to 20 | 45 to 60 s after the round | 7 to 8 |
| Weighted max effort | 3 × up to the rep max | 180 s | 9 |
| Warm-up | 2 rounds × 8 to 10 | 60 s after the round | 3 to 4 |
| Cool-down | 2 rounds × 30 s holds (legs 45 s on pancake) | none | — |

### 7.2 Level modifiers (apply on top of §7.1)

| | Beginner | Intermediate | Advanced |
|---|---|---|---|
| Main work sets | low end (2 to 3) | middle (3 to 4) | high end (4 to 5) |
| Reps target | ~60 to 70% of their max per set | ~70 to 80% | ~80%, or ladders that start near max |
| Rest | longer end | middle | short on conditioning, long on weighted work |
| Holds | 10 to 20 s | 15 to 30 s | 20 s+ or harder position |
| AMRAP / For Time cap | 5 to 8 min | 8 to 12 min | 10 to 20 min |
| Ladder | start 6 to 8, drop 2 | start 10 to 12, drop 2 | start 20+, drop 4 (e.g. 22/18/14) |
| Tabata | 20 s work / 40 s rest | 20/20 to 30/30 | 40/20 on conditioning |
| Weighted work | none, or light goblet squat / deadlift | first loaded dips and pull-ups | RM work, ascending ladders |

**Rule of thumb for reps:** use the athlete's real max. If max is 8, a
strength block is about 4 × 5 and a volume block about 3 × 6 with a
harder tempo or hold. Never program a set at 100% of their max.

**Hold / rep fields:** a static hold uses `hold_seconds` with `reps: "1"`.
A tabata block leaves `hold_seconds` empty because the timer controls it.

### 7.3 Progression across weeks: one lever per exercise

| Lever | Change | Use when |
|---|---|---|
| A · Reps | `"8"` → `"10"` | Easy at RPE ≤ 7 and still below the top of the rep range |
| B · Rounds | `"3"` → `"4"` | Reps are at the top of the range |
| C · Harder variation | move one step along §6.1 or the skill grid | The athlete has clearly mastered the current variation (top of range, low RPE, 2 weeks) |
| D · Load | `is_weighted` on, or +kg | Bodyweight is too easy and weighted work is allowed |

- **Never A and B in the same week** on the same exercise.
- After a C step, **drop the reps** back to the low end of the range.
- RPE 9 to 10 or failed sets → hold, or step back one variation.
- 2 or more sessions missed without a reason → hold everything.
- Deload every 4 to 6 weeks: same exercises, ~40% less volume, RPE 5 to 6.

**Gap to check:** does the current prompt say what to do **after** a
variation step (reset reps)? v2 did not.

---

## 8. Week balance, notes, naming

### 8.1 Weekly balance check (before calling the tool)
- Pull and push volume are roughly equal (within ~20%).
- Legs get at least one full day on 3+ day plans.
- Core is trained at least 2× per week (as a block or inside accessories).
- No more than 2 high-intensity days in a row.
- A skill goal appears ≥ 2× per week.
- Each day has warm-up and cool-down.

### 8.2 coach_notes
- Only write a note when there's a real reason (a logged RPE, weight or
  comment, or a decision based on one). Otherwise `""`.
- Arabic only from the fixed cue table (AMRAP, For Time, rep max, band,
  HSPU) and the phrase bank in `coach_notes_style_guide.md`.
- One line, no em dash.
- Block-type cues (AMRAP / For Time / rep max / band) are allowed from week 1.

### 8.3 Naming
- Program: `[Level] [Split] · Tier [X]`
- `day_name`: UPPERCASE `"PULL DAY 1"`, `"REST DAY 4"`
- `block_name`: Title Case phase name, `"Strength - 1"`

---

## 9. Validate in code (don't trust the prompt alone)

Add a validator before `propose_new_program`, `append_week` and
`add_block_to_week` write anything. On failure, return a clear error to the
model so it fixes the problem in the same turn.

| Check | Rule |
|---|---|
| Phase order | Warm-Up first and Cool-Down last on every training day |
| Required metadata | `timing_system`, `structure`, `focus_tag`, `is_weighted` present |
| Conditional metadata | per §5 table |
| Types | `sets`, `reps`, `rest_seconds`, `hold_seconds`, `rounds` are strings; other metadata numbers are integers |
| Rounds | when `rounds` is set, each exercise has `sets: "1"` |
| Exercise names | exact match in `exercise_library`; unknown → reject + suggest the 3 closest |
| Weighted | any exercise `is_weighted: true` → block `is_weighted: true` |
| Timing variety | not every block in a day has the same `timing_system` |
| Level fit | warn if a beginner-band program contains `advanced` library exercises outside the Skills block |
| Weighted gating | warn if a 3-day plan contains a Weighted Strength day |
| Notes | no `—`; Arabic only from the phrase list |
| Week number | append = current + 1; build = 1 |
| Tier field | reject any payload that tries to set `strength_tier` |

---

## 10. Eval cases for program-building quality

| # | Input | Pass when |
|---|---|---|
| P1 | Tier 0, 3 days, no equipment | Beginner exercises only; no bands, rings or weights; each day has warm-up and cool-down; ~5 blocks/day |
| P2 | Tier 4, 4 days, bar + bands, muscle-up goal | Muscle-up skill ≥ 2×/week; Weighted day only if unassisted dips and pull-ups are known; descending ladder on a pull block |
| P3 | Tier 7, 6 days, full equipment | Advanced ladders/AMRAP; weighted RM blocks with 180 s rest; Athletes Pro split |
| P4 | Tier 2 asks for 6 days | Suggests fewer hard days with a reason; still builds |
| P5 | Athlete max 5 pull-ups | No set asks for 5 or more strict pull-ups; banded or negative volume added |
| P6 | Week review: Banded Pull Ups 3×12 at RPE 6 for 2 weeks | Lever C to Pull Ups (Normal Grip) with reps reset low |
| P7 | Week review: reps and rounds both could go up | Only one lever applied per exercise |
| P8 | Any build | Every AMRAP/For Time has `time_cap_min`; every ladder has all 3 ladder fields |
| P9 | Any build | No two blocks in a day use the same `timing_system` everywhere |
| P10 | Rings not available | No exercise with "Ring" in the name |
| P11 | Front lever goal, athlete at Tuck Hold | Main skill = Tuck Front Lever Press; Tuck Front Lever Hold moves to warm-up/activation |
| P12 | Pull/push balance | Weekly pull and push set counts within ~20% |

---

## 11. What to hand back

After comparing with the current prompt, the code agent should return:

1. The gap table from §0.
2. A proposed diff to the system prompt (Craft section mostly).
3. A list of validator checks to add (§9) with where they go.
4. New eval cases added to the test suite (§10).
5. Open questions for the coach (Omar), especially anything that changes
   his programming style.
