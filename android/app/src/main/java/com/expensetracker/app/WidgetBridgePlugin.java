package com.expensetracker.app;

import android.content.Context;
import android.content.SharedPreferences;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * How the web app hands the widget its figures. The app works out the words (src/widget/data.ts) and sends them here; they are
 * kept in the app's private storage, and every Spending widget on the home screen is redrawn from them. Nothing leaves the phone.
 */
@CapacitorPlugin(name = "WidgetBridge")
public class WidgetBridgePlugin extends Plugin {
    @PluginMethod
    public void setSnapshot(PluginCall call) {
        Context context = getContext();
        SharedPreferences.Editor edit = context.getSharedPreferences(SpendingWidgetProvider.PREFS, Context.MODE_PRIVATE).edit();
        for (String key : SpendingWidgetProvider.KEYS) edit.putString(key, call.getString(key, ""));
        edit.apply();
        SpendingWidgetProvider.refreshAll(context);
        call.resolve();
    }
}
