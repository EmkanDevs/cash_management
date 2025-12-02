# Copyright (c) 2025, chris.panikulangara@finbyz.tech and contributors
# For license information, please see license.txt

# import frappe
from frappe.model.document import Document
import frappe
from erpnext.accounts.doctype.payment_request.payment_request import make_payment_entry

class PaymentRequestTracker(Document):
    def before_save(self):
        total_paid = self.total_amount_paid or 0
        total_remaining = self.total_amount_remaining or 0
        grand_total = total_paid + total_remaining

        # Update each child row
        for row in self.payment_request_details:
            row.grand_total = grand_total
            row.unpaid_amount = grand_total - (row.paid_amount or 0)

            if grand_total > 0:
                row.paid = (row.paid_amount or 0) / grand_total * 100
            else:
                row.paid = 0

def sync_payment_request_trackers():
    payment_requests = frappe.get_all("Payment Request", fields=["name", "grand_total"])

    for pr in payment_requests:
        # Check if a Tracker exists
        tracker_name = frappe.db.exists("Payment Request Tracker", {"payment_request": pr.name})

        # Get Payment Entry linked to this Payment Request (via reference_no)
        payment_entry = frappe.db.get_value(
            "Payment Entry",
            {"reference_no": pr.name},
            "name"
        )

        if tracker_name:
            # Update existing tracker
            tracker = frappe.get_doc("Payment Request Tracker", tracker_name)

            # Recalculate totals
            total_paid = 0
            if payment_entry:
                total_paid = frappe.db.get_value("Payment Entry", payment_entry, "paid_amount") or 0

            total_remaining = (pr.grand_total or 0) - total_paid

            tracker.total_amount_paid = total_paid
            tracker.total_amount_remaining = total_remaining
            tracker.payment_entry = payment_entry
            tracker.save(ignore_permissions=True)

        else:
            # Create new tracker
            total_paid = 0
            if payment_entry:
                total_paid = frappe.db.get_value("Payment Entry", payment_entry, "paid_amount") or 0

            total_remaining = (pr.grand_total or 0) - total_paid

            tracker = frappe.new_doc("Payment Request Tracker")
            tracker.payment_request = pr.name
            tracker.total_amount_paid = total_paid
            tracker.total_amount_remaining = total_remaining
            tracker.payment_entry = payment_entry
            tracker.insert(ignore_permissions=True)

    frappe.db.commit()

def sync_payment_requester_trackers():
    payment_requests = frappe.get_all("Payment Requester", fields=["name", "grand_total"])

    for pr in payment_requests:
        # Check if a Tracker exists
        tracker_name = frappe.db.exists("Payment Request Tracker", {"payment_requester": pr.name})

        # Get Payment Entry linked to this Payment Request (via reference_no)
        payment_entry = frappe.db.get_value(
            "Payment Entry",
            {"custom_payment_reference_name": pr.name},
            "name"
        )

        if tracker_name:
            # Update existing tracker
            tracker = frappe.get_doc("Payment Request Tracker", tracker_name)

            # Recalculate totals
            total_paid = 0
            if payment_entry:
                total_paid = frappe.db.get_value("Payment Entry", payment_entry, "paid_amount") or 0

            total_remaining = (pr.grand_total or 0) - total_paid

            tracker.total_amount_paid = total_paid
            tracker.total_amount_remaining = total_remaining
            tracker.payment_entry = payment_entry
            tracker.save(ignore_permissions=True)

        else:
            # Create new tracker
            total_paid = 0
            if payment_entry:
                total_paid = frappe.db.get_value("Payment Entry", payment_entry, "paid_amount") or 0

            total_remaining = (pr.grand_total or 0) - total_paid

            tracker = frappe.new_doc("Payment Request Tracker")
            tracker.payment_requester = pr.name
            tracker.total_amount_paid = total_paid
            tracker.total_amount_remaining = total_remaining
            tracker.payment_entry = payment_entry
            tracker.insert(ignore_permissions=True)

    frappe.db.commit()