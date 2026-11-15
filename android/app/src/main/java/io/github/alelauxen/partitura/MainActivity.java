package io.github.alelauxen.partitura;

import android.Manifest;
import android.app.Activity;
import android.content.ContentValues;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.media.projection.MediaProjectionManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import androidx.webkit.WebViewAssetLoader;

import java.io.File;
import java.io.OutputStream;
import java.util.ArrayList;

public class MainActivity extends Activity {
    static final String HOST = "https://appassets.androidplatform.net";
    static final int REQ_FILE = 1, REQ_PROJ = 2, REQ_PERM_CAP = 3, REQ_PERM_MIC = 4;
    static MainActivity inst;

    WebView web;
    ValueCallback<Uri[]> fileCb;
    PermissionRequest pendingWebPerm;
    int pendingMax = 0;

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        inst = this;
        File capDir = new File(getCacheDir(), "cap");
        capDir.mkdirs();
        final WebViewAssetLoader loader = new WebViewAssetLoader.Builder()
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
                .addPathHandler("/cap/", new WebViewAssetLoader.InternalStoragePathHandler(this, capDir))
                .build();

        web = new WebView(this);
        setContentView(web);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(true);
        s.setTextZoom(100);

        web.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView v, WebResourceRequest r) {
                return loader.shouldInterceptRequest(r.getUrl());
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) {
                Uri u = r.getUrl();
                if (HOST.contains(u.getHost() == null ? "" : u.getHost())) return false;
                try { startActivity(new Intent(Intent.ACTION_VIEW, u)); } catch (Exception e) { }
                return true;
            }
        });

        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onPermissionRequest(final PermissionRequest req) {
                runOnUiThread(() -> {
                    boolean audio = false;
                    for (String r : req.getResources())
                        if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(r)) audio = true;
                    if (!audio) { req.deny(); return; }
                    if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) {
                        req.grant(new String[]{PermissionRequest.RESOURCE_AUDIO_CAPTURE});
                    } else {
                        pendingWebPerm = req;
                        requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO}, REQ_PERM_MIC);
                    }
                });
            }

            @Override
            public boolean onShowFileChooser(WebView v, ValueCallback<Uri[]> cb, FileChooserParams p) {
                if (fileCb != null) fileCb.onReceiveValue(null);
                fileCb = cb;
                Intent i = new Intent(Intent.ACTION_GET_CONTENT);
                i.addCategory(Intent.CATEGORY_OPENABLE);
                String[] acc = p.getAcceptTypes();
                ArrayList<String> mimes = new ArrayList<>();
                for (String a : acc) for (String x : a.split(",")) {
                    x = x.trim();
                    if (x.contains("/")) mimes.add(x);
                }
                i.setType("*/*");
                if (!mimes.isEmpty() && !acc[0].contains(".")) i.putExtra(Intent.EXTRA_MIME_TYPES, mimes.toArray(new String[0]));
                if (p.getMode() == FileChooserParams.MODE_OPEN_MULTIPLE) i.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
                try { startActivityForResult(Intent.createChooser(i, "Escolher arquivo"), REQ_FILE); }
                catch (Exception e) { fileCb = null; return false; }
                return true;
            }
        });

        web.addJavascriptInterface(new Bridge(), "AndroidBridge");
        if (b == null) web.loadUrl(HOST + "/assets/www/index.html");
        else web.restoreState(b);
    }

    @Override
    protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        web.saveState(out);
    }

    @Override
    public void onBackPressed() {
        web.evaluateJavascript("(function(){try{if(typeof showHome==='function'&&document.getElementById('app')&&document.getElementById('app').style.display!=='none'){showHome();return 'h'}}catch(e){}return 'x'})()",
                v -> { if (!"\"h\"".equals(v)) moveTaskToBack(true); });
    }

    class Bridge {
        @JavascriptInterface
        public void startCapture(final int maxSec) {
            runOnUiThread(() -> {
                pendingMax = maxSec;
                ArrayList<String> need = new ArrayList<>();
                if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED)
                    need.add(Manifest.permission.RECORD_AUDIO);
                if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED)
                    need.add(Manifest.permission.POST_NOTIFICATIONS);
                if (!need.isEmpty()) requestPermissions(need.toArray(new String[0]), REQ_PERM_CAP);
                else askProjection();
            });
        }

        @JavascriptInterface
        public void stopCapture() {
            Intent i = new Intent(MainActivity.this, CaptureService.class);
            i.setAction(CaptureService.ACTION_STOP);
            startService(i);
        }

        @JavascriptInterface
        public boolean isCapturing() { return CaptureService.running; }

        @JavascriptInterface
        public void saveFile(String name, String b64, String mime) {
            try {
                byte[] data = Base64.decode(b64, Base64.DEFAULT);
                ContentValues cv = new ContentValues();
                cv.put(MediaStore.Downloads.DISPLAY_NAME, name);
                cv.put(MediaStore.Downloads.MIME_TYPE, mime);
                cv.put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/Partituras");
                Uri u = getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, cv);
                try (OutputStream o = getContentResolver().openOutputStream(u)) { o.write(data); }
                toast("Salvo em Downloads/Partituras: " + name);
            } catch (Exception e) {
                toast("Não consegui salvar: " + e.getMessage());
            }
        }
    }

    void askProjection() {
        MediaProjectionManager m = (MediaProjectionManager) getSystemService(MEDIA_PROJECTION_SERVICE);
        startActivityForResult(m.createScreenCaptureIntent(), REQ_PROJ);
    }

    @Override
    public void onRequestPermissionsResult(int code, String[] perms, int[] res) {
        if (code == REQ_PERM_MIC && pendingWebPerm != null) {
            if (res.length > 0 && res[0] == PackageManager.PERMISSION_GRANTED)
                pendingWebPerm.grant(new String[]{PermissionRequest.RESOURCE_AUDIO_CAPTURE});
            else pendingWebPerm.deny();
            pendingWebPerm = null;
        } else if (code == REQ_PERM_CAP) {
            if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) askProjection();
            else captureDone(null, "Sem a permissão de áudio o app não consegue ouvir o som do celular.");
        }
    }

    @Override
    protected void onActivityResult(int req, int res, Intent data) {
        if (req == REQ_FILE) {
            Uri[] r = null;
            if (res == RESULT_OK && data != null) {
                if (data.getClipData() != null) {
                    int n = data.getClipData().getItemCount();
                    r = new Uri[n];
                    for (int k = 0; k < n; k++) r[k] = data.getClipData().getItemAt(k).getUri();
                } else if (data.getData() != null) r = new Uri[]{data.getData()};
            }
            if (fileCb != null) fileCb.onReceiveValue(r);
            fileCb = null;
        } else if (req == REQ_PROJ) {
            if (res != RESULT_OK || data == null) {
                captureDone(null, "Captura cancelada.");
                return;
            }
            Intent i = new Intent(this, CaptureService.class);
            i.putExtra("code", res);
            i.putExtra("data", data);
            i.putExtra("max", pendingMax);
            startForegroundService(i);
        }
    }

    void toast(String t) { runOnUiThread(() -> Toast.makeText(this, t, Toast.LENGTH_LONG).show()); }

    static String js(String s) {
        if (s == null) return "null";
        return "'" + s.replace("\\", "\\\\").replace("'", "\\'").replace("\n", " ") + "'";
    }

    static void state(String st, int sec, String msg) {
        MainActivity a = inst;
        if (a == null) return;
        a.runOnUiThread(() -> a.web.evaluateJavascript("window.onNativeCaptureState&&onNativeCaptureState(" + js(st) + "," + sec + "," + js(msg) + ")", null));
    }

    static void captureDone(String fileName, String err) {
        MainActivity a = inst;
        if (a == null) return;
        String url = fileName == null ? null : HOST + "/cap/" + fileName;
        a.runOnUiThread(() -> a.web.evaluateJavascript("window.onNativeCapture&&onNativeCapture(" + js(url) + "," + js(err) + ")", null));
    }
}
