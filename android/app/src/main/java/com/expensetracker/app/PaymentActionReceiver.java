package com.expensetracker.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import org.json.JSONObject;

/** The buttons on the payment pop-up: Add keeps the payment for the app to save, and swiping the pop-up away forgets it. */
public class PaymentActionReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        int id = intent.getIntExtra(PaymentNotifier.EXTRA_ID, -1);
        if (id < 0 || intent.getAction() == null) return;
        if (PaymentNotifier.ACTION_ADD.equals(intent.getAction())) {
            PaymentStore.setState(context, id, PaymentStore.ADD);
            PaymentParser.Parsed payment = describe(context, id);
            if (payment != null) PaymentNotifier.saved(context, id, payment);
        } else if (PaymentNotifier.ACTION_DISMISS.equals(intent.getAction())) {
            PaymentStore.remove(context, id);
        }
    }

    /** What the payment was, for the "Saved" note: read back from what was kept. */
    private static PaymentParser.Parsed describe(Context context, int id) {
        org.json.JSONArray queue = PaymentStore.peek(context);
        for (int i = 0; i < queue.length(); i++) {
            JSONObject item = queue.optJSONObject(i);
            if (item != null && item.optInt("id") == id) {
                return new PaymentParser.Parsed(item.optLong("amountMinor"), item.optString("merchant"), item.optBoolean("income"));
            }
        }
        return null;
    }
}
