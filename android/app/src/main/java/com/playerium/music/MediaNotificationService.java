package com.playerium.music;

import android.content.Intent;
import android.content.Context;
import java.util.concurrent.atomic.AtomicReference;
import android.media.audiofx.Equalizer;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import androidx.annotation.Nullable;
import androidx.media3.common.AudioAttributes;
import androidx.media3.common.C;
import androidx.media3.common.MediaItem;
import androidx.media3.common.MediaMetadata;
import androidx.media3.common.Player;
import androidx.media3.common.PlaybackException;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.session.MediaSession;
import androidx.media3.session.MediaSessionService;
import org.json.JSONArray;
import org.json.JSONObject;
import java.util.ArrayList;
import java.util.List;

/** Owns audio, queue, audio focus and lock-screen controls independently of Activity. */
@androidx.annotation.OptIn(markerClass = androidx.media3.common.util.UnstableApi.class)
public class MediaNotificationService extends MediaSessionService {
    private static volatile String stateSnapshot = "{}";
    private static final AtomicReference<String> pendingQueue = new AtomicReference<>();
    public static void submitQueue(Context context, String queue) {
        pendingQueue.set(queue);
        // Large libraries must not be serialized into Binder Intent extras.
        context.startService(new Intent(context, MediaNotificationService.class).setAction("playerium.SET_QUEUE"));
    }
    private ExoPlayer player;
    private MediaSession session;
    private Equalizer equalizer;
    private String equalizerSettings;
    private String error;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final Runnable publishState = new Runnable() {
        @Override public void run() {
            MainActivity activity = MainActivity.getInstance();
            JSONObject data = state();
            stateSnapshot = data.toString();
            if (activity != null) activity.sendPlayerState(data);
            error = null;
            handler.postDelayed(this, 500);
        }
    };

    @Override public void onCreate() {
        super.onCreate();

        player = new ExoPlayer.Builder(this).build();
        player.setAudioAttributes(new AudioAttributes.Builder().setUsage(C.USAGE_MEDIA).setContentType(C.AUDIO_CONTENT_TYPE_MUSIC).build(), true);
        player.setHandleAudioBecomingNoisy(true);
        player.setWakeMode(C.WAKE_MODE_LOCAL);
        player.addListener(new Player.Listener() {
            @Override public void onPlayerError(PlaybackException exception) {
                error = "Не удалось воспроизвести файл. Проверьте доступ к папке.";
                player.pause(); // An unreadable playlist must not create an endless retry loop.
            }
            @Override public void onAudioSessionIdChanged(int id) { configureEqualizer(id); }
        });
        session = new MediaSession.Builder(this, player).build();
        handler.post(publishState);
    }

    @Nullable @Override public MediaSession onGetSession(MediaSession.ControllerInfo controller) { return session; }

    @Override public int onStartCommand(@Nullable Intent intent, int flags, int startId) {
        int result = super.onStartCommand(intent, flags, startId);
        if (intent != null) {
            try {
                if ("playerium.SET_QUEUE".equals(intent.getAction())) {
                    String queue = pendingQueue.getAndSet(null);
                    if (queue != null) setQueue(new JSONObject(queue));
                }
                if (intent.hasExtra("command")) command(intent.getStringExtra("command"), intent.getDoubleExtra("value", 0));
                if (intent.hasExtra("equalizer")) { equalizerSettings = intent.getStringExtra("equalizer"); configureEqualizer(player.getAudioSessionId()); }
            } catch (Exception e) { error = "Не удалось обновить очередь воспроизведения"; }
        }
        return result;
    }

    private void setQueue(JSONObject data) throws Exception {
        JSONArray tracks = data.getJSONArray("tracks");
        List<MediaItem> items = new ArrayList<>();
        for (int i = 0; i < tracks.length(); i++) {
            JSONObject t = tracks.getJSONObject(i);
            Uri uri = Uri.parse(t.getString("uri"));
            if (!MainActivity.hasMusicPermission(this, uri)) throw new SecurityException("Unauthorized URI");
            MediaMetadata metadata = new MediaMetadata.Builder().setTitle(t.optString("title"))
                .setArtist(t.optString("artist")).setAlbumTitle(t.optString("album")).build();
            items.add(new MediaItem.Builder().setMediaId(t.getString("id")).setUri(uri).setMediaMetadata(metadata).build());
        }
        if (items.isEmpty()) { player.stop(); player.clearMediaItems(); stopSelf(); return; }
        boolean play = data.optBoolean("play");
        String currentId = player.getCurrentMediaItem() == null ? "" : player.getCurrentMediaItem().mediaId;
        int index = Math.max(0, Math.min(items.size() - 1, data.optInt("index")));
        MediaItem current = player.getCurrentMediaItem();
        boolean preserve = !data.optBoolean("reset") && current != null
            && items.get(index).mediaId.equals(currentId)
            && java.util.Objects.equals(items.get(index).localConfiguration, current.localConfiguration);
        if (preserve) {
            // Keep the active media source and its position; edit only its neighbours.
            int oldIndex = player.getCurrentMediaItemIndex();
            player.removeMediaItems(oldIndex + 1, player.getMediaItemCount());
            player.removeMediaItems(0, oldIndex);
            player.addMediaItems(0, items.subList(0, index));
            player.addMediaItems(items.subList(index + 1, items.size()));
            player.replaceMediaItem(index, items.get(index));
        } else {
            player.setMediaItems(items, index, 0);
            player.prepare();
            player.setPlayWhenReady(play);
        }
        player.setRepeatMode("one".equals(data.optString("repeat")) ? Player.REPEAT_MODE_ONE : "all".equals(data.optString("repeat")) ? Player.REPEAT_MODE_ALL : Player.REPEAT_MODE_OFF);
        player.setVolume((float)data.optDouble("volume", 0.8));
    }

    private void command(String command, double value) {
        switch (command) {
            case "play": player.play(); break;
            case "pause": player.pause(); break;
            case "stop": player.stop(); player.clearMediaItems(); stopSelf(); break;
            case "seek": player.seekTo(Math.max(0, (long)value)); break;
            case "volume": player.setVolume((float)Math.max(0, Math.min(1, value))); break;
            case "repeat": player.setRepeatMode((int)value); break;
        }
    }

    private void configureEqualizer(int sessionId) {
        try {
            if (sessionId == C.AUDIO_SESSION_ID_UNSET || sessionId == 0) return;
            if (equalizer != null) equalizer.release();
            equalizer = new Equalizer(0, sessionId);
            if (equalizerSettings == null) return;
            JSONObject settings = new JSONObject(equalizerSettings);
            JSONArray gains = settings.getJSONArray("gains");
            int[] frequencies = {32,64,125,250,500,1000,2000,4000,8000,16000};
            short[] range = equalizer.getBandLevelRange();
            for (short band = 0; band < equalizer.getNumberOfBands(); band++) {
                int hz = equalizer.getCenterFreq(band) / 1000;
                int nearest = 0;
                for (int i = 1; i < frequencies.length; i++) if (Math.abs(Math.log((double)hz / frequencies[i])) < Math.abs(Math.log((double)hz / frequencies[nearest]))) nearest = i;
                int level = (int)(gains.optDouble(nearest, 0) * 100);
                equalizer.setBandLevel(band, (short)Math.max(range[0], Math.min(range[1], level)));
            }
            equalizer.setEnabled(settings.optBoolean("enabled", true));
        } catch (Exception ignored) { /* Audio effects are optional on some devices. */ }
    }

    private JSONObject state() {
        JSONObject data = new JSONObject();
        try {
            data.put("id", player.getCurrentMediaItem() == null ? "" : player.getCurrentMediaItem().mediaId);
            JSONArray queue = new JSONArray();
            for (int i = 0; i < player.getMediaItemCount(); i++) queue.put(player.getMediaItemAt(i).mediaId);
            data.put("queue", queue);
            data.put("index", player.getCurrentMediaItemIndex());
            data.put("repeat", player.getRepeatMode());
            data.put("playing", player.isPlaying()); data.put("position", player.getCurrentPosition());
            data.put("duration", Math.max(0, player.getDuration()));
            if (error != null) data.put("error", error);
        } catch (Exception ignored) {}
        return data;
    }

    public static String currentState() { return stateSnapshot; }

    @Override public void onTaskRemoved(Intent rootIntent) {
        if (!player.getPlayWhenReady() || player.getMediaItemCount() == 0) stopSelf();
    }
    @Override public void onDestroy() {
        handler.removeCallbacksAndMessages(null);
        if (equalizer != null) equalizer.release();
        session.release(); player.release(); stateSnapshot = "{}";
        super.onDestroy();
    }
}
