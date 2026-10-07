# Playerium 1.7.0 — interface verification

## References and scope

The primary reference is Spotify's publicly documented mobile music interface. Android receives priority, with equivalent desktop changes. Sources reviewed on 2026-10-07:

- [Mobile library: search, filters, sorting, list/grid](https://newsroom.spotify.com/2021-04-29/listeners-can-explore-their-spotify-collections-faster-and-easier-with-a-new-your-library-2/) (2021 screenshot; historical reference, not a claim about the current build).
- [Mobile queue, playlist tools and Create tab](https://newsroom.spotify.com/2025-05-07/experience-a-new-dimension-of-music-discovery-with-more-controls-and-enhanced-tools/) (2025 screenshot).
- [2026 queue and playlist updates](https://newsroom.spotify.com/2026-05-28/playlist-folders-mobile-queue-controls-updates/) (bulk queue management described by Spotify).
- [Desktop library and Now Playing](https://newsroom.spotify.com/2023-06-20/spotify-desktop-experience-redesign-your-library-now-playing-views-customize/).
- Public `open.spotify.com` reference images gathered during the 1.6.0 search work.

No Spotify screenshots, music, logos or proprietary fonts are bundled. Playerium retains its name, local music features and Inter font. The Android UI is still rendered in WebView with native file/audio/download integration; this release does **not** convert it to Android native UI widgets. An exact match to every currently deployed Spotify variant has not been established. Spotify account, cloud library, recommendations, Premium-only functionality, podcasts, Jam, AI playlists, sleep timer and folder grouping are not reproduced by decorative controls.

## Implemented throughout the application

| Area | Changes and interactions verified |
| --- | --- |
| Home | Album/artist shelves in the default dashboard; bounded desktop card sizes; artwork fallback while preserving play controls |
| Library | Search without losing input focus; filters; list/grid preference; sorting; actual playlist covers; playlist actions |
| Playlists | Add, sort, edit, overflow menu; in-app name/description forms; real persistence; confirmation before deletion |
| Albums | Artwork-derived background, compact mobile metadata, artist navigation and collection controls |
| Artists | Full-width cover backdrop, distinct hero layout, tracks and real local discography links |
| Player | Album/artist context, artwork fallback, share action, album/artist cards, swipe-down collapse, focus handling |
| Queue | Full-screen mobile view; reorder via touch/mouse handle or keyboard; multi-select removal; shuffle/repeat; playback preserved |
| Settings | Flat sections, readable labels, accessible equalizer/presets/theme controls; refresh replaces previous content |
| Menus/navigation | Shared touch sheets and desktop menus; visible keyboard focus, Escape and focus return; in-app forms; Android Back dismisses the top surface, player or queue, then follows app navigation |
| Motion | Short page/menu transitions and player swipe; respects reduced-motion preference |

## Validation

`npm run check`, `npm test`, `PLAYERIUM_BROWSER_PATH=/usr/bin/chromium npm run test:browser`.

New browser scenarios use generated WAV files and explicitly synthetic artwork. They exercise real import, IndexedDB playlist changes and browser audio playback. Queue tests assert the current track, audio source, play state and position survive edits without another `loadstart`. A native bridge unit test also checks `reset:false`, paused state and repeated track occurrences during reordering.

Screenshots are produced for home, library, playlist, artist, album, settings, queue, player and narrow layouts; they are visually reviewed against the public references, not scored as pixel-identical to a current native Spotify installation. Release CI additionally verifies Windows Electron and Android API 29 / API 35 (16 KB page size), then builds signed APK and Windows installers. The APK signing certificate is compared with 1.6.0 before publication.

Network/download limitations from [SEARCH-VERIFICATION.md](SEARCH-VERIFICATION.md) still apply: this interface update does not constitute verification from Russia with or without VPN.
