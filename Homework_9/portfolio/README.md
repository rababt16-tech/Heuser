# Homework 8: RABAB-O-MATIC

A portfolio served by a vending machine. Static HTML/CSS/JS, so it runs on GitHub Pages.

## How it works
1. **Insert the coin.** The coin has my face on it. Drag it into the slot, or tap it.
2. **Type a code** on the keypad or keyboard: `A1` About · `A2` Work · `B1` Achievements · `B2` Aspirations · `C1` Homework 7 · `C2` (sold out).
3. The spiral turns and the snack drops into the tray. **Tap the tray** to unwrap it. Each snack is its own page.
4. **Toss the wrapper in the bin** (click the bin, press Esc, or drag the wrapper onto it) to go back to the machine.

## Before you submit
- [ ] Fill in every dashed-outline placeholder on the four pages (search for `class="todo"`), then delete that class.
- [ ] Add your photo as `assets/me.jpg` (square crop works best). Until then a placeholder shows.
- [ ] In `index.html`, find the `C1` slot and replace the `href` with your live Homework 7 URL.
- [ ] Push this folder to `CS_CRP/Homework_8/` in your Heuser repo. With Pages already on, it goes live at `https://<username>.github.io/<repo>/CS_CRP/Homework_8/`.

## Rubric map
| Requirement | Where |
|---|---|
| Static site | Plain HTML/CSS/JS, no server |
| 3+ colors | Night `#1A0F2E`, plum `#3A1F5C`, tangerine `#FF6B2C`, lime `#C8F560`, pink `#FF4FA3`, cream `#F4EAD5` |
| Image of yourself | Your face is the coin (currency), the machine's mascot, and the About-page starburst |
| No header/footer/nav | None used anywhere |
| Unconventional navigation | Coin → keypad code → falling snack → tray; back = toss into bin |
| Animations | Coin bob/insert, marquee bulbs, boot flicker, spiral + falling snack, tray bounce, page wipe, tear-open wrapper, meter fills, flip cards, rising bubbles, crumple-to-bin |
| Unique fonts | Google Fonts: Bungee, Bungee Shade, VT323, Archivo, Caveat |
| Link to Homework 7 | Snack `C1` (`<a href>` in `index.html`) |
| Concept text on site | Taped lime note next to the machine |
| Bonus | `achievements.html` (B1), `aspirations.html` (B2) |

## Files
```
index.html            the machine
about.html            A1 · Rabab Bites (nutrition-facts label)
work.html             A2 · Project Crunch
achievements.html     B1 · Trophy Mix (flip cards)
aspirations.html      B2 · Future Fizz (soda can)
css/machine.css       machine styles
css/wrapper.css       shared snack-wrapper styles
js/machine.js         coin, keypad, vending, tray
js/wrapper.js         tear-open, toss-to-bin
assets/               me.jpg (add yours) + placeholder
```
