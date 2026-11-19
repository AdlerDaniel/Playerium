package com.playerium.music;

import android.os.Handler;
import androidx.media3.common.C;
import androidx.media3.common.Player;
import androidx.media3.exoplayer.ExoPlayer;

/** Mixes two decks and promotes the one already playing when the songs cross. */
@androidx.annotation.OptIn(markerClass = androidx.media3.common.util.UnstableApi.class)
final class PlaybackCrossfade {
    interface DeckFactory { Deck create(int index); }
    interface DeckPromotion { void promote(Deck deck); }

    static final class Deck {
        final ExoPlayer player;
        final TrackVolumeProcessor gain;

        Deck(ExoPlayer player, TrackVolumeProcessor gain) {
            this.player = player;
            this.gain = gain;
        }
    }

    private ExoPlayer main;
    private final Handler handler;
    private final DeckFactory factory;
    private final DeckPromotion promotion;
    private final Runnable clock = this::tick;
    private Deck incoming;
    private int fromIndex = C.INDEX_UNSET, nextIndex = C.INDEX_UNSET;
    private long overlap, incomingStart;
    private boolean started, failed;
    private int seconds;
    private float volume = .8f;

    PlaybackCrossfade(ExoPlayer main, Handler handler, DeckFactory factory, DeckPromotion promotion) {
        this.main = main;
        this.handler = handler;
        this.factory = factory;
        this.promotion = promotion;
    }

    int seconds() { return seconds; }
    float volume() { return volume; }

    void configure(int seconds) {
        int value = Math.max(0, Math.min(10, seconds));
        if (this.seconds != value) { this.seconds = value; cancel(); }
        wake();
    }

    void setVolume(double value) {
        volume = (float) Math.max(0, Math.min(1, value));
        applyVolume();
    }

    void wake() {
        handler.removeCallbacks(clock);
        if (seconds > 0 && main.getPlayWhenReady()) handler.post(clock);
    }

    void cancel() {
        clearDeck();
        failed = false;
        fromIndex = C.INDEX_UNSET;
        main.setVolume(volume);
    }

    void release() {
        handler.removeCallbacks(clock);
        clearDeck();
    }

    private void clearDeck() {
        if (incoming != null) incoming.player.release();
        incoming = null;
        nextIndex = C.INDEX_UNSET;
        started = false;
    }

    void discontinuity(Player.PositionInfo old, Player.PositionInfo next, int reason) {
        if (reason == Player.DISCONTINUITY_REASON_AUTO_TRANSITION && old.mediaItemIndex == fromIndex
                && next.mediaItemIndex == nextIndex && incomingPlaying()) {
            handOff();
            return;
        }
        cancel();
        wake();
    }

    private boolean incomingPlaying() {
        return started && incoming.player.isPlaying() && incoming.player.getCurrentPosition() > incomingStart;
    }

    private void handOff() {
        Deck next = incoming;
        incoming = null;
        started = false;
        failed = false;
        nextIndex = C.INDEX_UNSET;
        main = next.player;
        fromIndex = main.getCurrentMediaItemIndex();
        main.setVolume(volume);
        // Transfer the existing stream to the session without a seek or a new decoder.
        promotion.promote(next);
        wake();
    }

    private void applyVolume() {
        if (!started) { main.setVolume(volume); return; }
        float mix = (float) Math.max(0, Math.min(1, (incoming.player.getCurrentPosition() - incomingStart) / (double) overlap));
        main.setVolume(volume * (1 - mix));
        incoming.player.setVolume(volume * mix);
    }

    private void tick() {
        if (seconds <= 0 || !main.getPlayWhenReady()) return;
        if (main.getPlaybackSuppressionReason() != Player.PLAYBACK_SUPPRESSION_REASON_NONE) {
            cancel();
            return;
        }
        int current = main.getCurrentMediaItemIndex(), next = main.getNextMediaItemIndex();
        if (current != fromIndex || incoming != null && next != nextIndex) { cancel(); fromIndex = current; }
        if (next == C.INDEX_UNSET || next == current || main.getRepeatMode() == Player.REPEAT_MODE_ONE) {
            cancel();
            return;
        }
        long duration = main.getDuration();
        long remaining = duration == C.TIME_UNSET ? Long.MAX_VALUE : duration - main.getCurrentPosition();
        if (started && incomingPlaying() && remaining <= 40) { handOff(); return; }
        if (!failed && main.isPlaying() && remaining > 0 && remaining <= seconds * 1000L + 5500) {
            if (incoming == null) {
                try { incoming = factory.create(next); nextIndex = next; }
                catch (RuntimeException error) { failed = true; }
            } else if (incoming.player.getPlayerError() != null || incoming.player.getPlaybackState() == Player.STATE_ENDED) {
                clearDeck();
                main.setVolume(volume);
                failed = true;
            } else if (!started && incoming.player.getPlaybackState() == Player.STATE_READY) {
                long nextDuration = incoming.player.getDuration();
                if (nextDuration > 300 && remaining <= Math.min(seconds * 1000L, nextDuration / 2)) {
                    overlap = remaining;
                    incomingStart = incoming.player.getCurrentPosition();
                    started = true;
                    incoming.player.play();
                }
            } else if (started) {
                applyVolume();
            }
        }
        handler.postDelayed(clock, started ? 25 : Math.min(200, Math.max(25, remaining - seconds * 1000L)));
    }
}
