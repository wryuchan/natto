# Repository Working Rules

- Keep the game a static, build-free ES module application.
- Use only relative runtime URLs; do not add CDN or API dependencies.
- Keep simulation state JSON-serializable and separate from DOM and Three.js objects.
- Run `npm test` after each production change.
- Regenerate the checked-in Three.js runtime with `npm run vendor:sync` after dependency changes.

