package com.expensetracker.app;

import android.app.Notification;
import android.os.Bundle;
import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;
import org.json.JSONObject;

/**
 * Reads the notifications of the payment apps the person chose in Settings (and, if they chose it, the messages app, for bank
 * messages), and for each finished payment offers to add it. It looks only at notifications from those apps, keeps nothing from
 * the others, and sends nothing anywhere: the payment is kept on the phone and the pop-up is made on the phone. The person grants
 * this by hand under Notification access, and can take it away there at any time.
 */
public class PaymentNotificationListener extends NotificationListenerService {
    @Override
    public void onNotificationPosted(StatusBarNotification sbn) {
        try {
            handle(sbn);
        } catch (RuntimeException ignored) {
            // A notification this does not understand must never take the listener down.
        }
    }

    private void handle(StatusBarNotification sbn) {
        String packageName = sbn.getPackageName();
        if (packageName == null || packageName.equals(getPackageName())) return;
        JSONObject app = PaymentStore.app(this, packageName);
        if (app == null) return;

        Notification notification = sbn.getNotification();
        if (notification == null || (notification.flags & Notification.FLAG_GROUP_SUMMARY) != 0) return;
        Bundle extras = notification.extras;
        if (extras == null) return;

        CharSequence title = extras.getCharSequence(Notification.EXTRA_TITLE);
        CharSequence big = extras.getCharSequence(Notification.EXTRA_BIG_TEXT);
        CharSequence text = big != null ? big : extras.getCharSequence(Notification.EXTRA_TEXT);
        String titleText = title == null ? "" : title.toString();
        String bodyText = text == null ? "" : text.toString();

        boolean messages = app.optBoolean("sms");
        PaymentParser.Parsed payment = PaymentParser.parse(titleText, bodyText, messages);
        long now = System.currentTimeMillis();
        if (payment == null) {
            // A payment app said something with an amount in it that was not understood: keep it, to be shown in Settings, so
            // that it can be taught. Never for the messages app, which carries the person's private messages.
            String all = (titleText + " " + bodyText).trim();
            if (!messages && PaymentParser.hasAmount(all) && !PaymentParser.rejected(all)) PaymentStore.addUnread(this, packageName, all, now);
            return;
        }

        int id = PaymentStore.add(this, payment, packageName, now);
        if (id < 0) return;
        PaymentNotifier.suggest(this, id, payment, app.optString("name"));
    }
}
