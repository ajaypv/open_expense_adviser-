package com.expensetracker.app;

import android.content.Context;
import android.content.SharedPreferences;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * What the payment pop-ups need to remember, in the app's private storage: which apps to listen to, the payments waiting to be
 * added (the web app collects them when it is opened), and the last few notifications from a payment app that could not be read,
 * so that the wording can be taught. Nothing here leaves the phone.
 */
final class PaymentStore {
    private static final String PREFS = "expense_payments";
    private static final Object LOCK = new Object();

    /** A payment shown in a pop-up, not yet added or dismissed. */
    static final String SUGGESTED = "suggested";
    /** The Add button was pressed: add it when the app is next opened. */
    static final String ADD = "add";
    /** The pop-up was tapped: open the add form with it filled in. */
    static final String EDIT = "edit";

    /** The same amount twice within this long is one payment seen by two apps (the payment app and the bank's message). */
    private static final long SAME_PAYMENT_MS = 3 * 60 * 1000L;
    private static final long KEEP_MS = 24L * 60 * 60 * 1000L;
    private static final int MAX_QUEUE = 100;
    private static final int MAX_UNREAD = 5;

    private PaymentStore() {}

    private static SharedPreferences prefs(Context context) {
        return context.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    private static JSONArray read(SharedPreferences prefs, String key) {
        try {
            return new JSONArray(prefs.getString(key, "[]"));
        } catch (JSONException e) {
            return new JSONArray();
        }
    }

    // ---- which apps -------------------------------------------------------------------------------------------------

    /** `apps` is a list of { package, name, sms }. */
    static void setApps(Context context, JSONArray apps) {
        synchronized (LOCK) {
            prefs(context).edit().putString("apps", apps.toString()).apply();
        }
    }

    /** Whether the person has ever chosen apps (until then the app offers its own choice). */
    static boolean configured(Context context) {
        return prefs(context).contains("apps");
    }

    static JSONArray apps(Context context) {
        synchronized (LOCK) {
            return read(prefs(context), "apps");
        }
    }

    /** The entry for a package, or null when it is not one the person wants listened to. */
    static JSONObject app(Context context, String packageName) {
        JSONArray apps = apps(context);
        for (int i = 0; i < apps.length(); i++) {
            JSONObject app = apps.optJSONObject(i);
            if (app != null && packageName.equals(app.optString("package"))) return app;
        }
        return null;
    }

    // ---- payments waiting ---------------------------------------------------------------------------------------------

    /** Remembers a payment that is being offered. Returns its number, or -1 when it is the same payment as one just offered. */
    static int add(Context context, PaymentParser.Parsed payment, String packageName, long now) {
        synchronized (LOCK) {
            SharedPreferences prefs = prefs(context);
            JSONArray old = read(prefs, "queue");
            JSONArray queue = new JSONArray();
            try {
                for (int i = 0; i < old.length(); i++) {
                    JSONObject item = old.getJSONObject(i);
                    if (now - item.optLong("at") > KEEP_MS && SUGGESTED.equals(item.optString("state"))) continue;
                    if (item.optLong("amountMinor") == payment.amountMinor && item.optBoolean("income") == payment.income && Math.abs(now - item.optLong("at")) < SAME_PAYMENT_MS) {
                        return -1;
                    }
                    queue.put(item);
                }
                int id = prefs.getInt("nextId", 1);
                JSONObject item = new JSONObject();
                item.put("id", id);
                item.put("state", SUGGESTED);
                item.put("amountMinor", payment.amountMinor);
                item.put("merchant", payment.merchant);
                item.put("income", payment.income);
                item.put("package", packageName);
                item.put("at", now);
                queue.put(item);
                while (queue.length() > MAX_QUEUE) queue.remove(0);
                prefs.edit().putString("queue", queue.toString()).putInt("nextId", id == Integer.MAX_VALUE ? 1 : id + 1).apply();
                return id;
            } catch (JSONException e) {
                return -1;
            }
        }
    }

    /** Everything waiting, left where it is. */
    static JSONArray peek(Context context) {
        synchronized (LOCK) {
            return read(prefs(context), "queue");
        }
    }

    /** Changes what is to happen to a payment, if it is still waiting. */
    static void setState(Context context, int id, String state) {
        synchronized (LOCK) {
            SharedPreferences prefs = prefs(context);
            JSONArray queue = read(prefs, "queue");
            try {
                for (int i = 0; i < queue.length(); i++) {
                    JSONObject item = queue.getJSONObject(i);
                    if (item.optInt("id") == id) {
                        item.put("state", state);
                        prefs.edit().putString("queue", queue.toString()).apply();
                        return;
                    }
                }
            } catch (JSONException ignored) {
                // Leave it as it was.
            }
        }
    }

    /** Forgets a payment (it was dismissed). */
    static void remove(Context context, int id) {
        synchronized (LOCK) {
            SharedPreferences prefs = prefs(context);
            JSONArray old = read(prefs, "queue");
            JSONArray queue = new JSONArray();
            for (int i = 0; i < old.length(); i++) {
                JSONObject item = old.optJSONObject(i);
                if (item != null && item.optInt("id") != id) queue.put(item);
            }
            prefs.edit().putString("queue", queue.toString()).apply();
        }
    }

    /** The payments to add or open, which are then forgotten here; the ones still only offered stay. */
    static JSONArray take(Context context) {
        synchronized (LOCK) {
            SharedPreferences prefs = prefs(context);
            JSONArray old = read(prefs, "queue");
            JSONArray queue = new JSONArray();
            JSONArray taken = new JSONArray();
            for (int i = 0; i < old.length(); i++) {
                JSONObject item = old.optJSONObject(i);
                if (item == null) continue;
                String state = item.optString("state");
                if (ADD.equals(state) || EDIT.equals(state)) taken.put(item);
                else queue.put(item);
            }
            if (taken.length() > 0) prefs.edit().putString("queue", queue.toString()).apply();
            return taken;
        }
    }

    // ---- notifications that could not be read ------------------------------------------------------------------------

    static void addUnread(Context context, String packageName, String text, long now) {
        synchronized (LOCK) {
            SharedPreferences prefs = prefs(context);
            JSONArray old = read(prefs, "unread");
            JSONArray list = new JSONArray();
            try {
                JSONObject item = new JSONObject();
                item.put("package", packageName);
                item.put("text", text.length() > 300 ? text.substring(0, 300) : text);
                item.put("at", now);
                list.put(item);
                for (int i = 0; i < old.length() && list.length() < MAX_UNREAD; i++) list.put(old.get(i));
                prefs.edit().putString("unread", list.toString()).apply();
            } catch (JSONException ignored) {
                // Not worth failing a notification over.
            }
        }
    }

    static JSONArray unread(Context context) {
        synchronized (LOCK) {
            return read(prefs(context), "unread");
        }
    }

    static void clearUnread(Context context) {
        synchronized (LOCK) {
            prefs(context).edit().remove("unread").apply();
        }
    }
}
