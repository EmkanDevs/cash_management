import frappe
import json
from erpnext.accounts.doctype.payment_request.payment_request import make_payment_entry
from frappe import _

@frappe.whitelist()
def get_payment_request_entries(filters=None):
    filters = json.loads(filters) if filters else {}
    
    payment_request = filters.get("payment_request")
    supplier = filters.get("supplier")
    purchase_order = filters.get("reference_name")  # For backward compatibility
    from_date = filters.get("from_date")
    to_date = filters.get("to_date")
    only_fully_paid = int(filters.get("only_fully_paid") or 0)
    only_unpaid = int(filters.get("only_unpaid") or 0)
    reference_doctype = filters.get("reference_doctype")
    reference_name = filters.get("reference_name")
    
    results = []

    # build filters for Payment Request
    pr_filters = {}
    if payment_request:
        pr_filters["name"] = ["like", f"%{payment_request}%"]
    if supplier:
        pr_filters["party_type"] = "Supplier"
    if purchase_order:
        pr_filters["reference_doctype"] = "Purchase Order"
        pr_filters["reference_name"] = ["like", f"%{purchase_order}%"]

    # ✅ Add support for Reference Doctype + Reference Name
    if reference_doctype:
        pr_filters["reference_doctype"] = reference_doctype
    if reference_name:
        pr_filters["reference_name"] = ["like", f"%{reference_name}%"]  # use like for partial match

    if from_date and to_date:
        pr_filters["transaction_date"] = ["between", [from_date, to_date]]
    elif from_date:
        pr_filters["transaction_date"] = [">=", from_date]
    elif to_date:
        pr_filters["transaction_date"] = ["<=", to_date]

    # continue as before...
    payment_requests = frappe.db.get_values(
        "Payment Request",
        pr_filters,
        [
            "name",
            "grand_total",
            "reference_doctype",
            "reference_name",
            "party_type",
            "party",
            "party_name",
            "transaction_date",
        ],
        order_by="transaction_date desc",
        as_dict=True,
    )

    for pr in payment_requests:
        # additional supplier match on party_name OR party when supplier filter is provided
        if supplier and pr.get("party_type") == "Supplier":
            supplier_l = supplier.lower()
            party_name_l = (pr.get("party_name") or "").lower()
            party_id_l = (pr.get("party") or "").lower()
            if supplier_l not in party_name_l and supplier_l not in party_id_l:
                continue

        # find related Payment Request Tracker and fetch extra fields
        tracker = frappe.db.get_value(
            "Payment Request Tracker",
            {"payment_request": pr["name"]},
            ["name", "payment_entry", "total_amount_paid", "total_amount_remaining", "budget"],
            as_dict=True,
        )

        # derive supplier from Payment Request party fields
        supplier_name = None
        supplier_id = None
        payment_terms_value = None
        ref_dt = pr.get("reference_doctype")
        ref_dn = pr.get("reference_name")

        if pr.get("party_type") == "Supplier":
            supplier_id = pr.get("party")
            supplier_name = pr.get("party_name") or pr.get("party")

        # keep payment terms from the referenced document, if any
        if ref_dt and ref_dn:
            try:
                if ref_dt == "Purchase Order":
                    # Prefer template; otherwise build summary from payment schedule child table
                    po_doc = frappe.get_doc("Purchase Order", ref_dn)
                    if getattr(po_doc, "payment_terms_template", None):
                        payment_terms_value = po_doc.payment_terms_template
                    else:
                        schedule = getattr(po_doc, "payment_schedule", [])
                        if schedule:
                            # Example summary: "50% Advance Payment; 50% upon delivery"
                            parts = []
                            for row in schedule:
                                label = row.get("payment_term") or row.get("description") or "Payment"
                                percentage = None
                                # Try percentage first, fallback to amount
                                if row.get("invoice_portion"):
                                    percentage = f"{int(row.get('invoice_portion'))}%"
                                amount = None
                                if row.get("payment_amount"):
                                    amount = frappe.utils.fmt_money(row.get("payment_amount"), currency=po_doc.currency)
                                if percentage and label:
                                    parts.append(f"{percentage} {label}")
                                elif label and amount:
                                    parts.append(f"{label} {amount}")
                                elif label:
                                    parts.append(label)
                            payment_terms_value = "; ".join(parts)
                else:
                    ref_doc_vals = frappe.db.get_value(
                        ref_dt,
                        ref_dn,
                        [
                            "payment_terms_template",
                            "payment_terms",
                        ],
                        as_dict=True,
                    )
                    if ref_doc_vals:
                        payment_terms_value = (
                            ref_doc_vals.get("payment_terms_template")
                            or ref_doc_vals.get("payment_terms")
                        )
            except Exception:
                # tolerate missing fields/doctype variations
                pass

        # compute paid strictly from Payment Entry.paid_amount for all PEs referencing this Payment Request
        pr_grand_total = float(pr.get("grand_total") or 0)
        paid_from_entries = 0.0
        try:
            paid_sql = frappe.db.sql(
                """
                SELECT COALESCE(SUM(pe.paid_amount), 0)
                FROM `tabPayment Entry` pe
                WHERE pe.docstatus = 1
                AND pe.reference_no = %s
                """,
                (pr["name"],),
            )
            if paid_sql and paid_sql[0] and paid_sql[0][0] is not None:
                paid_from_entries = float(paid_sql[0][0] or 0)
        except Exception:
            paid_from_entries = 0.0

        # tracker fallback (optional)
        tracker_paid = float(tracker["total_amount_paid"]) if tracker and tracker.get("total_amount_paid") is not None else 0.0
        effective_paid = paid_from_entries if paid_from_entries > 0 else tracker_paid
        computed_remaining = max(0.0, pr_grand_total - effective_paid)


        # Skip non-fully-paid when only_fully_paid flag is set
        if only_fully_paid and computed_remaining > 0:
            continue

        if only_unpaid and computed_remaining == 0:
            continue

        po_grand_total = None
        po_remaining = None
        if ref_dt == "Purchase Order" and ref_dn:
            try:
                po_doc = frappe.get_doc("Purchase Order", ref_dn)
                po_grand_total = po_doc.grand_total or 0.0

                pe_total_paid = frappe.db.sql(
                    """
                    SELECT COALESCE(SUM(pe.paid_amount), 0)
                    FROM `tabPayment Entry` pe
                    INNER JOIN `tabPayment Entry Reference` per
                    ON per.parent = pe.name
                    WHERE pe.docstatus = 1
                    AND per.reference_doctype = 'Purchase Order'
                    AND per.reference_name = %s
                    """,
                    (ref_dn,)
                )
                pe_total_paid = float(pe_total_paid[0][0] if pe_total_paid and pe_total_paid[0] else 0.0)
                po_remaining = max(0.0, po_grand_total - pe_total_paid)
            except Exception:
                po_grand_total = None
                po_remaining = None

        # Append final result
        results.append(
            {
                "payment_request": pr["name"],
                "grand_total": pr["grand_total"],
                "reference_doctype": ref_dt,
                "reference_name": ref_dn,
                "supplier_name": supplier_name,
                "supplier_id": supplier_id,
                "payment_terms": payment_terms_value,
                "transaction_date": pr.get("transaction_date"),
                "tracker": tracker["name"] if tracker else None,
                "payment_entry": tracker["payment_entry"] if tracker else None,
                "total_amount_paid": effective_paid,
                "total_amount_remaining": computed_remaining,
                "po_grand_total": po_grand_total,
                "po_remaining": po_remaining,
                "budget": tracker["budget"] if tracker else None
            }
        )

    return results

@frappe.whitelist()
def get_payment_requester_entries(filters=None):
    filters = json.loads(filters) if filters else {}

    payment_requester = filters.get("payment_request")
    supplier = filters.get("supplier")
    invoice_released_memo = filters.get("reference_name")
    from_date = filters.get("from_date")
    to_date = filters.get("to_date")
    only_fully_paid = int(filters.get("only_fully_paid") or 0)
    only_unpaid = int(filters.get("only_unpaid") or 0)
    reference_doctype = filters.get("reference_doctype")
    reference_name = filters.get("reference_name")
    results = []

    # 🧠 Convert string "0"/"1" to bool (from JS frontend)
    # only_fully_paid = bool(int(only_fully_paid)) if only_fully_paid not in (None, "", False) else False
    # only_unpaid = bool(int(only_unpaid)) if only_unpaid not in (None, "", False) else False

    # 1️⃣ Build base filters
    prq_filters = {}
    if reference_doctype:
        prq_filters["reference_doctype"] = reference_doctype
    if payment_requester:
        prq_filters["name"] = ["like", f"%{payment_requester}%"]
    if invoice_released_memo:
        prq_filters["reference_name"] = ["like", f"%{invoice_released_memo}%"]
    elif reference_name:
        prq_filters["reference_name"] = ["like", f"%{reference_name}%"]

    # Date filters
    if from_date and to_date:
        prq_filters["transaction_date"] = ["between", [from_date, to_date]]
    elif from_date:
        prq_filters["transaction_date"] = [">=", from_date]
    elif to_date:
        prq_filters["transaction_date"] = ["<=", to_date]

    # 2️⃣ Fetch base records
    payment_requesters = frappe.db.get_values(
        "Payment Requester",
        prq_filters,
        [
            "name",
            "grand_total",
            "reference_doctype",
            "reference_name",
            "party_type",
            "party",
            "party_name",
            "transaction_date",
        ],
        order_by="transaction_date desc",
        as_dict=True,
    )

    # 3️⃣ Enrich and filter
    for prq in payment_requesters:
        supplier_name = None
        supplier_id = None
        payment_terms_value = None

        if prq.get("party_type") == "Supplier":
            supplier_id = prq.get("party")
            supplier_name = prq.get("party_name") or prq.get("party")

        ref_dn = prq.get("reference_name")
        if prq["reference_doctype"] == "Invoice released Memo" and ref_dn:
            try:
                irm_doc = frappe.get_doc("Invoice released Memo", ref_dn)
                payment_terms_value = getattr(irm_doc, "payment_terms_template", None) or getattr(
                    irm_doc, "payment_terms", None
                )
            except frappe.DoesNotExistError:
                frappe.log_error(f"{prq['reference_doctype']} {ref_dn} not found", "Payment Requester Fetch")
            except Exception as e:
                frappe.log_error(f"Error reading {ref_dn}: {str(e)}", "Payment Requester Fetch")

        # Payment tracker
        tracker = frappe.db.get_value(
            "Payment Request Tracker",
            {"payment_requester": prq["name"]},
            ["name", "payment_entry", "total_amount_paid", "total_amount_remaining", "budget"],
            as_dict=True,
        )

        grand_total = float(prq.get("grand_total") or 0)
        total_paid = float(tracker["total_amount_paid"]) if tracker else 0.0
        remaining = float(tracker["total_amount_remaining"]) if tracker else (grand_total - total_paid)
        remaining = max(0.0, remaining)

        # 4️⃣ Filter logic
        if only_fully_paid and remaining != 0:
            continue  # Show only fully paid
        if only_unpaid and remaining <= 0:
            continue  # Show only unpaid

        results.append({
            "payment_request": prq["name"],
            "grand_total": grand_total,
            "reference_doctype": prq["reference_doctype"],
            "reference_name": prq["reference_name"],
            "supplier_name": supplier_name,
            "supplier_id": supplier_id,
            "payment_terms": payment_terms_value,
            "transaction_date": prq.get("transaction_date"),
            "tracker": tracker["name"] if tracker else None,
            "payment_entry": tracker["payment_entry"] if tracker else None,
            "total_amount_paid": total_paid,
            "total_amount_remaining": remaining,
            "po_grand_total": grand_total,
            "po_remaining": remaining,
            "budget": tracker["budget"] if tracker else None
        })

    return results


@frappe.whitelist()
def get_payment_request_inward_entries(**kwargs):
    """
    Fetch inward Payment Requests (Customer Receipts) with tracker & payment details.
    Mirrors outward logic but restricted to payment_request_type = 'Inward'.
    """

    filters = kwargs.get("filters") or {}
    if isinstance(filters, str):
        filters = json.loads(filters)

    results = []

    payment_request = filters.get("payment_request")
    supplier = filters.get("supplier")
    from_date = filters.get("from_date")
    to_date = filters.get("to_date")
    only_fully_paid = filters.get("only_fully_paid")
    only_unpaid = filters.get("only_unpaid")
    reference_doctype = filters.get("reference_doctype")
    reference_name = filters.get("reference_name")

    # 🔹 Base filters
    pr_filters = {"payment_request_type": "Inward", "docstatus": 1}

    if payment_request:
        pr_filters["name"] = ["like", f"%{payment_request}%"]
    if supplier:
        # inward means customer
        pr_filters["party_name"] = ["like", f"%{supplier}%"]
    if reference_doctype:
        pr_filters["reference_doctype"] = reference_doctype
    if reference_name:
        pr_filters["reference_name"] = ["like", f"%{reference_name}%"]
    if from_date and to_date:
        pr_filters["transaction_date"] = ["between", [from_date, to_date]]
    elif from_date:
        pr_filters["transaction_date"] = [">=", from_date]
    elif to_date:
        pr_filters["transaction_date"] = ["<=", to_date]

    # 🔹 Fetch Payment Requests
    payment_requests = frappe.db.get_values(
        "Payment Request",
        pr_filters,
        [
            "name",
            "grand_total",
            "reference_doctype",
            "reference_name",
            "party_type",
            "party",
            "party_name",
            "transaction_date",
            "status",  # ✅ Added this
        ],
        order_by="transaction_date desc",
        as_dict=True,
    )

    for pr in payment_requests:
        # 🔹 Tracker info (if exists)
        tracker = frappe.db.get_value(
            "Payment Request Tracker",
            {"payment_request": pr["name"]},
            ["name", "payment_entry", "total_amount_paid", "total_amount_remaining", "budget"],
            as_dict=True,
        )

        # 🔹 Compute paid from Payment Entry (if linked)
        pr_grand_total = float(pr.get("grand_total") or 0)
        paid_from_entries = frappe.db.sql(
            """
            SELECT COALESCE(SUM(pe.paid_amount), 0)
            FROM `tabPayment Entry` pe
            WHERE pe.docstatus = 1
            AND pe.reference_no = %s
            """,
            (pr["name"],),
        )[0][0] or 0.0

        tracker_paid = (
            float(tracker["total_amount_paid"])
            if tracker and tracker.get("total_amount_paid") is not None
            else 0.0
        )

        effective_paid = paid_from_entries if paid_from_entries > 0 else tracker_paid
        computed_remaining = max(0.0, pr_grand_total - effective_paid)

        # ✅ New Logic: If Payment Request status is "Paid", force remaining to 0
        if pr.get("status") == "Paid":
            computed_remaining = 0.0

        # 🔹 Filter by paid/unpaid if checkbox active
        if only_fully_paid and computed_remaining > 0:
            continue
        if only_unpaid and computed_remaining == 0:
            continue

        results.append(
            {
                "payment_request": pr["name"],
                "grand_total": pr["grand_total"],
                "reference_doctype": pr.get("reference_doctype"),
                "reference_name": pr.get("reference_name"),
                "supplier_name": pr.get("party_name"),   # ← Customer in this case
                "supplier_id": pr.get("party"),
                "payment_terms": None,
                "transaction_date": pr.get("transaction_date"),
                "tracker": tracker["name"] if tracker else None,
                "payment_entry": tracker["payment_entry"] if tracker else None,
                "total_amount_paid": effective_paid,
                "total_amount_remaining": computed_remaining,
                "po_grand_total": None,
                "po_remaining": None,
                "budget": tracker["budget"] if tracker else None
            }
        )

    return results

@frappe.whitelist()
def get_tracker_child_table(tracker_name):
    tracker = frappe.get_doc("Payment Request Tracker", tracker_name)
    payment_entries = []

    try:
        if getattr(tracker, "payment_request", None):
            # Fetch ALL Payment Entries that reference this Payment Request
            # either via the Payment Entry Reference child table OR via Payment Entry.reference_no
            payment_entries = frappe.db.sql(
                """
                SELECT DISTINCT
                    pe.name,
                    pe.posting_date,
                    pe.paid_amount,
                    pe.party,
                    pe.mode_of_payment,
                    pe.status
                FROM `tabPayment Entry` pe
                LEFT JOIN `tabPayment Entry Reference` per
                    ON per.parent = pe.name
                WHERE pe.docstatus = 1
                  AND (
                      (per.reference_doctype = 'Payment Request' AND per.reference_name = %s)
                      OR IFNULL(pe.reference_no, '') = %s
                  )
                ORDER BY pe.posting_date DESC, pe.creation DESC
                """,
                (tracker.payment_request, tracker.payment_request),
                as_dict=True,
            )
    except Exception:
        payment_entries = []

    # Fallback: include the single payment_entry stored on the tracker if nothing found
    if not payment_entries and getattr(tracker, "payment_entry", None):
        try:
            pe_vals = frappe.db.get_value(
                "Payment Entry",
                tracker.payment_entry,
                ["name", "posting_date", "paid_amount", "party", "mode_of_payment", "status"],
                as_dict=True,
            )
            if pe_vals:
                payment_entries = [pe_vals]
        except Exception:
            pass

    return {
        "child_rows": tracker.payment_request_details,
        "totals": {
            "total_amount_paid": tracker.total_amount_paid,
            "total_amount_remaining": tracker.total_amount_remaining,
        },
        "payment_entries": payment_entries,
    }


@frappe.whitelist()
def update_tracker_child_table(tracker_name, rows, totals=None):

    rows = json.loads(rows) if isinstance(rows, str) else rows
    totals = json.loads(totals)
    total_paid = float(totals.get("total_amount_paid") or 0)
    total_remaining = float(totals.get("total_amount_remaining") or 0)
    grand_total = total_paid + total_remaining

    tracker_doc = frappe.get_doc("Payment Request Tracker", tracker_name)

    if totals:
        tracker_doc.total_amount_paid = totals.get("total_amount_paid")
        tracker_doc.total_amount_remaining = totals.get("total_amount_remaining")

    tracker_doc.set("payment_request_details", [])

    for r in rows:
        paid_amount = float(r.get("paid_amount") or 0)
        tracker_doc.append("payment_request_details", {
            "transaction_date": r.get("transaction_date"),
            "paid": float(r.get("paid") or 0),
            "paid_amount": paid_amount,
            "unpaid_amount": max(0.0, grand_total - paid_amount)
        })

        if paid_amount > 0 and tracker_doc.payment_request:
            try:
                pe_doc = make_payment_entry(tracker_doc.payment_request)
                if isinstance(pe_doc, dict):
                    pe_doc = frappe.get_doc(pe_doc)

                pe_doc.paid_amount = paid_amount
                pe_doc.received_amount = paid_amount
                pe_doc.base_received_amount = paid_amount
                pe_doc.total_allocated_amount = paid_amount
                pe_doc.base_total_allocated_amount = paid_amount

                if pe_doc.references and len(pe_doc.references) > 0:
                    pe_doc.references[0].allocated_amount = paid_amount

                pe_doc.reference_no = tracker_doc.payment_request
                pe_doc.name = None

                pe_doc.insert(ignore_permissions=True)
                frappe.db.commit()

            except Exception as e:
                frappe.db.rollback()

                frappe.log_error(frappe.get_traceback(), f"Payment Entry creation failed for {tracker_doc.payment_request}")

                error_text = str(e)
                if "Allocated Amount cannot be greater" in error_text:
                    frappe.throw(_("Payment Entry creation failed for {0}. Please check Error Log for details.").format(tracker_doc.payment_request))
                else:
                    frappe.throw(_("Payment Entry creation failed for {0}. Please check Error Log for details.").format(tracker_doc.payment_request))


    tracker_doc.save(ignore_permissions=True)
    frappe.db.commit()

    return {"status": "success"}

@frappe.whitelist()
def update_paid_amount(payment_entry, paid_amount):
    pe = frappe.get_doc("Payment Entry", payment_entry)
    pe.paid_amount = float(paid_amount)  # ensure numeric type
    pe.save(ignore_permissions=True)
    frappe.db.commit()
    return {"status": "success", "message": f"Updated {payment_entry} with Paid Amount {paid_amount}"}