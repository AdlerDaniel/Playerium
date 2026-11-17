package com.playerium.music;

import androidx.test.platform.app.InstrumentationRegistry;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;

@RunWith(AndroidJUnit4.class)
public class LyricsCatalogTest {
 @Test public void catalogTransportRestrictsPublicSourcesAndPaths()throws Exception{
  assertEquals("https://pisni.in.ua/dorofeeva/chervoni-praportsi",LyricsCatalogPage.pageURL(new JSONObject().put("provider","pisni").put("path","/dorofeeva/chervoni-praportsi")));
  for(String path:new String[]{"//localhost/secret","/artist/%2e%2e","/../secret/","/artist/song?target=elsewhere"})try{LyricsCatalogPage.pageURL(new JSONObject().put("provider","pisni").put("path",path));fail("Accepted invalid path");}catch(SecurityException expected){}
  try{LyricsCatalogPage.pageURL(new JSONObject().put("provider","other").put("query","Song"));fail("Accepted unknown catalog");}catch(SecurityException expected){}
 }
 @Test public void liveReaderReturnsTheVerifiedPublicSongPage()throws Exception{
  org.junit.Assume.assumeTrue("Enable explicit external-service verification",InstrumentationRegistry.getArguments().getString("lyricsNetwork","").equals("true"));
  JSONObject page=LyricsCatalogPage.fetch(new JSONObject().put("provider","pisni").put("path","/dorofeeva/chervoni-praportsi"));
  assertEquals(200,page.getInt("status"));assertEquals("https://pisni.in.ua/dorofeeva/chervoni-praportsi",page.getString("url"));assertTrue(page.getString("html").contains("MusicRecording"));assertTrue(page.getString("html").contains("DOROFEEVA"));
 }
}
