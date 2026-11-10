package com.expensetracker.app;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.util.Log;
import android.view.View;
import android.widget.RemoteViews;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * The Spending widget on the home screen. Three pages take turns, each arriving with a rise and a fade: what has been spent this
 * month and where it is heading; the month's days as a half circle of bars, as the Overview draws them; and the next payment that
 * leaves on its own with what can be spent a day. The words and figures are worked out by the app (src/widget/data.ts and
 * spendingArc.ts) and left here as JSON by WidgetBridgePlugin, so this only lays them out. It changes when the app is opened and says
 * when that was. Touching it opens the app.
 */
public class SpendingWidgetProvider extends AppWidgetProvider {
    static final String PREFS = "expense_widget";
    /** The snapshot as the app writes it, as JSON text. */
    static final String KEY = "json";

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        for (int id : ids) push(context, manager, id);
    }

    /** Redraws every Spending widget on the home screen from what the app last left. */
    static void refreshAll(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        int[] ids = manager.getAppWidgetIds(new ComponentName(context, SpendingWidgetProvider.class));
        for (int id : ids) push(context, manager, id);
    }

    /** Hands the home screen the widget's views. If the system refuses them (too much picture, say) the widget keeps what it had. */
    private static void push(Context context, AppWidgetManager manager, int id) {
        try {
            manager.updateAppWidget(id, build(context));
        } catch (RuntimeException e) {
            Log.w("SpendingWidgetProvider", "The widget could not be updated", e);
        }
    }

    private static RemoteViews build(Context context) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        JSONObject data = null;
        try {
            String json = prefs.getString(KEY, "");
            if (!json.isEmpty()) data = new JSONObject(json);
        } catch (JSONException ignored) {
            // Unreadable: shown as if the app had not left anything yet.
        }
        boolean has = data != null && !data.optString("spent", "").isEmpty();
        if (!has) {
            // Nothing left yet: the app has not been opened since the widget was added.
            RemoteViews empty = new RemoteViews(context.getPackageName(), R.layout.widget_empty);
            empty.setTextViewText(R.id.empty_title, context.getString(R.string.app_name));
            empty.setTextViewText(R.id.empty_text, context.getString(R.string.widget_empty));
            tapToOpen(context, empty, R.id.empty_root);
            return empty;
        }

        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_spending);
        {
            views.setTextViewText(R.id.widget_title, data.optString("title", ""));
            views.setTextViewText(R.id.widget_label, data.optString("spentLabel", ""));
            views.setTextViewText(R.id.widget_spent, data.optString("spent", ""));
            views.setTextViewText(R.id.widget_headline, data.optString("headline", ""));
            views.setTextColor(R.id.widget_headline, context.getColor(toneColor(data.optString("tone", ""))));
            show(views, R.id.widget_detail, data.optString("detail", ""));
            show(views, R.id.widget_updated, data.optString("updated", ""));

            // The second page: the month's days as bars, with the figure in the middle.
            JSONObject arc = data.optJSONObject("arc");
            if (arc != null) {
                views.setImageViewBitmap(R.id.widget_arc, WidgetArt.arc(arc.optJSONArray("ratios"), arc.isNull("todayDay") ? 0 : arc.optInt("todayDay", 0)));
                views.setTextViewText(R.id.widget_arc_big, arc.optString("big", ""));
                views.setTextViewText(R.id.widget_arc_small, arc.optString("small", ""));
                views.setTextColor(R.id.widget_arc_small, context.getColor(toneColor(arc.optString("tone", ""))));
            } else {
                views.setImageViewBitmap(R.id.widget_arc, WidgetArt.arc(null, 0));
                views.setTextViewText(R.id.widget_arc_big, data.optString("spent", ""));
                views.setTextViewText(R.id.widget_arc_small, "");
            }
            views.setTextViewText(R.id.widget_arc_caption, context.getString(R.string.widget_arc_caption));

            // The third page: what is coming, and what can be spent a day.
            String next = data.optString("next", "");
            String perDay = data.optString("perDay", "");
            views.setTextViewText(R.id.widget_ahead_label, context.getString(R.string.widget_ahead_label));
            views.setTextViewText(R.id.widget_next, next.isEmpty() && perDay.isEmpty() ? context.getString(R.string.widget_ahead_none) : next.isEmpty() ? perDay : next);
            show(views, R.id.widget_per_day, next.isEmpty() ? "" : perDay);
        }

        tapToOpen(context, views, R.id.widget_root);
        return views;
    }

    /** Touching the widget opens the app. */
    private static void tapToOpen(Context context, RemoteViews views, int id) {
        Intent open = context.getPackageManager().getLaunchIntentForPackage(context.getPackageName());
        if (open == null) return;
        PendingIntent tap = PendingIntent.getActivity(context, 0, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        views.setOnClickPendingIntent(id, tap);
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
                return R.color.widget_text_secondary;
        }
    }
}
