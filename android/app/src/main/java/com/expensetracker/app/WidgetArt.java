package com.expensetracker.app;

import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.RectF;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * What the widgets draw themselves, as pictures: the month's days as a half circle of bars, a day's bar, and a row of columns. The
 * widgets are drawn by the home screen from a layout, which cannot size a bar by what it holds, so those bars are made here and
 * handed over as images. The colours are mid tones, so they read on a light home screen and a dark one alike, and the faint parts are
 * the same colour made transparent rather than a fixed grey.
 */
final class WidgetArt {
    private WidgetArt() {}

    /**
     * The pictures are drawn large and made smaller, because the system refuses a widget update that carries too much picture (about one
     * and a half screens of pixels on a phone, and a good deal less where the screen is small). Together a widget's pictures are well under
     * a megabyte at these sizes, and still sharp where they are shown.
     */
    private static final float ARC_SCALE = 0.75f;
    private static final float COLUMNS_SCALE = 0.6f;
    private static final float BAR_SCALE = 0.667f;

    /** The colours of the Overview's budget meter: green for a quiet day, amber at a day's share, red beyond it. */
    private static final int GREEN = 0xFF25A25A;
    private static final int AMBER = 0xFFE0A100;
    private static final int RED = 0xFFE0463C;
    /** The part of a bar not filled, and a day still to come. */
    private static final int FAINT = 0x33808890;

    /** How the Overview colours a day: green to amber as its share of the budget is used, amber to red beyond it. */
    static int dayColor(double ratio) {
        double r = Math.max(0, ratio);
        if (r <= 1) return blend(GREEN, AMBER, r);
        return blend(AMBER, RED, Math.min((r - 1) / 0.5, 1));
    }

    static int blend(int from, int to, double share) {
        float t = (float) Math.max(0, Math.min(1, share));
        return Color.argb(
                255,
                Math.round(Color.red(from) + (Color.red(to) - Color.red(from)) * t),
                Math.round(Color.green(from) + (Color.green(to) - Color.green(from)) * t),
                Math.round(Color.blue(from) + (Color.blue(to) - Color.blue(from)) * t));
    }

    /** How far along the ring's depth a bar reaches: short for a quiet day, the whole depth at a day's share and beyond. */
    static double reach(double ratio) {
        return 0.4 + 0.6 * Math.max(0, Math.min(1, ratio));
    }

    /** The angle of bar `i` of `count` on the half circle: the first on the left (pi), the last on the right (0). */
    static double angle(int i, int count) {
        return count > 1 ? Math.PI - (i * Math.PI) / (count - 1) : Math.PI / 2;
    }

    /**
     * The month as a half circle of bars, one for each day, the first on the left. Days gone by are coloured and sized by how big they
     * were (the numbers are 1 for a day's share of the budget); days still to come are faint and short; a dot marks today.
     */
    static Bitmap arc(JSONArray ratios, int todayDay) {
        // Drawn on a 720 by 400 canvas and made smaller: a widget update may carry only so much picture (see SCALE).
        final int w = 720;
        final int h = 400;
        final float cx = w / 2f;
        final float cy = h - 24f;
        final float inner = 232f;
        final float outer = 340f;
        Bitmap bitmap = Bitmap.createBitmap(Math.round(w * ARC_SCALE), Math.round(h * ARC_SCALE), Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(bitmap);
        canvas.scale(ARC_SCALE, ARC_SCALE);
        int count = ratios == null ? 0 : ratios.length();
        if (count == 0) return bitmap;

        Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
        paint.setStyle(Paint.Style.STROKE);
        paint.setStrokeCap(Paint.Cap.ROUND);
        paint.setStrokeWidth(Math.min(22f, (float) (Math.PI * ((inner + outer) / 2) / count) * 0.58f));
        int elapsed = todayDay > 0 ? Math.min(todayDay, count) : count;
        for (int i = 0; i < count; i++) {
            double a = angle(i, count);
            boolean past = i < elapsed;
            double ratio = past ? ratios.optDouble(i, 0) : 0;
            float to = inner + (float) (reach(ratio) * (outer - inner));
            paint.setColor(past ? dayColor(ratio) : FAINT);
            canvas.drawLine(
                    cx + (float) (inner * Math.cos(a)), cy - (float) (inner * Math.sin(a)),
                    cx + (float) (to * Math.cos(a)), cy - (float) (to * Math.sin(a)),
                    paint);
        }
        if (todayDay > 0 && count > 1) {
            double a = angle(Math.min(todayDay, count) - 1, count);
            float r = outer + 16f;
            Paint dot = new Paint(Paint.ANTI_ALIAS_FLAG);
            dot.setColor(0xFFB0B6BF);
            canvas.drawCircle(cx + (float) (r * Math.cos(a)), cy - (float) (r * Math.sin(a)), 6f, dot);
        }
        return bitmap;
    }

    /**
     * A bar for one day: a faint track the whole width, and over it the day's share of the biggest day, in the day's colour, rounded at
     * the ends and never thinner than a dot, so a small day still shows.
     */
    static Bitmap bar(double share, int color) {
        final int w = 600;
        final int h = 24;
        Bitmap bitmap = Bitmap.createBitmap(Math.round(w * BAR_SCALE), Math.round(h * BAR_SCALE), Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(bitmap);
        canvas.scale(BAR_SCALE, BAR_SCALE);
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

    /**
     * The days as columns, the oldest on the left, each as tall as the day against the biggest and in the day's colour, on a faint
     * base line, with a dot over today's. The columns sit in equal slots across the picture, which is how the labels under it are
     * spaced too, so each label stays under its column.
     */
    static Bitmap columns(JSONArray columns) {
        // About the shape of the place it is shown (a little wider than tall), so the picture is stretched as little as possible.
        final int w = 720;
        final int h = 560;
        Bitmap bitmap = Bitmap.createBitmap(Math.round(w * COLUMNS_SCALE), Math.round(h * COLUMNS_SCALE), Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(bitmap);
        canvas.scale(COLUMNS_SCALE, COLUMNS_SCALE);
        int count = columns == null ? 0 : columns.length();
        if (count == 0) return bitmap;

        Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
        final float base = h - 14f;
        final float top = 44f;
        paint.setColor(FAINT);
        canvas.drawRect(0, base, w, base + 4f, paint);

        float slot = (float) w / count;
        float width = Math.min(slot * 0.5f, 96f);
        // Rounded at a fixed size rather than all the way round, so a short column is a short bar and not a bead.
        float radius = Math.min(width / 2f, 30f);
        for (int i = 0; i < count; i++) {
            JSONObject column = columns.optJSONObject(i);
            if (column == null) continue;
            double share = Math.max(0, Math.min(1, column.optDouble("share", 0)));
            int color;
            try {
                color = Color.parseColor(column.optString("color", ""));
            } catch (IllegalArgumentException e) {
                color = 0xFF889099;
            }
            float height = Math.max(width * 0.55f, (float) (share * (base - top)));
            float left = i * slot + (slot - width) / 2f;
            RectF rect = new RectF(left, base - height, left + width, base);
            paint.setColor(share > 0 ? (color | 0xFF000000) : ((color & 0x00FFFFFF) | 0x55000000));
            canvas.drawRoundRect(rect, radius, radius, paint);
            if (column.optBoolean("today", false)) {
                paint.setColor(0xFFB0B6BF);
                canvas.drawCircle(left + width / 2f, Math.max(14f, base - height - 18f), 7f, paint);
            }
        }
        return bitmap;
    }
}
