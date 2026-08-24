# GNARCADE
### Vision and Idea Document, v0.1
*Domain: gnarcade.games | Owner: John Overton, Open Glades LLC | Started: a 2:30am idea in August 2026*

---

## 1. Origin

This started the way the good ones do: late at night, kid wakes up, brain won't shut off, domain gets purchased. The seed was a memory of an attack helicopter arcade game from early childhood, probably Twin Cobra or Desert Strike, and the thought: remake old-style games people can play in the browser and pay a quarter a game for, like a real arcade.

Within one conversation the idea grew three layers:

1. **A game**: a roguelike attack helicopter shooter mixing Contra-style side scrolling, Twin Cobra-style top-down, and Desert Strike-style free roam.
2. **A place**: not a game portal, but a virtual arcade building you walk into.
3. **A business**: quarters and token packs now, private rentals later.

The moment that defined the whole thing was the change machine: a machine in the corner of the arcade where you feed in a crinkled dollar (with the animation and the sound), it asks "are you sure," and if you say no it spits the bill back out like the machines that could never read your dollar. That detail is the brand. **The paying part is part of the fun.** Nobody else in the space has figured that out.

---

## 2. The Concept

**Gnarcade is a place, not a catalog.**

Landing on gnarcade.games shows an illustrated old-school arcade building, GNARCADE over the door, dusk light, neon hum. Click the door and you walk in.

Inside is a single beautifully drawn pixel-art scene with clickable hotspots:

- **The greeter** at the front desk: account creation and sign-in, in character.
- **The change machine** in the corner: the payment flow. Crinkled dollar animation, the reject sound, token counter clunks upward. Buying tokens should be a bit people show their friends.
- **The concession area**: tables that are forum threads. Talk about the games over virtual nachos. Async community, not live chat.
- **The score wall**: leaderboards posted between the restroom doors, updated automatically.
- **The game room**: rows of cabinets, pinball, race games, arcade games, each one a hotspot. Attract-mode sounds bleed from cabinets on hover. 8-bit music, cozy retro vibe.

**Cabinet presentation:** games render at a fixed 640x480 inside illustrated cabinet art, bezel, marquee, and coin slot around the screen. Maximize goes fullscreen with largest-fit pixel scaling and black bars. Optional CRT scanlines. Playing a game should feel like standing at the machine.

Everything above is static art plus hotspots. It ships in weeks, works on mobile, and delivers nearly all of the vibe of a walkable world at a fraction of the cost.

---

## 3. Tone and Brand

- Late 80s and early 90s arcade nostalgia, played with total sincerity and a wink.
- Cheese is a feature: cool dudes, hot babes, over-the-top villains, freeze-frame high-fives.
- Warm, cozy, slightly gnarly. A place, with personality, that happens to sell games.
- Original games only. No emulated ROMs, no licensed IP, no legal gray zones.
- No crypto, no gambling mechanics, no prize tournaments. Quarters buy fun, not odds.

---

## 4. Business Model

**Core loop: tokens.** Card processors charge roughly $0.30 plus 2.9% per transaction, so a single $0.25 play can never be sold alone. The unit of sale is the token pack, themed as the change machine's bill slots: $1, $2, $5, $20. A play costs one token.

- **Free first credit** on every cabinet. The games have to earn the quarter; free-to-start converts better than a hard paywall in a market trained on free.
- **Roguelike economics fit quarters**: a run ends, a token continues. Same psychology that funded the original arcades, minus the predatory difficulty spikes.
- **Subscription later, maybe**: an all-access monthly pass once there are enough cabinets to justify it. Not at launch.
- **Private rentals (Phase 4)**: rent the arcade for a night, roughly $30, up to 10 friends by invite link, unlimited games, session leaderboards, host controls. It is the Jackbox model, not the MMO model: no strangers, so no heavy moderation burden. Birthday parties, remote friend groups, and quietly the big one, corporate remote team events, which pay far more than $30 for far worse activities. No movie rentals: public-performance licensing is a trap. Chiptune playlists and public-domain B-movies on a corner CRT deliver the vibe for free.

**Market position:** the current landscape splits into free-with-ads portals (CrazyGames and emulator sites), itch.io one-time purchases, one thin token-arcade site with no personality, and crypto score-tournament grifts. Nobody occupies "original games, genuine charm, pay-per-play as part of the experience." That gap is the wedge.

---

## 5. Launch Title: Steel Talon, Operation Greenfire

The proof-of-concept cabinet and the market test. If nobody pays for game one, the platform question answers itself.

- Roguelike attack-helicopter shooter, 10 levels, 2 to 5 minutes each.
- Three modes taught in the tutorial and mixed throughout: top-down shmup, Contra-style side scroll, and Desert Strike-style free roam. Missions structured as infiltrate, strike, and exfiltrate arcs.
- Story: an unknown autonomous force expands from the deep Amazon. Villain Preston Vayne, a canceled defense contractor "demonstrating the product" with his stolen MEDUSA swarm AI. Corny cutscenes, hot flight officer briefings, one human rival ace, a monologue-powered final boss.
- Meta-progression: salvage buys permanent chopper upgrades between runs. Seeded, deterministic runs enable daily challenges and future replays.
- Full details live in two companion documents: **steel-talon-beat-sheet.md** (story, levels, cast) and **steel-talon-tech-spec.md** (architecture, build order).

---

## 6. Technical Philosophy

Applies to Steel Talon first and every future cabinet after:

- **Hand-rolled, no engine.** Plain TypeScript, Canvas 2D, Web Audio. The engine layer is ~600 readable lines and gets reused for every cabinet. Understanding beats velocity; velocity follows anyway.
- **Assets are code.** Sprites are pixel-string grids indexing a 32-color palette, rasterized at boot. Sound is synthesized: oscillator SFX and a four-channel NES-layout sequencer for music. No asset files exist. The entire game is diffable plain text.
- **The 640x480 contract.** Every game renders to a fixed 640x480 buffer, pixel-scaled to the display. This is what makes the cabinet framing, fullscreen, and future CRT shader trivially consistent across all cabinets.
- **Piece by piece.** Built in small runnable milestones, each understood before the next. No vibe-coded ensembles. The point is a codebase John can hold in his head.
- **The shell interface is thin.** Each game exposes start(seed) and emits gameover(score, salvage). The arcade wraps games; it never reaches inside them. Token checks, leaderboards, and rentals all hang off that seam.

---

## 7. Roadmap

**Phase 1: The Game (now)**
Steel Talon Level 1 vertical slice, then the full 10 levels. Playable standalone from a static folder. This is where all effort goes until it is fun.

**Phase 2: The Arcade Shell**
Illustrated exterior and interior scene, greeter and accounts, the change machine with full animation and sound, Steel Talon in its cabinet with bezel art, score wall. Free first credit, token packs live. Gnarcade opens with one cabinet, which is exactly how real arcades started.

**Phase 3: More Cabinets and Community**
Second and third games on the shared engine (candidates: the pinball machine, a race game, another shooter). Concession-area forum tables. Daily challenge seeds. Evaluate an all-access pass.

**Phase 4: Rent the Place Out**
Private instances by invite link, host controls, session leaderboards, party-focused game modes (head-to-head scoring, race nights). Market to remote teams as well as friend groups.

**Someday / Maybe**
- Avatars and a walkable public arcade (the Habbo layer). Only if the community demands it; brings presence servers, live moderation, and safety tooling.
- Browser flight sims in the Jane's lineage, and browser RTS titles. Bigger cabinets for a bigger arcade.
- Native or Steam wrappers for the greatest hits.

**Sequencing rule that governs everything:** none of the upper floors exist without one game people love. Chopper first. Building second. Party third.

---

## 8. Open Questions

- Name and trade dress for the launch title (Steel Talon is a working title; check for conflicts before art is made).
- Token pricing: what does one token cost, and what do the $1, $2, $5, and $20 packs contain? Bonus tokens on bigger bills, like real change machines?
- Age posture: no gambling mechanics keeps this clean, but forums and rentals still need a terms-of-service pass.
- Where does Gnarcade sit inside Open Glades relative to Sprout Track and Parallax for time and attention? (Honest answer as of writing: nights, when Jackson allows.)
- Accessibility of the arcade metaphor on small phones: the scene needs a tap-friendly fallback nav.

---

*"Inveniam viam aut faciam."  Also acceptable: insert coin to continue.*