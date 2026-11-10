package com.expensetracker.app;

import android.content.Intent;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    /** Put on the intent of a widget that opens the app on one of its pages. */
    static final String EXTRA_VIEW = "widget_view";
    /** The page the app was last opened on from a widget, until the web side has taken it. */
    static volatile String launchView;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Plugins written in this app are registered before the bridge starts.
        registerPlugin(WidgetBridgePlugin.class);
        registerPlugin(ContactPickerPlugin.class);
        registerPlugin(PaymentBridgePlugin.class);
        super.onCreate(savedInstanceState);
        // Opened by touching a payment pop-up: the payment is to be shown on the add form.
        PaymentNotifier.handleLaunch(this, getIntent());
        rememberView(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        PaymentNotifier.handleLaunch(this, intent);
        rememberView(intent);
    }

    /** Opened by touching the Timeline widget: the web side reads this and shows the page. Taken off the intent, so it is not read twice. */
    private static void rememberView(Intent intent) {
        if (intent == null) return;
        String view = intent.getStringExtra(EXTRA_VIEW);
        if (view == null) return;
        launchView = view;
        intent.removeExtra(EXTRA_VIEW);
    }
}
