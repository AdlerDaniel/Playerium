package com.playerium.music;

import android.content.Intent;
import android.content.Context;
import android.app.PendingIntent;
import android.content.SharedPreferences;
import android.os.SystemClock;
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
import androidx.media3.exoplayer.DefaultRenderersFactory;
import androidx.media3.exoplayer.audio.AudioSink;
import androidx.media3.exoplayer.audio.DefaultAudioSink;
import androidx.media3.common.audio.AudioProcessor;
import androidx.media3.session.MediaSession;
import androidx.media3.session.MediaSessionService;
import com.google.common.util.concurrent.Futures;
import com.google.common.util.concurrent.ListenableFuture;
import org.json.JSONArray;
import org.json.JSONObject;
import java.util.ArrayList;
import java.util.List;

/** Owns audio, queue, audio focus and lock-screen controls independently of Activity. */
@androidx.annotation.OptIn(markerClass = androidx.media3.common.util.UnstableApi.class)
public class MediaNotificationService extends MediaSessionService {
    private static volatile String stateSnapshot = "{}";
    private static final AtomicReference<String> pendingQueue = new AtomicReference<>();
    static void resumeIfSaved(Context context) {
        if("{}".equals(stateSnapshot)&&!context.getSharedPreferences("playerium_playback",MODE_PRIVATE).getString("queue","").isEmpty())
            context.startService(new Intent(context,MediaNotificationService.class));
    }
    public static void submitQueue(Context context, String queue) {
        pendingQueue.set(queue);
        // Large libraries must not be serialized into Binder Intent extras.
        context.startService(new Intent(context, MediaNotificationService.class).setAction("playerium.SET_QUEUE"));
    }
    private ExoPlayer player;
    private MediaSession session;
    private Equalizer equalizer;
    private final NormalizationProcessor normalization=new NormalizationProcessor();
    private final java.util.concurrent.ExecutorService loudnessWorker=java.util.concurrent.Executors.newSingleThreadExecutor();
    private String normalizingUri="";
    private long normalizationVersion;
    private String equalizerSettings;
    private String error;
    private SharedPreferences playbackPrefs;
    private long lastSaved;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final Runnable publishState = new Runnable() {
        @Override public void run() {
            MainActivity activity = MainActivity.getInstance();
            JSONObject data = state();
            stateSnapshot = data.toString();
            if (activity != null && activity.isForeground()) activity.sendPlayerState(data);
            if (SystemClock.elapsedRealtime()-lastSaved>5000) savePlayback();
            error = null;
            handler.postDelayed(this, 500);
        }
    };

    @Override public void onCreate() {
        super.onCreate();
        playbackPrefs=getSharedPreferences("playerium_playback",MODE_PRIVATE);

        DefaultRenderersFactory renderers=new DefaultRenderersFactory(this){
            @Override protected AudioSink buildAudioSink(Context context,boolean enableFloatOutput,boolean enableAudioTrackPlaybackParams){
                return new DefaultAudioSink.Builder(context).setAudioProcessors(new AudioProcessor[]{normalization}).build();
            }
        };
        player = new ExoPlayer.Builder(this,renderers).build();
        player.setAudioAttributes(new AudioAttributes.Builder().setUsage(C.USAGE_MEDIA).setContentType(C.AUDIO_CONTENT_TYPE_MUSIC).build(), true);
        player.setHandleAudioBecomingNoisy(true);
        player.setWakeMode(C.WAKE_MODE_LOCAL);
        player.addListener(new Player.Listener() {
            @Override public void onPlayerError(PlaybackException exception) {
                error = "Не удалось воспроизвести файл. Проверьте доступ к папке.";
                player.pause(); // An unreadable playlist must not create an endless retry loop.
            }
            @Override public void onAudioSessionIdChanged(int id) { configureEqualizer(id); }
            @Override public void onMediaItemTransition(MediaItem item,int reason){normalizeCurrent();}
            @Override public void onEvents(Player ignored,Player.Events events) {
                savePlayback();JSONObject data=state();stateSnapshot=data.toString();
                MainActivity activity=MainActivity.getInstance();if(activity!=null&&activity.isForeground())activity.sendPlayerState(data);
            }
        });
        PendingIntent activityIntent=PendingIntent.getActivity(this,0,new Intent(this,MainActivity.class)
            .addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP|Intent.FLAG_ACTIVITY_CLEAR_TOP),PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
        session = new MediaSession.Builder(this, player).setSessionActivity(activityIntent)
            .setCallback(new MediaSession.Callback() {
                @Override public ListenableFuture<MediaSession.MediaItemsWithStartPosition> onPlaybackResumption(MediaSession ignored,MediaSession.ControllerInfo controller) {
                    if(player.getMediaItemCount()==0)restorePlayback();
                    List<MediaItem> items=new ArrayList<>();
                    for(int i=0;i<player.getMediaItemCount();i++)items.add(player.getMediaItemAt(i));
                    if(items.isEmpty())return Futures.immediateFailedFuture(new IllegalStateException("Нет сохранённой очереди"));
                    return Futures.immediateFuture(new MediaSession.MediaItemsWithStartPosition(items,player.getCurrentMediaItemIndex(),Math.max(0,player.getCurrentPosition())));
                }
            }).build();
        if(pendingQueue.get()==null)restorePlayback();
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
        return player.getPlayWhenReady()&&player.getMediaItemCount()>0?START_STICKY:result;
    }

    private void setQueue(JSONObject data) throws Exception {
        JSONArray tracks = data.getJSONArray("tracks");
        List<MediaItem> items = new ArrayList<>();
        for (int i = 0; i < tracks.length(); i++) {
            JSONObject t = tracks.getJSONObject(i);
            Uri uri = Uri.parse(t.getString("uri"));
            if (!MainActivity.hasMusicPermission(this, uri)) throw new SecurityException("Unauthorized URI");
            android.os.Bundle extras=new android.os.Bundle();extras.putDouble("normalizationGain",t.optDouble("normalizationGain",1));
            MediaMetadata metadata = new MediaMetadata.Builder().setTitle(t.optString("title"))
                .setArtist(t.optString("artist")).setAlbumTitle(t.optString("album")).setExtras(extras).build();
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
            long position=data.has("position")?Math.max(0,data.optLong("position")):retainedPosition(data.optBoolean("reset"),currentId,items.get(index).mediaId,player.getCurrentPosition());
            player.setMediaItems(items, index, position);
            player.prepare();
            player.setPlayWhenReady(play);
        }
        player.setRepeatMode("one".equals(data.optString("repeat")) ? Player.REPEAT_MODE_ONE : "all".equals(data.optString("repeat")) ? Player.REPEAT_MODE_ALL : Player.REPEAT_MODE_OFF);
        player.setVolume((float)data.optDouble("volume", 0.8));
        savePlayback();
    }

    private void restorePlayback() {
        try {
            String saved=playbackPrefs.getString("queue","");
            if(!saved.isEmpty())setQueue(new JSONObject(saved));
        }catch(Exception ignored){playbackPrefs.edit().remove("queue").apply();}
    }
    private void normalizeCurrent(){
        MediaItem item=player.getCurrentMediaItem();if(item==null||item.localConfiguration==null)return;
        Uri uri=item.localConfiguration.uri;if(uri.toString().equals(normalizingUri))return;
        normalizingUri=uri.toString();long version=++normalizationVersion;double known=MusicEngine.get(this).knownLoudness(uri);normalization.startTrack(known!=1?known:item.mediaMetadata.extras==null?1:item.mediaMetadata.extras.getDouble("normalizationGain",1));
        loudnessWorker.submit(()->{
            try{double gain=MusicEngine.get(this).analyzeLoudness(uri).getDouble("gain");handler.post(()->{if(version==normalizationVersion)normalization.setGain(gain);});}catch(Exception ignored){}
        });
        int next=player.getCurrentMediaItemIndex()+1;if(next<player.getMediaItemCount()){
            MediaItem future=player.getMediaItemAt(next);if(future.localConfiguration!=null)loudnessWorker.submit(()->{try{MusicEngine.get(this).analyzeLoudness(future.localConfiguration.uri);}catch(Exception ignored){}});
        }
    }

    private void savePlayback() {
        if(player==null||playbackPrefs==null)return;
        try {
            if(player.getMediaItemCount()==0){playbackPrefs.edit().remove("queue").apply();return;}
            JSONArray tracks=new JSONArray();
            for(int i=0;i<player.getMediaItemCount();i++){
                MediaItem item=player.getMediaItemAt(i);if(item.localConfiguration==null)continue;
                tracks.put(new JSONObject().put("id",item.mediaId).put("uri",item.localConfiguration.uri.toString())
                    .put("title",String.valueOf(item.mediaMetadata.title==null?"":item.mediaMetadata.title))
                    .put("artist",String.valueOf(item.mediaMetadata.artist==null?"":item.mediaMetadata.artist))
                    .put("album",String.valueOf(item.mediaMetadata.albumTitle==null?"":item.mediaMetadata.albumTitle)));
            }
            JSONObject data=new JSONObject().put("tracks",tracks).put("index",player.getCurrentMediaItemIndex())
                .put("play",player.getPlayWhenReady()).put("position",Math.max(0,player.getCurrentPosition()))
                .put("volume",player.getVolume()).put("repeat",player.getRepeatMode()==Player.REPEAT_MODE_ONE?"one":player.getRepeatMode()==Player.REPEAT_MODE_ALL?"all":"off");
            playbackPrefs.edit().putString("queue",data.toString()).apply();lastSaved=SystemClock.elapsedRealtime();
        }catch(Exception ignored){}
    }

    static long retainedPosition(boolean reset,String currentId,String nextId,long position) {
        return !reset&&!currentId.isEmpty()&&currentId.equals(nextId)?Math.max(0,position):0;
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
        savePlayback();
        if (!player.getPlayWhenReady() || player.getMediaItemCount() == 0) stopSelf();
    }
    @Override public void onDestroy() {
        savePlayback();
        handler.removeCallbacksAndMessages(null);
        ++normalizationVersion;loudnessWorker.shutdownNow();
        if (equalizer != null) equalizer.release();
        session.release(); player.release(); stateSnapshot = "{}";
        super.onDestroy();
    }
}
