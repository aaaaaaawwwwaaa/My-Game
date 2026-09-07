# ROTATION — Playtest Build 0.1

A browser-playable local prototype of Mathew's lane-based card game.

## Run it

Open `index.html` in a modern browser. No install or server is required.

## Implemented

- 2 players, 100 HP Kingdoms
- 5 mirrored lanes
- 5-card opening hand, 2 cards drawn each turn
- placement + attack periods
- left-to-right lane resolution
- automatic move rotation + self-discard
- persistent unit Defense and Kingdom Defense
- standard move engine covering the current keyword set
- revised Multi-Strike: adjacent ally immediately fires its next move and advances rotation
- Boss abilities and GX hooks
- deck builder with playtest restrictions
- a curated card pool transcribed from the notebooks/conversation
- spells, status effects, DoTs, revival, rotation manipulation

## Playtest deck rules

- 30 cards exactly
- maximum 2 copies of a normal card
- maximum 1 copy of each Boss
- maximum 2 Bosses total
- maximum 8 Spells
- minimum 20 Units (Bosses count)

## Important prototype notes

This is a first playable rules engine, not a final balance build. Some notebook GX abilities that were ambiguous were represented conservatively so the match loop stays playable. The engine is intentionally data-driven: card text/values can be changed in `cards.js` without rewriting the board/combat code.

Deck-out currently has no damage penalty; an empty deck simply stops drawing. This was intentionally left open for playtesting.
