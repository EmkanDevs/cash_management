frappe.ui.form.on('Public Relation Payment Required', {
    refresh(frm) {
        if (frm.is_new()) return;

        frm.add_custom_button(__('Create Payment Requester'), () => {
            frappe.new_doc('Payment Requester', {
                project: frm.doc.project, 
                public_relation_payment_required : frm.doc.name,
                cost_center : frm.doc.cost_center,
                sector : frm.doc.sector,
                scope : frm.doc.scope,
                department : frm.doc.department,
                region_location : frm.doc.location,
                transaction_date: frm.doc.created_date,
                section: frm.doc.section,
                grand_total : frm.doc.bill_amount,

                reference_doctype: frm.doctype,
                reference_name: frm.doc.name
            });
        }, __('Create'));

        frappe.db.get_value("Payment Requester", {
            reference_doctype: frm.doctype,
            reference_name: frm.doc.name
        }, "name").then(r => {
            if (r?.message?.name) {
                frm.add_custom_button(__('Create Purchase Invoice'), () => {
                    create_pr_purchase_invoice(frm, r.message.name);
                }, __('Create'));
            }
        });
    }
});

function create_pr_purchase_invoice(frm, payment_requester) {
    frappe.new_doc('Purchase Invoice', {
        project: frm.doc.project,
        supplier: frm.doc.payment_to,
        sector: frm.doc.sector,
        scope : frm.doc.scope,
        department : frm.doc.department,
        section : frm.doc.section,
        region_location : frm.doc.location,
        cost_center: frm.doc.cost_center,
        due_date : frm.doc.payment_due_date,
        bill_no : frm.doc.invoice_no,
        reference_doctype_payment: "Payment Requester",
        ref_payment_name: payment_requester,
        reference_doctype: frm.doctype,
        reference_name: frm.doc.name,

    });
}

