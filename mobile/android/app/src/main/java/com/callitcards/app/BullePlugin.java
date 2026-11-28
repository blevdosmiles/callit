package com.callitcards.app;

import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/* Ouvre ou ferme la bulle CallIt! depuis le Mode Live.
   Android demande d'autoriser « Afficher par-dessus les autres applis » une fois : on ouvre ce réglage. */
@CapacitorPlugin(name = "Bulle")
public class BullePlugin extends Plugin {
    private boolean autorisee() { return Build.VERSION.SDK_INT < 23 || Settings.canDrawOverlays(getContext()); }

    @PluginMethod
    public void etat(PluginCall call) {
        JSObject r = new JSObject();
        r.put("autorisee", autorisee());
        r.put("active", BulleService.active);
        call.resolve(r);
    }

    @PluginMethod
    public void ouvrir(PluginCall call) {
        JSObject r = new JSObject();
        if (!autorisee()) {
            Intent i = new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:" + getContext().getPackageName()));
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(i);
            r.put("autorisee", false);
            call.resolve(r);
            return;
        }
        getContext().startService(new Intent(getContext(), BulleService.class));
        r.put("autorisee", true);
        call.resolve(r);
    }

    @PluginMethod
    public void fermer(PluginCall call) {
        getContext().startService(new Intent(getContext(), BulleService.class).setAction(BulleService.FERMER));
        call.resolve();
    }
}
