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
import androidx.media3.session.CommandButton;
import androidx.media3.session.SessionCommand;
import androidx.media3.session.SessionResult;
import com.google.common.util.concurrent.Futures;
import com.google.common.util.concurrent.ListenableFuture;
import org.json.JSONArray;
import org.json.JSONObject;
import java.util.ArrayList;
import java.util.List;

/** Owns audio, queue, audio focus and lock-screen controls independently of Activity. */
@androidx.annotation.OptIn(markerClass = androidx.media3.common.util.UnstableApi.class)
public class MediaNotificationService extends MediaSessionService {
    private static volatile MediaNotificationService instance;
    private static final SessionCommand SHUFFLE=new SessionCommand("playerium.SHUFFLE",android.os.Bundle.EMPTY);
    private static final SessionCommand REPEAT=new SessionCommand("playerium.REPEAT",android.os.Bundle.EMPTY);
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
    private final java.util.concurrent.ExecutorService artworkWorker=java.util.concurrent.Executors.newSingleThreadExecutor();
    private final java.util.concurrent.ExecutorService connectWorker=java.util.concurrent.Executors.newSingleThreadExecutor(),connectCloudWorker=java.util.concurrent.Executors.newSingleThreadExecutor();
    private boolean connecting;
    static void artworkChanged(String id){
        MediaNotificationService service=instance;
        if(service!=null)service.handler.post(()->service.applyArtwork(id));
    }
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
            pollConnect(data);
            error = null;
            handler.postDelayed(this, 500);
        }
    };

    @Override public void onCreate() {
        super.onCreate();
        instance=this;
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
            @Override public void onMediaItemTransition(MediaItem item,int reason){normalizeCurrent();refreshArtwork();}
            @Override public void onEvents(Player ignored,Player.Events events) {
                updateMediaButtons();
                savePlayback();JSONObject data=state();stateSnapshot=data.toString();
                MainActivity activity=MainActivity.getInstance();if(activity!=null&&activity.isForeground())activity.sendPlayerState(data);
            }
        });
        PendingIntent activityIntent=PendingIntent.getActivity(this,0,new Intent(this,MainActivity.class)
            .addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP|Intent.FLAG_ACTIVITY_CLEAR_TOP),PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
        session = new MediaSession.Builder(this, player).setSessionActivity(activityIntent)
            .setCallback(new MediaSession.Callback() {
                @Override public MediaSession.ConnectionResult onConnect(MediaSession mediaSession,MediaSession.ControllerInfo controller){
                    MediaSession.ConnectionResult defaults=MediaSession.Callback.super.onConnect(mediaSession,controller);
                    return new MediaSession.ConnectionResult.AcceptedResultBuilder(mediaSession)
                        .setAvailableSessionCommands(defaults.availableSessionCommands.buildUpon().add(SHUFFLE).add(REPEAT).build())
                        .setAvailablePlayerCommands(defaults.availablePlayerCommands).build();
                }
                @Override public ListenableFuture<SessionResult> onCustomCommand(MediaSession mediaSession,MediaSession.ControllerInfo controller,SessionCommand command,android.os.Bundle args){
                    if(SHUFFLE.equals(command))player.setShuffleModeEnabled(!player.getShuffleModeEnabled());
                    else if(REPEAT.equals(command))player.setRepeatMode((player.getRepeatMode()+1)%3);
                    else return Futures.immediateFuture(new SessionResult(SessionResult.RESULT_ERROR_NOT_SUPPORTED));
                    return Futures.immediateFuture(new SessionResult(SessionResult.RESULT_SUCCESS));
                }
                @Override public ListenableFuture<MediaSession.MediaItemsWithStartPosition> onPlaybackResumption(MediaSession ignored,MediaSession.ControllerInfo controller) {
                    if(player.getMediaItemCount()==0)restorePlayback();
                    List<MediaItem> items=new ArrayList<>();
                    for(int i=0;i<player.getMediaItemCount();i++)items.add(player.getMediaItemAt(i));
                    if(items.isEmpty())return Futures.immediateFailedFuture(new IllegalStateException("Нет сохранённой очереди"));
                    return Futures.immediateFuture(new MediaSession.MediaItemsWithStartPosition(items,player.getCurrentMediaItemIndex(),Math.max(0,player.getCurrentPosition())));
                }
            }).build();
        // The JavaScript UI starts us directly; no MediaController connects on that path.
        // Register immediately so Media3 owns the notification and foreground lifecycle.
        addSession(session);
        updateMediaButtons();
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
            android.os.Bundle extras=new android.os.Bundle();extras.putDouble("normalizationGain",t.optDouble("normalizationGain",1));extras.putString("cloudKey",t.optString("cloudKey"));
            MediaMetadata metadata = new MediaMetadata.Builder().setTitle(t.optString("title"))
                .setArtist(t.optString("artist")).setArtworkUri(PlaybackArtwork.find(this,t.getString("id"))).setExtras(extras).build();
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
        boolean sameQueue=items.size()==player.getMediaItemCount();
        for(int i=0;sameQueue&&i<items.size();i++)sameQueue=items.get(i).equals(player.getMediaItemAt(i));
        if(sameQueue){
            // A song selection in the existing queue reuses prepared media sources.
            if(data.optBoolean("reset")||index!=player.getCurrentMediaItemIndex()||data.has("position"))
                player.seekTo(index,data.has("position")?Math.max(0,data.optLong("position")):0);
            if(player.getPlaybackState()==Player.STATE_IDLE)player.prepare();
            player.setPlayWhenReady(play);
        } else if (preserve) {
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
        player.setShuffleModeEnabled(data.optBoolean("shuffle"));
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
            // Measurements are cached for the next start, never applied midway through a song.
            try{MusicEngine.get(this).analyzeLoudness(uri);}catch(Exception ignored){}
        });
        int next=player.getCurrentMediaItemIndex()+1;if(next<player.getMediaItemCount()){
            MediaItem future=player.getMediaItemAt(next);if(future.localConfiguration!=null)loudnessWorker.submit(()->{try{MusicEngine.get(this).analyzeLoudness(future.localConfiguration.uri);}catch(Exception ignored){}});
        }
    }

    private void refreshArtwork(){
        MediaItem item=player.getCurrentMediaItem();if(item==null||item.localConfiguration==null)return;
        if(PlaybackArtwork.find(this,item.mediaId)!=null){applyArtwork(item.mediaId);return;}
        artworkWorker.submit(()->{
            if(PlaybackArtwork.embedded(this,item.mediaId,item.localConfiguration.uri)!=null)
                handler.post(()->applyArtwork(item.mediaId));
        });
    }
    private void applyArtwork(String id){
        if(instance!=this||player==null)return;
        Uri artwork=PlaybackArtwork.find(this,id);if(artwork==null)return;
        for(int index=0;index<player.getMediaItemCount();index++){
            MediaItem item=player.getMediaItemAt(index);
            if(item.mediaId.equals(id)&&!artwork.equals(item.mediaMetadata.artworkUri))
                player.replaceMediaItem(index,item.buildUpon().setMediaMetadata(item.mediaMetadata.buildUpon().setArtworkUri(artwork).build()).build());
        }
    }

    private void updateMediaButtons(){
        if(session==null)return;
        session.setCustomLayout(java.util.Arrays.asList(
            new CommandButton.Builder().setDisplayName(player.getShuffleModeEnabled()?"Выключить перемешивание":"Перемешать")
                .setIconResId(R.drawable.ic_media_shuffle).setSessionCommand(SHUFFLE).build(),
            new CommandButton.Builder().setDisplayName(player.getRepeatMode()==Player.REPEAT_MODE_ONE?"Повторять трек":player.getRepeatMode()==Player.REPEAT_MODE_ALL?"Повторять очередь":"Повтор выключен")
                .setIconResId(R.drawable.ic_media_repeat).setSessionCommand(REPEAT).build()));
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
                    .put("artist",String.valueOf(item.mediaMetadata.artist==null?"":item.mediaMetadata.artist)).put("cloudKey",item.mediaMetadata.extras==null?"":item.mediaMetadata.extras.getString("cloudKey",""))
                    );
            }
            JSONObject data=new JSONObject().put("tracks",tracks).put("index",player.getCurrentMediaItemIndex())
                .put("play",player.getPlayWhenReady()).put("position",Math.max(0,player.getCurrentPosition()))
                .put("volume",player.getVolume()).put("shuffle",player.getShuffleModeEnabled()).put("repeat",player.getRepeatMode()==Player.REPEAT_MODE_ONE?"one":player.getRepeatMode()==Player.REPEAT_MODE_ALL?"all":"off");
            playbackPrefs.edit().putString("queue",data.toString()).apply();lastSaved=SystemClock.elapsedRealtime();
        }catch(Exception ignored){}
    }

    static long retainedPosition(boolean reset,String currentId,String nextId,long position) {
        return !reset&&!currentId.isEmpty()&&currentId.equals(nextId)?Math.max(0,position):0;
    }

    private long lastConnect;private boolean cloudConnecting;
    private void pollConnect(JSONObject snapshot){
        MainActivity activity=MainActivity.getInstance();if(activity!=null&&activity.isForeground())return;
        GoogleCloud cloud=GoogleCloud.get(this);if(!cloud.prefs.getBoolean("enabled",false))return;
        GoogleConnect connect=cloud.connect;JSONObject local=connect.local();if(local==null||local.optString("id").isEmpty())return;
        try{
            String device=local.getString("id");JSONArray saved=snapshot.optJSONArray("tracks"),keys=new JSONArray();JSONObject track=null;int index=snapshot.optInt("index");
            int start=saved==null?0:Math.max(0,Math.min(index-100,saved.length()-200));
            if(saved!=null)for(int i=start;i<Math.min(saved.length(),start+200);i++){JSONObject item=saved.getJSONObject(i);String key=item.optString("cloudKey");if(!key.isEmpty())keys.put(key);if(i==index)track=new JSONObject().put("key",key).put("title",item.optString("title")).put("artist",item.optString("artist"));}
            JSONObject state=new JSONObject().put("queue",keys).put("track",track).put("playing",snapshot.optBoolean("playing")).put("position",snapshot.optDouble("position")/1000).put("duration",snapshot.optDouble("duration")/1000).put("volume",snapshot.optDouble("volume",.8)).put("shuffle",snapshot.optBoolean("shuffle")).put("repeat",new String[]{"off","one","all"}[Math.max(0,Math.min(2,snapshot.optInt("repeat")))]);
            local.put("state",state).put("seenAt",System.currentTimeMillis()).put("ack",connect.ack(device)).put("ackHistory",connect.ackHistory(device));
            connect.live.publish(local);
            JSONObject message=connect.live.take(device);
            if(message!=null&&!connecting){connecting=true;connectWorker.submit(()->{try{applyConnectCommand(message,snapshot,connect);}catch(Exception ignored){}finally{handler.post(()->connecting=false);}});}
            long interval=connect.live.devices().length()>0?15000:3000;
            if(!cloudConnecting&&SystemClock.elapsedRealtime()-lastConnect>interval){cloudConnecting=true;lastConnect=SystemClock.elapsedRealtime();connectCloudWorker.submit(()->{try{connect.live.start();connect.write("device",device,new JSONObject(local.toString()).put("lan",connect.live.descriptor()));JSONObject incoming=connect.command(device);if(incoming!=null)connect.live.enqueue(incoming);}catch(Exception ignored){}finally{handler.post(()->cloudConnecting=false);}});}
        }catch(Exception ignored){}
    }
    private void applyConnectCommand(JSONObject message,JSONObject snapshot,GoogleConnect connect)throws Exception{
        String device=connect.local().getString("id");if(connect.wasAcknowledged(device,message.getString("id")))return;
        GoogleCloud cloud=GoogleCloud.get(this);JSONArray saved=snapshot.optJSONArray("tracks");
        JSONObject queue=null;
                if("transfer".equals(message.optString("action"))){JSONObject incoming=message.getJSONObject("state");String key=incoming.getJSONObject("track").getString("key");
                    JSONArray supplied=message.optJSONArray("media");if(supplied==null)throw new java.io.IOException("Очередь треков не передана.");JSONArray tracks=new JSONArray();int selected=-1;
                    for(int i=0;i<Math.min(supplied.length(),200);i++){JSONObject entry=supplied.getJSONObject(i),file=cloud.localCopy(entry.getString("key"),entry.getJSONObject("track"));if(file==null)file=cloud.download(entry.getString("key"),entry.getJSONObject("track"));String id="remote_"+entry.getString("key");if(saved!=null)for(int j=0;j<saved.length();j++)if(file.getString("uri").equals(saved.getJSONObject(j).optString("uri"))){id=saved.getJSONObject(j).optString("id",id);break;}if(entry.getString("key").equals(key)){selected=tracks.length();if(file.has("coverBase64"))PlaybackArtwork.saveBase64(this,id,file.getString("coverBase64"));else if(PlaybackArtwork.find(this,id)==null&&entry.getJSONObject("track").has("coverId"))try{byte[] cover=cloud.media(entry.getJSONObject("track").getString("coverId"),4*1024*1024);PlaybackArtwork.save(this,id,cover);}catch(Exception ignored){}}
                        tracks.put(new JSONObject().put("id",id).put("uri",file.getString("uri")).put("title",entry.getJSONObject("track").optString("title")).put("artist",entry.getJSONObject("track").optString("artist")).put("cloudKey",entry.getString("key")));}
                    if(selected<0)throw new java.io.IOException("Песня не найдена.");queue=new JSONObject().put("tracks",tracks).put("index",selected).put("position",Math.max(0,incoming.optDouble("position"))*1000).put("play",incoming.optBoolean("playing")).put("volume",incoming.optDouble("volume",.8)).put("repeat",incoming.optString("repeat","off")).put("shuffle",incoming.optBoolean("shuffle")).put("reset",true);
                }
                if(System.currentTimeMillis()-message.optLong("issuedAt")>25000)throw new java.io.IOException("Команда устарела.");
                final JSONObject prepared=queue;java.util.concurrent.CountDownLatch applied=new java.util.concurrent.CountDownLatch(1);final Exception[] failure=new Exception[1];
                handler.post(()->{try{if(prepared!=null)setQueue(prepared);else{String action=message.optString("action");double value=message.optDouble("value");if("seek".equals(action))value*=1000;if("shuffle".equals(action))value=message.optBoolean("value")?1:0;if("repeat".equals(action))value="one".equals(message.optString("value"))?1:"all".equals(message.optString("value"))?2:0;if(java.util.Arrays.asList("play","pause","next","previous","seek","volume","shuffle","repeat").contains(action))command(action,value);else throw new java.io.IOException("Неизвестная команда.");}}catch(Exception e){failure[0]=e;}finally{applied.countDown();}});
                if(!applied.await(15,java.util.concurrent.TimeUnit.SECONDS))throw new java.io.IOException("Команда не выполнена.");if(failure[0]!=null)throw failure[0];
                if(prepared!=null&&prepared.optBoolean("play")){long readyUntil=SystemClock.elapsedRealtime()+5000;boolean ready=false;while(SystemClock.elapsedRealtime()<readyUntil){JSONObject current=new JSONObject(stateSnapshot);if(current.optBoolean("playing")&&current.optString("id").equals(prepared.getJSONArray("tracks").getJSONObject(prepared.getInt("index")).getString("id"))){ready=true;break;}Thread.sleep(100);}if(!ready)throw new java.io.IOException("Песня не запустилась.");}
                connect.acknowledge(device,message.getString("id"));
    }

    private void command(String command, double value) {
        switch (command) {
            case "play": player.play(); break;
            case "pause": player.pause(); break;
            case "stop": player.stop(); player.clearMediaItems(); stopSelf(); break;
            case "seek": player.seekTo(Math.max(0, (long)value)); break;
            case "volume": player.setVolume((float)Math.max(0, Math.min(1, value))); break;
            case "repeat": player.setRepeatMode((int)value); break;
            case "shuffle": player.setShuffleModeEnabled(value!=0); break;
            case "next":
                int next=player.getNextMediaItemIndex();if(next==C.INDEX_UNSET)player.pause();else player.seekTo(next,0);break;
            case "previous":
                int previous=player.getPreviousMediaItemIndex();
                if(player.getCurrentPosition()>3000||previous==C.INDEX_UNSET)player.seekTo(0);else player.seekTo(previous,0);break;
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
            JSONArray tracks = new JSONArray();
            for (int i = 0; i < player.getMediaItemCount(); i++) {
                MediaItem item = player.getMediaItemAt(i);
                queue.put(item.mediaId);
                JSONObject track = new JSONObject();
                track.put("id",item.mediaId);
                track.put("uri", item.localConfiguration == null ? "" : item.localConfiguration.uri.toString());
                track.put("title", item.mediaMetadata.title == null ? "" : item.mediaMetadata.title.toString());
                track.put("artist", item.mediaMetadata.artist == null ? "" : item.mediaMetadata.artist.toString());
                String cloudKey=item.mediaMetadata.extras==null?"":item.mediaMetadata.extras.getString("cloudKey","");if(cloudKey.isEmpty()&&item.localConfiguration!=null){String name=item.localConfiguration.uri.getLastPathSegment();if(name!=null&&name.matches("[a-f0-9]{64}\\.(mp3|flac|wav|m4a|aac|ogg|opus|wma)"))cloudKey=name.substring(0,64);}track.put("cloudKey",cloudKey);
                tracks.put(track);
            }
            data.put("queue", queue);
            data.put("tracks", tracks);
            data.put("index", player.getCurrentMediaItemIndex());
            data.put("repeat", player.getRepeatMode());
            data.put("shuffle",player.getShuffleModeEnabled());
            data.put("playing", player.isPlaying()); data.put("position", player.getCurrentPosition());
            data.put("duration", Math.max(0, player.getDuration()));data.put("volume",player.getVolume());
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
        artworkWorker.shutdownNow();connectWorker.shutdownNow();connectCloudWorker.shutdownNow();if(instance==this)instance=null;
        if (equalizer != null) equalizer.release();
        session.release(); player.release(); stateSnapshot = "{}";
        super.onDestroy();
    }
}
