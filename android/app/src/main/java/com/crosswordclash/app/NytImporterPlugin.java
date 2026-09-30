package com.crosswordclash.app;

import android.app.Activity;
import android.content.Intent;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "NytImporter")
public class NytImporterPlugin extends Plugin {
    private boolean active = false;

    @PluginMethod
    public void open(PluginCall call) {
        String url = call.getString("url", "");
        if (!NytImportActivity.isPuzzle(url)) { call.reject("Choose a dated NYT crossword.", "PAGE"); return; }
        if (active) { call.reject("The importer is already open.", "BUSY"); return; }
        active = true;
        Intent intent = new Intent(getContext(), NytImportActivity.class);
        intent.putExtra("url", url);
        JSObject labels = call.getObject("labels", new JSObject());
        intent.putExtra("labels", labels.toString());
        startActivityForResult(call, intent, "importResult");
    }

    @ActivityCallback
    private void importResult(PluginCall call, ActivityResult result) {
        active = false;
        if (call == null) return;
        JSObject response = new JSObject();
        String json = result.getData() == null ? null : result.getData().getStringExtra("result");
        if (result.getResultCode() == Activity.RESULT_OK && json != null) {
            response.put("cancelled", false); response.put("result", json);
        } else { response.put("cancelled", true); }
        call.resolve(response);
    }
}
