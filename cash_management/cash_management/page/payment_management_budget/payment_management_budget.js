frappe.pages['payment-management-budget'].on_page_load = function (wrapper) {
	let page = frappe.ui.make_app_page({
		parent: wrapper,
		title: 'Cash Management Budget',
		single_column: true
	});

	// 🔹 Tabs
	const tabs_html = `
		<ul class="nav nav-tabs mb-4" id="doctypeTabs">
			<li class="nav-item">
				<a class="nav-link active" data-doctype="Sales Order" href="#">Sales Order</a>
			</li>
			<li class="nav-item">
				<a class="nav-link" data-doctype="Purchase Order" href="#">Purchase Order</a>
			</li>
			<li class="nav-item">
				<a class="nav-link" data-doctype="Invoice Released Memo" href="#">Other Payment Requests</a>
			</li>
		</ul>
	`;
	$(tabs_html).prependTo(page.main);

	// 🔹 State
	let active_tab_doctype = "Sales Order";
	let suppressOnChange = false;

	// 🔹 Default filters
	let filters = {
		payment_request: '',
		reference_doctype: '',
		reference_name: '',
		supplier: '',
		from_date: '',
		to_date: '',
		only_fully_paid: 0,
		only_unpaid: 0
	};

	// 🔹 Report shortcut button
	function getLastMonthRange() {
		const now = new Date();
		const firstDayThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
		const lastDayLastMonth = new Date(firstDayThisMonth - 1);
		const firstDayLastMonth = new Date(lastDayLastMonth.getFullYear(), lastDayLastMonth.getMonth(), 1);
		const formatDate = d => d.toISOString().split('T')[0];
		return {
			from_date: formatDate(firstDayLastMonth),
			to_date: formatDate(lastDayLastMonth)
		};
	}

	const { from_date, to_date } = getLastMonthRange();
	const report_url = `/app/query-report/Payment%20Request%20Report%20with%20Request%20Tracker?from_date=${from_date}&to_date=${to_date}`;
	$(`<div class="mb-3">
        <a href="${report_url}" class="btn btn-primary" target="_blank">
            Open Payment Request Tracker Report
        </a>
    </div>`).prependTo(page.main);

	// 🔹 Containers
	const filters_container = $("<div class='mb-3'></div>").appendTo(page.main);
	const table_container = $("<div class='purchase-receipt-tra-table'></div>").appendTo(page.main);

	// 🔹 Refresh button
	page.add_inner_button(__('Refresh'), function () {
		Object.keys(filters).forEach(k => {
			if (typeof filters[k] === 'number') filters[k] = 0;
			else filters[k] = '';
		});
		loadData();
	});

	// 🔹 Send Notification button
	page.add_inner_button(__('Send Notification'), function () {
		frappe.confirm(__('Are you sure you want to send notifications to all users with enabled roles in Cash Management Budget?'), function () {
			frappe.call({
				method: 'cash_management.cash_management.page.payment_management_budget.payment_management_budget.process_email_notification',
				freeze: true,
				freeze_message: __('Sending...'),
				callback: function (r) {
					// Success handled by Python
				}
			});
		});
	});

	// 🔹 FieldGroup creation
	this.form = new frappe.ui.FieldGroup({
		fields: [
			// ------------------------- SECTION 1 (2 fields) -------------------------
			{ fieldtype: 'Section Break', collapsible: 0 },

			{ fieldtype: 'Date', label: 'From Date', fieldname: 'from_date' },
			{ fieldtype: 'Column Break' },

			{ fieldtype: 'Date', label: 'To Date', fieldname: 'to_date' },
			{ fieldtype: 'Column Break' },

			{ fieldtype: 'Currency', label: 'Budget', fieldname: 'budget', read_only: 1 },


			// ------------------------- SECTION 2 (2 fields) -------------------------
			{ fieldtype: 'Section Break', },

			{ fieldtype: 'Link', label: 'Supplier', fieldname: 'supplier', options: 'Supplier' },
			{ fieldtype: 'Column Break' },

			{ fieldtype: 'Currency', label: 'Target Budget', fieldname: 'target_budget' },
			{ fieldtype: 'Column Break' },

			{ fieldtype: 'Currency', label: 'Remaining Budget', fieldname: 'remaining_budget', read_only: 1 },


			// ------------------------- SECTION 3 (3 fields) -------------------------
			{ fieldtype: 'Section Break', },

			{ fieldtype: 'Link', label: 'Payment Request', fieldname: 'payment_request', options: 'Payment Request' },
			{ fieldtype: 'Column Break' },

			{ fieldtype: 'Link', label: 'Reference Doctype', fieldname: 'reference_doctype', options: 'DocType' },
			{ fieldtype: 'Column Break' },

			{
				fieldtype: 'Link',
				label: 'Reference Name',
				fieldname: 'reference_name',
				options: '',
				get_query: function () {
					const selected_doctype = filters.reference_doctype;
					if (!selected_doctype) frappe.throw(__('Please select Reference Doctype first'));
					return { doctype: selected_doctype, filters: {} };
				}
			},


			// ------------------------- SECTION 4 (2 fields) -------------------------
			{ fieldtype: 'Section Break', label: 'Status Filters' },

			{ fieldtype: 'Check', label: 'Show Fully Paid Only', fieldname: 'only_fully_paid' },
			{ fieldtype: 'Column Break' },

			{ fieldtype: 'Check', label: 'Show Unpaid Only', fieldname: 'only_unpaid', default: 1 }
		],
		body: filters_container[0]
	});
	this.form.make();

	let today = frappe.datetime.get_today();
	let week_ago = frappe.datetime.add_days(today, -7);

	// Set values in UI fields
	this.form.set_value("from_date", week_ago);
	this.form.set_value("to_date", today);

	// Update internal filters
	filters.from_date = week_ago;
	filters.to_date = today;

	// ✅ Define fg AFTER make()
	const fg = this.form;

	// 🔹 Hook up onchange handlers safely
	if (fg.fields_dict.payment_request) {
		fg.fields_dict.payment_request.df.onchange = function () {
			filters.payment_request = this.value || '';
			loadData();
		};
	}

	fg.fields_dict.reference_doctype.df.onchange = function () {
		if (suppressOnChange) return;
		filters.reference_doctype = this.value || '';
		fg.fields_dict.reference_name.set_value('');
		fg.fields_dict.reference_name.df.options = filters.reference_doctype;
		fg.refresh_field('reference_name');
		loadData();
	};

	fg.fields_dict.reference_name.df.onchange = function () {
		filters.reference_name = this.value || '';
		loadData();
	};

	fg.fields_dict.supplier.df.onchange = function () {
		filters.supplier = this.value || '';
		loadData();
	};
	if (fg.fields_dict.target_budget) {
		fg.fields_dict.target_budget.df.onchange = function () {
			updateRemainingBudget();
		};
	}
	fg.fields_dict.from_date.df.onchange = function () {
		filters.from_date = this.value || '';
		loadData();
	};
	fg.fields_dict.to_date.df.onchange = function () {
		filters.to_date = this.value || '';
		loadData();
	};
	fg.fields_dict.only_fully_paid.df.onchange = function () {
		if (this.value) {
			fg.fields_dict.only_unpaid.set_value(0);
		}
		filters.only_fully_paid = this.value ? 1 : 0;
		filters.only_unpaid = fg.fields_dict.only_unpaid.value ? 1 : 0;
		loadData();
	};
	fg.fields_dict.only_unpaid.df.onchange = function () {
		if (this.value) {
			fg.fields_dict.only_fully_paid.set_value(0);
		}
		filters.only_unpaid = this.value ? 1 : 0;
		filters.only_fully_paid = fg.fields_dict.only_fully_paid.value ? 1 : 0;
		loadData();
	};

	// helpers
	function formatPct(numerator, denominator) {
		const num = parseFloat(numerator || 0);
		const den = parseFloat(denominator || 0);
		if (!den || !isFinite(den) || !isFinite(num)) return '';
		const pct = (num / den) * 100;
		return ` (${pct.toFixed(1)}%)`;
	}

	function updateRemainingBudget() {
		const target = parseFloat(fg.get_value('target_budget')) || 0;
		const budget = parseFloat(fg.get_value('budget')) || 0;
		fg.set_value('remaining_budget', target - budget);
	}

	// renderTable (unchanged)
	function renderTable(data) {
		// 🔹 Dynamic column labels based on active tab
		let amountLabel = "Purchase Order Amount";
		let remainingLabel = "PO Remaining";

		if (active_tab_doctype === "Invoice Released Memo") {
			amountLabel = "Reference Doctype Amount";
			remainingLabel = "Remaining";
		} else if (active_tab_doctype === "Sales Order") {
			amountLabel = "Sales Order Amount";
			remainingLabel = "SO Remaining";
		}

		let rows = data.map(row => {
			const refLink = (row.reference_doctype && row.reference_name)
				? `<a href="/app/${frappe.router.slug(row.reference_doctype)}/${row.reference_name}">${row.reference_name}</a>`
				: (row.reference_name || "NA");

			const supplierBlock = (() => {
				const supplierHtml = row.supplier_id
					? `<a href="/app/supplier/${row.supplier_id}">${row.supplier_name || row.supplier_id}</a>`
					: (row.supplier_name || "NA");
				const termsHtml = row.payment_terms ? `<div class="text-muted" style="font-size:12px;">Terms: ${row.payment_terms}</div>` : "";
				return `${supplierHtml}${termsHtml}`;
			})();

			// Payment Request Remaining column
			const remainingAmount = row.total_amount_remaining || 0;
			const pctRemaining = row.grand_total ? (remainingAmount / row.grand_total) * 100 : 0;
			const pctPaid = 100 - pctRemaining;
			const remainingValue = `
				<div style="display:flex; flex-direction:column; gap:2px;">
					<div>${remainingAmount}${formatPct(remainingAmount, row.grand_total)}</div>
					<div style="display:flex; width:100%; height:10px; border-radius:4px; overflow:hidden; background:#ccc;">
						<div style="width:${pctPaid}%; background:green; height:100%;"></div>
						<div style="width:${pctRemaining}%; background:red; height:100%;"></div>
					</div>
				</div>
			`;

			// Purchase Order or Invoice Released Memo Remaining column
			let poRemainingValue = "NA";
			if (row.po_grand_total != null) {
				const poPaid = row.po_grand_total - (row.po_remaining || 0);
				const poPctRemaining = row.po_grand_total ? (row.po_remaining / row.po_grand_total) * 100 : 0;
				const poPctPaid = 100 - poPctRemaining;

				poRemainingValue = `
					<div style="display:flex; flex-direction:column; gap:2px;">
						<div>${row.po_remaining}${formatPct(row.po_remaining, row.po_grand_total)}</div>
						<div style="display:flex; width:100%; height:10px; border-radius:4px; overflow:hidden; background:#ccc;">
							<div style="width:${poPctPaid}%; background:green; height:100%;"></div>
							<div style="width:${poPctRemaining}%; background:red; height:100%;"></div>
						</div>
					</div>
				`;
			}

			// Tracker link
			const trackerLink = row.tracker
				? `<a href="/app/payment-request-tracker/${row.tracker}">${row.tracker}</a>`
				: "NA";

			// Budget input field
			const budgetValue = row.budget || row.po_grand_total || 0;
			const budgetInput = row.tracker
				? `<input type="number" class="form-control budget-input" 
						data-tracker="${row.tracker}" 
						value="${budgetValue}" 
						style="width:150px;">`
				: "NA";

			return `
				<tr>
					<td>${refLink}</td>
					<td>${row.reference_doctype || "NA"}</td>
					<td>${frappe.format(row.po_grand_total || 0, { fieldtype: "Currency" })}</td>
					<td>${poRemainingValue}</td>
					<td><a href="/app/payment-request/${row.payment_request}">${row.payment_request}</a></td>
					<td>${frappe.format(row.grand_total || 0, { fieldtype: "Currency" })}</td>
					<td>${remainingValue}</td>
					<td>${supplierBlock}</td>
					<td>${trackerLink}</td>
					<td>${budgetInput}</td>
				</tr>
			`;
		}).join("");

		let html = `
			<table class="table table-bordered">
				<thead>
					<tr>
						<th>Reference Name</th>
						<th>Reference Doctype</th>
						<th>${amountLabel}</th>
						<th>${remainingLabel}</th>
						<th>Payment Request</th>
						<th>Grand Total</th>
						<th>PR Remaining</th>
						<th>Supplier</th>
						<th>Tracker</th>
						<th>Budget</th>
					</tr>
				</thead>
				<tbody>${rows}</tbody>
			</table>
		`;

		$(table_container).html(html);

		// Attach change handler for budget inputs
		$(table_container).off("change", ".budget-input").on("change", ".budget-input", function () {
			const $input = $(this);
			const tracker_name = $input.data("tracker");
			const budget = parseFloat($input.val()) || 0;

			frappe.call({
				method: "cash_management.cash_management.page.payment_management_budget.payment_management_budget.update_tracker_budget",
				args: { tracker_name, budget },
				callback: function (res) {
					if (!res.exc) {
						frappe.show_alert({
							message: `Budget updated to ${frappe.format(budget, { fieldtype: "Currency" })}`,
							indicator: "green"
						}, 3);
						loadData();
					} else {
						frappe.msgprint("Failed to update budget");
					}
				}
			});
		});
	}

	// loadData: call your original python method
	function loadData() {
		frappe.call({
			method:
				active_tab_doctype === "Invoice Released Memo"
					? "cash_management.cash_management.page.payment_management_budget.payment_management_budget.get_payment_requester_entries"
					: active_tab_doctype === "Sales Order"
						? "cash_management.cash_management.page.payment_management_budget.payment_management_budget.get_payment_request_inward_entries"
						: "cash_management.cash_management.page.payment_management_budget.payment_management_budget.get_payment_request_entries",
			args: {
				filters: filters
			},
			freeze: true,
			freeze_message: __("Loading data..."),
			callback: function (r) {
				if (r.message) {
					// Calculate total budget (budget only)
					const total_budget = r.message.reduce((sum, row) => {
						return sum + (parseFloat(row.budget) || 0);
					}, 0);
					fg.set_value('budget', total_budget);
					updateRemainingBudget();

					renderTable(r.message);
				} else {
					fg.set_value('budget', 0);
					updateRemainingBudget();
					table_container.empty().html(`<div class="text-muted">No records found.</div>`);
				}
			}
		});
	}

	// 🔹 Tab switching logic
	$('#doctypeTabs a').on('click', function (e) {
		e.preventDefault();

		const selected = $(this);
		$('#doctypeTabs a').removeClass('active');
		selected.addClass('active');

		const doctype = selected.data('doctype');
		active_tab_doctype = doctype;

		// 🔹 Prevent onchange triggers while switching tabs
		suppressOnChange = true;

		// Clear fields
		if (fg.fields_dict.reference_name) fg.fields_dict.reference_name.set_value('');
		if (fg.fields_dict.payment_request) fg.fields_dict.payment_request.set_value('');

		filters.reference_name = '';
		filters.payment_request = '';

		if (fg.fields_dict.reference_doctype) {
			fg.fields_dict.reference_doctype.set_value('');
		}
		filters.reference_doctype = '';

		// renderReportButton();
		// 🔹 Load new data for this tab
		loadData();

		// 🔹 Re-enable onchange handlers
		setTimeout(() => {
			suppressOnChange = false;
		}, 300);
	});


	// initial load
	loadData();
};