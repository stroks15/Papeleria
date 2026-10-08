package com.papeleriaarcoiris.app;

import android.content.ContentValues;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.PluginMethod;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;

@CapacitorPlugin(name = "FileSaver")
public class FileSaverPlugin extends Plugin {
    @PluginMethod
    public void save(PluginCall call) {
        String filename = call.getString("filename");
        String mimeType = call.getString("mimeType");
        if (mimeType == null || mimeType.trim().isEmpty()) mimeType = "application/octet-stream";
        String dataBase64 = call.getString("dataBase64");

        if (filename == null || filename.trim().isEmpty() || dataBase64 == null || dataBase64.isEmpty()) {
            call.reject("Archivo inválido.");
            return;
        }

        try {
            byte[] bytes = Base64.decode(dataBase64, Base64.DEFAULT);

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                ContentValues values = new ContentValues();
                values.put(MediaStore.Downloads.DISPLAY_NAME, filename);
                values.put(MediaStore.Downloads.MIME_TYPE, mimeType);
                values.put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/Papelería Arcoíris");
                values.put(MediaStore.Downloads.IS_PENDING, 1);

                Uri uri = getContext().getContentResolver().insert(
                    MediaStore.Downloads.EXTERNAL_CONTENT_URI, values
                );
                if (uri == null) throw new IllegalStateException("No se pudo crear el archivo en Descargas.");

                try (OutputStream output = getContext().getContentResolver().openOutputStream(uri)) {
                    if (output == null) throw new IllegalStateException("No se pudo escribir el archivo.");
                    output.write(bytes);
                }

                ContentValues done = new ContentValues();
                done.put(MediaStore.Downloads.IS_PENDING, 0);
                getContext().getContentResolver().update(uri, done, null, null);

                JSObject result = new JSObject();
                result.put("uri", uri.toString());
                result.put("filename", filename);
                result.put("size", bytes.length);
                call.resolve(result);
                return;
            }

            File directory = new File(
                getContext().getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS),
                "Papelería Arcoíris"
            );
            if (!directory.exists() && !directory.mkdirs()) {
                throw new IllegalStateException("No se pudo crear la carpeta de Descargas.");
            }

            File outputFile = new File(directory, filename);
            try (FileOutputStream output = new FileOutputStream(outputFile)) {
                output.write(bytes);
            }

            JSObject result = new JSObject();
            result.put("uri", Uri.fromFile(outputFile).toString());
            result.put("filename", filename);
            result.put("size", bytes.length);
            call.resolve(result);
        } catch (Exception error) {
            call.reject("No se pudo guardar el archivo en Descargas.", error);
        }
    }
}
