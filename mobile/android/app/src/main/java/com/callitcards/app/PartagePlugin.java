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
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/* Photo partagée depuis la Galerie (« Partager » > CallIt!) : copiée dans le cache de l'appli,
   puis lue par natif.js qui l'ouvre dans le centrage. Rien n'est envoyé ailleurs.
   Lien partagé depuis l'appli eBay (« Partager » > Enchères CallIt!) : le texte est gardé, puis natif.js
   l'ouvre dans « Mes enchères ». Un lien court eBay (ebay.us/…) est déplié en lisant seulement l'adresse
   de redirection d'eBay (rien n'est lu sur l'annonce elle-même). */
@CapacitorPlugin(name = "Partage")
public class PartagePlugin extends Plugin {
    private static final long MAX = 30L * 1024 * 1024;
    private String enAttente = null;
    private String texte = null, sujet = null;
    private static final Pattern COURT = Pattern.compile("https?://(?:www\\.)?ebay\\.(?:us|to)/[^\\s\"'<>]+", Pattern.CASE_INSENSITIVE);
    private static final Pattern EBAY = Pattern.compile("^https://(?:[a-z0-9-]+\\.)*ebay\\.[a-z]{2,3}(?:\\.[a-z]{2})?/", Pattern.CASE_INSENSITIVE);

    @Override
    public void load() { recevoir(getActivity().getIntent()); }

    @Override
    protected void handleOnNewIntent(Intent intent) {
        super.handleOnNewIntent(intent);
        if (recevoir(intent)) notifyListeners(texte != null ? "texte" : "photo", new JSObject(), true);
    }

    private boolean recevoir(Intent intent) {
        if (intent == null || !Intent.ACTION_SEND.equals(intent.getAction())) return false;
        String type = intent.getType();
        if ("text/plain".equals(type)) {
            CharSequence t = intent.getCharSequenceExtra(Intent.EXTRA_TEXT);
            if (t == null || t.length() == 0) return false;
            texte = t.length() > 4000 ? t.subSequence(0, 4000).toString() : t.toString();
            String s = intent.getStringExtra(Intent.EXTRA_SUBJECT);
            sujet = s != null && s.length() > 300 ? s.substring(0, 300) : s;
            intent.setAction(Intent.ACTION_MAIN);
            return true;
        }
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

    // ebay.us/m/… → https://www.ebay.fr/itm/… : on suit au plus 5 redirections, seulement vers eBay, sans lire les pages
    private static String deplier(String court) {
        String url = court;
        for (int i = 0; i < 5; i++) {
            HttpURLConnection c = null;
            try {
                c = (HttpURLConnection) new URL(url).openConnection();
                c.setInstanceFollowRedirects(false);
                c.setConnectTimeout(4000); c.setReadTimeout(4000);
                c.setRequestMethod("GET");
                int code = c.getResponseCode();
                String loc = c.getHeaderField("Location");
                if (code < 300 || code >= 400 || loc == null) break;
                String suivant = new URL(new URL(url), loc).toString();
                if (!EBAY.matcher(suivant).find()) break;
                url = suivant;
                if (suivant.contains("/itm/")) break;
            } catch (Exception e) {
                break;
            } finally {
                if (c != null) c.disconnect();
            }
        }
        return url.equals(court) ? null : url;
    }

    @PluginMethod
    public void prendre(PluginCall call) {
        if (texte != null) {
            final String t = texte, s = sujet;
            texte = null; sujet = null;
            new Thread(() -> {
                JSObject r = new JSObject();
                r.put("texte", t);
                if (s != null) r.put("sujet", s);
                Matcher m = COURT.matcher(t);
                if (m.find()) { String long_ = deplier(m.group()); if (long_ != null) r.put("lien", long_); }
                call.resolve(r);
            }).start();
            return;
        }
        JSObject r = new JSObject();
        if (enAttente != null) { r.put("chemin", enAttente); enAttente = null; }
        call.resolve(r);
    }
}
