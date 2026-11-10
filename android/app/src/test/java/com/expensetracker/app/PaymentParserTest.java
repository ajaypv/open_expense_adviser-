package com.expensetracker.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

/**
 * The wordings here are the usual ones for UPI apps and bank messages, written from how they are commonly worded, not copied from
 * a phone: a real notification that is worded differently is the thing to add a case for.
 */
public class PaymentParserTest {
    private static final String R = "₹"; // the rupee sign

    private static PaymentParser.Parsed app(String text) {
        return PaymentParser.parse("", text, false);
    }

    private static void expense(PaymentParser.Parsed p, long minor, String merchant) {
        assertNotNull(p);
        assertFalse("should be money going out", p.income);
        assertEquals(minor, p.amountMinor);
        assertEquals(merchant, p.merchant);
    }

    private static void income(PaymentParser.Parsed p, long minor, String merchant) {
        assertNotNull(p);
        assertTrue("should be money coming in", p.income);
        assertEquals(minor, p.amountMinor);
        assertEquals(merchant, p.merchant);
    }

    // ---- money going out -----------------------------------------------------------------------------------------

    @Test
    public void paidToAShop() {
        expense(PaymentParser.parse("Payment successful", "Paid " + R + "250 to Swiggy", false), 25000, "Swiggy");
    }

    @Test
    public void youPaidAPerson() {
        expense(app("You paid " + R + "1,200 to Ravi Kumar"), 120000, "Ravi Kumar");
    }

    @Test
    public void nameBetweenTheVerbAndTheAmount() {
        expense(app("You paid Ravi Kumar " + R + "500"), 50000, "Ravi Kumar");
    }

    @Test
    public void amountFirstThenPaidTo() {
        expense(app(R + "250 paid to Swiggy successfully"), 25000, "Swiggy");
    }

    @Test
    public void paymentOfAmountIsSuccessful() {
        expense(app("Payment of " + R + "250 to Swiggy is successful"), 25000, "Swiggy");
    }

    @Test
    public void paisaAreKept() {
        expense(app("Paid " + R + "99.50 to Chai Point"), 9950, "Chai Point");
    }

    @Test
    public void aTimeBeforeTheNameIsNotTheName() {
        expense(app("Paid " + R + "250 at 10:30 PM to Swiggy"), 25000, "Swiggy");
    }

    @Test
    public void cashbackAfterwardsDoesNotMakeItIncome() {
        expense(app("Paid " + R + "250 to Swiggy. Cashback " + R + "5 credited"), 25000, "Swiggy");
    }

    @Test
    public void bankDebitMessageWithAnUpiAddress() {
        String text = "Rs.250.00 debited from a/c XX1234 on 10-11-26 to VPA swiggy@okaxis (UPI Ref 1234567890)";
        expense(PaymentParser.parse("HDFCBK", text, true), 25000, "Swiggy");
    }

    @Test
    public void cardSpendAtAShop() {
        expense(PaymentParser.parse("Axis Bank", "Spent Rs 1,499 at Amazon on card XX4321", true), 149900, "Amazon");
    }

    @Test
    public void aDebitThatNamesNoOne() {
        expense(PaymentParser.parse("SBIINB", "Rs 500 debited from a/c XX1234", true), 50000, "");
    }

    @Test
    public void inrWrittenOut() {
        expense(app("INR 2,500.00 paid to Rent Co"), 250000, "Rent Co");
    }

    @Test
    public void lakhsAreRead() {
        expense(app("Paid " + R + "1,20,000 to Builder"), 12000000, "Builder");
    }

    // ---- money coming in -----------------------------------------------------------------------------------------

    @Test
    public void receivedFromSomeone() {
        income(app("Received " + R + "500 from Ravi"), 50000, "Ravi");
    }

    @Test
    public void someonePaidYou() {
        income(app("Ravi Kumar paid you " + R + "500"), 50000, "Ravi Kumar");
    }

    @Test
    public void creditedMessage() {
        income(PaymentParser.parse("ICICIB", "Rs 5,000.00 credited to your a/c XX1234 on 10-11-26. Info: salary", true), 500000, "");
    }

    @Test
    public void refund() {
        income(app("Refund of " + R + "299 from Amazon processed"), 29900, "Amazon");
    }

    // ---- not a finished payment ------------------------------------------------------------------------------------

    @Test
    public void failedPayment() {
        assertNull(app("Payment of " + R + "250 to Swiggy failed"));
    }

    @Test
    public void pendingPayment() {
        assertNull(app("Your payment of " + R + "250 to Swiggy is pending"));
    }

    @Test
    public void paymentRequest() {
        assertNull(app("Ravi has requested " + R + "500 from you"));
        assertNull(app("Collect request of " + R + "500 from Ravi"));
    }

    @Test
    public void billReminder() {
        assertNull(app("Your bill of " + R + "1,200 is due on 15 Nov"));
    }

    @Test
    public void offerAndOtp() {
        assertNull(app("Win cashback up to " + R + "100 on your next payment"));
        assertNull(app("Your OTP for paying " + R + "250 is 123456"));
    }

    @Test
    public void anAmountWithNothingSaidAboutIt() {
        assertNull(app("Hello, you have " + R + "250 in rewards"));
    }

    @Test
    public void noAmount() {
        assertNull(app("Payment successful"));
        assertNull(app(""));
        assertNull(PaymentParser.parse(null, null, false));
    }

    @Test
    public void zeroAndSillyAmounts() {
        assertNull(app("Paid " + R + "0 to Swiggy"));
        assertNull(app("Paid " + R + "99999999999 to Swiggy"));
    }

    @Test
    public void aMessageNeedsABankingCueToCount() {
        assertNull(PaymentParser.parse("Ravi", "I paid Rs 500 to the plumber today", true));
        assertNotNull(PaymentParser.parse("Ravi", "I paid Rs 500 to the plumber today", false));
    }

    // ---- helpers -------------------------------------------------------------------------------------------------

    @Test
    public void rejectedAndHasAmount() {
        assertTrue(PaymentParser.rejected("Payment failed"));
        assertFalse(PaymentParser.rejected("Paid " + R + "250 to Swiggy"));
        assertTrue(PaymentParser.hasAmount("Paid " + R + "250"));
        assertFalse(PaymentParser.hasAmount("Paid"));
    }

    @Test
    public void amountsAreShownTheWayTheAppShowsThem() {
        assertEquals(R + "250", PaymentParser.formatRupees(25000));
        assertEquals(R + "1,200.50", PaymentParser.formatRupees(120050));
        assertEquals(R + "1,20,000", PaymentParser.formatRupees(12000000));
        assertEquals(R + "10,00,000", PaymentParser.formatRupees(100000000));
        assertEquals(R + "0.05", PaymentParser.formatRupees(5));
        assertEquals(R + "999", PaymentParser.formatRupees(99900));
        assertEquals(R + "1,000", PaymentParser.formatRupees(100000));
    }

    @Test
    public void namesAreNotLongerThanTheyShouldBe() {
        PaymentParser.Parsed p = app("Paid " + R + "250 to " + "A".repeat(80));
        assertNotNull(p);
        assertTrue(p.merchant.length() <= 40);
    }
}
