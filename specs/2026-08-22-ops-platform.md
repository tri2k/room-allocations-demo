# Event operations platform

**Status**: Draft (vision — decisions locking; module specs still open)

Product context: [PRODUCT.md](../PRODUCT.md). This spec is the parent of the allocator (this repo today), [indoor maps](2026-08-21-indoor-maps.md), [catalog history](2026-08-13-catalog-history-and-plan-pins.md), and later ops / proctor / volunteer / public modules. Do not implement the whole platform in one pass. Do **protect the kernel** so those modules do not grow a second rooms list.

## Problem

BMT-style contests are run from a pile of spreadsheets and forms that all mention the same halls:

| Today | Pain |
| ----- | ---- |
| Classroom/capacity sheet | Source of truth until someone forgets to copy a column |
| Time × room grid | The allocator this repo already targets |
| Volunteer Google Form → attached sheet → LLM cleanup → another app | Room names typed again; dropouts edited in a sheet; no semester-to-semester person |
| Day-of status | Slack, memory, a printed grid |
| Proctor timers / clarifications | Separate from the plan that said “Indiv in DWIN155” |
| Guest maps (Figma, old Dwinelle Navigator) | Geometry and room codes not joined to the capacity sheet |

The costly redesign is not “we picked FastAPI.” It is **DWIN155 existing in six places**. Going straight for an integrated product only helps if those six UIs share one catalog and one published plan. It fails if we boil the ocean and ship none of them.

## Recommendation

**One org, one Postgres, one API, several modules.** A modular monolith on this stack (FastAPI + Postgres + Vite). Not six apps with six room tables. Not microservices.

Rooms are the **kernel**. Everything else is either a rare catalog edit, a **draft plan**, a **published plan**, or a **live overlay** on that plan.

```text
Identity (Google users, roles)
        │
        ▼
Catalog  Building → Floor → Room          ← kernel (capacity, type, ADA, …)
        │                 │
        │                 └── MapSpace (Figma geom; optional room_id)
        ▼
Event (BMT 2026, then BmMT and later semesterly contests)
        │
        ├── People (volunteers across semesters; org-lifetime)
        │       └── Applications (this event)
        │       └── Assignments (this event: role + optional room/building)
        │
        ├── Sheets (private allocator drafts)
        │       └── Allocations (activity × room × time)
        │
        ├── PublishedPlan (one sheet snapshot selected for day-of)
        │
        ├── LiveRoomState (timer, headcount, status — day-of only)
        │       └── Clarifications (HQ → proctors)
        │
        └── PublicContent (announcements guests may see)
```

Figma does **not** own rooms. The volunteer form does **not** own rooms. The proctor timer does **not** own rooms. They all point at `rooms.id` (and display `DWIN155`).

## Design

### Decisions (this spec)

| Topic | Decision | Why |
| ----- | -------- | --- |
| Shape | Modular monolith, this repo | Student-org turnover; one deploy; one migration to add a room field |
| Kernel | Org-owned catalog: building / floor / room | Already in Phase 1–2b; missing org-scope until 2c |
| Live vs plan | Live state is a **separate** row keyed by event + room (and time window) | Reality diverges without rewriting the frozen snapshot |
| People vs users | `Person` (volunteer record) ≠ `User` (Google sign-in) | Volunteers exist before they sign in; students from CSV are not volunteers |
| Assignments | `(person, event, role, room?, building?)` | Proctors and other roles share one table |
| Maps | [Indoor maps spec](2026-08-21-indoor-maps.md): Figma geom; join by code → `room_id` | Unjoined spaces still draw; they never become grid columns |
| Public vs staff | Same API; public routes **omit** fields | Guests never get rosters, phones, HQ notes |
| First production event | **BMT 2026**, Saturday **2026-11-14** | Defines v1. Same org then runs semesterly events (BmMT, next BMT, …) |
| Tenancy | **One org (BMT)** in product; `org_id` still in the schema | Do not build a multi-org marketplace this year |
| Scale (design load) | ~**1800** contestants, **50+** testing rooms (growth 500 F22 → 1800 Sp26) | Timers, clarifications, maps, volunteer assign must work at this size |
| Student registration | **Out of scope.** Roster may be a **CSV import** | Separate platform exists; do not join it for v1 |
| Volunteer product | **Replace** the current volunteer app | Shared catalog + assignments beats another room CSV |
| Publish | **Frozen snapshot** of one sheet per Event | Day-of cannot drift from an accidental grid edit; republish is explicit |
| Timers | **Independent clock per room** | Not one shared Indiv clock. Bulk “start these rooms” is a convenience; each clock then runs on its own `starts_at` / `ends_at` |
| Clarifications | **Both** one room and a **subset** of rooms | Focus tests run in parallel; “all Algebra rooms” ≠ “all testing rooms” |
| Staff auth | **Google OAuth only** (same as Phase 2a) | Assume volunteers/proctors have Google accounts; no magic-link v1 unless we learn otherwise |
| Indoor turn-by-turn | **Not year one** | Public maps: floor finder + search + pinch-zoom |
| Custom room fields | Known columns as real SQL; `JSONB extras` for rare one-offs | Adding `has_projector` to everyone is a migration; adding “piano” to two rooms is extras (column list still open) |
| Realtime | Server-authoritative clocks (`starts_at` / `ends_at`); poll ops v1; push if clarifications need it | 50+ rooms is still a small JSON; drifting phone timers are the bug |
| C4 | Update as-built diagrams only when code lands | This file is target, not current commit |

### Component map

#### 1. Rooms catalog (kernel)

Replace the capacity spreadsheet. Edits to existing classrooms are rare; **adding a building** and **adding a column** are the two growth moves.

| Move | How |
| ---- | --- |
| New building + rooms | Catalog UI already: insert `buildings`, `floors`, `rooms` |
| New field on every room | Alembic column + form control (e.g. `accessible`, `seat_rows`) |
| One-off facts | `rooms.extras` JSONB, or tags you already have |
| Wrong capacity last year vs this year | [Catalog history / pins](2026-08-13-catalog-history-and-plan-pins.md) when scheduled — do not snapshot-copy rooms into volunteer or map tables |

**Do not** store polygons, timers, or proctor names here.

Identity: UUID plus stable display `{building.code}{room.name}`. Floor `label` must be the real code (`C`/`D`/`E`, not v0 `1`/`2`) before maps or volunteers can join without a translation table.

#### 2. Event room allocator (this repo)

Time × room grid. Allocations reference `room_id`. Many private sheets per Event (Phase 2b).

**New seam (not built):** `POST /events/{id}/publish` copies the sheet into a **frozen snapshot** (allocations, activities, included rooms, clock). Day-of tools read **only** that snapshot. The original sheet can keep changing; it does not affect ops until someone republishes. Republish replaces the snapshot (policy for in-flight timers is still open).

Until something is published, ops/public/proctor have no schedule. That is intentional.

#### 3. Day-of operations dashboard

Input: published plan. Output: list + later map of **plan vs live**.

Per room, HQ might see: assigned activity, assigned proctors (from Assignments), headcount vs capacity, timer, flags (late, extra time, closed).

Views are **projections** of the same rows:

- List: rooms as a table (closest to the spreadsheet they already stare at)
- Map: same `LiveRoomState` joined to [map spaces](2026-08-21-indoor-maps.md)
- (Later) building / floor filters

Ops **writes live fields**. It does not move Puzzle from 155 to 182 — that is an allocator edit + republish, or a deliberate “live override” flagged as diverged from plan.

#### 4. Proctor suite

Timer + clarifications for 50+ rooms. Attached to **this event’s assignment + published allocation**, not to the catalog forever.

- Timer: **each room** has its own server-authoritative countdown (`starts_at` / `ends_at`). HQ or the proctor starts/pauses/**adds time** on that room. A bulk action may start many rooms at once; that only copies the same timestamp onto each room — it does not bind their clocks together afterward.
- Clarifications: HQ posts to **one room**, **all rooms**, or a **subset** (e.g. every room currently allocated to Algebra focus). Proctors acknowledge. Targeting shortcuts (by activity, subject tag, building, multi-select) are still open.

Proctors are `Person`s with role `proctor` (or similar) on an `Assignment` with `room_id`. They sign in with **Google**. The suite is a phone-first UI; it must not require the allocator grid.

Pulling the rooms catalog: **yes, by id**, so we never type “Dwinelle 155” into a fourth sheet.

#### 5. Public live site (guests)

Primary: contest status (“Indiv in progress”, lunch, delays). Secondary: useful maps.

Same map viewer as ops, **different live payload**:

| Show publicly | Hide |
| ------------- | ---- |
| Building/floor maps, room codes, bathrooms, exits | Proctor names, radios |
| Coarse activity (“Team round”) and maybe a shared countdown | Student names, seat maps, scores |
| Announcements HQ marked public | Internal HQ notes, volunteer emails |

Figma toggle maps (Dwinelle C/D/E, Wheeler B/1/2, VLSB 2) are the right **floor plates**. They relate to the catalog as: **one `MapSpace` per named plate → optional `room_id`**. Public “155 is Team” is `published allocation` + `live state` on that room, painted onto the polygon.

**Dwinelle Navigator** ([dkess.me/dwinelle](https://dkess.me/dwinelle), graph under ODbL) is a different artifact: a **3D hallway graph** with turn-by-turn. Recreating that for every hall is a later project (import a graph, or draw connectors). Do not pretend Figma room rectangles are a routing mesh. v1 public maps: pick a building, pick a floor, search a room, pinch-zoom, “you are at entrance X” as a POI — not first-person flythrough.

#### 6. Volunteer check-in (across semesters)

Replace: Google Form → attached sheet → hand edits → LLM-shaped import into a separate volunteer app that has its own room list.

| Object | Lifetime | Owns |
| ------ | -------- | ---- |
| `Person` | Org, many semesters | Name, email, phone, notes, “do not contact” |
| `Application` | One Event | Availability, shirt, dietary, this-year answers |
| `Assignment` | One Event | Role + room and/or building |

Admin UI: a signup form in this product (replacing Google Form), edit dropouts **in the app**, assign people to rooms **picked from the catalog**. The volunteer module’s building/room list **is** the catalog.

Contest **students** are not volunteers. A roster CSV may attach names to rooms for the Event; they are not `Person` rows unless we later decide they should be (open). The existing registration platform stays separate.

### How the pieces share a room

```text
rooms.id  =  9c2e…     code display DWIN155
    ▲
    │  allocations.room_id          (draft + published plan)
    │  assignments.room_id          (proctor, building lead)
    │  live_room_states.room_id     (timer, headcount)
    │  map_spaces.room_id           (nullable; bathrooms have none)
```

Never join on free-text `"Dwinelle 155"` in production paths. Import/search may fuzzy-match once, then store the UUID.

### AuthZ sketch

| Actor | Catalog | Sheets | Published + live | Volunteer PII | Public site |
| ----- | ------- | ------ | ---------------- | ------------- | ----------- |
| Guest | — | — | Coarse public live + maps | — | Yes |
| Volunteer / proctor | — | — | Own room + timer + clarifications | Own record | Yes |
| Ops HQ | Read | Read published | Read/write live | Read assignments | Yes |
| Planner | Edit | Own drafts; maybe publish | — | — | Yes |
| Volunteer admin | Read | — | — | Full | Yes |
| Org admin | Full | Policy | Publish rights | Full | Yes |

Exact roles can wait for Phase 2c, but **do not** invent a new permission system per module.

### What to build first (avoid the redesign without boiling the ocean)

Protect the kernel, then cut **vertical slices** that reuse it:

1. **Catalog quality** — real floor labels, enough fields for the capacity sheet, add-building flow you trust. (Mostly productizing what exists.)
2. **Allocator + publish** — finish the grid; add “this sheet is the plan.” Without publish, every later tool will scrape a spreadsheet again.
3. **People + assignments** — kills the volunteer room-list copy; gives proctor suite a join key.
4. **Ops list view** — published allocations + empty live fields. Map view when indoor maps land.
5. **Proctor timer / clarifications** — writes the same `LiveRoomState`.
6. **Public site** — maps + public live subset.
7. **Wayfinding graph** — only if guests still get lost after floor search.

Maps can be prototyped in parallel **as soon as room codes match Figma**, because geometry does not depend on volunteers. Do not block the catalog on Leaflet.

Phase 2c orgs still matter: catalog and people are org-scoped; Events belong to an org. Public HTTPS (2e) is required for guests and proctor phones.

## In Scope (as a vision doc)

- Kernel vs overlay split
- Publish-plan seam
- How Figma spaces, ops, proctors, and volunteers attach to `rooms.id`
- Build order that avoids a second rooms database
- Honest bound on Dwinelle Navigator vs Figma maps

## Not in Scope

- Implementing all six products now
- Microservices, extra Postgres instances, or a “rooms microservice”
- Student contest **registration / scoring** (separate platform; CSV roster only)
- Recreating Kessler’s 3D navigator in year one
- Replacing Figma as the drafting tool for walls
- Multi-org product; magic-link login (unless Google proves insufficient)

## Open questions (round 2)

Round 1 is locked above. Answer in any order; numbered so you can reply `11. a`, `12. …`. If a question is “not for Nov 14,” say so — that is a useful answer.

### A. What must actually run on 2026-11-14

Eleven weeks is not enough for every module at full fidelity. Stack-rank with **must / should / later (BmMT spring or BMT 2027)**.

11. For each module, what is the **minimum** that must work on Nov 14 vs can stay spreadsheet/Slack?
    - Catalog (rooms + capacity)
    - Allocator grid + publish
    - Volunteer signup + room assignment
    - Day-of HQ **list**
    - Day-of HQ **map**
    - Proctor **timer**
    - Proctor **clarifications**
    - Public **announcements**
    - Public **indoor maps**
    - Roster CSV on HQ/proctor screens
12. Is a **printed paper backup** still required if the site dies (Dwinelle Wi‑Fi)? For whom — HQ, proctors, guests?
13. Who is in the war room on Nov 14 (count + roles: HQ, building leads, tech)? Who is allowed to publish, start timers, send clarifications, post public announcements?
14. Do planners need **two people on the same sheet** before Nov 14, or is owner-only (Phase 2b) enough if only one person builds the grid?

### B. Contest day (BMT, not BmMT)

The seed data in this repo is a **BmMT** day (Puzzle / Indiv / Team / Relay). BMT focus tests are a different shape.

15. Paste or describe the **Nov 14 schedule**: named rounds, start/end times, lunch, awards. Which rounds use 50+ rooms vs a few halls?
16. List the **focus tests / subjects** (Algebra, Geometry, …). How many does a student take, and are they **sequential slots** or overlapping?
17. On the grid, is “Algebra focus in DWIN155 9:00–10:30” an **activity** (like Puzzle), or an activity **plus a subject tag** so two rooms can both be “Indiv” but different subjects?
18. Can one room host **two subjects in one time slot** (split room)? Today the allocator forbids overlapping allocations on one room.
19. Besides testing rooms, what **non-testing** spaces must exist as catalog rooms or map-only spaces: HQ, check-in, grading, scanning, food, lounge, merchandise, bathrooms, stairs?
20. How many **buildings** on Nov 14 (Dwinelle, Wheeler, VLSB, others)? Any outdoor / overflow tents?

### C. Rooms catalog

21. What are the **column headers** on the current capacity spreadsheet? (Paste them.) Which are required vs nice?
22. Do you store **two capacities** (fire code vs “we will seat for a test”)? The app already has `capacity` and `optimal_capacity`.
23. Who may **edit a room on the morning of** (broken projector, room pulled by campus)? Catalog edit vs a day-of “closed” flag that does not change the catalog?
24. How do you handle **rooms campus takes back** after you planned — hide from picker, deactivate, or leave on the published plan as closed?
25. Wheeler (and any hall not in the current seed): do you have a registrar **building code** you want in the UI (`WHEE` vs `Wheeler`)?

### D. Allocator + freeze

26. Who is the **one owner** of the Nov 14 sheet, and who else needs **view** (not edit) of the draft before publish?
27. After freeze, if DWIN155’s Algebra round must move to DWIN182 **during the day**, is that: republish from a fixed sheet, a day-of “move” that flags divergence, or paper-only?
28. On **republish**, what happens to rooms whose timers already started — keep live clocks, reset, or block republish until HQ confirms a diff?
29. Do you need **import from the old grid spreadsheet** for Nov 14, or will someone rebuild in the app?
30. Bulk assign “all of Dwinelle D is Algebra 9:00–10:30”: is that a real workflow, or do you place rooms one-by-one / by multi-select?

### E. Roster CSV (students)

31. What are the **CSV headers** you can actually export from the registration platform (name, room, subject, school, id, …)?
32. When does that file **stabilize** — T−7 days, night before, morning of, continuously?
33. Should HQ/proctors see **names in a room**, or only a **headcount** / “87 of 120”?
34. If a student is **in the wrong room**, do you need to move them in this app, or is that only in the registration platform (and a new CSV)?
35. One student, **two focus tests**: two rows in the CSV (two rooms/times)? Same room twice?

### F. Volunteers

36. Paste the **current Google Form questions** (or a screenshot list). Which must survive in-app?
37. What **roles** do you assign (proctor, runner, HQ, grading, scanning, check-in, building lead, food, …)? Can one person have **two roles** the same day (proctor morning, grading afternoon)?
38. Is assignment **per room for the whole day**, or **per round** (proctor in 155 for Indiv only)?
39. How do you pick how many proctors a room needs — by capacity, by room type, by hand?
40. **Day-of volunteer check-in**: name search, QR, both, or just “they showed up” in HQ’s head?
41. Returning volunteers: should last semester’s `Person` **pre-fill** the next Event application, and how do you handle “do not invite back”?
42. Typical **volunteer count** for an 1800-student BMT? How many are proctors vs other?
43. Shirt sizes / dietary / minor (under 18) / emergency contact: store in this app? Visible to whom?
44. Signup **deadline** and waitlist, or open until the day before?

### G. Proctor suite (timer)

45. Who is allowed to **start / pause / add time** on a room — only HQ, only the assigned proctor, or both?
46. What **add-time** increments do you actually use (1 min, 5 min, “until 11:07”)?
47. Does the proctor screen show **end-of-test clock time** (“stop at 10:32”) as well as remaining minutes?
48. If a proctor’s **phone dies or loses Wi‑Fi**, should the last countdown keep ticking locally, or freeze until reconnect (server is source of truth either way)?
49. Need **prep / 5-minute warnings** (“5 minutes remaining” auto-banner) or is that the proctor’s watch?
50. Rooms that are **not testing** (HQ, lunch): hide timers entirely?
51. Bulk start: “start every room whose **current published allocation** is Algebra” — is that the main HQ action, or will they always tap rooms individually?

### H. Clarifications

52. Targeting shortcuts you need on Nov 14 (check all that apply): by **activity**, by **subject/focus**, by **building**, by **floor**, by **saved group**, by **multi-select rooms**, by “all rooms with a running timer.”
53. Is a clarification **one-way HQ → proctor**, or can a proctor **ask a question** back (and should other rooms see that)?
54. Must the proctor **acknowledge** before HQ considers it delivered? Escalation if 3 rooms have not acked?
55. **Math formatting**: plain text, image upload of a handwritten note, both?
56. Do **students** ever see clarifications on a screen, or only via the proctor reading them aloud?
57. Visibility: should Algebra rooms **see** that a Geometry clarification went out (no body), or only their own?

### I. Day-of HQ dashboard

58. Default HQ view: **spreadsheet-like list** of all testing rooms, or a map? (Map can exist without being the home screen.)
59. Columns you want on that list (timer remaining, activity/subject, proctors, headcount/capacity, last ack, flags, building…).
60. Filters: building, floor, subject, “timer not started,” “needs ack,” “over capacity.”
61. What does **red** mean on day-of (timer overdue, no proctor signed in, room closed, over capacity)?
62. Building leads: do they get the **same HQ dashboard filtered to one building**, or a different app?

### J. Public site

63. Public URL preference (`bmt.berkeley.edu/…`, a new subdomain, unset)?
64. What may guests see **per room** — nothing (only campus-wide “Team round in progress”), or “DWIN155 · Algebra” without names?
65. **Countdown** on the public site: contest-wide (“Indiv ends at 11:00”) even though room timers differ? Or no public countdown?
66. Announcements: who writes them, and is there an **approve** step before they hit the guest site?
67. Languages: English only for Nov 14?
68. Need **campus outdoor** context (which building from Sather Gate) or only indoor floors?

### K. Identity and access

69. Phase 2c currently has only **org admin vs regular**. For Nov 14 do you need distinct **HQ / volunteer-admin / planner / proctor** roles, or is “a small allowlist of Google accounts can do everything staff-shaped, proctors only see their room” enough?
70. How does a proctor **get access** — HQ assigns their Google email to a room, then they sign in and see that assignment? (No claim code?)
71. Shared **HQ laptop** vs each HQ member signed in as themselves (audit trail: who sent a clarification)?
72. After the event, should proctors **lose** live controls immediately, keep read-only, or keep nothing?

### L. Artifacts to attach when you can

Not questions so much as source material for the detailed module specs:

73. Capacity spreadsheet (headers + a few example rows; redact if needed).
74. Last BMT’s time × room grid (screenshot or sheet).
75. Volunteer Google Form + the “clean” columns you imported.
76. Sample **roster CSV** (fake names OK).
77. Day-of HQ run-of-show / radio codes if they encode room status.
78. Figma files in the repo or a Drive link (Dwinelle, Wheeler, VLSB).
79. Anything you already consider **non-negotiable UX** (e.g. “proctor must start timer in two taps”).

If you only have time for a subset, **A (11–14) + B (15–18) + H (52–53) + roster headers (31)** unblock the next spec pass the most. We will write per-module specs (catalog, allocator/publish, volunteers, ops, proctor, public) only after those answers, so the first code matches Nov 14 rather than a generic tournament.
