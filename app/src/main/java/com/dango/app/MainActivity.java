package com.dango.app;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.view.KeyEvent;
import android.view.View;
import android.webkit.ConsoleMessage;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.util.Log;
import com.dango.BreakController;

/** 摸鱼团子 1.6 Android 入口：WebView 承载 assets/index.htm，照片导入与系统亮度能力经 DangoNative 桥接。 */
public class MainActivity extends Activity {
    private WebView web;
    private BreakController controller;
    private ValueCallback<Uri[]> fileCallback;
    private com.dango.StorageAccess storage;
    private boolean backDown;
    private String pickerMode = "album";
    private static final int PICK_PHOTO = 4105;
    private static final String HOME = "file:///android_asset/index.htm";

    @SuppressLint({"SetJavaScriptEnabled", "JavascriptInterface"})
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().getDecorView().setBackgroundColor(Color.rgb(255, 250, 244));
        getWindow().setStatusBarColor(Color.rgb(255, 250, 244));
        getWindow().setNavigationBarColor(Color.rgb(255, 250, 244));
        getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR);
        web = new WebView(this);
        web.setBackgroundColor(Color.rgb(255, 250, 244));
        WebSettings settings = web.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setAllowFileAccessFromFileURLs(true);
        settings.setAllowUniversalAccessFromFileURLs(false);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        settings.setMediaPlaybackRequiresUserGesture(true);
        controller = new BreakController(this, web);
        storage = new com.dango.StorageAccess(this);
        web.addJavascriptInterface(new DangoBridge(), "DangoNative");
        web.setWebViewClient(new WebViewClient() {
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                if (url.startsWith("mailto:")) {
                    try { startActivity(new Intent(Intent.ACTION_SENDTO, Uri.parse(url))); }
                    catch (ActivityNotFoundException e) { android.widget.Toast.makeText(MainActivity.this, "未找到邮件应用，联系邮箱：3199912548@qq.com", android.widget.Toast.LENGTH_LONG).show(); }
                    return true;
                }
                return !url.startsWith(HOME);
            }
            public void onPageFinished(WebView view, String url) {
                Log.i("Dango", "Home page loaded: " + url);
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            public boolean onConsoleMessage(ConsoleMessage message) {
                Log.i("DangoJS", message.message() + " @" + message.lineNumber());
                return true;
            }
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if ("album".equals(pickerMode) && !controller.hasFullAlbumAccess()) {
                    callback.onReceiveValue(null);
                    if (web != null) web.evaluateJavascript("window.DangoApp && DangoApp.albumAccessRequired()", null);
                    return true;
                }
                if ("file".equals(pickerMode) && !storage.granted()) {
                    callback.onReceiveValue(null);
                    if (web != null) web.evaluateJavascript("window.DangoApp && DangoApp.storageAccessRequired()", null);
                    return true;
                }
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = callback;
                if ("album".equals(pickerMode)) beginAlbumPick(); else beginFileManagerPick();
                return true;
            }
        });
        setContentView(web);
        web.loadUrl(HOME);
    }
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        if (Intent.ACTION_MAIN.equals(intent.getAction()) && web != null) {
            if (controller != null) controller.end();
            web.evaluateJavascript("if(window.DangoApp && DangoApp.isRunning()){DangoApp.finish(false)};window.DangoDeveloperWelcome && DangoDeveloperWelcome.newLaunch()", null);
        }
    }
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == PICK_PHOTO && fileCallback != null) {
            boolean allowed = !"album".equals(pickerMode) || controller.hasFullAlbumAccess();
            Uri[] result = resultCode == RESULT_OK && allowed && data != null && data.getData() != null ? new Uri[]{data.getData()} : null;
            fileCallback.onReceiveValue(result);
            fileCallback = null;
        }
    }
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == com.dango.AlbumAccess.REQUEST_CODE) controller.onAlbumPermissionResult();
        if (requestCode == com.dango.StorageAccess.REQUEST_CODE) storage.onPermissionResult();
        if (requestCode == com.dango.AlbumAccess.REQUEST_CODE || requestCode == com.dango.StorageAccess.REQUEST_CODE) {
            if (web != null) web.evaluateJavascript("window.DangoApp && DangoApp.permissionsChanged()", null);
        }
    }
    private void beginAlbumPick() {
        Intent pick = new Intent(Intent.ACTION_PICK, android.provider.MediaStore.Images.Media.EXTERNAL_CONTENT_URI);
        pick.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        try { startActivityForResult(pick, PICK_PHOTO); return; } catch (ActivityNotFoundException ignored) {}
        Intent any = new Intent(Intent.ACTION_GET_CONTENT);
        any.addCategory(Intent.CATEGORY_OPENABLE);
        any.setType("image/*");
        any.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        try { startActivityForResult(any, PICK_PHOTO); } catch (ActivityNotFoundException e) { failPick(); }
    }
    private void beginFileManagerPick() {
        Intent pick = new Intent(Intent.ACTION_GET_CONTENT);
        pick.addCategory(Intent.CATEGORY_OPENABLE);
        pick.setType("*/*");
        pick.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        try { startActivityForResult(Intent.createChooser(pick, "\u7528\u6587\u4ef6\u7ba1\u7406\u5668\u9009\u62e9\u7167\u7247"), PICK_PHOTO); }
        catch (ActivityNotFoundException e) { failPick(); }
    }
    private void failPick() {
        if (fileCallback != null) { fileCallback.onReceiveValue(null); fileCallback = null; }
    }
    private void handleBack() {
        web.evaluateJavascript("window.DangoApp ? String(DangoApp.nativeBack()) : 'false'", new ValueCallback<String>() {
            public void onReceiveValue(String result) {
                if (!"\"true\"".equals(result) && !"true".equals(result)) finish();
            }
        });
    }
    public boolean onKeyDown(int keyCode, KeyEvent event) {
        if (keyCode == KeyEvent.KEYCODE_BACK) {
            if (event.getRepeatCount() == 0 && !backDown) { backDown = true; handleBack(); }
            return true;
        }
        return super.onKeyDown(keyCode, event);
    }
    public boolean onKeyUp(int keyCode, KeyEvent event) {
        if (keyCode == KeyEvent.KEYCODE_BACK) { backDown = false; return true; }
        return super.onKeyUp(keyCode, event);
    }
    public void onBackPressed() { if (!backDown) handleBack(); }
    protected void onPause() {
        if (controller != null) controller.pause();
        if (web != null) web.evaluateJavascript("window.DangoApp && DangoApp.nativePaused()", null);
        super.onPause();
    }
    protected void onResume() {
        super.onResume();
        if (controller != null) controller.resume();
        if (web != null) web.evaluateJavascript("window.DangoApp && DangoApp.nativeResumed()", null);
    }
    protected void onDestroy() {
        if (controller != null) controller.end();
        if (fileCallback != null) { fileCallback.onReceiveValue(null); fileCallback = null; }
        if (web != null) { web.removeJavascriptInterface("DangoNative"); web.destroy(); web = null; }
        super.onDestroy();
    }
    public class DangoBridge {
        @JavascriptInterface public boolean dangoReady() { return true; }
        @JavascriptInterface public String appVersion() { try { return getPackageManager().getPackageInfo(getPackageName(), 0).versionName; } catch (Exception e) { return ""; } }
        @JavascriptInterface public boolean canChangeBrightness() { return controller.canChangeBrightness(); }
        @JavascriptInterface public String permissionInfo() { return controller.permissionInfo(); }
        @JavascriptInterface public boolean hasPhotoPicker() { return controller.hasPhotoPicker(); }
        @JavascriptInterface public boolean hasFullAlbumAccess() { return controller.hasFullAlbumAccess(); }
        @JavascriptInterface public String albumAccess() { return controller.albumAccess(); }
        @JavascriptInterface public boolean requestAlbumAccess() { return controller.requestAlbumAccess(); }
        @JavascriptInterface public boolean openAlbumSettings() { return controller.openAlbumSettings(); }
        @JavascriptInterface public boolean storageGranted() { return storage.granted(); }
        @JavascriptInterface public String storageAccess() { return storage.access(); }
        @JavascriptInterface public boolean requestStorageAccess() { return storage.requestAccess(); }
        @JavascriptInterface public boolean hasFileManagerPicker() { return storage.hasFileManagerPicker(); }
        @JavascriptInterface public void setPickerMode(String mode) { pickerMode = "file".equals(mode) ? "file" : "album"; }
        @JavascriptInterface public boolean requestBrightnessAccess() { return controller.requestBrightnessAccess(); }
        @JavascriptInterface public boolean hasProximity() { return controller.hasProximity(); }
        @JavascriptInterface public boolean sensorActive() { return controller.sensorActive(); }
        @JavascriptInterface public boolean hasLight() { return controller.hasLight(); }
        @JavascriptInterface public boolean brightnessState() { return controller.brightnessState(); }
        @JavascriptInterface public String detectionInfo() { return controller.detectionInfo(); }
        @JavascriptInterface public boolean setDetectionOptions(boolean light, boolean proximity, int sensitivity, int delay, float distance) { return controller.setDetectionOptions(light, proximity, sensitivity, delay, distance); }
        @JavascriptInterface public String screenInfo() { return controller.screenInfo(); }
        @JavascriptInterface public void prunePhotos(String ids) { controller.prunePhotos(ids); }
        @JavascriptInterface public boolean beginBreak(boolean keep) { return controller.begin(keep); }
        @JavascriptInterface public boolean setDim(boolean enabled) { return controller.dim(enabled); }
        @JavascriptInterface public boolean toggleBrightness() { return controller.toggleBrightness(); }
        @JavascriptInterface public void pauseBreak() { controller.pause(); }
        @JavascriptInterface public void resumeBreak() { controller.resume(); }
        @JavascriptInterface public void endBreak() { controller.end(); }
        @JavascriptInterface public void setKeepAwake(boolean keep) { controller.keepAwake(keep); }
        @JavascriptInterface public void dangoHaptic() { controller.haptic(); }
        @JavascriptInterface public boolean savePhoto(String id, String data) { return controller.savePhoto(id, data); }
        @JavascriptInterface public String loadPhoto(String id) { return controller.loadPhoto(id); }
        @JavascriptInterface public void deletePhoto(String id) { controller.deletePhoto(id); }
    }
}
