package com.playerium.music;

import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;

/** A push is only a wake-up hint; the authenticated durable journal is authoritative. */
public final class CloudMessagingService extends FirebaseMessagingService {
    @Override public void onNewToken(String token) { CloudPush.schedule(this); }
    @Override public void onMessageReceived(RemoteMessage message) {
        GoogleCloud cloud=GoogleCloud.get(this);
        if(CloudPush.accepts(cloud,message.getFrom(),message.getData())){
            android.util.Log.i("PlayeriumSync","Library wake-up accepted");
            cloud.enqueuePush(message.getPriority()==RemoteMessage.PRIORITY_HIGH);
        }
    }
    @Override public void onDeletedMessages() {
        GoogleCloud cloud=GoogleCloud.get(this);
        if(cloud.isConnected())cloud.enqueuePush(false);
    }
}
