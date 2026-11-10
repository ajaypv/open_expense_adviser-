package com.expensetracker.app;

import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.provider.Settings;
import androidx.core.app.NotificationManagerCompat;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import org.json.JSONArray;
import org.json.JSONException;

/**
 * How the web app and the payment pop-ups talk: the app says which apps to listen to and reads back what is waiting to be added,
 * and opens the phone's own screens where the person gives and takes away the permission.
 */
@CapacitorPlugin(name = "PaymentBridge")
public class PaymentBridgePlugin extends Plugin {
    @PluginMethod
    public void getStatus(PluginCall call) {
        Context context = getContext();
        JSObject out = new JSObject();
        out.put("listening", NotificationManagerCompat.getEnabledListenerPackages(context).contains(context.getPackageName()));
        out.put("notifications", NotificationManagerCompat.from(context).areNotificationsEnabled());
        out.put("configured", PaymentStore.configured(context));
        try {
            out.put("apps", new JSArray(PaymentStore.apps(context).toString()));
            out.put("unread", new JSArray(PaymentStore.unread(context).toString()));
        } catch (JSONException e) {
            call.reject("Could not read the saved choices");
            return;
        }
        call.resolve(out);
    }

    /** The apps to listen to: a list of { package, name, sms }. */
    @PluginMethod
    public void setApps(PluginCall call) {
        JSArray apps = call.getArray("apps");
        if (apps == null) {
            call.reject("apps is needed");
            return;
        }
        PaymentStore.setApps(getContext(), apps);
        call.resolve();
    }

    @PluginMethod
    public void openListenerSettings(PluginCall call) {
        startSettings(call, new Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS));
    }

    /** The app's own page in Settings, where Android 13 and later let a sideloaded app's restricted settings be allowed. */
    @PluginMethod
    public void openAppSettings(PluginCall call) {
        startSettings(call, new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.fromParts("package", getContext().getPackageName(), null)));
    }

    private void startSettings(PluginCall call, Intent intent) {
        try {
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            call.resolve();
        } catch (RuntimeException e) {
            call.reject("Could not open Settings");
        }
    }

    /** The payments to add or to open on the form. They are forgotten here once handed over. */
    @PluginMethod
    public void takePending(PluginCall call) {
        JSObject out = new JSObject();
        try {
            JSONArray taken = PaymentStore.take(getContext());
            out.put("payments", new JSArray(taken.toString()));
        } catch (JSONException e) {
            call.reject("Could not read the waiting payments");
            return;
        }
        call.resolve(out);
    }

    @PluginMethod
    public void clearUnread(PluginCall call) {
        PaymentStore.clearUnread(getContext());
        call.resolve();
    }
}
