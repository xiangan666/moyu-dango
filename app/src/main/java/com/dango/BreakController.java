package com.dango;

import android.app.Activity;
import android.app.Application;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Point;
import android.hardware.Sensor;
import android.hardware.SensorEvent;
import android.hardware.SensorEventListener;
import android.hardware.SensorManager;
import android.net.Uri;
import android.os.Bundle;
import android.os.Looper;
import android.os.Handler;
import android.os.SystemClock;
import android.provider.Settings;
import android.util.Log;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.WebView;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.util.concurrent.FutureTask;
import java.util.concurrent.TimeUnit;
import org.json.JSONArray;

/** 光线与距离只调暗，双击切换共享亮度状态，以及原图私有存储。 */
public final class BreakController implements Application.ActivityLifecycleCallbacks, SensorEventListener {
    private final Activity activity;
    private final WebView web;
    private final SharedPreferences recovery;
    private final SensorManager sensors;
    private final Sensor proximity;
    private final Sensor light;
    private final AlbumAccess album;
    private final CoverDetector cover = new CoverDetector();
    private final Handler sensorHandler = new Handler(Looper.getMainLooper());
    private volatile boolean lightListening, proximityListening;
    private boolean lightEnabled = true;
    private int lightSensitivity = 1, coverDelay = 350;
    private float proximityDistance = 5f;
    private final Runnable sensorPoll = new Runnable() { public void run() {
        if (!active || paused || !sensorListening || destroyed) return;
        if (cover.poll(SystemClock.elapsedRealtime()) && !dark) {
            String source = cover.source();
            if (dim(true)) notifyJs("nativeCover", "true,\"" + source + "\"");
        }
        sensorHandler.postDelayed(this, 80);
    }};
    private volatile boolean active, paused, dark, sensorListening;
    private boolean proximityEnabled = true;
    private boolean systemChanged;
    private int originalSystemBrightness;
    private int originalBrightnessMode;
    private float originalWindowBrightness = -1f;
    private int originalFlags, originalUi;
    private boolean awake;
    private boolean destroyed;
    private static final int MANAGED_FLAGS = WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON | WindowManager.LayoutParams.FLAG_FULLSCREEN;
    private static final long MAX_PHOTO_BYTES = 64L * 1024 * 1024;

    public BreakController(Activity activity, WebView web) {
        this.activity = activity;
        this.web = web;
        recovery = activity.getSharedPreferences("dango_brightness_recovery", Context.MODE_PRIVATE);
        sensors = (SensorManager) activity.getSystemService(Context.SENSOR_SERVICE);
        proximity = sensors == null ? null : sensors.getDefaultSensor(Sensor.TYPE_PROXIMITY);
        light = sensors == null ? null : sensors.getDefaultSensor(Sensor.TYPE_LIGHT);
        album = new AlbumAccess(activity);
        recoverPending();
        activity.getApplication().registerActivityLifecycleCallbacks(this);
    }
    private boolean onUi(final Runnable action) {
        if (destroyed) return false;
        if (Looper.myLooper() == Looper.getMainLooper()) {
            try { action.run(); return true; } catch (Throwable e) { Log.e("Dango", "Operation failed", e); return false; }
        }
        FutureTask<Boolean> task = new FutureTask<Boolean>(new java.util.concurrent.Callable<Boolean>() {
            public Boolean call() { if (destroyed) return false; action.run(); return true; }
        });
        activity.runOnUiThread(task);
        try { return task.get(3, TimeUnit.SECONDS).booleanValue(); }
        catch (Exception e) { task.cancel(false); Log.e("Dango", "Operation failed", e); return false; }
    }
    public boolean canChangeBrightness() { return Settings.System.canWrite(activity); }
    public boolean hasPhotoPicker() {
        Intent pick = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        pick.addCategory(Intent.CATEGORY_OPENABLE);
        pick.setType("image/*");
        return pick.resolveActivity(activity.getPackageManager()) != null;
    }
    /** 光线和距离无需 BODY_SENSORS；照片导入要求全部照片访问授权。 */
    public String permissionInfo() {
        try {
            org.json.JSONObject info = new org.json.JSONObject();
            info.put("nativeReady", true).put("brightnessGranted", canChangeBrightness())
                .put("proximityAvailable", hasProximity()).put("lightAvailable", hasLight())
                .put("sensorListening", sensorActive()).put("lightListening", lightListening)
                .put("proximityListening", proximityListening).put("photoPickerAvailable", hasPhotoPicker());
            AlbumAccess.addPermissionInfo(activity, info);
            info.put("albumRequestPending", album.requestPending());
            new StorageAccess(activity).addPermissionInfo(info);
            return info.toString();
        } catch (Exception e) { return "{\"nativeReady\":true,\"brightnessGranted\":" + canChangeBrightness() + "}"; }
    }
    public boolean hasFullAlbumAccess() { return AlbumAccess.hasFullAccess(activity); }
    public String albumAccess() { return AlbumAccess.access(activity); }
    public boolean requestAlbumAccess() { return AlbumAccess.hasFullAccess(activity) || album.requestFullAccess(); }
    public boolean openAlbumSettings() { return album.openSettings(); }
    public void onAlbumPermissionResult() { album.onPermissionResult(); }
    private boolean openSettings(Intent intent) {
        try { activity.startActivity(intent); return true; }
        catch (android.content.ActivityNotFoundException e) { return false; }
        catch (SecurityException e) { return false; }
    }
    /** 返回的是打开设置页的结果，不代表已经获得授权。 */
    public boolean requestBrightnessAccess() {
        if (canChangeBrightness()) return true;
        return onUi(new Runnable() { public void run() {
            Uri packageUri = Uri.parse("package:" + activity.getPackageName());
            if (openSettings(new Intent(Settings.ACTION_MANAGE_WRITE_SETTINGS, packageUri))) return;
            if (openSettings(new Intent(Settings.ACTION_MANAGE_WRITE_SETTINGS))) return;
            if (openSettings(new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, packageUri))) return;
            if (!openSettings(new Intent(Settings.ACTION_SETTINGS))) throw new IllegalStateException("Cannot open settings");
        }});
    }
    private void writeSetting(String key, int value) {
        if (!Settings.System.putInt(activity.getContentResolver(), key, value)) throw new IllegalStateException("Cannot write " + key);
    }
    private void recoverPending() {
        if (!recovery.getBoolean("pending", false) || !canChangeBrightness()) return;
        try {
            writeSetting(Settings.System.SCREEN_BRIGHTNESS, recovery.getInt("brightness", 128));
            writeSetting(Settings.System.SCREEN_BRIGHTNESS_MODE, recovery.getInt("mode", Settings.System.SCREEN_BRIGHTNESS_MODE_MANUAL));
            recovery.edit().remove("pending").commit();
            Log.i("Dango", "Recovered saved system brightness and automatic-brightness mode");
        } catch (Exception e) { Log.e("Dango", "Brightness recovery remains pending", e); }
    }
    public boolean begin(final boolean keep) {
        if (!canChangeBrightness()) return false;
        return onUi(new Runnable() { public void run() {
            if (active) return;
            recoverPending();
            if (recovery.getBoolean("pending", false)) throw new IllegalStateException("Restore previous brightness first");
            try {
                originalSystemBrightness = Settings.System.getInt(activity.getContentResolver(), Settings.System.SCREEN_BRIGHTNESS);
                originalBrightnessMode = Settings.System.getInt(activity.getContentResolver(), Settings.System.SCREEN_BRIGHTNESS_MODE);
            } catch (Settings.SettingNotFoundException e) { throw new IllegalStateException("Cannot read original brightness", e); }
            WindowManager.LayoutParams params = activity.getWindow().getAttributes();
            originalWindowBrightness = params.screenBrightness;
            originalFlags = params.flags;
            originalUi = activity.getWindow().getDecorView().getSystemUiVisibility();
            awake = keep; active = true; paused = false; dark = false; systemChanged = false;
            applySession(); startSensor();
            Log.i("Dango", "Break started; system brightness=" + originalSystemBrightness + "; mode=" + originalBrightnessMode);
        }});
    }
    private void applySession() {
        Window window = activity.getWindow();
        WindowManager.LayoutParams params = window.getAttributes();
        params.screenBrightness = -1f; // 窗口跟随真实系统亮度。
        window.setAttributes(params);
        window.addFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN);
        if (awake) window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        else window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        window.getDecorView().setSystemUiVisibility(5894);
    }
    public boolean dim(final boolean enabled) {
        if (!active || paused || !canChangeBrightness()) return false;
        return onUi(new Runnable() { public void run() {
            if (!active || paused) throw new IllegalStateException("Break is not active");
            if (enabled == dark) return;
            if (enabled) {
                if (!recovery.edit().putInt("brightness", originalSystemBrightness).putInt("mode", originalBrightnessMode).putBoolean("pending", true).commit())
                    throw new IllegalStateException("Cannot save brightness recovery state");
                systemChanged = true;
                try {
                    // 临时关闭自动亮度，避免环境光把用户要求的 0 自动拉高。
                    writeSetting(Settings.System.SCREEN_BRIGHTNESS_MODE, Settings.System.SCREEN_BRIGHTNESS_MODE_MANUAL);
                    writeSetting(Settings.System.SCREEN_BRIGHTNESS, 0);
                    dark = true;
                } catch (RuntimeException e) { restoreSystem(); throw e; }
            } else restoreSystem();
            cover.restored(SystemClock.elapsedRealtime());
            notifyDim();
            Log.i("Dango", enabled ? "System brightness set to 0" : "System brightness and mode restored");
        }});
    }
    /** 传感器与双击在主线程共用 dark 状态，避免页面状态滞后造成反向误判。 */
    public boolean toggleBrightness() {
        if (!active || paused || !canChangeBrightness()) return false;
        return onUi(new Runnable() { public void run() {
            if (!active || paused || !canChangeBrightness()) throw new IllegalStateException("Break is not active or permission missing");
            // 在同一主线程操作中读取状态并切换，传感器回调不能插在判断与写入之间。
            if (!dim(!dark)) throw new IllegalStateException("Brightness toggle failed");
        }});
    }
    private void restoreSystem() {
        if (!systemChanged) { dark = false; return; }
        writeSetting(Settings.System.SCREEN_BRIGHTNESS, originalSystemBrightness);
        writeSetting(Settings.System.SCREEN_BRIGHTNESS_MODE, originalBrightnessMode);
        dark = false; systemChanged = false;
        recovery.edit().remove("pending").commit();
    }
    private void restoreWindow() {
        Window window = activity.getWindow();
        WindowManager.LayoutParams params = window.getAttributes();
        params.screenBrightness = originalWindowBrightness;
        params.flags = (params.flags & ~MANAGED_FLAGS) | (originalFlags & MANAGED_FLAGS);
        window.setAttributes(params);
        window.getDecorView().setSystemUiVisibility(originalUi);
    }
    public void pause() { onUi(new Runnable() { public void run() {
        if (active && !paused) {
            paused = true; stopSensor();
            try { restoreSystem(); } finally { restoreWindow(); }
        }
    }}); }
    public void resume() { onUi(new Runnable() { public void run() {
        if (active && paused && systemChanged) restoreSystem();
        recoverPending();
        if (active && paused) {
            if (recovery.getBoolean("pending", false)) throw new IllegalStateException("System brightness restoration pending");
            paused = false; dark = false; systemChanged = false; applySession(); startSensor();
        }
    }}); }
    public void end() { onUi(new Runnable() { public void run() {
        if (active) {
            stopSensor();
            try { restoreSystem(); }
            finally { restoreWindow(); active = false; paused = false; }
        }
    }}); }
    public void keepAwake(final boolean keep) { onUi(new Runnable() { public void run() {
        awake = keep;
        if (active && !paused) { if (keep) activity.getWindow().addFlags(128); else activity.getWindow().clearFlags(128); }
    }}); }
    public boolean hasProximity() { return proximity != null; }
    public boolean hasLight() { return light != null; }
    public boolean sensorActive() { return sensorListening; }
    public boolean brightnessState() { return dark; }
    public String detectionInfo() {
        return "{\"lightAvailable\":" + hasLight() + ",\"proximityAvailable\":" + hasProximity()
            + ",\"lightListening\":" + lightListening + ",\"proximityListening\":" + proximityListening
            + ",\"lux\":" + cover.lux() + ",\"baseline\":" + cover.baseline()
            + ",\"calibrating\":" + cover.calibrating(SystemClock.elapsedRealtime()) + "}";
    }
    public boolean setDetectionOptions(final boolean enableLight, final boolean enableProximity,
            final int sensitivity, final int delay, final float distance) {
        return onUi(new Runnable() { public void run() {
            lightEnabled = enableLight; proximityEnabled = enableProximity;
            lightSensitivity = Math.max(0, Math.min(2, sensitivity));
            coverDelay = Math.max(150, Math.min(1000, delay));
            proximityDistance = Math.max(0.5f, Math.min(5f, distance));
            stopSensor();
            if (active && !paused) { startSensor(); if (dark) cover.restored(SystemClock.elapsedRealtime()); }
        }});
    }
    private void startSensor() {
        cover.configure(lightEnabled, proximityEnabled, lightSensitivity, coverDelay);
        cover.reset(SystemClock.elapsedRealtime());
        if (sensors != null) {
            if (lightEnabled && light != null)
                lightListening = sensors.registerListener(this, light, SensorManager.SENSOR_DELAY_NORMAL);
            if (proximityEnabled && proximity != null)
                proximityListening = sensors.registerListener(this, proximity, SensorManager.SENSOR_DELAY_GAME);
        }
        // 未注册成功的通道不参与锁定，避免硬件失效影响另一种检测。
        cover.configure(lightListening, proximityListening, lightSensitivity, coverDelay);
        sensorListening = lightListening || proximityListening;
        sensorHandler.removeCallbacks(sensorPoll);
        if (sensorListening) sensorHandler.postDelayed(sensorPoll, 80);
    }
    private void stopSensor() {
        sensorHandler.removeCallbacks(sensorPoll);
        if (sensors != null) sensors.unregisterListener(this);
        sensorListening = false; lightListening = false; proximityListening = false;
        cover.reset(SystemClock.elapsedRealtime());
    }
    public void onSensorChanged(SensorEvent event) {
        if (!active || paused || !sensorListening || event.values.length == 0) return;
        long now = SystemClock.elapsedRealtime();
        float value = event.values[0];
        if (Float.isNaN(value) || Float.isInfinite(value) || value < 0f) return;
        if (event.sensor.getType() == Sensor.TYPE_LIGHT && lightListening) {
            cover.light(value, now);
        } else if (event.sensor.getType() == Sensor.TYPE_PROXIMITY && proximityListening) {
            float max = proximity.getMaximumRange();
            if (max > 0f) cover.proximity(value < Math.min(max, proximityDistance), now);
        }
    }
    public void onAccuracyChanged(Sensor sensor, int accuracy) {}
    public void haptic() { onUi(new Runnable() { public void run() {
        web.performHapticFeedback(android.view.HapticFeedbackConstants.VIRTUAL_KEY);
    }}); }
    public String screenInfo() {
        Point size = new Point(); activity.getWindowManager().getDefaultDisplay().getRealSize(size);
        return "{\"width\":" + size.x + ",\"height\":" + size.y + "}";
    }
    private File photoFile(String id) {
        if (id == null || !id.matches("[A-Za-z0-9_-]{1,90}")) throw new IllegalArgumentException("Invalid photo id");
        File dir = new File(activity.getFilesDir(), "dango_photos");
        if (!dir.exists() && !dir.mkdirs()) throw new IllegalStateException("Cannot create photo directory");
        return new File(dir, id + ".txt");
    }
    public boolean savePhoto(String id, String data) {
        if (data == null || !data.startsWith("data:image/") || data.indexOf(";base64,") < 0 || data.length() > MAX_PHOTO_BYTES) return false;
        try {
            File target = photoFile(id), temp = new File(target.getPath() + ".tmp");
            FileOutputStream stream = new FileOutputStream(temp);
            try { stream.write(data.getBytes("UTF-8")); stream.getFD().sync(); } finally { stream.close(); }
            if (!temp.renameTo(target)) { temp.delete(); return false; }
            return true;
        } catch (Exception e) { Log.e("Dango", "Photo save failed", e); return false; }
    }
    public String loadPhoto(String id) {
        try {
            File file = photoFile(id);
            if (!file.exists() || file.length() > MAX_PHOTO_BYTES) return null;
            FileInputStream in = new FileInputStream(file);
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            try { byte[] buffer = new byte[16384]; int count; while ((count = in.read(buffer)) != -1) out.write(buffer, 0, count); }
            finally { in.close(); }
            return new String(out.toByteArray(), "UTF-8");
        } catch (Exception e) { return null; }
    }
    public void deletePhoto(String id) { try { photoFile(id).delete(); } catch (Exception ignored) {} }
    public void prunePhotos(String ids) {
        try {
            JSONArray array = new JSONArray(ids); java.util.HashSet<String> used = new java.util.HashSet<String>();
            for (int i = 0; i < array.length(); i++) used.add(array.getString(i));
            File[] files = new File(activity.getFilesDir(), "dango_photos").listFiles();
            if (files != null) for (File file : files) { String name = file.getName(); if (name.endsWith(".txt") && !used.contains(name.substring(0, name.length() - 4))) file.delete(); }
        } catch (Exception e) { Log.w("Dango", "Photo cleanup skipped", e); }
    }
    public void onActivityPaused(Activity a) { if (a == activity) { pause(); notifyJs("nativePaused", ""); } }
    public void onActivityResumed(Activity a) { if (a == activity) { resume(); notifyJs("nativeResumed", ""); } }
    public void onActivityDestroyed(Activity a) {
        if (a == activity) { end(); stopSensor(); destroyed = true; activity.getApplication().unregisterActivityLifecycleCallbacks(this); }
    }
    private void notifyDim() { notifyJs("nativeBrightness", dark ? "true" : "false"); }
    private void notifyJs(final String method, final String args) { activity.runOnUiThread(new Runnable() { public void run() {
        if (!destroyed) web.evaluateJavascript("window.DangoApp && DangoApp." + method + "(" + args + ")", null);
    }}); }
    public void onActivityCreated(Activity a, Bundle state) {}
    public void onActivityStarted(Activity a) {}
    public void onActivityStopped(Activity a) {}
    public void onActivitySaveInstanceState(Activity a, Bundle state) {}
}
