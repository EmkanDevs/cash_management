import frappe
from frappe import _
from frappe.utils import getdate

def execute(filters=None):
    filters = filters or {}
    columns = get_columns()
    data = get_data(filters)
    return columns, data


def get_columns():
    return [
        {"label": _("Payment Request / Requester"), "fieldname": "payment_request", "fieldtype": "Dynamic Link", "options": "reference_type", "width": 200},  # 🔸 Changed label & type
        {"label": _("Payment Request Tracker"), "fieldname": "prt_id", "fieldtype": "Link", "options": "Payment Request Tracker", "width": 200},
        {"label": _("Payment Entry"), "fieldname": "payment_entry", "fieldtype": "Link", "options": "Payment Entry", "width": 200},
        {"label": _("Posting Date"), "fieldname": "posting_date", "fieldtype": "Date", "width": 120},
        {"label": _("Paid Amount"), "fieldname": "paid_amount", "fieldtype": "Currency", "width": 120},
        {"label": _("Unpaid Amount"), "fieldname": "unpaid_amount", "fieldtype": "Currency", "width": 120},
        {"label": _("Grand Total"), "fieldname": "grand_total", "fieldtype": "Currency", "width": 120},
    ]


def get_data(filters):
    data = []
    reference_type = filters.get("reference_type") or "Payment Request"  # 🔸 Default to Payment Request

    # Fetch PRTs
    prts = frappe.get_all(
        "Payment Request Tracker",
        fields=["name", "payment_requester", "payment_request", "total_amount_remaining"],
        filters={}
    )

    for prt in prts:
        # Determine which field to use based on reference type
        if reference_type == "Payment Request":
            reference_name = prt.payment_request
            pe_filters = {"payment_request": prt.payment_request}
        else:
            reference_name = prt.payment_requester
            pe_filters = {"custom_payment_reference_name": reference_name}

        if not reference_name:
            continue

        # Fetch Payment Entries linked to the selected reference type
        # pe_filters = {"custom_payment_reference_name": reference_name}  # 🔸 Use dynamic reference
        pes = frappe.get_all(
            "Payment Entry",
            filters=pe_filters,
            fields=["name", "posting_date", "paid_amount"]
        )

        if not pes:
            # Only add rows without posting_date if no date filters are applied
            if not (filters.get("from_date") or filters.get("to_date")):
                grand_total = (prt.total_amount_remaining or 0)
                row = {
                    "payment_request": reference_name,
                    "prt_id": prt.name,
                    "payment_entry": None,
                    "posting_date": None,
                    "paid_amount": 0,
                    "unpaid_amount": prt.total_amount_remaining or 0,
                    "grand_total": grand_total,
                }
                if match_filters(row, filters):
                    data.append(row)
            continue

        for pe in pes:
            grand_total = (pe.paid_amount or 0) + (prt.total_amount_remaining or 0)
            row = {
                "payment_request": reference_name,
                "prt_id": prt.name,
                "payment_entry": pe.name,
                "posting_date": pe.posting_date,
                "paid_amount": pe.paid_amount or 0,
                "unpaid_amount": prt.total_amount_remaining or 0,
                "grand_total": grand_total,
            }
            if match_filters(row, filters):
                data.append(row)

    return data


def match_filters(row, filters):
    """Apply manual filters"""
    if filters.get("from_date") or filters.get("to_date"):
        if not row["posting_date"]:
            return False
    if filters.get("from_date") and row["posting_date"]:
        if row["posting_date"] < getdate(filters["from_date"]):
            return False
    if filters.get("to_date") and row["posting_date"]:
        if row["posting_date"] > getdate(filters["to_date"]):
            return False

    if filters.get("amount_paid") == "Full Paid":
        if row["grand_total"] != row["paid_amount"]:
            return False
    elif filters.get("amount_paid") == "Unpaid":
        if row["paid_amount"] != 0:
            return False

    return True
