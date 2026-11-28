# SpeedTag – Video Speed & Volume Control (Firefox extension)

Shows the current speed (e.g. `1.5`) at the top-left of every playing video.

- Keys: `[` slower, `]` faster, `\` reset to 1×, `9` or `(` quieter, `0` or `)` louder (10% steps; ignored while typing in a text box)
- Remembers your speed: every next video (and every tab) starts at the speed you last chose. Turn off in the popup.
- Tag size: grows with the video (bigger in fullscreen), plus Small / Normal / Large / Extra large in the popup. Saved and used on every video.
- Toolbar popup: −/+ buttons, presets, and settings (watermark on/off, hide at 1×, tag size, shortcuts, step)
- Light on CPU: it is event-driven, and its only timer runs once a second while a video plays
- Collects no data and needs only the `storage` permission

## Test locally
1. Firefox → `about:debugging#/runtime/this-firefox` → **Load Temporary Add-on…**
2. Pick `manifest.json` in this folder.
3. Play any video (YouTube, etc.) and press `]`.

## Publish to addons.mozilla.org
1. Build: `zip -r ../speedtag-1.2.7.zip manifest.json content.js popup.html popup.js icons`
2. Go to https://addons.mozilla.org/developers/ → **Submit a New Add-on** → "On this site" → upload the zip.
3. Source code upload: answer **No** (nothing is minified or bundled).
4. For each new version, bump `"version"` in `manifest.json` and rebuild the zip.

Optional lint, the same checks AMO runs: `npx web-ext lint`
