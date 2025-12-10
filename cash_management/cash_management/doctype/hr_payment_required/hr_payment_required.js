frappe.ui.form.on('HR Payment Required', {
    refresh(frm) {
        if (!frm.is_new()) {
            frm.add_custom_button(__('Create Payment Requester'), () => {

                frappe.new_doc('Payment Requester', {
                    project: frm.doc.project, 
                    hr_payment_required : frm.doc.name
                });

            }, __('Create'));
        }
    }
});

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
