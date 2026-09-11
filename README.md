# The Vinci Game

A minimalist compound-word / phrase-chain puzzle game. Each level shows **one starting word only** — you guess every other word in the chain, where each pair of neighboring words forms a real compound word or familiar phrase (e.g. `RUN → DOWN → TOWN`, because RUN+DOWN=RUNDOWN and DOWN+TOWN=DOWNTOWN).

## How to Play

- Every level gives you the **first word** of the chain. Guess the rest, one word at a time, in order.
- Type your answer and press **Check** (or hit Enter).
- A wrong answer costs one heart. You start with 5; the maximum grows slightly at levels 25, 50, 75, and 100.
- **Hints**: you don't get hints automatically — you earn them by playing. Every **10 page refreshes** of the game, you're awarded **2 hints**. Spend a hint to reveal the first letter of the word you're currently stuck on. Your refresh count and hint balance are saved, so reloading the page to "farm" hints is exactly how it's meant to work, and it can't be reset just by reloading again.
- **Out of hearts**: the game locks for **15 minutes**. This is a real countdown tied to a saved timestamp, not a page timer — closing the tab, refreshing, or restarting your browser will not skip it. When it reaches zero your hearts refill and you continue from the same level.
- Solve all 100 levels — each one harder than the last — to see the final completion screen.

## Project Structure

```
/
├── index.html          # Game shell (all screens/overlays)
├── css/
│   └── style.css       # All styling
├── js/
│   └── app.js          # All game logic
├── data/
│   └── levels.json     # All 100 levels (word chains + reveal pattern)
└── README.md
```

## Player Data

All progress — current level, hearts, hint balance, refresh count, and the 15-minute cooldown timestamp — is stored locally in your browser via `localStorage`. Nothing is sent to a server. Clearing your browser's site data (or using the in-game "Reset Progress" button) erases it.

## Editing the Prize / Completion Message

Open `js/app.js` and edit this line near the top:

```javascript
const prizeContactMessage =
  "You've completed The Vinci Game. Contact me to claim your prize.";
```

This message is only ever shown after Level 100 is genuinely completed through normal gameplay.

## Editing / Adding Levels

Levels live in `data/levels.json`. Each entry looks like:

```json
{
  "id": 1,
  "difficulty": "Beginner",
  "words": ["SEA", "WALL", "PAPER", "BACK", "YARD"],
  "visible": [true, false, false, false, false],
  "displays": ["SEAWALL", "WALLPAPER", "PAPERBACK", "BACKYARD"]
}
```

- `words` is the full solution chain, in order.
- `visible` marks which words are shown to the player up front (currently only index 0 — the "one word given" rule).
- `displays` is the compound word/phrase each adjacent pair forms (shown when the chain is completed).

## Running Locally

This project uses `fetch()` to load `data/levels.json`, which most browsers block on a bare `file://` page. To test locally, serve the folder with any static server, for example:

```bash
python3 -m http.server 8000
```

then open `http://localhost:8000`.

## Deploying to GitHub Pages

1. Create a new GitHub repository.
2. Upload all the files in this folder (keeping the folder structure intact).
3. Commit the changes.
4. Open the repository's **Settings** tab.
5. Go to **Pages**.
6. Under "Build and deployment", choose **Deploy from a branch**, select your branch (e.g. `main`) and the root (`/`) folder.
7. Save.
8. Open the GitHub Pages URL it gives you — the game should load and work immediately, no build step required.

## Notes

- No backend, database, API key, or server-side code is used anywhere — this is a fully static site.
- All game-integrity checks (level completion, cooldown expiry, hint spending) run client-side. As with any static browser game, a determined player could edit their own `localStorage`; there is no server to prevent that, and none is claimed.
