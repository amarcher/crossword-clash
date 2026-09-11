package com.crosswordclash.app;

import android.content.Intent;
import android.graphics.Bitmap;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.ViewGroup;
import android.webkit.CookieManager;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.activity.ComponentActivity;
import androidx.activity.OnBackPressedCallback;
import org.json.JSONObject;
import org.json.JSONTokener;
import java.io.InputStream;
import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.UUID;

/** Separate unbridged WebView: never exposes addJavascriptInterface or Capacitor. */
public class NytImportActivity extends ComponentActivity {
    private WebView browser;
    private Button importButton;
    private TextView status;
    private JSONObject labels = new JSONObject();
    private String initialUrl;
    private int generation = 0;
    private final Handler handler = new Handler(Looper.getMainLooper());

    static boolean allowed(String input) {
        if (input == null) return false;
        Uri url = Uri.parse(input);
        String host = url.getHost();
        return "https".equals(url.getScheme()) && url.getUserInfo() == null &&
            (url.getPort() == -1 || url.getPort() == 443) && host != null &&
            (host.equals("nytimes.com") || host.endsWith(".nytimes.com"));
    }
    static boolean isPuzzle(String input) {
        if (!allowed(input)) return false;
        Uri url = Uri.parse(input);
        return "www.nytimes.com".equals(url.getHost()) && url.getPath() != null &&
            url.getPath().matches("^/crosswords/game/(daily|mini)/[0-9]{4}/[0-9]{2}/[0-9]{2}/?$");
    }
    private String label(String key, String fallback) { return labels.optString(key, fallback); }

    @Override public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        initialUrl = getIntent().getStringExtra("url");
        if (!isPuzzle(initialUrl)) { finish(); return; }
        try { labels = new JSONObject(getIntent().getStringExtra("labels")); } catch (Exception ignored) { }
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(0xffffffff);
        ViewCompat.setOnApplyWindowInsetsListener(root, (view, insets) -> {
            androidx.core.graphics.Insets bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.ime());
            view.setPadding(bars.left, bars.top, bars.right, bars.bottom);
            return insets;
        });
        LinearLayout toolbar = new LinearLayout(this);
        Button close = new Button(this); close.setText(label("close", "Close")); close.setOnClickListener(v -> finish());
        Button selected = new Button(this); selected.setText(label("selected", "Selected puzzle")); selected.setOnClickListener(v -> browser.loadUrl(initialUrl));
        toolbar.addView(close); toolbar.addView(selected);
        root.addView(toolbar);
        TextView origin = new TextView(this); origin.setText("NYT · nytimes.com"); origin.setPadding(16, 4, 16, 4); root.addView(origin);
        status = new TextView(this); status.setPadding(16, 8, 16, 8);
        status.setText(label("hint", "Sign in on NYT, open the selected puzzle, then tap Import.")); root.addView(status);
        browser = new WebView(this);
        WebSettings settings = browser.getSettings();
        settings.setJavaScriptEnabled(true); settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false); settings.setAllowContentAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        CookieManager.getInstance().setAcceptThirdPartyCookies(browser, false);
        browser.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                if (request.isForMainFrame() && !allowed(request.getUrl().toString())) {
                    status.setText(label("external", "Use NYT email sign-in here. This importer only opens NYT pages.")); return true;
                }
                return false;
            }
            @Override public void onPageStarted(WebView view, String url, Bitmap icon) {
                generation++; importButton.setEnabled(false);
            }
            @Override public void onPageFinished(WebView view, String url) {
                CookieManager.getInstance().flush();
                importButton.setEnabled(isPuzzle(url));
                status.setText(label("hint", "Sign in on NYT, open the selected puzzle, then tap Import."));
            }
            @Override public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame()) showError("NETWORK");
            }
        });
        root.addView(browser, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1));
        importButton = new Button(this); importButton.setText(label("import", "Import this puzzle"));
        importButton.setEnabled(false); importButton.setOnClickListener(v -> importPuzzle()); root.addView(importButton);
        setContentView(root);
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override public void handleOnBackPressed() {
                if (browser.canGoBack()) browser.goBack(); else finish();
            }
        });
        if (savedInstanceState == null || browser.restoreState(savedInstanceState) == null) browser.loadUrl(initialUrl);
    }

    private void showError(String code) {
        importButton.setEnabled(isPuzzle(browser.getUrl()));
        status.setText(label(code, label("FORMAT", "This puzzle could not be imported.")));
    }
    private void importPuzzle() {
        if (!isPuzzle(browser.getUrl())) { showError("PAGE"); return; }
        String script;
        try (InputStream stream = getAssets().open("public/native/nyt-import.js")) {
            ByteArrayOutputStream bytes = new ByteArrayOutputStream();
            byte[] buffer = new byte[4096]; int count;
            while ((count = stream.read(buffer)) != -1) bytes.write(buffer, 0, count);
            script = new String(bytes.toByteArray(), StandardCharsets.UTF_8);
        } catch (Exception error) { showError("FORMAT"); return; }
        int attempt = ++generation;
        String key = "__clashImport_" + UUID.randomUUID().toString().replace("-", "");
        importButton.setEnabled(false); status.setText(label("working", "Importing puzzle…"));
        // evaluateJavascript does not await promises. Poll a random per-attempt slot;
        // navigation invalidates the attempt, and no native object is exposed to NYT.
        browser.evaluateJavascript("window['" + key + "']=null;(" + script + ")().then(function(result){window['" + key + "']=result;});", ignored -> poll(key, attempt, 0));
    }
    private void poll(String key, int attempt, int count) {
        if (isFinishing() || generation != attempt) return;
        if (count >= 80) { generation++; showError("NETWORK"); return; }
        browser.evaluateJavascript("window['" + key + "']", value -> {
            if (isFinishing() || generation != attempt) return;
            if (value == null || value.equals("null")) {
                handler.postDelayed(() -> poll(key, attempt, count + 1), 250); return;
            }
            browser.evaluateJavascript("delete window['" + key + "']", null);
            try {
                Object decoded = new JSONTokener(value).nextValue();
                if (!(decoded instanceof String) || ((String) decoded).length() > 500000) throw new Exception();
                String json = (String) decoded;
                JSONObject object = new JSONObject(json);
                if (!object.optString("status").equals("ok")) { showError(object.optString("code", "FORMAT")); return; }
                CookieManager.getInstance().flush();
                setResult(RESULT_OK, new Intent().putExtra("result", json)); finish();
            } catch (Exception error) { showError("FORMAT"); }
        });
    }
    @Override protected void onSaveInstanceState(Bundle state) { browser.saveState(state); super.onSaveInstanceState(state); }
    @Override protected void onPause() { if (browser != null) browser.onPause(); CookieManager.getInstance().flush(); super.onPause(); }
    @Override protected void onResume() { super.onResume(); if (browser != null) browser.onResume(); }
    @Override protected void onDestroy() {
        generation++; handler.removeCallbacksAndMessages(null);
        if (browser != null) { browser.stopLoading(); browser.destroy(); }
        super.onDestroy();
    }
}
