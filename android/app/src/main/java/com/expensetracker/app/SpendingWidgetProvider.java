package com.expensetracker.app;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.view.View;
import android.widget.RemoteViews;

/**
 * The Spending widget on the home screen: what has been spent this month, where the month is heading and the next payment
 * that leaves on its own. The words are worked out by the app (the same ones the Windows widget shows) and left here by
 * WidgetBridgePlugin, so this only has to lay them out. It changes when the app is opened and says when that was.
 */
public class SpendingWidgetProvider extends AppWidgetProvider {
    static final String PREFS = "expense_widget";
    /** The fields of the snapshot, as the app writes them (src/widget/data.ts). */
    static final String[] KEYS = {"title", "spent", "spentLabel", "headline", "detail", "perDay", "next", "tone", "updated"};

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        for (int id : ids) manager.updateAppWidget(id, build(context));
    }

    /** Redraws every Spending widget on the home screen from what the app last left. */
    static void refreshAll(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        int[] ids = manager.getAppWidgetIds(new ComponentName(context, SpendingWidgetProvider.class));
        for (int id : ids) manager.updateAppWidget(id, build(context));
    }

    private static RemoteViews build(Context context) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_spending);
        boolean has = !prefs.getString("spent", "").isEmpty();

        if (has) {
            views.setTextViewText(R.id.widget_title, prefs.getString("title", ""));
            views.setTextViewText(R.id.widget_label, prefs.getString("spentLabel", ""));
            views.setTextViewText(R.id.widget_spent, prefs.getString("spent", ""));
            views.setTextViewText(R.id.widget_headline, prefs.getString("headline", ""));
            views.setTextColor(R.id.widget_headline, context.getColor(toneColor(prefs.getString("tone", ""))));
            show(views, R.id.widget_detail, prefs.getString("detail", ""));
            show(views, R.id.widget_per_day, prefs.getString("perDay", ""));
            show(views, R.id.widget_next, prefs.getString("next", ""));
            show(views, R.id.widget_updated, prefs.getString("updated", ""));
            views.setViewVisibility(R.id.widget_label, View.VISIBLE);
            views.setViewVisibility(R.id.widget_spent, View.VISIBLE);
        } else {
            // Nothing left yet: the app has not been opened since the widget was added.
            views.setTextViewText(R.id.widget_title, context.getString(R.string.app_name));
            views.setTextViewText(R.id.widget_headline, context.getString(R.string.widget_empty));
            views.setTextColor(R.id.widget_headline, context.getColor(R.color.widget_text));
            views.setViewVisibility(R.id.widget_label, View.GONE);
            views.setViewVisibility(R.id.widget_spent, View.GONE);
            views.setViewVisibility(R.id.widget_detail, View.GONE);
            views.setViewVisibility(R.id.widget_per_day, View.GONE);
            views.setViewVisibility(R.id.widget_next, View.GONE);
            views.setViewVisibility(R.id.widget_updated, View.GONE);
        }

        // Touching the widget opens the app.
        Intent open = context.getPackageManager().getLaunchIntentForPackage(context.getPackageName());
        if (open != null) {
            PendingIntent tap = PendingIntent.getActivity(context, 0, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
            views.setOnClickPendingIntent(R.id.widget_root, tap);
        }
        return views;
    }

    private static void show(RemoteViews views, int id, String text) {
        views.setTextViewText(id, text);
        views.setViewVisibility(id, text.isEmpty() ? View.GONE : View.VISIBLE);
    }

    /** The app's tones are Adaptive Cards colours: Good, Warning, Attention, and Default for the rest. */
    private static int toneColor(String tone) {
        switch (tone) {
            case "Good":
                return R.color.widget_good;
            case "Warning":
                return R.color.widget_warning;
            case "Attention":
                return R.color.widget_attention;
            default:
                return R.color.widget_text;
        }
    }
}
