# Word Chain

A responsive, static browser game inspired by the supplied soft pink word-grid reference image and built around the original **Sequential Word Association / Chain Association** mechanic.

## Gameplay

Each level contains a complete chain of connected words. Some words are already visible and the remaining words are hidden as individual letter tiles. The active blank is highlighted. Type the missing word and press **Check** or Enter. A correct answer fills that word and advances the active link; the complete chain is never shown before it is solved.

The original 100-level compound-word and phrase-chain dataset is preserved in `data/levels.json` and loaded for the browser from `data/levels.js`. Words connect through familiar compounds, phrases, or recognizable associations.

Wrong answers remove one of five hearts. Hints reveal the first letter of the current blank without giving away the full answer. Every ten actual browser reloads awards two hints, with milestones stored locally so they cannot repeat. Losing all hearts begins a timestamp-based 15-minute recovery period that survives refreshes and browser restarts.

## Project structure

```text
index.html
css/style.css
js/app.js
data/levels.js
data/levels.json
README.md
```

The project has no framework, server, build step, API key, or database. All paths are relative and suitable for a repository subpath.

## Deploy to GitHub Pages

1. Create a public GitHub repository.
2. Upload the contents of this folder, keeping `index.html` at the repository root.
3. Commit the files to the `main` branch.
4. Open **Settings → Pages**.
5. Choose **Deploy from a branch**, select `main`, and choose `/ (root)`.
6. Save and open the generated Pages URL.

## Local state

The display name, current level, completed levels, hearts, hints, refresh milestones, recovery timestamp, completion state, and sound preference are stored in browser `localStorage`. This is intentionally local game progress, not secure authentication. Corrupt storage falls back to a clean game state.

## Controls and accessibility

The game supports mouse, touch, keyboard navigation, Enter-to-submit, visible focus states, live status feedback, disabled states, and reduced-motion preferences. Sound is optional and can be toggled from the top-right control. Reset progress requires confirmation.

## Customization

Edit `data/levels.json` to maintain the human-readable source dataset. If you change the data, regenerate the equivalent `data/levels.js` browser file or update both files together. The browser uses `data/levels.js` because static pages cannot reliably fetch JSON when opened directly from a local file.
