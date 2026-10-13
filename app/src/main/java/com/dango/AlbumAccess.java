package com.dango;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Looper;
import android.provider.Settings;
import android.util.Log;
import java.util.concurrent.FutureTask;
import java.util.concurrent.TimeUnit;
import org.json.JSONObject;

/** 照片全访问授权；Android 14+ 的选定照片权限不算全部照片访问。 */
public final class AlbumAccess {
    public static final int REQUEST_CODE = 4106;
    private static final String READ_IMAGES = "android.permission.READ_MEDIA_IMAGES";
    private static final String READ_SELECTED = "android.permission.READ_MEDIA_VISUAL_USER_SELECTED";
    private static final String READ_STORAGE = "android.permission.READ_EXTERNAL_STORAGE";
    private final Activity activity;
    private volatile boolean requesting;

    public AlbumAccess(Activity activity) { this.activity = activity; }
    private static String requiredPermission() {
        return Build.VERSION.SDK_INT >= 33 ? READ_IMAGES : READ_STORAGE;
    }
    /** 以实际运行时权限判断，不使用文件选择器的 URI 授权冒充全访问。 */
    public static String access(Activity activity) {
        if (Build.VERSION.SDK_INT < 23) return "full";
        if (activity.checkSelfPermission(requiredPermission()) == PackageManager.PERMISSION_GRANTED) return "full";
        if (Build.VERSION.SDK_INT >= 34 && activity.checkSelfPermission(READ_SELECTED) == PackageManager.PERMISSION_GRANTED) return "partial";
        return "denied";
    }
    public static boolean hasFullAccess(Activity activity) { return "full".equals(access(activity)); }
    public static boolean needsSettings(Activity activity) {
        String access = access(activity);
        if ("full".equals(access)) return false;
        if ("partial".equals(access)) return true;
        SharedPreferences prefs = activity.getSharedPreferences("dango_album_permission", Context.MODE_PRIVATE);
        return prefs.getBoolean("asked", false) && !activity.shouldShowRequestPermissionRationale(requiredPermission());
    }
    public static void addPermissionInfo(Activity activity, JSONObject info) {
        try {
            String value = access(activity);
            info.put("albumAccess", value);
            info.put("albumFullGranted", "full".equals(value));
            info.put("albumNeedsSettings", needsSettings(activity));
            info.put("albumPermissionName", requiredPermission());
        } catch (Exception e) { Log.w("Dango", "Album permission query failed", e); }
    }
    public boolean requestPending() { return requesting; }
    public void onPermissionResult() { requesting = false; }
    public boolean requestFullAccess() {
        if (hasFullAccess(activity) || requesting) return true;
        return onUi(new Runnable() { public void run() {
            if (hasFullAccess(activity) || requesting) return;
            // 部分照片或不再弹出的拒绝状态，进入应用设置让用户选择全部照片。
            if (needsSettings(activity)) { openSettingsNow(); return; }
            requesting = true;
            activity.getSharedPreferences("dango_album_permission", Context.MODE_PRIVATE).edit().putBoolean("asked", true).apply();
            try {
                String[] permissions = Build.VERSION.SDK_INT >= 34
                    ? new String[]{READ_IMAGES, READ_SELECTED}
                    : new String[]{requiredPermission()};
                activity.requestPermissions(permissions, REQUEST_CODE);
            } catch (RuntimeException e) { requesting = false; throw e; }
        }});
    }
    public boolean openSettings() { return onUi(new Runnable() { public void run() { openSettingsNow(); }}); }
    private void openSettingsNow() {
        requesting = false;
        Intent intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + activity.getPackageName()));
        try { activity.startActivity(intent); }
        catch (android.content.ActivityNotFoundException e) { activity.startActivity(new Intent(Settings.ACTION_SETTINGS)); }
    }
    private boolean onUi(final Runnable action) {
        if (Looper.myLooper() == Looper.getMainLooper()) {
            try { action.run(); return true; } catch (RuntimeException e) { Log.e("Dango", "Album authorization failed", e); return false; }
        }
        FutureTask<Boolean> task = new FutureTask<Boolean>(new java.util.concurrent.Callable<Boolean>() {
            public Boolean call() { action.run(); return true; }
        });
        activity.runOnUiThread(task);
        try { return task.get(3, TimeUnit.SECONDS).booleanValue(); }
        catch (Exception e) { task.cancel(false); requesting = false; Log.e("Dango", "Album authorization failed", e); return false; }
    }
}
