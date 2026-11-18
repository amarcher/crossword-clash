# Marketing videos

Two videos, each as a vertical Short and a 16:9 cut, published on the Crossword
Clash YouTube channel (`@crosswordclashapp`, channel ID
`UC-tfh--sRXzKUg3vDcgHdtA`, owned by the Fable Designer Google login).

| File | What | YouTube |
| --- | --- | --- |
| `crossword-clash-reel.mp4` | The reel, 1080×1920, 28.5 s, both store badges | https://youtube.com/shorts/hI9UOU5muq0 |
| `crossword-clash-reel-wide.mp4` | The reel, 1920×1080, Google Play badge only | https://youtu.be/XmGX4YKABBs |
| `crossword-clash-reel-wide-social.mp4` | The wide reel with both store badges, for social posts | Facebook only, see below |
| `crossword-clash-studio-short.mp4` | The studio video, 1080×1920, 26.5 s | https://youtube.com/shorts/mI40utmWlug |
| `crossword-clash-studio-wide.mp4` | The studio video, 1920×1080 | https://youtu.be/Gn352Mn2-XE |

The wide reel is the Play listing's video (`../play-store/README.md`). Play
shows listing videos in a landscape player and does not want a listing to point
at another store, hence the separate cut with one badge.

## Facebook and Instagram

The Page is https://www.facebook.com/crosswordclash and the Instagram profile
is https://www.instagram.com/crosswordclash/ (a business account, connected to
the Page). Both use the channel picture; the Page cover is the banner cropped
with `crop=2200:837:180:480`.

| Post | Facebook | Instagram |
| --- | --- | --- |
| The reel, vertical | https://www.facebook.com/reel/1004278149389730/ | https://www.instagram.com/crosswordclash/reel/Df23tWwJFm7/ |
| The studio video, vertical | https://www.facebook.com/reel/1436828244769037/ | https://www.instagram.com/crosswordclash/reel/Df24CbSJVnF/ |
| The reel, 16:9, pinned on the Page | https://www.facebook.com/reel/2142981769924527 | |

The two vertical Facebook links are matched to their videos by posting order.
A vertical video sits in a tall black box in the Page's feed, so the pinned
post is the 16:9 cut. `reel-fb.mjs` is `reel-wide.mjs` with the App Store
badge back on the end card (frames 751 to 855; the rest are the wide reel's).
Uploads through the browser are capped at 10 MB, so the social copies are
encoded at `-crf 21`. On Instagram, upload a cover image with the reel: the
web composer's frame picker left the first reel with a blank cover.

`youtube/` holds the channel picture (the app icon at 80% on its own blue, so
the circle crop keeps both tiles) and the 2560×1440 banner.

## What is real and what is staged

Every screen is the app itself, captured with Playwright at a store device's
pixel size. The data is invented: player names are Maya, Theo and Priya, and
the solves are scripted.

- **Reel:** the room and TV scenes are a real room on production, played by
  three test accounts. The race scene is staged with `stage.mjs`.
- **Studio video:** the layout, fill and AI clue drafts are real, made on
  production with the Plus test account. The race is a real room started from
  the puzzle's play-test page. Nothing was published: the publish dialog was
  filled in and never submitted, its username was changed to `@maya` in the
  capture, and the community list is answered locally by
  `studio-community.mjs` with made-up puzzles. The wait for 30 clue drafts
  (about 25 seconds) is cut down to a moment.

## Rebuilding

The scripts in `scripts/` were written in a scratch folder and are kept as they
ran. They expect:

- `ST`: a work folder for captures and frames (`$ST/frames/<scene>/`,
  `$ST/raw/`, `$ST/studio/`, `$ST/reel/`).
- The repo root as the working directory, with `pnpm dev` on port 5311 (the
  render pages borrow the site's fonts and backdrop from it).
- `DRIVE_URL` for captures: the dev server by default, or
  `https://crosswordclash.com` for the studio, whose word list is not built in
  a fresh checkout.
- Test accounts in `~/.config/crossword-clash/shots-accounts.json` (keys `free`
  and `plus`, each with `email` and `password`). Never commit that file.
- The two official store badges at `$ST/badges/app-store.svg` and
  `$ST/badges/google-play.png`, from Apple's and Google's marketing pages.
- `ffmpeg`, and `numpy` for `music.py` (the backing track is synthesized, so
  there is nothing to license).

| Script | Does |
| --- | --- |
| `cap.mjs` | Opens the app at a device size, signed in as a test account |
| `room.mjs`, `race2.mjs`, `stage.mjs` | The reel's captures: the room on a TV and phones, the staged race |
| `studio-cap.mjs` | The studio on a phone: theme entries, lay out, fill, clue drafts, publish dialog |
| `studio-race.mjs` | A room on the studio puzzle with three players |
| `studio-community.mjs` | The community list with a local, made-up response |
| `reel.mjs`, `reel-wide.mjs` | Render the reel's frames, vertical and 16:9 |
| `reel-fb.mjs` | The 16:9 reel with both badges on the end card |
| `reel-studio.mjs`, `reel-studio-wide.mjs` | Render the studio video's frames |
| `studio-tiles-cap.mjs`, `compose.mjs` | The studio screen at the four store sizes, and the store tiles (`06-studio` in `../app-store` and `../play-store`) |
| `banner.mjs` | Renders the channel banner |
| `music.py` | Writes `music.wav` |

Encode a frame folder with:

```sh
ffmpeg -framerate 30 -i frames/%05d.jpg -i music.wav -vf scale=1080:1920:flags=lanczos \
  -c:v libx264 -preset slow -crf 17 -pix_fmt yuv420p -c:a aac -b:a 192k -shortest \
  -movflags +faststart out.mp4
```

Use `scale=1920:1080` for the wide cuts. The studio video is two seconds
shorter than the track, so it adds `-af "afade=t=out:st=25.3:d=1.2"`.

The studio captures spend the Plus test account's AI clue drafts (40 a month)
and each room capture leaves a finished test room on production.

## Uploading to YouTube

Studio's upload form asks three things on every video. These were answered:
not made for kids, no paid promotion, and "No" to AI use (the question covers
realistic altered footage and AI music as the main focus). Links in a
description are not clickable until the channel completes YouTube's one-time
verification.
