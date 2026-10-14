# Playerium visual test 1.7.24
Vanilla ES modules, Electron and Android WebView. Preserve the native player and existing synchronization protocol.
Six palettes and the brown vinyl icon remain. Use neutral layered surfaces and local Inter, artwork as the color focus, 12px cards, 20px dialogs, 16/24px spacing.
All twenty experiment IDs are documented in docs/visual-test-1.7.24.md and enabled in js/visual-features.js. Keep independent rollback boundaries.
Existing menus, keyboard/touch controls and media sessions are reused. Real decoded audio peaks are cached separately from source music. Native artwork/waveform caches remain private to the application.
Design references: Refero warm neutral surfaces, Watermelon waveform interaction, Skiper compact music button states. Adapted for the existing stack; no React migration or paid components.
