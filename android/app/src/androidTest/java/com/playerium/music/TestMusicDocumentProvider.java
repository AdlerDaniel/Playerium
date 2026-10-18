package com.playerium.music;

import android.content.ContentProvider;
import android.content.ContentValues;
import android.content.Intent;
import android.database.Cursor;
import android.database.MatrixCursor;
import android.net.Uri;
import android.os.Bundle;
import android.os.ParcelFileDescriptor;
import android.provider.DocumentsContract.Document;
import java.io.*;

/** Instrumentation APK only: exercises actual content:// grants and failed writes. */
public class TestMusicDocumentProvider extends ContentProvider {
    private File root;
    @Override public boolean onCreate(){root=new File(getContext().getFilesDir(),"normalization-documents");root.mkdirs();return true;}
    private File file(Uri uri){String name=uri.getLastPathSegment();if(name==null||!name.matches("[a-zA-Z0-9-]+\\.wav"))throw new SecurityException("Invalid fixture");return new File(root,name);}
    private boolean flag(Uri uri,String name){return getContext().getSharedPreferences("documents",0).getBoolean(uri+":"+name,false);}
    @Override public Bundle call(String method,String arg,Bundle extras){try{
        if(method.equals("create")){
            File file=new File(root,java.util.UUID.randomUUID()+".wav");try(FileOutputStream out=new FileOutputStream(file)){out.write(extras.getByteArray("bytes"));}
            Uri uri=Uri.parse("content://com.playerium.music.test-documents/document/"+file.getName());boolean readOnly=extras.getBoolean("readOnly");
            getContext().getSharedPreferences("documents",0).edit().putBoolean(uri+":readOnly",readOnly).commit();
            int grants=Intent.FLAG_GRANT_READ_URI_PERMISSION|Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION|(readOnly?0:Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
            getContext().grantUriPermission(extras.getString("package"),uri,grants);Bundle result=new Bundle();result.putString("uri",uri.toString());result.putInt("grants",grants);return result;
        }
        Uri uri=Uri.parse(arg);File file=file(uri);
        if(method.equals("failWrites"))getContext().getSharedPreferences("documents",0).edit().putBoolean(uri+":fail",extras.getBoolean("enabled")).commit();
        if(method.equals("delete"))file.delete();return new Bundle();
    }catch(IOException error){throw new IllegalStateException(error);}}
    @Override public Cursor query(Uri uri,String[] projection,String selection,String[] args,String sort){File f=file(uri);String[] columns=projection==null?new String[]{Document.COLUMN_DOCUMENT_ID,Document.COLUMN_DISPLAY_NAME,Document.COLUMN_MIME_TYPE,Document.COLUMN_SIZE,Document.COLUMN_LAST_MODIFIED,Document.COLUMN_FLAGS}:projection;
        MatrixCursor cursor=new MatrixCursor(columns);MatrixCursor.RowBuilder row=cursor.newRow();for(String column:columns){Object value=null;if(column.equals(Document.COLUMN_DOCUMENT_ID)||column.equals(Document.COLUMN_DISPLAY_NAME))value=f.getName();else if(column.equals(Document.COLUMN_MIME_TYPE))value="audio/wav";else if(column.equals(Document.COLUMN_SIZE))value=f.length();else if(column.equals(Document.COLUMN_LAST_MODIFIED))value=f.lastModified();else if(column.equals(Document.COLUMN_FLAGS))value=flag(uri,"readOnly")?0:Document.FLAG_SUPPORTS_WRITE;row.add(value);}return cursor;}
    @Override public String getType(Uri uri){return "audio/wav";}
    @Override public ParcelFileDescriptor openFile(Uri uri,String mode)throws FileNotFoundException{
        if(mode.contains("w")&&flag(uri,"readOnly"))throw new FileNotFoundException("Read-only fixture");
        ParcelFileDescriptor fd=ParcelFileDescriptor.open(file(uri),ParcelFileDescriptor.parseMode(mode));
        if(mode.contains("w")&&flag(uri,"fail")){try{fd.close();}catch(IOException ignored){}throw new FileNotFoundException("Injected failure after truncating the document");}return fd;
    }
    @Override public Uri insert(Uri uri,ContentValues values){throw new UnsupportedOperationException();}
    @Override public int update(Uri uri,ContentValues values,String selection,String[] args){throw new UnsupportedOperationException();}
    @Override public int delete(Uri uri,String selection,String[] args){return file(uri).delete()?1:0;}
}
