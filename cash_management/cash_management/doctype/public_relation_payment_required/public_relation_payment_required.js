frappe.ui.form.on('Public Relation Payment Required', {
    refresh(frm) {
        if (!frm.is_new()) {
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
					section:frm.doc.section,
					grand_total : frm.doc.bill_amount
                });

            }, __('Create'));
        }
    }
});
