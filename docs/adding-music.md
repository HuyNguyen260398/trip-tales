# Adding Music Tracks to Triptales

## Where music lives

| Path | Purpose |
|---|---|
| `public/music/*.wav` (or `.mp3`) | Audio files served statically to the browser |
| `src/lib/music.ts` | Catalogue — the app reads `TRACKS` to populate the picker |
| `public/music/LICENSES.md` | Required attribution for every bundled track |

---

## Steps to add a new track

### 1. Find a CC0 track

Download from one of these sources (filter by CC0 / public domain):

- **Pixabay Music** — https://pixabay.com/music/
- **Free Music Archive** — https://freemusicarchive.org/ → Browse → License: CC0 1.0

Any common audio format works (MP3, WAV, OGG). Keep files under ~5 MB for fast load.

### 2. Place the file in `public/music/`

```
public/music/your-track-name.mp3
```

Use a short, lowercase, hyphenated filename. The extension is preserved as-is.

### 3. Add an entry to `src/lib/music.ts`

Open `src/lib/music.ts` and add a new object to the `TRACKS` array:

```ts
export const TRACKS: Track[] = [
  { id: "sunrise", title: "Sunrise", src: "/music/sunrise.wav" },
  { id: "wander",  title: "Wander",  src: "/music/wander.wav"  },
  // Add your track here:
  { id: "your-id", title: "Display Name", src: "/music/your-track-name.mp3" },
];
```

- `id` — unique slug used in the database; never reuse or rename after tracks have been saved
- `title` — shown in the music picker dropdown
- `src` — must match the filename in `public/music/` exactly (case-sensitive)

### 4. Record attribution in `public/music/LICENSES.md`

Add a line for the new track:

```markdown
- your-track-name.mp3 — "Track Title" by Artist Name, CC0, https://source-url
```

---

## Removing a track

1. Delete the file from `public/music/`.
2. Remove its entry from `TRACKS` in `src/lib/music.ts`.
3. Remove the line from `public/music/LICENSES.md`.

> **Note:** Removing a track ID that users have already saved in reels won't break anything — the reel blob is already recorded and stored. The missing track just won't appear in the picker for new reels.

---

## Replacing the placeholder stubs

`sunrise.wav` and `wander.wav` are currently 1-second silent stubs.
To replace them, simply overwrite the files with real audio — no code changes needed since the `id` and `src` stay the same. Update `LICENSES.md` with the real track's attribution.
