# Normalization rollback and temporary import repair

Version 1.7.49 restores the constant -7 LUFS / -1 dBTP profile used in 1.7.44–1.7.47. Peak-constrained recordings retain their dynamics and may remain below the target. Existing -18 LUFS markers are invalidated by the restored profile; preparation measures the current recording before changing its gain.

The reported duplicate of «Время и Стекло — Дим» was a stale row for a `.playerium-UUID.mp3` staging file created beside the actual recording during atomic normalization. A folder scan imported the staging file before its rename. Its path later disappeared, but its unavailable row stayed visible in Added.

Windows native scans, Android document scans and JavaScript folder imports now reject reserved temporary names. Existing unlinked staging rows are merged only when one real recording in the same directory matches title, artist, duration, size and modification time. The database transaction preserves likes and playlist order and writes a recovery record before removing the staging row. Audio files are never deleted by this repair. Cloud-linked or ambiguous temporary rows are retained internally and excluded from visible collections rather than guessed at.

A copied desktop snapshot contained 65 rows, including the reported duplicate. Replaying the migration in an isolated database produced 59 rows, one «Дим», and six recovery records. The production database and audio files were not modified by this diagnostic.

File rescans also retain logical cloud recording identity while invalidating loudness measurements when the file bytes may have changed.

This release includes the local Added-artwork changes: automatic generation, replacement from the large cover, a spinner with «Обложка генерируется…», persistent artwork, and resuming a replacement request after restart.

Validation before packaging: 170 unit tests; targeted desktop and mobile browser coverage for artwork, device menus, normalization controls and collection sorting. Publication is followed by no further checks at the user's request.
