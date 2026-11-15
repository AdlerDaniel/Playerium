package com.playerium.music;

import android.content.Intent;
import android.database.Cursor;
import android.database.MatrixCursor;
import android.net.Uri;
import android.os.Bundle;
import android.os.CancellationSignal;
import android.os.ParcelFileDescriptor;
import android.provider.DocumentsContract;
import android.provider.DocumentsContract.Document;
import android.provider.DocumentsContract.Root;
import android.provider.DocumentsProvider;
import android.util.Base64;
import java.io.*;
import java.nio.charset.StandardCharsets;

/** A real SAF provider with opaque IDs, nested folders and persistent prefix grants. Test APK only. */
public class TreeMusicProvider extends DocumentsProvider {
 static final String AUTHORITY="com.playerium.music.test-tree",ROOT="opaque-root";
 private File root;
 @Override public boolean onCreate(){root=new File(getContext().getFilesDir(),"tree-music");root.mkdirs();return true;}
 private String id(File file){String relative=root.toURI().relativize(file.toURI()).getPath();return relative.isEmpty()?ROOT:"opaque-"+Base64.encodeToString(relative.getBytes(StandardCharsets.UTF_8),Base64.NO_WRAP|Base64.URL_SAFE);}
 private File file(String id)throws FileNotFoundException{
  try{File f=ROOT.equals(id)?root:new File(root,new String(Base64.decode(id.substring(7),Base64.NO_WRAP|Base64.URL_SAFE),StandardCharsets.UTF_8));if(!f.getCanonicalPath().equals(root.getCanonicalPath())&&!f.getCanonicalPath().startsWith(root.getCanonicalPath()+File.separator))throw new IOException();return f;}
  catch(Exception e){throw new FileNotFoundException("Invalid document");}
 }
 private void row(MatrixCursor cursor,String[] columns,File f){MatrixCursor.RowBuilder row=cursor.newRow();for(String column:columns){Object value=null;
  if(column.equals(Document.COLUMN_DOCUMENT_ID))value=id(f);else if(column.equals(Document.COLUMN_DISPLAY_NAME))value=f.getName();else if(column.equals(Document.COLUMN_MIME_TYPE))value=f.isDirectory()?Document.MIME_TYPE_DIR:f.getName().endsWith(".mp3")?"audio/mpeg":"audio/wav";
  else if(column.equals(Document.COLUMN_SIZE))value=f.length();else if(column.equals(Document.COLUMN_LAST_MODIFIED))value=f.lastModified();else if(column.equals(Document.COLUMN_FLAGS))value=f.isDirectory()?Document.FLAG_DIR_SUPPORTS_CREATE:Document.FLAG_SUPPORTS_WRITE|Document.FLAG_SUPPORTS_DELETE;row.add(value);
 }}
 private String[] columns(String[] projection){return projection==null?new String[]{Document.COLUMN_DOCUMENT_ID,Document.COLUMN_DISPLAY_NAME,Document.COLUMN_MIME_TYPE,Document.COLUMN_SIZE,Document.COLUMN_LAST_MODIFIED,Document.COLUMN_FLAGS}:projection;}
 @Override public Cursor queryRoots(String[] projection){String[] columns=projection==null?new String[]{Root.COLUMN_ROOT_ID,Root.COLUMN_DOCUMENT_ID,Root.COLUMN_TITLE,Root.COLUMN_FLAGS}:projection;MatrixCursor c=new MatrixCursor(columns);MatrixCursor.RowBuilder row=c.newRow();for(String column:columns)row.add(column.equals(Root.COLUMN_TITLE)?"Playerium test":column.equals(Root.COLUMN_FLAGS)?Root.FLAG_SUPPORTS_CREATE:ROOT);return c;}
 @Override public Cursor queryDocument(String documentId,String[] projection)throws FileNotFoundException{String[] columns=columns(projection);MatrixCursor c=new MatrixCursor(columns);row(c,columns,file(documentId));return c;}
 @Override public Cursor queryChildDocuments(String parent,String[] projection,String sort)throws FileNotFoundException{String[] columns=columns(projection);MatrixCursor c=new MatrixCursor(columns);File[] files=file(parent).listFiles();if(files!=null)for(File f:files)row(c,columns,f);return c;}
 @Override public boolean isChildDocument(String parent,String child){try{return file(child).getCanonicalPath().startsWith(file(parent).getCanonicalPath()+File.separator);}catch(Exception e){return false;}}
 @Override public ParcelFileDescriptor openDocument(String documentId,String mode,CancellationSignal signal)throws FileNotFoundException{return ParcelFileDescriptor.open(file(documentId),ParcelFileDescriptor.parseMode(mode));}
 @Override public String createDocument(String parent,String mime,String name)throws FileNotFoundException{try{File target=new File(file(parent),name);if(!target.getCanonicalPath().startsWith(root.getCanonicalPath()+File.separator))throw new IOException();if(Document.MIME_TYPE_DIR.equals(mime)){if(!target.mkdir())throw new IOException();}else if(!target.createNewFile())throw new IOException();return id(target);}catch(IOException e){throw new FileNotFoundException(e.toString());}}
 @Override public void deleteDocument(String documentId)throws FileNotFoundException{if(!file(documentId).delete())throw new FileNotFoundException();}
 @Override public Bundle call(String method,String arg,Bundle extras){
  if(!"fixture".equals(method))return super.call(method,arg,extras);
  try{
   for(String name:new String[]{"Root.wav","One/Middle.wav","One/Two/Deep.wav"}){File f=new File(root,name);f.getParentFile().mkdirs();try(OutputStream out=new FileOutputStream(f)){out.write(extras.getByteArray("bytes"));}}
   Uri tree=DocumentsContract.buildTreeDocumentUri(AUTHORITY,ROOT);
   int flags=Intent.FLAG_GRANT_READ_URI_PERMISSION|Intent.FLAG_GRANT_WRITE_URI_PERMISSION|Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION|Intent.FLAG_GRANT_PREFIX_URI_PERMISSION;
   getContext().grantUriPermission(extras.getString("package"),tree,flags);Bundle result=new Bundle();result.putString("tree",tree.toString());result.putString("deep",DocumentsContract.buildDocumentUriUsingTree(tree,id(new File(root,"One/Two/Deep.wav"))).toString());return result;
  }catch(IOException e){throw new IllegalStateException(e);}
 }
}
