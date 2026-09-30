package com.crosswordclash.app;

import android.app.Activity;
import android.app.Instrumentation;
import android.content.Intent;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.WebView;
import android.webkit.WebSettings;
import android.widget.Button;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import org.junit.Test;
import org.junit.runner.RunWith;
import java.io.InputStream;
import static org.junit.Assert.*;

@RunWith(AndroidJUnit4.class)
public class NytImporterInstrumentedTest {
    private static final String PUZZLE = "https://www.nytimes.com/crosswords/game/daily/2026/09/10";

    @Test public void navigationIsRestrictedToHttpsNytAndDatedPuzzles() {
        assertTrue(NytImportActivity.isPuzzle(PUZZLE));
        assertTrue(NytImportActivity.allowed("https://myaccount.nytimes.com/auth/login"));
        assertFalse(NytImportActivity.isPuzzle("https://www.nytimes.com/crosswords/game/daily"));
        assertFalse(NytImportActivity.allowed("https://nytimes.com.evil.test"));
        assertFalse(NytImportActivity.allowed("https://evilnytimes.com"));
        assertFalse(NytImportActivity.allowed("http://www.nytimes.com"));
        assertFalse(NytImportActivity.allowed("https://user:secret@www.nytimes.com"));
        assertFalse(NytImportActivity.allowed("file:///private"));
        assertFalse(NytImportActivity.allowed("https://www.nytimes.com:8443"));
    }

    @Test public void packagedExtractorAndSeparateBrowserAreAvailable() throws Exception {
        Instrumentation instrumentation = InstrumentationRegistry.getInstrumentation();
        try (InputStream asset = instrumentation.getTargetContext().getAssets().open("public/native/nyt-import.js")) {
            assertTrue(asset.available() > 100);
        }
        Intent intent = new Intent(instrumentation.getTargetContext(), NytImportActivity.class);
        intent.putExtra("url", PUZZLE).putExtra("labels", "{}").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        Activity activity = instrumentation.startActivitySync(intent);
        try {
            instrumentation.runOnMainSync(() -> {
                ViewGroup root = activity.findViewById(android.R.id.content);
                WebView webView = findBrowser(root);
                assertNotNull(webView);
                assertTrue(webView.getSettings().getJavaScriptEnabled());
                assertTrue(webView.getSettings().getDomStorageEnabled());
                assertFalse(webView.getSettings().getAllowFileAccess());
                assertFalse(webView.getSettings().getAllowContentAccess());
                assertEquals(WebSettings.MIXED_CONTENT_NEVER_ALLOW, webView.getSettings().getMixedContentMode());
                assertTrue(hasButton(root, "Import this puzzle"));
                assertTrue(hasButton(root, "Close"));
            });
        } finally { instrumentation.runOnMainSync(activity::finish); }
    }

    private WebView findBrowser(View view) {
        if (view instanceof WebView) return (WebView) view;
        if (view instanceof ViewGroup) for (int i = 0; i < ((ViewGroup) view).getChildCount(); i++) {
            WebView found = findBrowser(((ViewGroup) view).getChildAt(i)); if (found != null) return found;
        }
        return null;
    }
    private boolean hasButton(View view, String title) {
        if (view instanceof Button && ((Button) view).getText().toString().equals(title)) return true;
        if (view instanceof ViewGroup) for (int i = 0; i < ((ViewGroup) view).getChildCount(); i++) {
            if (hasButton(((ViewGroup) view).getChildAt(i), title)) return true;
        }
        return false;
    }
}
