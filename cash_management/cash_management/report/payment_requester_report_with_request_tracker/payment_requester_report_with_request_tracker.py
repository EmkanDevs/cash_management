import frappe
from frappe import _
from frappe.utils import getdate

def execute(filters=None):
    columns = get_columns()
    data = get_data(filters or {})
    return columns, data


def get_columns():
    return [
        {"label": _("Payment Requester"), "fieldname": "payment_request", "fieldtype": "Link", "options": "Payment Requester", "width": 200},
        {"label": _("Payment Request Tracker"), "fieldname": "prt_id", "fieldtype": "Link", "options": "Payment Request Tracker", "width": 200},
        {"label": _("Payment Entry"), "fieldname": "payment_entry", "fieldtype": "Link", "options": "Payment Entry", "width": 200},
        {"label": _("Posting Date"), "fieldname": "posting_date", "fieldtype": "Date", "width": 120},
        {"label": _("Paid Amount"), "fieldname": "paid_amount", "fieldtype": "Currency", "width": 120},  # now from Payment Entry
        {"label": _("Unpaid Amount"), "fieldname": "unpaid_amount", "fieldtype": "Currency", "width": 120},
        {"label": _("Grand Total"), "fieldname": "grand_total", "fieldtype": "Currency", "width": 120},
    ]


def get_data(filters):
    data = []

    prts = frappe.get_all(
        "Payment Request Tracker",
        fields=["name", "payment_requester", "total_amount_remaining"],
        filters={}
    )

    for prt in prts:
        if not prt.payment_requester:
            continue

        # 🔹 Fetch Payment Entries linked to this Payment Request
        pes = frappe.get_all(
            "Payment Entry",
            filters={"custom_payment_reference_name": prt.payment_requester},
            fields=["name", "posting_date", "paid_amount"]
        )

        if not pes:
            # Only add rows without posting_date if no date filters are applied
            if not (filters.get("from_date") or filters.get("to_date")):
                grand_total = (prt.total_amount_remaining or 0)
                row = {
                    "payment_request": prt.payment_requester,
                    "prt_id": prt.name,
                    "payment_entry": None,
                    "posting_date": None,
                    "paid_amount": 0,  # no payment entry means nothing paid
                    "unpaid_amount": prt.total_amount_remaining or 0,
                    "grand_total": grand_total,
                }
                if match_filters(row, filters):
                    data.append(row)

        for pe in pes:
            # grand_total = paid_amount (this PE) + unpaid remaining (from PRT)
            grand_total = (pe.paid_amount or 0) + (prt.total_amount_remaining or 0)

            row = {
                "payment_request": prt.payment_requester,
                "prt_id": prt.name,
                "payment_entry": pe.name,
                "posting_date": pe.posting_date,
                "paid_amount": pe.paid_amount or 0,  # ✅ from Payment Entry
                "unpaid_amount": prt.total_amount_remaining or 0,
                "grand_total": grand_total,
            }
            if match_filters(row, filters):
                data.append(row)

    return data


def match_filters(row, filters):
    """Apply custom filters manually because Payment Entry is being pulled separately."""

    # 1. Date filter
    if filters.get("from_date") or filters.get("to_date"):
        # Skip rows without posting_date if date filters are applied
        if not row["posting_date"]:
            return False

    if filters.get("from_date") and row["posting_date"]:
        if row["posting_date"] < getdate(filters["from_date"]):
            return False

    if filters.get("to_date") and row["posting_date"]:
        if row["posting_date"] > getdate(filters["to_date"]):
            return False

    # 2. Amount Paid filter
    if filters.get("amount_paid") == "Full Paid":
        if row["grand_total"] != row["paid_amount"]:
            return False
    elif filters.get("amount_paid") == "Unpaid":
        if row["paid_amount"] == 0:
            pass  # unpaid
        else:
            return False

    return True
