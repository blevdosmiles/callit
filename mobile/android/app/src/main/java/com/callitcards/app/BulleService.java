package com.callitcards.app;

import android.annotation.SuppressLint;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.ServiceInfo;
import android.graphics.Color;
import android.graphics.PixelFormat;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.provider.Settings;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.View;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;
import androidx.core.app.NotificationCompat;

/* Bulle CallIt! : une pastille flottante par-dessus les autres applis (ex. un live eBay).
   La toucher ouvre un petit panneau qui affiche la page https://callitcards.com/#/bulle :
   on tape un numéro ou un nom de carte et la cote s'affiche. Tout le contenu du panneau est du code web,
   donc il se règle et s'améliore sans nouvelle version de l'appli.
   Rien n'est lu à l'écran ici : la bulle ne voit pas l'appli du dessous.
   Le panneau parle à l'appli par l'objet JavaScript « CallItBulleNatif » (réduire, fermer, taille, transparence). */
public class BulleService extends Service {
    static final String FERMER = "com.callitcards.app.BULLE_FERMER";
    static final String PAGE = "https://callitcards.com/#/bulle";
    private static final String CANAL = "bulle";
    static volatile boolean active = false;

    private WindowManager wm;
    private SharedPreferences prefs;
    private final Handler ui = new Handler(Looper.getMainLooper());
    private ImageView pastille;
    private LinearLayout panneau;
    private WebView web;
    private WindowManager.LayoutParams lpPastille, lpPanneau;
    private boolean ouvert = false;

    @Override public IBinder onBind(Intent i) { return null; }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && FERMER.equals(intent.getAction())) { stopSelf(); return START_NOT_STICKY; }
        if (Build.VERSION.SDK_INT >= 23 && !Settings.canDrawOverlays(this)) { stopSelf(); return START_NOT_STICKY; }
        demarrerPremierPlan();
        if (pastille == null) creer();
        else if (!ouvert) ouvrir();
        active = true;
        return START_NOT_STICKY;
    }

    private void demarrerPremierPlan() {
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (Build.VERSION.SDK_INT >= 26 && nm.getNotificationChannel(CANAL) == null) {
            NotificationChannel c = new NotificationChannel(CANAL, "Bulle CallIt!", NotificationManager.IMPORTANCE_LOW);
            c.setDescription("Affichée tant que la bulle CallIt! est ouverte");
            nm.createNotificationChannel(c);
        }
        int fi = Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0;
        PendingIntent fermer = PendingIntent.getService(this, 1, new Intent(this, BulleService.class).setAction(FERMER), fi);
        PendingIntent appli = PendingIntent.getActivity(this, 2, new Intent(this, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK), fi);
        Notification n = new NotificationCompat.Builder(this, CANAL)
            .setSmallIcon(getApplicationInfo().icon)
            .setContentTitle("Bulle CallIt! ouverte")
            .setContentText("Touche la pastille pour voir la cote d'une carte.")
            .setContentIntent(appli)
            .addAction(0, "Fermer la bulle", fermer)
            .setOngoing(true)
            .build();
        if (Build.VERSION.SDK_INT >= 34) startForeground(7, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE);
        else startForeground(7, n);
    }

    private int dp(float v) { return Math.round(TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v, getResources().getDisplayMetrics())); }
    private int typeFenetre() { return Build.VERSION.SDK_INT >= 26 ? WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY : WindowManager.LayoutParams.TYPE_PHONE; }

    @SuppressLint({"ClickableViewAccessibility", "SetJavaScriptEnabled", "JavascriptInterface"})
    private void creer() {
        wm = (WindowManager) getSystemService(WINDOW_SERVICE);
        prefs = getSharedPreferences("bulle", MODE_PRIVATE);

        // Pastille ronde, déplaçable du doigt ; un simple toucher ouvre le panneau
        pastille = new ImageView(this);
        pastille.setImageResource(R.mipmap.ic_launcher_round);
        int t = dp(prefs.getBoolean("petite", false) ? 44 : 58);
        lpPastille = new WindowManager.LayoutParams(t, t, typeFenetre(),
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE | WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS, PixelFormat.TRANSLUCENT);
        lpPastille.gravity = Gravity.TOP | Gravity.START;
        lpPastille.x = prefs.getInt("x", dp(8));
        lpPastille.y = prefs.getInt("y", dp(160));
        pastille.setOnTouchListener(new Glisser(lpPastille, true));
        wm.addView(pastille, lpPastille);

        // Panneau : une barre (pour le déplacer, réduire, fermer) + la page web de la bulle
        panneau = new LinearLayout(this);
        panneau.setOrientation(LinearLayout.VERTICAL);
        GradientDrawable fond = new GradientDrawable();
        fond.setColor(Color.parseColor("#18181b")); fond.setCornerRadius(dp(16));
        panneau.setBackground(fond);
        panneau.setClipToOutline(true);
        LinearLayout barre = new LinearLayout(this);
        barre.setGravity(Gravity.CENTER_VERTICAL);
        barre.setPadding(dp(12), 0, dp(4), 0);
        TextView titre = new TextView(this);
        titre.setText("⠿  CallIt!");
        titre.setTextColor(Color.WHITE);
        titre.setTextSize(13);
        barre.addView(titre, new LinearLayout.LayoutParams(0, dp(36), 1f));
        titre.setGravity(Gravity.CENTER_VERTICAL);
        barre.addView(bouton("–", v -> reduire()), new LinearLayout.LayoutParams(dp(40), dp(36)));
        barre.addView(bouton("✕", v -> stopSelf()), new LinearLayout.LayoutParams(dp(40), dp(36)));
        panneau.addView(barre, new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(36)));
        web = new WebView(this);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        web.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) {
                Uri u = r.getUrl();
                if ("callitcards.com".equals(u.getHost()) || "www.callitcards.com".equals(u.getHost())) return false;
                try { startActivity(new Intent(Intent.ACTION_VIEW, u).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)); } catch (Exception e) { }
                return true;
            }
        });
        web.addJavascriptInterface(new Pont(), "CallItBulleNatif");
        web.loadUrl(PAGE);
        panneau.addView(web, new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f));
        int[] d = dimensions(prefs.getString("taille", "m"));
        lpPanneau = new WindowManager.LayoutParams(d[0], d[1], typeFenetre(),
            WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL | WindowManager.LayoutParams.FLAG_WATCH_OUTSIDE_TOUCH, PixelFormat.TRANSLUCENT);
        lpPanneau.gravity = Gravity.TOP | Gravity.START;
        lpPanneau.x = prefs.getInt("px", dp(12));
        lpPanneau.y = prefs.getInt("py", dp(90));
        lpPanneau.alpha = prefs.getFloat("alpha", 1f);
        lpPanneau.softInputMode = WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE;
        titre.setOnTouchListener(new Glisser(lpPanneau, false));
        ouvrir();
    }

    private TextView bouton(String t, View.OnClickListener l) {
        TextView b = new TextView(this);
        b.setText(t); b.setTextColor(Color.WHITE); b.setTextSize(18); b.setGravity(Gravity.CENTER);
        b.setOnClickListener(l);
        return b;
    }

    private int[] dimensions(String taille) {
        int w = getResources().getDisplayMetrics().widthPixels - dp(24);
        if ("s".equals(taille)) return new int[]{Math.min(w, dp(250)), dp(300)};
        if ("l".equals(taille)) return new int[]{Math.min(w, dp(340)), dp(520)};
        return new int[]{Math.min(w, dp(300)), dp(400)};
    }

    private void ouvrir() {
        if (ouvert || panneau == null) return;
        if (panneau.getParent() == null) wm.addView(panneau, lpPanneau);
        panneau.setVisibility(View.VISIBLE);
        pastille.setVisibility(View.GONE);
        ouvert = true;
        web.evaluateJavascript("window.CallItBulle && window.CallItBulle.ouverte && window.CallItBulle.ouverte()", null);
    }
    private void reduire() {
        if (!ouvert) return;
        panneau.setVisibility(View.GONE);
        pastille.setVisibility(View.VISIBLE);
        ouvert = false;
    }

    /* Déplacer une fenêtre du doigt ; pour la pastille, un toucher sans déplacement l'ouvre */
    private class Glisser implements View.OnTouchListener {
        final WindowManager.LayoutParams lp; final boolean estPastille;
        int x0, y0; float tx, ty; boolean bouge;
        Glisser(WindowManager.LayoutParams lp, boolean estPastille) { this.lp = lp; this.estPastille = estPastille; }
        @Override public boolean onTouch(View v, MotionEvent e) {
            switch (e.getActionMasked()) {
                case MotionEvent.ACTION_DOWN: x0 = lp.x; y0 = lp.y; tx = e.getRawX(); ty = e.getRawY(); bouge = false; return true;
                case MotionEvent.ACTION_MOVE:
                    int dx = (int) (e.getRawX() - tx), dy = (int) (e.getRawY() - ty);
                    if (Math.abs(dx) > dp(6) || Math.abs(dy) > dp(6)) bouge = true;
                    if (bouge) { lp.x = Math.max(0, x0 + dx); lp.y = Math.max(0, y0 + dy); wm.updateViewLayout(estPastille ? pastille : panneau, lp); }
                    return true;
                case MotionEvent.ACTION_UP:
                    if (estPastille) { if (!bouge) ouvrir(); else prefs.edit().putInt("x", lp.x).putInt("y", lp.y).apply(); }
                    else prefs.edit().putInt("px", lp.x).putInt("py", lp.y).apply();
                    return true;
            }
            return false;
        }
    }

    /* Appelé par la page de la bulle (callitcards.com/#/bulle). Ne donne accès à rien d'autre que la fenêtre. */
    private class Pont {
        @JavascriptInterface public void reduire() { ui.post(BulleService.this::reduire); }
        @JavascriptInterface public void fermer() { ui.post(BulleService.this::stopSelf); }
        @JavascriptInterface public void taille(String t) {
            ui.post(() -> {
                String v = "s".equals(t) || "l".equals(t) ? t : "m";
                prefs.edit().putString("taille", v).apply();
                int[] d = dimensions(v); lpPanneau.width = d[0]; lpPanneau.height = d[1];
                if (panneau.getParent() != null) wm.updateViewLayout(panneau, lpPanneau);
            });
        }
        @JavascriptInterface public void transparence(float a) {
            ui.post(() -> {
                float v = Math.max(0.5f, Math.min(1f, a));
                prefs.edit().putFloat("alpha", v).apply();
                lpPanneau.alpha = v; if (panneau.getParent() != null) wm.updateViewLayout(panneau, lpPanneau);
            });
        }
        @JavascriptInterface public void pastille(boolean petite) {
            ui.post(() -> {
                prefs.edit().putBoolean("petite", petite).apply();
                int t = dp(petite ? 44 : 58); lpPastille.width = t; lpPastille.height = t;
                wm.updateViewLayout(pastille, lpPastille);
            });
        }
        // Ouvre un écran de l'appli (ex. « #/carte/… ») par le lien callit://
        @JavascriptInterface public void ouvrirAppli(String hash) {
            ui.post(() -> {
                if (hash == null || !hash.startsWith("#/")) return;
                reduire();
                Intent i = new Intent(Intent.ACTION_VIEW, Uri.parse("callit://app" + hash), BulleService.this, MainActivity.class);
                i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                startActivity(i);
            });
        }
        @JavascriptInterface public boolean estNatif() { return true; }
    }

    @Override
    public void onDestroy() {
        active = false;
        try { if (pastille != null && pastille.getParent() != null) wm.removeView(pastille); } catch (Exception e) { }
        try { if (panneau != null && panneau.getParent() != null) wm.removeView(panneau); } catch (Exception e) { }
        if (web != null) { web.removeJavascriptInterface("CallItBulleNatif"); web.destroy(); }
        super.onDestroy();
    }
}
