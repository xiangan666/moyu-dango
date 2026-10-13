package com.dango;

/** 光线和距离独立判断遮挡，任一满足即可调暗。解除遮挡不自动恢复。 */
public final class CoverDetector {
    private boolean lightEnabled, proximityEnabled;
    private boolean lightKnown, proximityKnown, near;
    private boolean lightBlocked, locked;
    private float lux, baseline = -1f;
    private float dropRatio = 0.20f, darkLimit = 8f;
    private int delayMs = 350;
    private long calibratedSince = -1, previousLightAt = -1;
    private long lightSince = -1, proximitySince = -1, clearSince = -1;
    private String lastSource = "none";

    public void configure(boolean light, boolean proximity, int sensitivity, int delay) {
        lightEnabled = light; proximityEnabled = proximity;
        delayMs = Math.max(150, Math.min(1000, delay));
        if (sensitivity == 0) { dropRatio = 0.10f; darkLimit = 3f; }
        else if (sensitivity == 2) { dropRatio = 0.35f; darkLimit = 15f; }
        else { dropRatio = 0.20f; darkLimit = 8f; }
    }
    public void reset(long now) {
        calibratedSince = -1; previousLightAt = -1;
        lightKnown = false; proximityKnown = false; near = false;
        baseline = -1f; lux = 0f; locked = false; lightBlocked = false;
        lightSince = -1; proximitySince = -1; clearSince = -1; lastSource = "none";
    }
    public void light(float value, long now) {
        if (!lightEnabled || Float.isNaN(value) || Float.isInfinite(value) || value < 0f) return;
        long interval = previousLightAt < 0 ? 0 : Math.max(0, now - previousLightAt);
        previousLightAt = now; lightKnown = true; lux = value;
        if (baseline < 0f) { baseline = value; calibratedSince = now; return; }
        if (now - calibratedSince < 700) { baseline = Math.max(baseline, value); return; }
        float threshold = Math.min(darkLimit, baseline * dropRatio);
        lightBlocked = baseline >= 4f && value <= threshold;
        if (lightBlocked) { if (lightSince < 0) lightSince = now; }
        else {
            lightSince = -1;
            if (!locked) {
                double alpha = value > baseline ? 0.35 : 1.0 - Math.exp(-Math.min(interval, 1000L) / 8000.0);
                baseline += (value - baseline) * (float) alpha;
            }
        }
    }
    public void proximity(boolean value, long now) {
        if (!proximityEnabled) return;
        proximityKnown = true; near = value;
        if (value) { if (proximitySince < 0) proximitySince = now; }
        else proximitySince = -1;
    }
    public boolean poll(long now) {
        // 光线感应器可能只在数值改变时回调，校准结束和确认时长由轮询补齐。
        if (lightEnabled && lightKnown && calibratedSince >= 0 && now - calibratedSince >= 700) {
            float threshold = Math.min(darkLimit, baseline * dropRatio);
            lightBlocked = baseline >= 4f && lux <= threshold;
            if (lightBlocked) { if (lightSince < 0) lightSince = now; }
            else lightSince = -1;
        }
        if (locked) {
            boolean lightClear = !lightEnabled || !lightKnown || !lightBlocked;
            boolean proximityClear = !proximityEnabled || !proximityKnown || !near;
            if (lightClear && proximityClear) {
                if (clearSince < 0) clearSince = now;
                if (now - clearSince >= 500) { locked = false; clearSince = -1; }
            } else clearSince = -1;
            return false;
        }
        boolean lightTrigger = lightEnabled && lightKnown && lightBlocked && lightSince >= 0 && now - lightSince >= delayMs;
        boolean proximityTrigger = proximityEnabled && proximityKnown && near && proximitySince >= 0 && now - proximitySince >= Math.min(delayMs, 250);
        if (!lightTrigger && !proximityTrigger) return false;
        lastSource = lightTrigger ? "light" : "proximity";
        locked = true; clearSince = -1;
        return true;
    }
    /** 双击恢复后先解除遮挡再重新启用，防止持续遮挡立刻重复调暗。 */
    public void restored(long now) { locked = true; clearSince = -1; }
    public String source() { return lastSource; }
    public float lux() { return lightKnown ? lux : -1f; }
    public float baseline() { return baseline; }
    public boolean calibrating(long now) { return lightEnabled && (!lightKnown || calibratedSince < 0 || now - calibratedSince < 700); }
}
