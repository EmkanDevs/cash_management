frappe.ui.form.on('HR Payment Required', {
    refresh(frm) {
        if (frm.is_new()) return;

        // Always show Payment Requester
        frm.add_custom_button(__('Create Payment Requester'), () => {
            frappe.new_doc('Payment Requester', {
                project: frm.doc.project, 
                hr_payment_required : frm.doc.name,
                transaction_date : frm.doc.created_date,
                grand_total : frm.doc.amount,
                reference_doctype : frm.doctype,
                reference_name: frm.doc.name,
                sector : frm.doc.sector,
                department : frm.doc.department,
                region_location : frm.doc.location,
                cost_center : frm.doc.cost_center,
            });
        }, __('Create'));

        // Safe existence check
        frappe.db.get_value('Payment Requester', {
            reference_doctype: frm.doctype,
            reference_name: frm.doc.name
        }, 'name').then(r => {
            if (r && r.message && r.message.name) {
                frm.add_custom_button(__('Create Purchase Invoice'), () => {
                    create_purchase_invoice(frm);
                }, __('Create'));
            }
        });
    }
});

function create_purchase_invoice(frm) {
    frappe.new_doc('Purchase Invoice', {
        supplier: frm.doc.payment_to,
        project: frm.doc.project,
        due_date: frm.doc.payment_due_date,
        sector: frm.doc.sector,
        scope : frm.doc.scope,
        department : frm.doc.department,
        section : frm.doc.section,
        region_location : frm.doc.location,
        cost_center: frm.doc.cost_center,
        reference_doctype_payment: "Payment Requester",
        ref_payment_name: frm.doc.payment_requester,
        reference_doctype: frm.doctype,
        reference_name: frm.doc.name,
    });
}




frappe.ui.form.on('HR Payment Required Employees', {
    extra_pay(frm, cdt, cdn) {
        const row = locals[cdt][cdn];
        const child = frm.doc.extra_amount_to_deducted_on_the_employee || [];

        if (row.extra_pay) {
            const exists = child.some(d => d.full_name === row.assigned_user);
            if (!exists) {
                frm.add_child('extra_amount_to_deducted_on_the_employee', {
                    full_name: row.full_name,
                    employee: row.employee,
                    department: row.department,
                    designation: row.designation
                });
            }
        } else {
            const idx = child.findIndex(d => d.full_name === row.assigned_user);
            if (idx > -1) {
                frm.get_field('extra_amount_to_deducted_on_the_employee').grid.grid_rows[idx].remove();
            }
        }

        frm.refresh_field('extra_amount_to_deducted_on_the_employee');
    }
});
