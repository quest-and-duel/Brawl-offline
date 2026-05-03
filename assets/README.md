# Game assets (optional)

- Run `npm run gen:assets` from repo root with `AI302_API_KEY` in `.env` to generate PNG sprites via [302.ai](https://302.ai) and refresh `manifest.json`.
- Without generated files the game uses emoji fallbacks and procedural background.
- **Music / SFX:** place `.mp3` files under `music/` and `sfx/` and extend `manifest.json` (see `js/game.js` `ASSET_MANIFEST` keys) or regenerate after editing the loader.
