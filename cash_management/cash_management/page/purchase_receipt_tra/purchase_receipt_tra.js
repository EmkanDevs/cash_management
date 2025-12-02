frappe.pages['purchase-receipt-tra'].on_page_load = function (wrapper) {
    let page = frappe.ui.make_app_page({
        parent: wrapper,
        title: 'Payment Requests and Trackers',
        single_column: true
    });
    // 🔑 Compute last month dates
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

    // 🔑 Add button above filters
    const { from_date, to_date } = getLastMonthRange();
    const report_url = `/app/query-report/Payment%20Request%20Report%20with%20Request%20Tracker?from_date=${from_date}&to_date=${to_date}`;

    const report_button = $(`
        <div class="mb-3">
            <a href="${report_url}" class="btn btn-primary" target="_blank">
                Open Payment Request Tracker Report
            </a>
        </div>
    `).prependTo(page.main);
    // filters + containers
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

    const filters_container = $("<div class='mb-3'></div>").appendTo(page.main);
    const table_container = $("<div class='purchase-receipt-tra-table'></div>").appendTo(page.main);

    // Restore page-level Refresh button
    page.add_inner_button(__('Refresh'), function() {
        loadData();
    });

    // FieldGroup
    this.form = new frappe.ui.FieldGroup({
        fields: [
            {
                fieldtype: 'Section Break',
                label: 'Filters',
                collapsible: 0
            },
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
                    if (!selected_doctype) {
                        frappe.throw(__('Please select Reference Doctype first'));
                    }
                    return {
                        doctype: selected_doctype,
                        filters: {}
                    };
                }
            },

            { fieldtype: 'Section Break' },
            { fieldtype: 'Link', label: 'Supplier', fieldname: 'supplier', options: 'Supplier' },

            { fieldtype: 'Column Break' },
            { fieldtype: 'Date', label: 'From Date', fieldname: 'from_date' },

            { fieldtype: 'Column Break' },
            { fieldtype: 'Date', label: 'To Date', fieldname: 'to_date' },

            { fieldtype: 'Section Break' },
            { fieldtype: 'Check', label: 'Show Fully Paid Only', fieldname: 'only_fully_paid' },

            { fieldtype: 'Column Break' },
            { fieldtype: 'Check', label: 'Show Unpaid Only', fieldname: 'only_unpaid' }
        ],
        body: filters_container[0]
    });
    this.form.make();

    // wire up onchange handlers after make()
    const fg = this.form;

    if (fg.fields_dict.payment_request) {
        fg.fields_dict.payment_request.df.onchange = function() {
            filters.payment_request = this.value || '';
            loadData();
        };
    }

    fg.fields_dict.reference_doctype.df.onchange = function () {
        filters.reference_doctype = this.value || '';
        // Clear the old value of Reference Name
        fg.fields_dict.reference_name.set_value('');
        // Update the options for Reference Name dynamically
        fg.fields_dict.reference_name.df.options = filters.reference_doctype;
        fg.refresh_field('reference_name');
        loadData();
    };

    fg.fields_dict.reference_name.df.onchange = function() {
        filters.reference_name = this.value || '';
        loadData();
    };

    fg.fields_dict.supplier.df.onchange = function() {
        filters.supplier = this.value || '';
        loadData();
    };
    fg.fields_dict.from_date.df.onchange = function() {
        filters.from_date = this.value || '';
        loadData();
    };
    fg.fields_dict.to_date.df.onchange = function() {
        filters.to_date = this.value || '';
        loadData();
    };
    fg.fields_dict.only_fully_paid.df.onchange = function() {
        filters.only_fully_paid = this.value ? 1 : 0;
        loadData();
    };
    fg.fields_dict.only_unpaid.df.onchange = function() {
        filters.only_unpaid = this.value ? 1 : 0;
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

    // renderTable (unchanged)
	function renderTable(data) {
		let rows = data.map(row => {
			let tracker_html = "—";
			if (row.tracker) {
				tracker_html = `
					<a href="/app/payment-request-tracker/${row.tracker}">${row.tracker}</a>
					<br>
					<button class="btn btn-xs btn-secondary view-tracker" data-tracker="${row.tracker}" data-grand-total="${row.grand_total || 0}">
						View Table
					</button>
				`;
			}
	
			const refLink = (row.reference_doctype && row.reference_name)
				? `<a href="/app/${frappe.router.slug(row.reference_doctype)}/${row.reference_name}">${row.reference_name}</a>`
				: (row.reference_name || "—");
	
			const supplierBlock = (() => {
				const supplierHtml = row.supplier_id
					? `<a href="/app/supplier/${row.supplier_id}">${row.supplier_name || row.supplier_id}</a>`
					: (row.supplier_name || "—");
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
	
			// Purchase Order Remaining column
			let poRemainingValue = "—";
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
	
			return `
				<tr>
					<td>${refLink}</td>
					<td>${row.reference_doctype || "—"}</td>
					<td>${frappe.format(row.po_grand_total || 0, {fieldtype: "Currency"})}</td>
					<td>${poRemainingValue}</td>
					<td><a href="/app/payment-request/${row.payment_request}">${row.payment_request}</a></td>
					<td>${frappe.format(row.grand_total || 0, {fieldtype: "Currency"})}</td>
					<td>${remainingValue}</td>
					<td>${supplierBlock}</td>
					<td>${tracker_html}</td>
				</tr>
			`;
		}).join("");
	
		let html = `
			<table class="table table-bordered">
				<thead>
					<tr>
						<th>Reference Name</th>
						<th>Reference Doctype</th>
						<th>Purchase Order Amount</th>
						<th>PO Remaining</th>
						<th>Payment Request</th>
						<th>Grand Total</th>
						<th>PR Remaining</th>
						<th>Supplier</th>
						<th>Payment Request Tracker</th>
					</tr>
				</thead>
				<tbody>${rows}</tbody>
			</table>
		`;
	
		$(table_container).html(html);
	
		// Attach click handler for View Table (tracker) — delegated
		$(table_container).off("click", ".view-tracker").on("click", ".view-tracker", function () {
			let tracker_name = $(this).data("tracker");
			let grand_total = parseFloat($(this).data("grandTotal")) || 0;
		
			frappe.call({
				method: "cash_management.cash_management.page.purchase_receipt_tra.purchase_receipt_tra.get_tracker_child_table",
				args: { tracker_name },
				callback: function (res) {
					if (!res.message) return;
					let child_rows = res.message.child_rows || [];
					let totals = res.message.totals || {};
					let payment_entries = res.message.payment_entries || [];
		
					// helpers to render tables
					const renderReadOnlyTable = (rows) => {
						if (!rows.length) return "<p>No child rows found.</p>";
						return `
							<table class="table table-bordered">
								<thead>
									<tr>
										<th>Transaction Date</th>
										<th>Paid %</th>
										<th>Paid Amount</th>
									</tr>
								</thead>
								<tbody>
									${rows.map(c => {
										const paidPct = formatPct(c.paid_amount, grand_total);
										return `<tr>
											<td>${c.transaction_date || "—"}</td>
											<td>${c.paid || 0}</td>
											<td>${c.paid_amount || 0}${paidPct}</td>
										</tr>`;
									}).join("")}
								</tbody>
							</table>
							<p class="text-muted mt-2 mb-0">Click <b>Edit</b> to modify rows.</p>
						`;
					};
		
					const renderPaymentEntriesTable = (entries) => {
						if (!entries.length) return "<p>No Payment Entries found for this Payment Request.</p>";
						return `
							<table class="table table-bordered">
								<thead>
									<tr>
										<th>Payment Entry</th>
										<th>Posting Date</th>
										<th>Paid Amount</th>
										<th>Party</th>
										<th>Mode of Payment</th>
										<th>Status</th>
									</tr>
								</thead>
								<tbody>
									${entries.map(e => {
										const pePct = formatPct(e.paid_amount, grand_total);
										return `<tr>
											<td><a href="/app/payment-entry/${e.name}">${e.name}</a></td>
											<td>${e.posting_date || "—"}</td>
											<td>${e.paid_amount || 0}${pePct}</td>
											<td>${e.party || "—"}</td>
											<td>${e.mode_of_payment || "—"}</td>
											<td>${e.status || "—"}</td>
										</tr>`;
									}).join("")}
								</tbody>
							</table>
						`;
					};
		
					const renderEditableTable = (rows) => {
						return `
							<div class="tracker-edit-wrap" style="overflow:auto;">
								<table class="table table-bordered edit-table mb-3">
									<thead>
										<tr>
											<th>Transaction Date</th>
											<th>Paid</th>
											<th>Paid Amount</th>
											<th>Actions</th>
										</tr>
									</thead>
									<tbody>
										${(rows.length ? rows : [{}]).map(c => `<tr>
											<td><input type="date" class="form-control" data-field="transaction_date" value="${c.transaction_date || ""}"></td>
											<td><input type="number" class="form-control" data-field="paid" value="${c.paid ?? 0}"></td>
											<td><input type="number" class="form-control" data-field="paid_amount" value="${c.paid_amount ?? 0}"></td>
											<td style="width:1%;white-space:nowrap;">
												<button class="btn btn-danger btn-sm remove-row">Remove</button>
											</td>
										</tr>`).join("")}
									</tbody>
								</table>
								<div class="d-flex justify-content-between">
									<button class="btn btn-success add-row">+ Add Row</button>
									<button class="btn btn-primary save-edits">Save Changes</button>
								</div>
							</div>
						`;
					};
		
					// build dialog
					let d = new frappe.ui.Dialog({
						title: `Tracker Details: ${tracker_name}`,
						size: "extra-large",
						fields: [
							{ fieldtype: "Float", fieldname: "total_amount_paid", label: "Total Amount Paid", default: totals.total_amount_paid || 0, read_only: 1 },
							{ fieldtype: "Float", fieldname: "total_amount_remaining", label: "Total Amount Remaining", default: totals.total_amount_remaining || 0, read_only: 1 },
							{ fieldtype: "Button", fieldname: "refresh_details", label: "Refresh Details", click: function() {
								frappe.call({
									method: "cash_management.cash_management.page.purchase_receipt_tra.purchase_receipt_tra.get_tracker_child_table",
									args: { tracker_name },
									callback: function(res2) {
										if (!res2.message) return;
										child_rows = res2.message.child_rows || [];
										totals = res2.message.totals || [];
										payment_entries = res2.message.payment_entries || [];
										d.set_value("total_amount_paid", totals.total_amount_paid || 0);
										d.set_value("total_amount_remaining", totals.total_amount_remaining || 0);
										d.fields_dict.child_table_html.$wrapper.html(renderReadOnlyTable(child_rows));
										d.fields_dict.payment_entries_html.$wrapper.html(renderPaymentEntriesTable(payment_entries));
									}
								});
							}},
							{ fieldtype: "HTML", fieldname: "child_table_html", options: renderReadOnlyTable(child_rows) },
							{ fieldtype: "HTML", fieldname: "payment_entries_html", options: renderPaymentEntriesTable(payment_entries) }
						],
						primary_action_label: "Close",
						primary_action() { d.hide(); },
						secondary_action_label: "Edit",
						secondary_action() {
							d.set_df_property("total_amount_paid", "read_only", 0);
							d.set_df_property("total_amount_remaining", "read_only", 0);
							d.refresh_fields(["total_amount_paid","total_amount_remaining"]);
							const $wrap = d.fields_dict.child_table_html.$wrapper;
							$wrap.html(renderEditableTable(child_rows));
		
							// Add/remove/save handlers
							$wrap.off("click", ".add-row").on("click", ".add-row", function () {
								$wrap.find(".edit-table tbody").append(`
									<tr>
										<td><input type="date" class="form-control" data-field="transaction_date"></td>
										<td><input type="number" class="form-control" data-field="paid" value="0"></td>
										<td><input type="number" class="form-control" data-field="paid_amount" value="0"></td>
										<td><button class="btn btn-danger btn-sm remove-row">Remove</button></td>
									</tr>
								`);
							});
							$wrap.off("click", ".remove-row").on("click", ".remove-row", function () { $(this).closest("tr").remove(); });
		
							$wrap.off("click", ".save-edits").on("click", ".save-edits", function () {
								let updated_rows = [];
								$wrap.find(".edit-table tbody tr").each(function() {
									let row = {};
									$(this).find("input").each(function() {
										row[$(this).data("field")] = $(this).val();
									});
									updated_rows.push(row);
								});
		
								let totals_payload = {
									total_amount_paid: d.get_value("total_amount_paid"),
									total_amount_remaining: d.get_value("total_amount_remaining")
								};
		
								frappe.call({
									method: "cash_management.cash_management.page.purchase_receipt_tra.purchase_receipt_tra.update_tracker_child_table",
									args: { tracker_name: tracker_name, rows: updated_rows, totals: totals_payload },
									callback: function(res) {
										if (!res.exc) {
											frappe.msgprint("Tracker updated successfully");
											d.hide();
											loadData(); // refresh main table
										}
									}
								});
							});
						}
					});
		
					// show dialog first so footer buttons are rendered
					d.show();
		
					// 🔑 Hide Edit if PR Remaining is 0
					const prRemaining = totals.total_amount_remaining || 0;
					if (prRemaining <= 0) {
						try {
							if (typeof d.get_secondary_btn === 'function') {
								const $sec = d.get_secondary_btn();
								if ($sec && $sec.length) {
									$sec.hide();
								}
							}
						} catch (e) {
							// ignore
						}

						// fallback: find the button by text "Edit" (case-insensitive)
						if (d.$wrapper && d.$wrapper.find) {
							d.$wrapper.find('.modal-footer button').filter(function() {
								return $(this).text().trim().toLowerCase() === 'edit';
							}).hide();
						}

						// optional: add a short notice so user knows why editing is disabled
						if (d.fields_dict && d.fields_dict.child_table_html) {
							d.fields_dict.child_table_html.$wrapper.prepend(
								'<div class="alert alert-info mb-2">Editing disabled because Purchase Request is paid off</div>'
							);
						}

						console.log("PR Remaining = 0 → hiding Edit button");
					}
				}
			});
		});			
    }

    // loadData: call your original python method
    function loadData() {
        frappe.call({
            method: "cash_management.cash_management.page.purchase_receipt_tra.purchase_receipt_tra.get_payment_request_entries",
            args: Object.assign({}, filters),
            callback: function (r) {
                renderTable(r.message || []);
            }
        });
    }

    // initial load
    loadData();
};
