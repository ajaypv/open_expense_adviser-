package com.expensetracker.app;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.provider.ContactsContract;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Opens the phone's own contact picker and hands back only the person chosen there: a name and a number. The app is never given
 * the contact list and asks for no contacts permission, because the phone gives access to the one contact picked and no more.
 */
@CapacitorPlugin(name = "ContactPicker")
public class ContactPickerPlugin extends Plugin {
    @PluginMethod
    public void pick(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_PICK, ContactsContract.CommonDataKinds.Phone.CONTENT_URI);
        try {
            startActivityForResult(call, intent, "pickResult");
        } catch (ActivityNotFoundException e) {
            call.reject("No contacts app to choose from");
        }
    }

    @ActivityCallback
    private void pickResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        JSArray contacts = new JSArray();
        Intent data = result.getData();
        Uri uri = data == null ? null : data.getData();
        if (result.getResultCode() == Activity.RESULT_OK && uri != null) {
            String[] columns = {ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME, ContactsContract.CommonDataKinds.Phone.NUMBER};
            try (Cursor cursor = getContext().getContentResolver().query(uri, columns, null, null, null)) {
                if (cursor != null && cursor.moveToFirst()) {
                    JSObject contact = new JSObject();
                    contact.put("name", cursor.getString(0));
                    contact.put("phone", cursor.getString(1));
                    contacts.put(contact);
                }
            }
        }
        JSObject out = new JSObject();
        out.put("contacts", contacts);
        call.resolve(out);
    }
}
