frappe.ui.form.on("SIM Bills Payment Required", {
    refresh(frm) {
        if (frm.is_new()) return;

        // Always show Payment Requester
        frm.add_custom_button(__('Payment Requester'), () => {
            frappe.new_doc("Payment Requester", {
                transaction_date: frm.doc.created_date,
                party_type: "Supplier",
                party: frm.doc.payment_to,
                party_name: frm.doc.payment_to_name,
                reference_doctype: frm.doctype,
                reference_name: frm.doc.name,
                grand_total: frm.doc.bill_amount,
                project: frm.doc.project,
                sector: frm.doc.sector,
                scope: frm.doc.scope,
                cost_center: frm.doc.cost_center,
                region_location: frm.doc.location
            });
        }, __("Create"));

        // Show PI only if Payment Requester exists
        frappe.db.get_value("Payment Requester", {
            reference_doctype: frm.doctype,
            reference_name: frm.doc.name
        }, "name").then(r => {
            if (r?.message?.name) {
                frm.add_custom_button(__('Create Purchase Invoice'), () => {
                    create_sim_purchase_invoice(frm, r.message.name);
                }, __("Create"));
            }
        });
    }
});

function create_sim_purchase_invoice(frm, payment_requester) {
    frappe.new_doc('Purchase Invoice', {
        project: frm.doc.project,
        supplier: frm.doc.payment_to,
        due_date: frm.doc.payment_due_date,
        sector: frm.doc.sector,
        scope : frm.doc.scope,
        department : frm.doc.department,
        section : frm.doc.section,
        region_location : frm.doc.location,
        cost_center: frm.doc.cost_center,
    
        reference_doctype_payment: "Payment Requester",
        ref_payment_name: payment_requester,

    
        reference_doctype: frm.doctype,
        reference_name: frm.doc.name,

    });
}
