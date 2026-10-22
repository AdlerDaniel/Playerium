# Playerium visual test 1.7.24
Vanilla ES modules, Electron and Android WebView. Preserve the native player and existing synchronization protocol.
Six palettes and the brown vinyl icon remain. Use neutral layered surfaces and local Inter, artwork as the color focus, 12px cards, 20px dialogs, 16/24px spacing.
All twenty experiment IDs are documented in docs/visual-test-1.7.24.md and enabled in js/visual-features.js. Keep independent rollback boundaries.
Existing menus, keyboard/touch controls and media sessions are reused. Real decoded audio peaks are cached separately from source music. Native artwork/waveform caches remain private to the application.
Design references: Refero warm neutral surfaces, Watermelon waveform interaction, Skiper compact music button states. Adapted for the existing stack; no React migration or paid components.

## Interface refresh 1.7.50
The user requested a substantial redesign, replacing earlier limits on visual changes. Keep the native playback and synchronization architecture, palette tokens, local fonts and existing keyboard/touch semantics.
The home screen now uses an artwork-led collection feature, an explicit play action and grouped quick access. Shared cards use 12–20px corners and a 4/8px spacing rhythm. Desktop playback has flexible track and transport columns with a fixed, non-shrinking utility area; the volume button and range have separate bounds. Device labels remain in the picker and its accessible button label.
Menus have quiet group labels, separators and a final destructive group. Mobile sheets stay left-aligned, size to content and scroll below an 85dvh cap; modal actions remain outside the scrolling body. Keep compact track density at 56px.
Use CSS/WAAPI for short, interruptible feedback: 120–180ms controls/menus and 220ms dialogs. Do not animate search typing or background list refreshes. Honor reduced motion. Skeletons mirror actual asynchronous content; retain decoded artwork during refreshes.
Source-backed references reviewed: [Prism desktop music player](https://www.prismplayer.app/), [Watermelon grouped dropdown](https://ui.watermelon.sh/components/dropdown-menu). Adapt the hierarchy to vanilla modules; do not add React dependencies. AI cover lifecycle follows the [AI Horde integration guide](https://github.com/Haidra-Org/AI-Horde/blob/main/README_integration.md): persist the job, poll, retrieve and cache the image. Anonymous queue delays must remain visible as progress, not a failure.
