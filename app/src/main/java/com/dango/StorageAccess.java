package com.dango;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.os.Looper;
import android.provider.Settings;
import android.util.Log;
import java.lang.reflect.Method;
import java.util.concurrent.FutureTask;
import java.util.concurrent.TimeUnit;
import org.json.JSONObject;

/** 所有文件访问授权；不使用单文件夹授权流程。 */
public final class StorageAccess {
    public static final int REQUEST_CODE = 4108;
    private static final String READ_STORAGE = "android.permission.READ_EXTERNAL_STORAGE";
    private final Activity activity;
    private volatile boolean requesting;
    public StorageAccess(Activity activity) { this.activity = activity; }
    public String access() {
        if (Build.VERSION.SDK_INT >= 30) {
            try {
                Method method = Environment.class.getMethod("isExternalStorageManager");
                return Boolean.TRUE.equals(method.invoke(null)) ? "full" : "denied";
            } catch (Exception e) { return "denied"; }
        }
        if (Build.VERSION.SDK_INT < 23 || activity.checkSelfPermission(READ_STORAGE) == PackageManager.PERMISSION_GRANTED) return "legacy";
        return "denied";
    }
    public boolean granted() { String value = access(); return "full".equals(value) || "legacy".equals(value); }
    public boolean requestPending() { return requesting; }
    public void onPermissionResult() { requesting = false; }
    public boolean hasFileManagerPicker() {
        Intent pick = new Intent(Intent.ACTION_GET_CONTENT);
        pick.addCategory(Intent.CATEGORY_OPENABLE); pick.setType("image/*");
        return pick.resolveActivity(activity.getPackageManager()) != null;
    }
    public void addPermissionInfo(JSONObject info) {
        try {
            info.put("storageAccess", access()).put("storageGranted", granted())
                .put("storageRequestPending", requesting).put("allFilesSupported", Build.VERSION.SDK_INT >= 30)
                .put("fileManagerPickerAvailable", hasFileManagerPicker()).put("androidApi", Build.VERSION.SDK_INT);
        } catch (Exception e) { Log.w("Dango", "Storage permission query failed", e); }
    }
    /** 只打开所有文件访问入口，不申请相册或亮度权限。 */
    public boolean requestAccess() {
        if (granted() || requesting) return true;
        return onUi(new Runnable() { public void run() {
            if (granted() || requesting) return;
            if (Build.VERSION.SDK_INT >= 30) {
                Uri uri = Uri.parse("package:" + activity.getPackageName());
                if (open(new Intent("android.settings.MANAGE_APP_ALL_FILES_ACCESS_PERMISSION", uri))) return;
                if (open(new Intent("android.settings.MANAGE_ALL_FILES_ACCESS_PERMISSION"))) return;
                if (open(new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, uri))) return;
                throw new IllegalStateException("Cannot open all-files permission settings");
            }
            boolean asked = activity.getSharedPreferences("dango_storage_permission", Context.MODE_PRIVATE).getBoolean("asked", false);
            if (asked && !activity.shouldShowRequestPermissionRationale(READ_STORAGE)) {
                if (!open(new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + activity.getPackageName()))))
                    throw new IllegalStateException("Cannot open storage permission settings");
                return;
            }
            requesting = true;
            activity.getSharedPreferences("dango_storage_permission", Context.MODE_PRIVATE).edit().putBoolean("asked", true).apply();
            try { activity.requestPermissions(new String[]{READ_STORAGE}, REQUEST_CODE); }
            catch (RuntimeException e) { requesting = false; throw e; }
        }});
    }
    private boolean open(Intent intent) {
        try { activity.startActivity(intent); return true; }
        catch (android.content.ActivityNotFoundException e) { return false; }
        catch (SecurityException e) { return false; }
    }
    private boolean onUi(final Runnable action) {
        if (Looper.myLooper() == Looper.getMainLooper()) {
            try { action.run(); return true; } catch (RuntimeException e) { Log.e("Dango", "Storage authorization failed", e); return false; }
        }
        FutureTask<Boolean> task = new FutureTask<Boolean>(new java.util.concurrent.Callable<Boolean>() {
            public Boolean call() { action.run(); return true; }
        });
        activity.runOnUiThread(task);
        try { return task.get(3, TimeUnit.SECONDS).booleanValue(); }
        catch (Exception e) { task.cancel(false); requesting = false; Log.e("Dango", "Storage authorization failed", e); return false; }
    }
}
