// Copyright (c) 2025, chris.panikulangara@finbyz.tech and contributors
// For license information, please see license.txt

frappe.query_reports["Payment Requester Report with Request Tracker"] = {
	"filters": [
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
