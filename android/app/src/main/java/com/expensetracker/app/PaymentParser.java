package com.expensetracker.app;

import java.math.BigDecimal;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Reads what a payment app (or a bank's message) says about a payment: whether money went out or came in, how much, and to or from
 * whom. It is written for the way UPI and bank notifications are usually worded ("Paid ₹250 to Swiggy", "Rs.250.00 debited from
 * a/c XX1234 ... to VPA swiggy@okaxis", "Received ₹500 from Ravi"), and it would rather say nothing than guess: a notification it is
 * not sure is a finished payment (failed, pending, a reminder, an offer) gives null. Plain Java, so it can be tested on a computer.
 */
final class PaymentParser {
    /** A payment found in a notification. */
    static final class Parsed {
        final long amountMinor;
        /** Who it went to, or came from; empty when the notification does not say. */
        final String merchant;
        final boolean income;

        Parsed(long amountMinor, String merchant, boolean income) {
            this.amountMinor = amountMinor;
            this.merchant = merchant;
            this.income = income;
        }
    }

    /** Nothing above this (in rupees) is a payment this app should be guessing at. */
    private static final BigDecimal MAX_RUPEES = new BigDecimal("10000000");

    private static final int FLAGS = Pattern.CASE_INSENSITIVE | Pattern.UNICODE_CASE;

    private static final Pattern AMOUNT = Pattern.compile("(?:\\u20B9|\\brs\\.?|\\binr)\\s*([0-9][0-9,]*(?:\\.[0-9]{1,2})?)", FLAGS);
    private static final Pattern AMOUNT_AFTER = Pattern.compile("([0-9][0-9,]*(?:\\.[0-9]{1,2})?)\\s*(?:\\u20B9|\\brs\\b|\\binr\\b)", FLAGS);

    /** Words that mean the notification is not a finished payment. */
    private static final Pattern REJECT = Pattern.compile(
        "\\b(?:failed|failure|declined|unsuccessful|pending|requested|requests?|collect|reminder|due|overdue|upcoming|will be|scheduled|otp|verification|"
            + "cancell?ed|reversed|insufficient|expires?|expired|offers?|up to|upto|win|earn|apply|eligible|limit|statement)\\b",
        FLAGS);

    /** Money went out, in the words notifications use. */
    private static final Pattern DEBIT = Pattern.compile("\\b(?:paid|debited|sent|spent|purchased?|withdrawn|transferred|deducted|charged)\\b", FLAGS);
    /** Money came in, including "Ravi paid you". */
    private static final Pattern CREDIT = Pattern.compile("\\b(?:received|credited|refund(?:ed)?|deposited|cashback|(?:paid|sent)\\s+(?:you|me))\\b", FLAGS);
    /** "Payment successful" and the like: money went out, said without a stronger word. */
    private static final Pattern WEAK_DEBIT = Pattern.compile("\\bpayment\\b", FLAGS);

    private static final Pattern BANK_CUE = Pattern.compile("\\ba/c\\b|\\bacct?\\b|\\baccount\\b|\\bupi\\b|\\bvpa\\b|\\bcard\\b|\\bbank\\b|\\bx{2,}\\d{3,4}\\b|\\*{2,}\\d{3,4}", FLAGS);

    private static final Pattern TO = Pattern.compile("\\b(?:to|at)\\s+(?:vpa\\s+|merchant\\s+)?(.+)", FLAGS);
    private static final Pattern FROM = Pattern.compile("\\bfrom\\s+(?:vpa\\s+)?(.+)", FLAGS);
    /** "You paid Ravi Kumar ₹500": the name sits between the verb and the amount. */
    private static final Pattern PAID_NAME = Pattern.compile("\\b(?:paid|sent)\\s+([A-Za-z][A-Za-z .'&-]{1,30}?)\\s+(?:\\u20B9|rs\\b|inr\\b)", FLAGS);
    /** "Ravi Kumar paid you ₹500": the name comes first. */
    private static final Pattern NAME_PAID_YOU = Pattern.compile("^(?:you\\s+)?([A-Za-z][A-Za-z .'&-]{1,30}?)\\s+(?:has\\s+)?(?:paid|sent)\\s+(?:you|me)\\b", FLAGS);

    /** Where a name ends: the next word of the sentence, or the punctuation after it. */
    private static final Pattern END_OF_NAME = Pattern.compile(
        "\\s+(?:on|via|using|from|ref|upi|a/c|ac|acct|account|with|is|has|was|successful|successfully|processed|initiated|completed|credited|debited|done|txn|transaction|towards|utr|id|for)\\b|[,;()|~\\n]|\\.(?:\\s|$)|\\s[-\\u2013]\\s",
        FLAGS);
    private static final Pattern NOT_A_NAME = Pattern.compile("^(?:x+\\d+|\\*+\\d+|\\d.*|you|your.*|the|a|an|me)$", FLAGS);

    private PaymentParser() {}

    /** Whether the words say it is not a finished payment (failed, pending, a reminder, an offer). */
    static boolean rejected(String text) {
        return REJECT.matcher(text).find();
    }

    /** Whether there is an amount in rupees in the words. */
    static boolean hasAmount(String text) {
        return amountMinor(text) >= 0;
    }

    /**
     * The payment the notification describes, or null when it is not one it is sure of. A notification from a messages app needs
     * a banking cue (an account, a card, UPI, a bank) as well, since not every message with an amount in it is a payment.
     */
    static Parsed parse(String title, String text, boolean requireBankCue) {
        String full = clean((title == null ? "" : title) + " " + (text == null ? "" : text));
        if (full.isEmpty() || rejected(full)) return null;
        if (requireBankCue && !BANK_CUE.matcher(full).find()) return null;

        long amount = amountMinor(full);
        if (amount <= 0) return null;

        int debit = first(DEBIT, full);
        int credit = first(CREDIT, full);
        boolean income;
        if (debit >= 0 && credit >= 0) income = credit <= debit;
        else if (debit >= 0) income = false;
        else if (credit >= 0) income = true;
        else if (WEAK_DEBIT.matcher(full).find()) income = false;
        else return null;

        return new Parsed(amount, merchant(full, income), income);
    }

    /** The first amount in rupees, in paise; -1 when there is none or it is not believable. */
    private static long amountMinor(String text) {
        Matcher m = AMOUNT.matcher(text);
        if (!m.find()) {
            m = AMOUNT_AFTER.matcher(text);
            if (!m.find()) return -1;
        }
        try {
            BigDecimal rupees = new BigDecimal(m.group(1).replace(",", ""));
            if (rupees.signum() <= 0 || rupees.compareTo(MAX_RUPEES) > 0) return -1;
            return rupees.movePointRight(2).setScale(0, java.math.RoundingMode.HALF_UP).longValueExact();
        } catch (NumberFormatException | ArithmeticException e) {
            return -1;
        }
    }

    private static int first(Pattern pattern, String text) {
        Matcher m = pattern.matcher(text);
        return m.find() ? m.start() : -1;
    }

    private static String merchant(String full, boolean income) {
        int from = amountEnd(full);
        String name = income ? candidate(FROM, full, 0) : candidate(TO, full, from);
        if (name.isEmpty()) {
            Matcher m = (income ? NAME_PAID_YOU : PAID_NAME).matcher(full);
            if (m.find()) name = tidy(m.group(1));
        }
        return name;
    }

    /** Where the amount ends, so that a name is looked for after it ("paid ₹250 to ..."). */
    private static int amountEnd(String text) {
        Matcher m = AMOUNT.matcher(text);
        if (m.find()) return m.end();
        m = AMOUNT_AFTER.matcher(text);
        return m.find() ? m.end() : 0;
    }

    /** The first thing after a "to", "at" or "from" that can be a name. */
    private static String candidate(Pattern pattern, String text, int from) {
        Matcher m = pattern.matcher(text);
        int at = from;
        while (at <= text.length() && m.find(at)) {
            String name = tidy(m.group(1));
            if (!name.isEmpty()) return name;
            at = m.start() + 1;
        }
        return "";
    }

    /** A name cut where it ends, without an address ("@okaxis"), in capitals where it had none. Empty if it is not a name. */
    private static String tidy(String raw) {
        String s = raw.trim();
        Matcher end = END_OF_NAME.matcher(s);
        if (end.find()) s = s.substring(0, end.start());
        s = s.replaceFirst("(?i)^the\\s+", "").trim();
        int at = s.indexOf('@');
        if (at >= 0) s = s.substring(0, at).replaceAll("[._-]+", " ").trim();
        s = s.replaceAll("\\s+", " ").replaceAll("^[\\p{Punct}\\s]+|[\\p{Punct}\\s]+$", "");
        if (s.length() < 2 || NOT_A_NAME.matcher(s).matches()) return "";
        if (s.equals(s.toLowerCase(Locale.ROOT))) s = capitalise(s);
        return s.length() > 40 ? s.substring(0, 40).trim() : s;
    }

    private static String capitalise(String s) {
        StringBuilder out = new StringBuilder();
        for (String word : s.split(" ")) {
            if (word.isEmpty()) continue;
            if (out.length() > 0) out.append(' ');
            out.append(Character.toUpperCase(word.charAt(0))).append(word.substring(1));
        }
        return out.toString();
    }

    private static String clean(String s) {
        return s.replace('\u00A0', ' ').replaceAll("\\s+", " ").trim();
    }

    /** An amount in rupees the way the app shows it: ₹250, ₹1,200.50, ₹1,20,000 (groups of two after the first three). */
    static String formatRupees(long amountMinor) {
        long rupees = amountMinor / 100;
        long paise = amountMinor % 100;
        String digits = Long.toString(rupees);
        StringBuilder grouped = new StringBuilder();
        int n = digits.length();
        if (n <= 3) {
            grouped.append(digits);
        } else {
            String head = digits.substring(0, n - 3);
            for (int i = 0; i < head.length(); i++) {
                if (i > 0 && (head.length() - i) % 2 == 0) grouped.append(',');
                grouped.append(head.charAt(i));
            }
            grouped.append(',').append(digits.substring(n - 3));
        }
        return "\u20B9" + grouped + (paise == 0 ? "" : String.format(Locale.ROOT, ".%02d", paise));
    }
}
