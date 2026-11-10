package com.expensetracker.app;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.view.View;
import android.widget.RemoteViews;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * The Timeline widget on the home screen: the last few days, newest first, each a dot with its date, what was spent and a bar as long
 * as the day is against the biggest, in the Timeline's own colours. The words, figures and colours are worked out by the app
 * (src/widget/timelineData.ts) and left here as JSON by WidgetBridgePlugin, so this only lays them out. It changes when the app is
 * opened and says when that was. Touching it opens the app on its Timeline.
 */
public class TimelineWidgetProvider extends AppWidgetProvider {
    static final String PREFS = "expense_timeline";
    static final String KEY = "json";
    /** How many days the layout has room for (the app sends no more than this: TIMELINE_WIDGET_DAYS). */
    static final int ROWS = 6;

    private static final int[] ROW = {R.id.tl_row_0, R.id.tl_row_1, R.id.tl_row_2, R.id.tl_row_3, R.id.tl_row_4, R.id.tl_row_5};
    private static final int[] CHIP = {R.id.tl_chip_0, R.id.tl_chip_1, R.id.tl_chip_2, R.id.tl_chip_3, R.id.tl_chip_4, R.id.tl_chip_5};
    private static final int[] DAY = {R.id.tl_day_0, R.id.tl_day_1, R.id.tl_day_2, R.id.tl_day_3, R.id.tl_day_4, R.id.tl_day_5};
    private static final int[] TEXT = {R.id.tl_text_0, R.id.tl_text_1, R.id.tl_text_2, R.id.tl_text_3, R.id.tl_text_4, R.id.tl_text_5};
    private static final int[] BAR = {R.id.tl_bar_0, R.id.tl_bar_1, R.id.tl_bar_2, R.id.tl_bar_3, R.id.tl_bar_4, R.id.tl_bar_5};
    private static final int[] AMOUNT = {R.id.tl_amount_0, R.id.tl_amount_1, R.id.tl_amount_2, R.id.tl_amount_3, R.id.tl_amount_4, R.id.tl_amount_5};

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        for (int id : ids) manager.updateAppWidget(id, build(context));
    }

    /** Redraws every Timeline widget on the home screen from what the app last left. */
    static void refreshAll(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        int[] ids = manager.getAppWidgetIds(new ComponentName(context, TimelineWidgetProvider.class));
        for (int id : ids) manager.updateAppWidget(id, build(context));
    }

    private static RemoteViews build(Context context) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_timeline);

        JSONObject data = null;
        try {
            String json = prefs.getString(KEY, "");
            if (!json.isEmpty()) data = new JSONObject(json);
        } catch (JSONException ignored) {
            // Unreadable: shown as if the app had not left anything yet.
        }
        JSONArray rows = data == null ? null : data.optJSONArray("rows");
        int shown = rows == null ? 0 : Math.min(rows.length(), ROWS);

        if (data == null) {
            // Nothing left yet: the app has not been opened since the widget was added.
            views.setTextViewText(R.id.tl_title, context.getString(R.string.widget_timeline_label));
            empty(views, context.getString(R.string.widget_empty));
        } else if (shown == 0) {
            views.setTextViewText(R.id.tl_title, data.optString("title", context.getString(R.string.widget_timeline_label)));
            empty(views, context.getString(R.string.widget_timeline_none));
        } else {
            views.setTextViewText(R.id.tl_title, data.optString("title", ""));
            views.setViewVisibility(R.id.tl_empty, View.GONE);
        }

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
            views.setImageViewBitmap(BAR[i], bar(row.optDouble("share", 0), color));
        }

        String updated = data == null ? "" : data.optString("updated", "");
        views.setTextViewText(R.id.tl_updated, updated);
        views.setViewVisibility(R.id.tl_updated, updated.isEmpty() ? View.GONE : View.VISIBLE);

        // Touching the widget opens the app on its Timeline. The request code differs from the Spending widget's, which opens the app as it is.
        Intent open = new Intent(context, MainActivity.class);
        open.putExtra(MainActivity.EXTRA_VIEW, "timeline");
        PendingIntent tap = PendingIntent.getActivity(context, 1, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        views.setOnClickPendingIntent(R.id.tl_root, tap);
        return views;
    }

    private static void empty(RemoteViews views, String text) {
        views.setTextViewText(R.id.tl_empty, text);
        views.setViewVisibility(R.id.tl_empty, View.VISIBLE);
        views.setViewVisibility(R.id.tl_updated, View.GONE);
    }

    private static int parse(String hex, int fallback) {
        try {
            return Color.parseColor(hex);
        } catch (IllegalArgumentException e) {
            return fallback;
        }
    }

    /**
     * A bar for one day: a faint track the whole width, and over it the day's share of the biggest day, in the day's colour, rounded at
     * the ends and never thinner than a dot, so a small day still shows. The track is the colour made faint rather than a fixed grey,
     * so it reads on a light or a dark home screen alike.
     */
    static Bitmap bar(double share, int color) {
        final int w = 600;
        final int h = 24;
        Bitmap bitmap = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(bitmap);
        Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
        float r = h / 2f;
        paint.setColor((color & 0x00FFFFFF) | 0x38000000);
        canvas.drawRoundRect(0, 0, w, h, r, r, paint);
        if (share > 0) {
            float filled = Math.max(h, (float) (w * Math.min(1.0, share)));
            paint.setColor(color | 0xFF000000);
            canvas.drawRoundRect(0, 0, filled, h, r, r, paint);
        }
        return bitmap;
    }
}
