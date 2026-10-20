# Current notification artwork and shuffled next-track previews

## Findings

Android owns the shuffled playback order, but the WebView previously predicted
the next song with `queue[queueIndex + 1]`. Changing shuffle while keeping the
current song did not emit a queue update. The notification cover prefetch used
the same incorrect prediction.

Media3 1.3.1's DefaultMediaNotificationProvider discards its previous pending
bitmap callback only when the next metadata produces a bitmap future. An item
without artwork produces no future, leaving the old callback able to publish an
outdated notification. Playerium also attached even cached artwork only after a
media-item transition, leaving an unnecessary empty-art interval.

Source reviewed:
https://github.com/androidx/media/blob/1.3.1/libraries/session/src/main/java/androidx/media3/session/DefaultMediaNotificationProvider.java

## Changes

- Every native queue item starts with its own cached cover or an explicit neutral
  PNG placeholder. A later real cover replaces the placeholder bytes and URI.
- A late WebView encoding cannot overwrite a newer cover for the same recording.
- Native snapshots include the exact Media3 shuffle permutation, preserving
  duplicate queue positions. The next card, upcoming list and artwork prefetch
  use that order and refresh even when the current song stays the same.
- The next card invokes the normal next command. Repeat-all wrapping follows
  the playback order. Invalid/missing native shuffle permutations are not guessed.
- Queue drag handles use displayed neighbours; native shuffle edits update its
  permutation without seeking or restarting the active media source. Batch
  removal preserves the current physical index even when future shuffled items
  lie before it in the stored queue. Native shuffle order is saved for restoration.

## Verification

Node regressions cover shuffle updates, prefetch, repeat modes, exact-index
reordering/removal, invalid permutations and late artwork encodings. Browser
regressions cover the next card and queue on desktop and phone layouts.

`MediaCardTest` adds red -> no cover -> blue -> no cover -> late green transitions
in a fixed shuffled order. It checks both the platform MediaController bitmap
and the posted notification title/large icon. Android emulator verification runs
in GitHub Actions; no physical tablet is connected to this workspace.
