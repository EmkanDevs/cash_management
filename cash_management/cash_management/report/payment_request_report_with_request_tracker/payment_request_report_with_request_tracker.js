frappe.query_reports["Payment Request Report with Request Tracker"] = {
	"filters": [
		{
			fieldname: "reference_type",
			label: __("Reference Type"),
			fieldtype: "Select",
			options: ["Payment Request", "Payment Requester"],
			default: "Payment Request",
			reqd: 1
		},
		{
			fieldname: "from_date",
			label: __("From Date"),
			fieldtype: "Date",
			default: frappe.datetime.add_months(frappe.datetime.get_today(), -1)
		},
		{
			fieldname: "to_date",
			label: __("To Date"),
			fieldtype: "Date",
			default: frappe.datetime.get_today()
		},
		{
			fieldname: "amount_paid",
			label: __("Amount Paid"),
			fieldtype: "Select",
			options: ["", "Full Paid", "Unpaid"],
			default: ""
		}
	]
};
