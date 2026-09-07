# ROTATION — PvE Playtest Build 0.2

A browser-playable prototype of Mathew's lane-based card game.

## Run it

Unzip the folder and open `index.html` in a modern desktop browser. No install or server is required.

## New in 0.2

- Player vs **Abyss AI** PvE loop
- AI placement, spell use, lane choices, and occasional Boss Ability use
- notebook-inspired physical card layout: Name / Type / HP header, move list, GX text, and four corner rotation icons
- built-in procedural **pixel portraits** for every card so the roster has art immediately; these are intended as replaceable prototype art
- hover/focus `i` markers beside moves showing the authoritative move definition
- slow lane-by-lane attack presentation with **LANE 1 → LANE 5** cues
- move cinematics and VFX families: Bullseye scope, fire, lightning, shields, poison clouds, frost, void effects, impact cues
- lightweight synthesized combat SFX
- 1× / 2× cinematic speed toggle
- revised Multi-Strike: adjacent ally (right favored) immediately performs its **next** move and advances rotation normally
- Poison values capped at 3 in the engine

## Playtest deck rules

- 30 cards exactly
- maximum 2 copies of a normal card
- maximum 1 copy of each Boss
- maximum 2 Bosses total
- maximum 8 Spells
- minimum 20 Units (Bosses count)

## Art workflow

The current portraits are generated directly in the browser from each card's name/type. They deliberately use a chunky prototype pixel-art language so every card has a readable identity without external image files. Later, individual artwork can replace a portrait without changing combat logic.

## Prototype note

This build focuses on feel, readability, PvE flow, and cinematic combat. The game engine remains data-driven: card stats/text live in `cards.js`, while the combat/UI logic lives in `app.js`.
