package com.playerium.music;

import org.json.*;
import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.security.*;
import java.util.*;
import java.util.concurrent.*;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

/** Signed, account-scoped local control. All socket work stays off the UI thread. */
final class LocalConnect {
    interface Account { String get(); }
    interface FileReader {JSONObject read(JSONObject request)throws Exception;}
    volatile FileReader fileReader;
    interface Acknowledged { boolean contains(String device,String command); }
    final Account account;
    final Acknowledged acknowledged;
    String secret=randomSecret(),session=UUID.randomUUID().toString(),localAccount;
    volatile JSONObject local;
    ServerSocket server;
    final ConcurrentHashMap<String,Peer> peers=new ConcurrentHashMap<>();
    final Map<String,ArrayDeque<JSONObject>> inboxes=new HashMap<>();
    final Map<String,Long> nonces=new HashMap<>();
    final ExecutorService requests=new ThreadPoolExecutor(4,4,0L,TimeUnit.MILLISECONDS,new ArrayBlockingQueue<>(32));
    final ScheduledExecutorService heartbeat=Executors.newSingleThreadScheduledExecutor();
    final ExecutorService outbound=new ThreadPoolExecutor(4,4,0L,TimeUnit.MILLISECONDS,new ArrayBlockingQueue<>(20));
    volatile boolean pumping;
    static final class Peer { JSONObject document,lan;volatile JSONObject live;String address;long offset,incoming,nextProbe;volatile boolean exchanging; }
    LocalConnect(Account account,Acknowledged acknowledged){this.account=account;this.acknowledged=acknowledged;}
    static String randomSecret(){byte[] bytes=new byte[32];new SecureRandom().nextBytes(bytes);return GoogleCloud.hex(bytes);}
    static boolean privateIP(String ip){return ip!=null&&ip.matches("(?:10\\..*|192\\.168\\..*|172\\.(?:1[6-9]|2[0-9]|3[01])\\..*|127\\..*)")&&ip.matches("[0-9]+\\.[0-9]+\\.[0-9]+\\.[0-9]+");}
    static String signature(String secret,String body)throws Exception{Mac mac=Mac.getInstance("HmacSHA256");mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8),"HmacSHA256"));return GoogleCloud.hex(mac.doFinal(body.getBytes(StandardCharsets.UTF_8)));}
    static boolean matches(String a,String b){return a!=null&&b!=null&&MessageDigest.isEqual(a.getBytes(StandardCharsets.US_ASCII),b.getBytes(StandardCharsets.US_ASCII));}
    synchronized void start()throws Exception{
        if(server!=null)return;server=new ServerSocket();server.bind(new InetSocketAddress("0.0.0.0",0));
        Thread accept=new Thread(()->{while(!server.isClosed())try{Socket client=server.accept();try{requests.submit(()->handle(client));}catch(RejectedExecutionException ignored){client.close();}}catch(Exception ignored){if(server.isClosed())return;}},"playerium-local-control");accept.setDaemon(true);accept.start();
        heartbeat.scheduleWithFixedDelay(()->pump(),0,250,TimeUnit.MILLISECONDS);
    }
    synchronized JSONObject descriptor()throws Exception{
        JSONArray addresses=new JSONArray();Enumeration<NetworkInterface> interfaces=NetworkInterface.getNetworkInterfaces();
        while(interfaces.hasMoreElements()){Enumeration<InetAddress> entries=interfaces.nextElement().getInetAddresses();while(entries.hasMoreElements()){InetAddress address=entries.nextElement();if(address instanceof Inet4Address&&!address.isLoopbackAddress()&&privateIP(address.getHostAddress()))addresses.put(address.getHostAddress());}}
        return new JSONObject().put("version",1).put("port",server==null?0:server.getLocalPort()).put("addresses",addresses).put("secret",secret).put("session",session);
    }
    synchronized void publish(JSONObject device)throws Exception{
        String current=account.get();if(localAccount!=null&&!localAccount.equals(current)){secret=randomSecret();session=UUID.randomUUID().toString();peers.clear();inboxes.clear();nonces.clear();}
        localAccount=current;local=new JSONObject(device.toString()).put("seenAt",System.currentTimeMillis());
    }
    Peer peer(String id){Peer value=peers.get(id);if(value!=null)return value;Peer fresh=new Peer(),old=peers.putIfAbsent(id,fresh);return old==null?fresh:old;}
    void learn(JSONObject device){String id=device.optString("id");if(id.isEmpty()||local!=null&&id.equals(local.optString("id")))return;Peer peer=peer(id);peer.document=device;if(device.has("lan"))peer.lan=device.optJSONObject("lan");}
    synchronized ArrayDeque<JSONObject> queue(String target){ArrayDeque<JSONObject> value=inboxes.get(target);if(value==null){value=new ArrayDeque<>();inboxes.put(target,value);}return value;}
    synchronized void enqueue(JSONObject message)throws Exception{
        GoogleConnect.identifier(message.optString("id"));String target=message.optString("target");GoogleConnect.identifier(target);
        String action=message.optString("action");if(!Arrays.asList("play","pause","seek","volume","next","previous","shuffle","repeat","transfer").contains(action))throw new IOException("Некорректная команда.");
        ArrayDeque<JSONObject> queue=queue(target);
        if(acknowledged.contains(target,message.optString("id")))return;
        for(JSONObject old:queue)if(old.optString("id").equals(message.optString("id")))return;
        if(action.equals("seek")||action.equals("volume"))remove(queue,"action",action);
        if(queue.size()>=32)throw new IOException("Слишком много команд.");queue.add(new JSONObject(message.toString()).put("issuedAt",System.currentTimeMillis()));
    }
    static void remove(ArrayDeque<JSONObject> queue,String field,String value){Iterator<JSONObject> it=queue.iterator();while(it.hasNext())if(value.equals(it.next().optString(field)))it.remove();}
    synchronized JSONObject take(String device){ArrayDeque<JSONObject> queue=inboxes.get(device);if(queue==null)return null;while(!queue.isEmpty()&&(System.currentTimeMillis()-queue.peek().optLong("issuedAt")>25000||acknowledged.contains(device,queue.peek().optString("id"))))queue.poll();return queue.peek();}
    synchronized void acknowledge(String device,String command)throws Exception{ArrayDeque<JSONObject> queue=inboxes.get(device);if(queue!=null)remove(queue,"id",command);if(local!=null&&device.equals(local.optString("id")))local.put("ack",command);}
    void peerAcknowledgements(JSONObject device)throws Exception{JSONArray history=device.optJSONArray("ackHistory");if(history!=null)for(int i=Math.max(0,history.length()-64);i<history.length();i++)acknowledge(device.getString("id"),history.optString(i));if(device.has("ack"))acknowledge(device.getString("id"),device.getString("ack"));}
    JSONArray devices(){JSONArray result=new JSONArray();for(Peer peer:peers.values())if(peer.live!=null&&System.currentTimeMillis()-peer.live.optLong("seenAt")<5000)try{result.put(new JSONObject(peer.live.toString()).put("live",true));}catch(Exception ignored){}return result;}
    JSONObject scan(String device)throws Exception{return new JSONObject().put("devices",devices()).put("command",take(device));}
    static String line(InputStream in)throws Exception{ByteArrayOutputStream out=new ByteArrayOutputStream();int value;while((value=in.read())!=-1){if(value=='\n')break;if(value!='\r')out.write(value);if(out.size()>8192)throw new IOException("Header too large");}return out.toString("UTF-8");}
    static Map<String,String> headers(InputStream in)throws Exception{Map<String,String> values=new HashMap<>();for(int i=0;i<40;i++){String header=line(in);if(header.isEmpty())return values;int separator=header.indexOf(':');if(separator>0)values.put(header.substring(0,separator).toLowerCase(Locale.ROOT),header.substring(separator+1).trim());}throw new IOException("Too many headers");}
    static byte[] body(InputStream in,int length)throws Exception{if(length<0||length>1048576)throw new IOException("Message too large");byte[] bytes=new byte[length];int offset=0;while(offset<length){int count=in.read(bytes,offset,length-offset);if(count<0)throw new EOFException();offset+=count;}return bytes;}
    void reply(Socket client,int status,JSONObject data)throws Exception{String text=data.put("serverTime",System.currentTimeMillis()).toString();byte[] bytes=text.getBytes(StandardCharsets.UTF_8);String header="HTTP/1.1 "+status+" OK\r\nContent-Type: application/json\r\nContent-Length: "+bytes.length+"\r\nConnection: close\r\nX-Playerium-Signature: "+signature(secret,text)+"\r\n\r\n";OutputStream out=client.getOutputStream();out.write(header.getBytes(StandardCharsets.US_ASCII));out.write(bytes);out.flush();}
    void handle(Socket client){try(Socket socket=client){socket.setSoTimeout(2000);InputStream in=new BufferedInputStream(socket.getInputStream());if(!line(in).equals("POST /exchange HTTP/1.1")||local==null||account.get()==null||!account.get().equals(localAccount)){reply(socket,404,new JSONObject());return;}
        Map<String,String> headers=headers(in);String text=new String(body(in,Integer.parseInt(headers.containsKey("content-length")?headers.get("content-length"):"-1")),StandardCharsets.UTF_8);
        if(!matches(headers.get("x-playerium-signature"),signature(secret,text))){reply(socket,401,new JSONObject());return;}
        JSONObject packet=new JSONObject(text);if(!account.get().equals(packet.optString("account"))){reply(socket,401,new JSONObject());return;}GoogleConnect.identifier(packet.optString("nonce"));JSONObject device=packet.getJSONObject("device");GoogleConnect.identifier(device.optString("id"));
        if(!session.equals(packet.optString("session"))||Math.abs(System.currentTimeMillis()-packet.optLong("time"))>120000){reply(socket,409,new JSONObject().put("clock",true).put("session",session));return;}
        synchronized(this){Iterator<Map.Entry<String,Long>> entries=nonces.entrySet().iterator();while(entries.hasNext())if(System.currentTimeMillis()-entries.next().getValue()>180000)entries.remove();if(nonces.containsKey(packet.getString("nonce"))||nonces.size()>=4096){reply(socket,409,new JSONObject());return;}nonces.put(packet.getString("nonce"),System.currentTimeMillis());}
        Peer peer=peer(device.getString("id"));peer.incoming=System.currentTimeMillis();peer.live=new JSONObject(device.toString()).put("seenAt",System.currentTimeMillis());if(packet.has("command")&&!packet.isNull("command")){JSONObject command=packet.getJSONObject("command");if(!local.optString("id").equals(command.optString("target")))throw new IOException("Invalid target");enqueue(command);}peerAcknowledgements(device);
        if(packet.has("file")){JSONObject requested=packet.getJSONObject("file");String owner=account.get();
            if(!PeerFileCrypto.key(requested.optString("key"))||requested.optLong("offset",-1)<0||requested.optLong("offset")>1073741824L)throw new IOException("Invalid file request");
            JSONObject chunk=fileReader==null?null:fileReader.read(requested);
            if(owner==null||!owner.equals(account.get())||!owner.equals(localAccount))throw new IOException("Account changed");
            reply(socket,200,new JSONObject().put("device",local).put("file",chunk==null?JSONObject.NULL:PeerFileCrypto.seal(secret,session,chunk)));return;
        }
        reply(socket,200,new JSONObject().put("device",local).put("command",take(device.getString("id"))));
    }catch(Exception ignored){}}
    boolean exchange(Peer peer,JSONObject command){return exchangePacket(peer,command,null)!=null;}
    JSONObject exchangePacket(Peer peer,JSONObject command,JSONObject file){String owner=account.get();JSONObject lan=peer.lan;if(local==null||account.get()==null||!account.get().equals(localAccount)||lan==null||!lan.optString("secret").matches("[a-f0-9]{64}")||lan.optInt("port")<1024||lan.optInt("port")>65535)return null;
        LinkedHashSet<String> addresses=new LinkedHashSet<>();if(peer.address!=null)addresses.add(peer.address);JSONArray listed=lan.optJSONArray("addresses");if(listed!=null)for(int i=0;i<Math.min(listed.length(),6);i++)if(privateIP(listed.optString(i)))addresses.add(listed.optString(i));
        for(String address:addresses)try{for(int attempt=0;attempt<2;attempt++)try(Socket socket=new Socket()){
            socket.connect(new InetSocketAddress(address,lan.getInt("port")),450);socket.setSoTimeout(file==null?450:3500);long start=System.currentTimeMillis();
            JSONObject packet=new JSONObject().put("account",account.get()).put("nonce",UUID.randomUUID().toString()).put("session",lan.optString("session")).put("time",System.currentTimeMillis()+peer.offset).put("device",local);if(command!=null)packet.put("command",command);if(file!=null)packet.put("file",file);
            String text=packet.toString();byte[] bytes=text.getBytes(StandardCharsets.UTF_8);String request="POST /exchange HTTP/1.1\r\nHost: "+address+"\r\nContent-Type: application/json\r\nContent-Length: "+bytes.length+"\r\nConnection: close\r\nX-Playerium-Signature: "+signature(lan.getString("secret"),text)+"\r\n\r\n";
            OutputStream out=socket.getOutputStream();out.write(request.getBytes(StandardCharsets.US_ASCII));out.write(bytes);out.flush();InputStream in=new BufferedInputStream(socket.getInputStream());int status=Integer.parseInt(line(in).split(" ")[1]);Map<String,String> response=headers(in);String answer=new String(body(in,Integer.parseInt(response.containsKey("content-length")?response.get("content-length"):"-1")),StandardCharsets.UTF_8);
            if(!matches(response.get("x-playerium-signature"),signature(lan.getString("secret"),answer)))throw new IOException("Invalid signature");JSONObject data=new JSONObject(answer);peer.offset=data.optLong("serverTime")-System.currentTimeMillis();if(status==409&&data.optBoolean("clock")&&attempt==0){lan.put("session",data.optString("session"));continue;}if(status!=200)throw new IOException("Peer unavailable");JSONObject device=data.getJSONObject("device");String expected=peer.document==null?peer.live.optString("id"):peer.document.optString("id");if(!expected.equals(device.optString("id")))throw new IOException("Invalid identity");if(owner==null||!owner.equals(account.get())||!owner.equals(localAccount))throw new IOException("Account changed");if(file!=null)return PeerFileCrypto.open(lan.getString("secret"),lan.getString("session"),data.optJSONObject("file"),file);peer.address=address;peer.live=new JSONObject(device.toString()).put("seenAt",System.currentTimeMillis()-(System.currentTimeMillis()-start)/2);if(data.has("command")&&!data.isNull("command"))enqueue(data.getJSONObject("command"));peerAcknowledgements(device);return data;
        }}catch(Exception ignored){}return null;
    }
    JSONObject readFile(String key,long offset)throws Exception{
        if(!PeerFileCrypto.key(key)||offset<0)return null;JSONObject request=new JSONObject().put("key",key).put("offset",offset);
        for(Peer peer:peers.values()){JSONObject chunk=exchangePacket(peer,null,request);if(chunk!=null)return chunk;}return null;
    }
    boolean send(JSONObject message)throws Exception{Peer peer=peers.get(message.optString("target"));if(peer!=null&&peer.incoming>0&&System.currentTimeMillis()-peer.incoming<1000&&peer.address==null){enqueue(message);return true;}if(peer!=null&&exchange(peer,message))return true;if(peer!=null&&peer.live!=null&&System.currentTimeMillis()-peer.live.optLong("seenAt")<4000){enqueue(message);return true;}return false;}
    void pump(){if(local==null||account.get()==null)return;for(Peer peer:peers.values())if(peer.lan!=null&&!peer.exchanging&&System.currentTimeMillis()>peer.nextProbe&&!(peer.incoming>0&&System.currentTimeMillis()-peer.incoming<1000&&peer.address==null)){peer.exchanging=true;try{outbound.submit(()->{try{if(!exchange(peer,take(peer.document==null?peer.live.optString("id"):peer.document.optString("id"))))peer.nextProbe=System.currentTimeMillis()+5000;}finally{peer.exchanging=false;}});}catch(RejectedExecutionException ignored){peer.exchanging=false;}}}
    void close()throws Exception{heartbeat.shutdownNow();requests.shutdownNow();outbound.shutdownNow();if(server!=null)server.close();}
}
