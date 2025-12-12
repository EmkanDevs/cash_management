// // Copyright (c) 2025, chris.panikulangara@finbyz.tech and contributors
// // For license information, please see license.txt

frappe.ui.form.on("SIM Bills Payment Required", {
    refresh(frm) {
        if (!frm.is_new()) {
            frm.add_custom_button(__('Payment Requester'), function () {
                
                // Create a new Payment Requester document with all linked data
                frappe.new_doc("Payment Requester", {
                    transaction_date: frm.doc.created_date,
                    party_type: "Supplier",
                    party: frm.doc.payment_to,
                    party_name: frm.doc.payment_to_name,
                    reference_doctype: "SIM Bills Payment Required",
                    reference_name: frm.doc.name,
                    grand_total: frm.doc.bill_amount,
                    project: frm.doc.project,
                    sector: frm.doc.sector,
                    scope: frm.doc.scope,
                    cost_center: frm.doc.cost_center,
                    // department: frm.doc.department,
                    region_location: frm.doc.location
                });

            }, __("Create"));
        }
    }
});

