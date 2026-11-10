package com.expensetracker.app;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.os.Build;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;

/**
 * The pop-up that appears after a payment: "Add ₹250 to Swiggy?", with an Add button. It is a notification on a high-importance
 * channel, which Android shows as a banner over whatever is on screen. Add keeps the payment for the app to save when it is next
 * opened; touching the pop-up opens the app on the add form with the payment filled in; swiping it away forgets it.
 */
final class PaymentNotifier {
    static final String CHANNEL = "payment_suggestions";
    static final String ACTION_ADD = "com.expensetracker.app.PAYMENT_ADD";
    static final String ACTION_DISMISS = "com.expensetracker.app.PAYMENT_DISMISS";
    static final String EXTRA_ID = "payment_id";

    /** A pop-up that nobody answered goes away by itself after this long. */
    private static final long TIMEOUT_MS = 15 * 60 * 1000L;
    private static final int BLUE = Color.rgb(0x3B, 0x86, 0xE8);

    private PaymentNotifier() {}

    private static void ensureChannel(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        if (manager.getNotificationChannel(CHANNEL) != null) return;
        NotificationChannel channel = new NotificationChannel(CHANNEL, context.getString(R.string.payment_channel_name), NotificationManager.IMPORTANCE_HIGH);
        channel.setDescription(context.getString(R.string.payment_channel_description));
        manager.createNotificationChannel(channel);
    }

    /** "Add ₹250 to Swiggy?", or "Add ₹500 received from Ravi?". */
    static String title(PaymentParser.Parsed payment) {
        String amount = PaymentParser.formatRupees(payment.amountMinor);
        boolean named = !payment.merchant.isEmpty();
        if (payment.income) return named ? "Add " + amount + " received from " + payment.merchant + "?" : "Add " + amount + " received?";
        return named ? "Add " + amount + " to " + payment.merchant + "?" : "Add " + amount + " payment?";
    }

    /** Offers the payment. Does nothing when the phone is not letting this app show notifications. */
    static void suggest(Context context, int id, PaymentParser.Parsed payment, String appName) {
        NotificationManagerCompat manager = NotificationManagerCompat.from(context);
        if (!manager.areNotificationsEnabled()) return;
        ensureChannel(context);

        Intent open = new Intent(context, MainActivity.class).setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP).putExtra(EXTRA_ID, id);
        PendingIntent tap = PendingIntent.getActivity(context, id * 3, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        Intent add = new Intent(context, PaymentActionReceiver.class).setAction(ACTION_ADD).putExtra(EXTRA_ID, id);
        PendingIntent addIntent = PendingIntent.getBroadcast(context, id * 3 + 1, add, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        Intent dismiss = new Intent(context, PaymentActionReceiver.class).setAction(ACTION_DISMISS).putExtra(EXTRA_ID, id);
        PendingIntent dismissIntent = PendingIntent.getBroadcast(context, id * 3 + 2, dismiss, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);

        String from = appName == null || appName.isEmpty() ? "a payment" : appName;
        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, CHANNEL)
            .setSmallIcon(R.drawable.ic_stat_notify)
            .setColor(BLUE)
            .setContentTitle(title(payment))
            .setContentText("From " + from + ". Touch to check it first.")
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_STATUS)
            .setAutoCancel(true)
            .setTimeoutAfter(TIMEOUT_MS)
            .setContentIntent(tap)
            .setDeleteIntent(dismissIntent)
            .addAction(0, "Add", addIntent);
        try {
            manager.notify(id, builder.build());
        } catch (SecurityException ignored) {
            // The notification permission was taken away between the check and now.
        }
    }

    /** Replaces the pop-up with a short note that the payment is kept, which goes away by itself. */
    static void saved(Context context, int id, PaymentParser.Parsed payment) {
        NotificationManagerCompat manager = NotificationManagerCompat.from(context);
        if (!manager.areNotificationsEnabled()) return;
        String amount = PaymentParser.formatRupees(payment.amountMinor);
        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, CHANNEL)
            .setSmallIcon(R.drawable.ic_stat_notify)
            .setColor(BLUE)
            .setContentTitle("Saved " + amount + (payment.merchant.isEmpty() ? "" : " · " + payment.merchant))
            .setContentText("It shows in the app when you next open it.")
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setOnlyAlertOnce(true)
            .setAutoCancel(true)
            .setTimeoutAfter(6000);
        try {
            manager.notify(id, builder.build());
        } catch (SecurityException ignored) {
            // As above.
        }
    }

    /** The pop-up was touched and the app opened: mark the payment to be shown on the add form, and take the pop-up down. */
    static void handleLaunch(Context context, Intent intent) {
        if (intent == null || !intent.hasExtra(EXTRA_ID)) return;
        int id = intent.getIntExtra(EXTRA_ID, -1);
        intent.removeExtra(EXTRA_ID); // so that coming back to the app later does not do it again
        if (id < 0) return;
        PaymentStore.setState(context, id, PaymentStore.EDIT);
        NotificationManagerCompat.from(context).cancel(id);
    }
}
