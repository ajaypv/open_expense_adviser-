package com.expensetracker.app;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.util.Log;
import android.view.View;
import android.widget.RemoteViews;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * The Timeline widget on the home screen. Three pages take turns, each arriving with a rise and a fade: the last few days, newest
 * first, each a dot with its date, what was spent and a bar as long as the day against the biggest, in the Timeline's own colours;
 * the same days as a chart of columns; and a few facts about them. The words, figures and colours are worked out by the app
 * (src/widget/timelineData.ts) and left here as JSON by WidgetBridgePlugin, so this only lays them out. It changes when the app is
 * opened and says when that was. Touching it opens the app on its Timeline.
 */
public class TimelineWidgetProvider extends AppWidgetProvider {
    static final String PREFS = "expense_timeline";
    static final String KEY = "json";
    /** How many days the layout has room for (the app sends no more than this: TIMELINE_WIDGET_DAYS). */
    static final int ROWS = 6;
    static final int FACTS = 3;

    private static final int[] ROW = {R.id.tl_row_0, R.id.tl_row_1, R.id.tl_row_2, R.id.tl_row_3, R.id.tl_row_4, R.id.tl_row_5};
    private static final int[] CHIP = {R.id.tl_chip_0, R.id.tl_chip_1, R.id.tl_chip_2, R.id.tl_chip_3, R.id.tl_chip_4, R.id.tl_chip_5};
    private static final int[] DAY = {R.id.tl_day_0, R.id.tl_day_1, R.id.tl_day_2, R.id.tl_day_3, R.id.tl_day_4, R.id.tl_day_5};
    private static final int[] TEXT = {R.id.tl_text_0, R.id.tl_text_1, R.id.tl_text_2, R.id.tl_text_3, R.id.tl_text_4, R.id.tl_text_5};
    private static final int[] BAR = {R.id.tl_bar_0, R.id.tl_bar_1, R.id.tl_bar_2, R.id.tl_bar_3, R.id.tl_bar_4, R.id.tl_bar_5};
    private static final int[] AMOUNT = {R.id.tl_amount_0, R.id.tl_amount_1, R.id.tl_amount_2, R.id.tl_amount_3, R.id.tl_amount_4, R.id.tl_amount_5};
    private static final int[] COLUMN = {R.id.tl_col_0, R.id.tl_col_1, R.id.tl_col_2, R.id.tl_col_3, R.id.tl_col_4, R.id.tl_col_5};
    private static final int[] FACT_LABEL = {R.id.tl_fact_label_0, R.id.tl_fact_label_1, R.id.tl_fact_label_2};
    private static final int[] FACT_VALUE = {R.id.tl_fact_value_0, R.id.tl_fact_value_1, R.id.tl_fact_value_2};

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        for (int id : ids) push(context, manager, id);
    }

    /** Redraws every Timeline widget on the home screen from what the app last left. */
    static void refreshAll(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        int[] ids = manager.getAppWidgetIds(new ComponentName(context, TimelineWidgetProvider.class));
        for (int id : ids) push(context, manager, id);
    }

    /** Hands the home screen the widget's views. If the system refuses them (too much picture, say) the widget keeps what it had. */
    private static void push(Context context, AppWidgetManager manager, int id) {
        try {
            manager.updateAppWidget(id, build(context));
        } catch (RuntimeException e) {
            Log.w("TimelineWidgetProvider", "The widget could not be updated", e);
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
        JSONArray rows = data == null ? null : data.optJSONArray("rows");
        int shown = rows == null ? 0 : Math.min(rows.length(), ROWS);

        if (data == null || shown == 0) {
            // Nothing left yet (the app has not been opened since the widget was added), or no spending to show.
            RemoteViews empty = new RemoteViews(context.getPackageName(), R.layout.widget_empty);
            empty.setTextViewText(R.id.empty_title, context.getString(R.string.widget_timeline_label));
            empty.setTextViewText(R.id.empty_text, context.getString(data == null ? R.string.widget_empty : R.string.widget_timeline_none));
            tapToTimeline(context, empty, R.id.empty_root);
            return empty;
        }

        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_timeline);
        views.setTextViewText(R.id.tl_title, data.optString("title", ""));

        // First page: the days.
        for (int i = 0; i < ROWS; i++) {
            JSONObject row = i < shown ? rows.optJSONObject(i) : null;
            if (row == null) {
                views.setViewVisibility(ROW[i], View.GONE);
                continue;
            }
            int color = parse(row.optString("color", ""), context.getColor(R.color.widget_text_secondary));
            views.setViewVisibility(ROW[i], View.VISIBLE);
            views.setInt(CHIP[i], "setColorFilter", color);
            views.setTextViewText(DAY[i], row.optString("chip", ""));
            views.setTextViewText(TEXT[i], row.optString("text", ""));
            views.setTextViewText(AMOUNT[i], row.optString("amount", ""));
            views.setImageViewBitmap(BAR[i], WidgetArt.bar(row.optDouble("share", 0), color));
        }

        // Second page: the same days as columns, with the weekday under each.
        JSONArray chart = data == null ? null : data.optJSONArray("chart");
        int columns = chart == null ? 0 : Math.min(chart.length(), ROWS);
        views.setImageViewBitmap(R.id.tl_chart, WidgetArt.columns(chart));
        for (int i = 0; i < ROWS; i++) {
            JSONObject column = i < columns ? chart.optJSONObject(i) : null;
            if (column == null) {
                views.setViewVisibility(COLUMN[i], View.GONE);
                continue;
            }
            views.setViewVisibility(COLUMN[i], View.VISIBLE);
            views.setTextViewText(COLUMN[i], column.optString("label", ""));
        }

        // Third page: a few facts.
        JSONArray facts = data == null ? null : data.optJSONArray("facts");
        int shownFacts = facts == null ? 0 : Math.min(facts.length(), FACTS);
        for (int i = 0; i < FACTS; i++) {
            JSONObject fact = i < shownFacts ? facts.optJSONObject(i) : null;
            views.setTextViewText(FACT_LABEL[i], fact == null ? "" : fact.optString("label", ""));
            views.setTextViewText(FACT_VALUE[i], fact == null ? "" : fact.optString("value", ""));
        }

        String updated = data == null ? "" : data.optString("updated", "");
        views.setTextViewText(R.id.tl_updated, updated);
        views.setViewVisibility(R.id.tl_updated, updated.isEmpty() ? View.GONE : View.VISIBLE);

        tapToTimeline(context, views, R.id.tl_root);
        return views;
    }

    /** Touching the widget opens the app on its Timeline. The request code differs from the Spending widget's, which opens the app as it is. */
    private static void tapToTimeline(Context context, RemoteViews views, int id) {
        Intent open = new Intent(context, MainActivity.class);
        open.putExtra(MainActivity.EXTRA_VIEW, "timeline");
        PendingIntent tap = PendingIntent.getActivity(context, 1, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        views.setOnClickPendingIntent(id, tap);
    }

    private static int parse(String hex, int fallback) {
        try {
            return Color.parseColor(hex);
        } catch (IllegalArgumentException e) {
            return fallback;
        }
    }
}
