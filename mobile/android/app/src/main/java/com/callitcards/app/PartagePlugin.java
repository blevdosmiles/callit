package com.callitcards.app;

import android.content.Intent;
import android.net.Uri;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;

/* Photo partagée depuis la Galerie (« Partager » > CallIt!) : copiée dans le cache de l'appli,
   puis lue par natif.js qui l'ouvre dans le centrage. Rien n'est envoyé ailleurs. */
@CapacitorPlugin(name = "Partage")
public class PartagePlugin extends Plugin {
    private static final long MAX = 30L * 1024 * 1024;
    private String enAttente = null;

    @Override
    public void load() { recevoir(getActivity().getIntent()); }

    @Override
    protected void handleOnNewIntent(Intent intent) {
        super.handleOnNewIntent(intent);
        if (recevoir(intent)) notifyListeners("photo", new JSObject(), true);
    }

    private boolean recevoir(Intent intent) {
        if (intent == null || !Intent.ACTION_SEND.equals(intent.getAction())) return false;
        String type = intent.getType();
        if (type == null || !type.startsWith("image/")) return false;
        Uri uri = intent.getParcelableExtra(Intent.EXTRA_STREAM);
        if (uri == null) return false;
        try {
            File dossier = new File(getContext().getCacheDir(), "partage");
            dossier.mkdirs();
            File[] anciens = dossier.listFiles();
            if (anciens != null) for (File f : anciens) f.delete();
            File dest = new File(dossier, "photo-" + System.currentTimeMillis() + (type.contains("png") ? ".png" : ".jpg"));
            long total = 0;
            try (InputStream in = getContext().getContentResolver().openInputStream(uri); OutputStream out = new FileOutputStream(dest)) {
                if (in == null) return false;
                byte[] buf = new byte[65536];
                int n;
                while ((n = in.read(buf)) > 0) { total += n; if (total > MAX) throw new Exception("trop grande"); out.write(buf, 0, n); }
            }
            enAttente = dest.getAbsolutePath();
            intent.setAction(Intent.ACTION_MAIN); // ne pas la reprendre au prochain démarrage
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    @PluginMethod
    public void prendre(PluginCall call) {
        JSObject r = new JSObject();
        if (enAttente != null) { r.put("chemin", enAttente); enAttente = null; }
        call.resolve(r);
    }
}
