package com.playerium.music;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.os.Build;
import android.os.IBinder;
import android.support.v4.media.MediaMetadataCompat;
import android.support.v4.media.session.MediaSessionCompat;
import android.support.v4.media.session.PlaybackStateCompat;
import android.util.Base64;
import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;
import androidx.media.app.NotificationCompat.MediaStyle;

public class MediaNotificationService extends Service {
    public static final String CHANNEL_ID = "playerium_media_channel";
    public static final int NOTIFICATION_ID = 4040;

    public static final String ACTION_PLAY_PAUSE = "com.playerium.music.ACTION_PLAY_PAUSE";
    public static final String ACTION_NEXT = "com.playerium.music.ACTION_NEXT";
    public static final String ACTION_PREV = "com.playerium.music.ACTION_PREV";
    public static final String ACTION_UPDATE_STATE = "com.playerium.music.ACTION_UPDATE_STATE";

    public static final String EXTRA_TITLE = "extra_title";
    public static final String EXTRA_ARTIST = "extra_artist";
    public static final String EXTRA_ALBUM = "extra_album";
    public static final String EXTRA_IS_PLAYING = "extra_is_playing";
    public static final String EXTRA_ARTWORK_BASE64 = "extra_artwork_base64";

    private MediaSessionCompat mediaSession;
    private NotificationManager notificationManager;
    private String currentTitle = "Playerium";
    private String currentArtist = "Музыкальный плеер";
    private String currentAlbum = "";
    private boolean isPlaying = false;
    private Bitmap currentCover = null;

    @Override
    public void onCreate() {
        super.onCreate();
        notificationManager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        createNotificationChannel();

        mediaSession = new MediaSessionCompat(this, "PlayeriumMediaSession");
        mediaSession.setFlags(MediaSessionCompat.FLAG_HANDLES_MEDIA_BUTTONS | MediaSessionCompat.FLAG_HANDLES_TRANSPORT_CONTROLS);
        mediaSession.setActive(true);

        mediaSession.setCallback(new MediaSessionCompat.Callback() {
            @Override
            public void onPlay() {
                handleMediaAction("playPause");
            }

            @Override
            public void onPause() {
                handleMediaAction("playPause");
            }

            @Override
            public void onSkipToNext() {
                handleMediaAction("next");
            }

            @Override
            public void onSkipToPrevious() {
                handleMediaAction("prev");
            }
        });
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID,
                "Воспроизведение музыки Playerium",
                NotificationManager.IMPORTANCE_LOW
            );
            channel.setDescription("Управление воспроизведением музыки в шторке уведомлений");
            channel.setShowBadge(false);
            channel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
            if (notificationManager != null) {
                notificationManager.createNotificationChannel(channel);
            }
        }
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent == null || intent.getAction() == null) {
            return START_STICKY;
        }

        String action = intent.getAction();
        switch (action) {
            case ACTION_PLAY_PAUSE:
                handleMediaAction("playPause");
                break;
            case ACTION_NEXT:
                handleMediaAction("next");
                break;
            case ACTION_PREV:
                handleMediaAction("prev");
                break;
            case ACTION_UPDATE_STATE:
                currentTitle = intent.getStringExtra(EXTRA_TITLE);
                if (currentTitle == null || currentTitle.trim().isEmpty()) {
                    currentTitle = "Неизвестный трек";
                }
                currentArtist = intent.getStringExtra(EXTRA_ARTIST);
                if (currentArtist == null || currentArtist.trim().isEmpty()) {
                    currentArtist = "Неизвестный исполнитель";
                }
                currentAlbum = intent.getStringExtra(EXTRA_ALBUM);
                isPlaying = intent.getBooleanExtra(EXTRA_IS_PLAYING, false);

                String base64Art = intent.getStringExtra(EXTRA_ARTWORK_BASE64);
                if (base64Art != null && !base64Art.isEmpty()) {
                    try {
                        String cleanBase64 = base64Art;
                        if (cleanBase64.contains(",")) {
                            cleanBase64 = cleanBase64.substring(cleanBase64.indexOf(",") + 1);
                        }
                        byte[] decodedBytes = Base64.decode(cleanBase64, Base64.DEFAULT);
                        currentCover = BitmapFactory.decodeByteArray(decodedBytes, 0, decodedBytes.length);
                    } catch (Exception e) {
                        currentCover = null;
                    }
                } else {
                    currentCover = null;
                }

                updateMediaSessionState();
                buildAndPostNotification();
                break;
        }

        return START_STICKY;
    }

    private void updateMediaSessionState() {
        if (mediaSession == null) return;

        int state = isPlaying ? PlaybackStateCompat.STATE_PLAYING : PlaybackStateCompat.STATE_PAUSED;
        long actions = PlaybackStateCompat.ACTION_PLAY | PlaybackStateCompat.ACTION_PAUSE |
                       PlaybackStateCompat.ACTION_SKIP_TO_NEXT | PlaybackStateCompat.ACTION_SKIP_TO_PREVIOUS |
                       PlaybackStateCompat.ACTION_PLAY_PAUSE;

        mediaSession.setPlaybackState(
            new PlaybackStateCompat.Builder()
                .setActions(actions)
                .setState(state, PlaybackStateCompat.PLAYBACK_POSITION_UNKNOWN, 1.0f)
                .build()
        );

        MediaMetadataCompat.Builder metaBuilder = new MediaMetadataCompat.Builder()
            .putString(MediaMetadataCompat.METADATA_KEY_TITLE, currentTitle)
            .putString(MediaMetadataCompat.METADATA_KEY_ARTIST, currentArtist)
            .putString(MediaMetadataCompat.METADATA_KEY_ALBUM, currentAlbum);

        if (currentCover != null) {
            metaBuilder.putBitmap(MediaMetadataCompat.METADATA_KEY_ALBUM_ART, currentCover);
        }

        mediaSession.setMetadata(metaBuilder.build());
    }

    private void buildAndPostNotification() {
        Intent openAppIntent = new Intent(this, MainActivity.class);
        openAppIntent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent pendingOpenApp = PendingIntent.getActivity(
            this, 0, openAppIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0)
        );

        PendingIntent pendingPrev = createActionPendingIntent(ACTION_PREV, 1);
        PendingIntent pendingPlayPause = createActionPendingIntent(ACTION_PLAY_PAUSE, 2);
        PendingIntent pendingNext = createActionPendingIntent(ACTION_NEXT, 3);

        int playPauseIcon = isPlaying ? android.R.drawable.ic_media_pause : android.R.drawable.ic_media_play;
        String playPauseTitle = isPlaying ? "Пауза" : "Воспроизвести";

        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle(currentTitle)
            .setContentText(currentArtist)
            .setSubText(currentAlbum)
            .setContentIntent(pendingOpenApp)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setOngoing(isPlaying)
            .setAutoCancel(false)
            .addAction(android.R.drawable.ic_media_previous, "Назад", pendingPrev)
            .addAction(playPauseIcon, playPauseTitle, pendingPlayPause)
            .addAction(android.R.drawable.ic_media_next, "Вперед", pendingNext)
            .setStyle(
                new MediaStyle()
                    .setMediaSession(mediaSession.getSessionToken())
                    .setShowActionsInCompactView(0, 1, 2)
            );

        if (currentCover != null) {
            builder.setLargeIcon(currentCover);
        }

        Notification notification = builder.build();

        if (isPlaying) {
            startForeground(NOTIFICATION_ID, notification);
        } else {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                stopForeground(STOP_FOREGROUND_DETACH);
            } else {
                stopForeground(false);
            }
            if (notificationManager != null) {
                notificationManager.notify(NOTIFICATION_ID, notification);
            }
        }
    }

    private PendingIntent createActionPendingIntent(String action, int requestCode) {
        Intent intent = new Intent(this, MediaNotificationService.class);
        intent.setAction(action);
        return PendingIntent.getService(
            this, requestCode, intent,
            PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0)
        );
    }

    private void handleMediaAction(String command) {
        MainActivity activity = MainActivity.getInstance();
        if (activity != null) {
            activity.sendMediaCommand(command);
        }
    }

    @Override
    public void onDestroy() {
        if (mediaSession != null) {
            mediaSession.setActive(false);
            mediaSession.release();
        }
        stopForeground(true);
        super.onDestroy();
    }

    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
