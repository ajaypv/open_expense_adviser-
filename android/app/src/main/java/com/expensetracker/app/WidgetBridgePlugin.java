package com.expensetracker.app;

import android.content.Context;
import com.getcapacitor.JSObject;
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
        // The whole snapshot is kept as the JSON the app sent: its words and figures, and the month's day bars.
        context.getSharedPreferences(SpendingWidgetProvider.PREFS, Context.MODE_PRIVATE).edit().putString(SpendingWidgetProvider.KEY, call.getData().toString()).apply();
        SpendingWidgetProvider.refreshAll(context);
        call.resolve();
    }

    /** The Timeline widget's days, as the JSON text the app worked out (src/widget/timelineData.ts). */
    @PluginMethod
    public void setTimeline(PluginCall call) {
        Context context = getContext();
        context.getSharedPreferences(TimelineWidgetProvider.PREFS, Context.MODE_PRIVATE).edit().putString(TimelineWidgetProvider.KEY, call.getString("json", "")).apply();
        TimelineWidgetProvider.refreshAll(context);
        call.resolve();
    }

    /** The page of the app a widget was touched to open, once; empty when the app was opened some other way. */
    @PluginMethod
    public void takeLaunchView(PluginCall call) {
        JSObject result = new JSObject();
        String view = MainActivity.launchView;
        MainActivity.launchView = null;
        result.put("view", view == null ? "" : view);
        call.resolve(result);
    }
}
