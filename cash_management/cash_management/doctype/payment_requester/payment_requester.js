frappe.ui.form.on("Payment Requester", {
    party: function(frm) {

        if (!frm.doc.party || !frm.doc.party_type) {
            frm.set_value("party_name", "");
            return;
        }

        let name_field_map = {
            "Customer": "customer_name",
            "Supplier": "supplier_name",
            "Employee": "employee_name",
            "Lead": "lead_name"
        };

        let name_field = name_field_map[frm.doc.party_type] || "name";

        frappe.db.get_value(
            frm.doc.party_type,
            frm.doc.party,
            name_field,
            (r) => {
                frm.set_value("party_name", r[name_field] || "");
            }
        );
    }
});
