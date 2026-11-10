package com.expensetracker.app;

import android.content.Intent;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Plugins written in this app are registered before the bridge starts.
        registerPlugin(WidgetBridgePlugin.class);
        registerPlugin(ContactPickerPlugin.class);
        registerPlugin(PaymentBridgePlugin.class);
        super.onCreate(savedInstanceState);
        // Opened by touching a payment pop-up: the payment is to be shown on the add form.
        PaymentNotifier.handleLaunch(this, getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        PaymentNotifier.handleLaunch(this, intent);
    }
}
