# Sounder palettes and Playerium layout

Playerium imports Sounder's six accents in both light and dark mode (12 palettes). `js/sounder-palettes.js` contains the exact output of `sounder/theme.py:tokens()` from `C:/project/Sounder`, including QColor blending and contrast adjustment. The source SHA-256 is recorded with the exported tokens. No extra desaturation, whitening, or palette mixing is applied in Playerium. Radix scale licensing is retained in `assets/LICENSE-Radix.txt`.

The source accents are violet, brown, red, blue, green and yellow. Mode and accent are selected separately, matching Sounder's controls. Old Playerium theme preferences map to the nearest new accent/mode without deleting settings.

On Windows the library is a right-aligned header rail: Added sits nearest the circular profile; user playlists grow leftwards in creation order. The create button remains fixed at the left of the rail as covers scroll. Covers have accessible names and context menus without visible captions. Android uses the full library screen from 1.7.51, with named collections, search, filters and list/grid choices; the desktop header rail is hidden. Its home filters return beside the profile, and content screens keep their own headers. Folder import lives in Settings; individual file import remains available.

The profile opens a top-aligned dialog above existing player windows. The backdrop blurs, background controls become inert, focus stays inside, Escape or an outside click closes it and returns focus. Its placement follows the free [Watermelon Dialog 17](https://ui.watermelon.sh/components/dialog) pattern, implemented with existing vanilla modules. There is no new framework or dependency. Nested confirmation dialogs stay above settings.

Pointer clicks do not draw focus outlines; Tab navigation keeps a visible theme-colored focus indicator. Shuffle/repeat use the exact Sounder accent for enabled state and muted icons otherwise, without status dots. The volume glyph has a padded 24-unit viewBox.

Custom profile images are resized and stored locally; they override the Google photo, persist across restarts, and can be reset independently from Google authentication. Shuffle state waits briefly for native command acknowledgement before accepting an old snapshot. Both foreground and background Android state publish actual shuffle order rather than the physical import order.
