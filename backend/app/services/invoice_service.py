from datetime import datetime
from typing import Any, Optional
import fitz  # PyMuPDF


class InvoiceService:
    """
    Generates professional PDF payment receipts and tax invoices for Prime ID Pro.
    """

    @staticmethod
    def generate_invoice_pdf(subscription: Any, user: Any) -> bytes:
        """
        Builds a structured A4 PDF invoice and returns its raw bytes.
        """
        doc = fitz.open()
        # Standard A4 size in points: 595.28 x 841.89
        page = doc.new_page(width=595.28, height=841.89)

        # Extract user details safely
        user_email = getattr(user, "email", "") or (user.get("email") if isinstance(user, dict) else str(user))
        user_name = (
            getattr(user, "full_name", None)
            or getattr(user, "name", None)
            or (user.get("full_name") if isinstance(user, dict) else None)
            or user_email
        )

        # Extract subscription details safely
        amount = getattr(subscription, "amount", 0.0)
        plan_name = getattr(subscription, "plan_name", "Studio Credit Pack")
        credits_count = getattr(subscription, "credits_allocated", 0)
        order_id = (
            getattr(subscription, "razorpay_order_id", None)
            or getattr(subscription, "id", None)
            or "ORD-" + datetime.utcnow().strftime("%Y%m%d%H%M%S")
        )
        payment_id = getattr(subscription, "razorpay_payment_id", "PAID-DIRECT")
        created_at = getattr(subscription, "started_at", None) or getattr(subscription, "created_at", None) or datetime.utcnow()
        date_str = created_at.strftime("%d %b %Y, %I:%M %p UTC")

        # 1. Header Banner (Dark Navy)
        header_rect = fitz.Rect(0, 0, 595.28, 100)
        page.draw_rect(header_rect, color=None, fill=(0.06, 0.09, 0.16)) # #0f172a

        # Cyan Accent Stripe
        stripe_rect = fitz.Rect(0, 97, 595.28, 100)
        page.draw_rect(stripe_rect, color=None, fill=(0.02, 0.71, 0.83)) # #06b6d4

        page.insert_text((40, 50), "PRIME ID PRO", fontsize=20, color=(1, 1, 1))
        page.insert_text((40, 72), "AI Biometric Studio & Document Printing Platform", fontsize=10, color=(0.58, 0.64, 0.72))
        page.insert_text((400, 48), "TAX INVOICE / RECEIPT", fontsize=12, color=(0.13, 0.83, 0.93))
        page.insert_text((400, 68), f"Invoice #: {str(order_id)[:18]}", fontsize=9, color=(0.8, 0.85, 0.9))

        # 2. Billed To & Transaction Details Box
        page.draw_rect(fitz.Rect(40, 125, 555, 210), color=(0.88, 0.91, 0.94), fill=(0.97, 0.98, 0.99))
        page.insert_text((55, 145), "BILLED TO:", fontsize=10, color=(0.3, 0.35, 0.4))
        page.insert_text((55, 165), f"Name: {user_name}", fontsize=11, color=(0.06, 0.09, 0.16))
        page.insert_text((55, 185), f"Email: {user_email}", fontsize=10, color=(0.2, 0.25, 0.3))

        page.insert_text((330, 145), "PAYMENT INFO:", fontsize=10, color=(0.3, 0.35, 0.4))
        page.insert_text((330, 165), f"Date: {date_str}", fontsize=9, color=(0.06, 0.09, 0.16))
        page.insert_text((330, 185), f"Payment ID: {payment_id}", fontsize=9, color=(0.06, 0.09, 0.16))

        # 3. Items Table Header
        table_top = 230
        page.draw_rect(fitz.Rect(40, table_top, 555, table_top + 28), color=None, fill=(0.94, 0.96, 0.98))
        page.insert_text((55, table_top + 18), "ITEM DESCRIPTION", fontsize=10, color=(0.2, 0.25, 0.3))
        page.insert_text((300, table_top + 18), "CREDITS", fontsize=10, color=(0.2, 0.25, 0.3))
        page.insert_text((470, table_top + 18), "AMOUNT (INR)", fontsize=10, color=(0.2, 0.25, 0.3))

        # Items Row
        row_top = table_top + 38
        page.insert_text((55, row_top + 18), f"{plan_name}", fontsize=11, color=(0.06, 0.09, 0.16))
        page.insert_text((300, row_top + 18), f"+{credits_count} Tokens", fontsize=11, color=(0.06, 0.7, 0.4))
        page.insert_text((470, row_top + 18), f"INR {amount:.2f}", fontsize=11, color=(0.06, 0.09, 0.16))
        page.draw_line(fitz.Point(40, row_top + 32), fitz.Point(555, row_top + 32), color=(0.88, 0.91, 0.94))

        # Total Summary Box
        total_top = row_top + 50
        page.draw_rect(fitz.Rect(320, total_top, 555, total_top + 60), color=(0.88, 0.91, 0.94), fill=(0.94, 0.98, 0.96))
        page.insert_text((335, total_top + 25), "Payment Status:", fontsize=10, color=(0.2, 0.4, 0.3))
        page.insert_text((450, total_top + 25), "PAID (Success)", fontsize=10, color=(0.06, 0.65, 0.35))
        page.insert_text((335, total_top + 48), "Total Paid:", fontsize=12, color=(0.06, 0.09, 0.16))
        page.insert_text((450, total_top + 48), f"INR {amount:.2f}", fontsize=14, color=(0.06, 0.65, 0.35))

        # 4. Footer & GST Note
        page.draw_line(fitz.Point(40, 760), fitz.Point(555, 760), color=(0.88, 0.91, 0.94))
        page.insert_text((40, 780), "Prime ID Pro Platform • Official Electronic Tax Invoice & Receipt", fontsize=9, color=(0.5, 0.55, 0.6))
        page.insert_text((40, 795), "For billing inquiries, please contact support@primeidpro.online", fontsize=8, color=(0.6, 0.65, 0.7))

        pdf_bytes = doc.tobytes()
        doc.close()
        return pdf_bytes


invoice_service = InvoiceService()
