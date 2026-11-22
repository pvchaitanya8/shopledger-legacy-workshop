'use strict';

var test = require('node:test');
var assert = require('node:assert/strict');
var pricing = require('../lib/pricing');
var invoice = require('../lib/invoice');
var reports = require('../lib/reports');

test('invoice GST breakdown and total match the amount billed for an HSN coupon order', function () {
  var items = [
    { id: 1, name: 'Rice', sku: 'GRN-001', hsn: '1006', price: 640, qty: 1 },
    { id: 8, name: 'Tea', sku: 'BEV-001', hsn: '0902', price: 140, qty: 2 }
  ];
  var order = { id: 41, items: items, coupon: 'SAVE10' };
  var billed = pricing.computeTotals(items, order.coupon);
  var invoiced = invoice.computeInvoiceFigures(order);

  assert.equal(invoiced.subtotal, billed.subtotal);
  assert.equal(invoiced.discount, billed.discount);
  assert.equal(invoiced.tax, billed.tax);
  assert.equal(invoiced.cgst, billed.cgst);
  assert.equal(invoiced.sgst, billed.sgst);
  assert.equal(invoiced.total, billed.total);
  assert.deepEqual(invoiced.rows.map(function (line) {
    return [line.gstPercent, line.lineTax];
  }), billed.lines.map(function (line) { return [line.gstPercent, line.tax]; }));
});

test('CURRENT BEHAVIOUR: order pricing applies HSN rates and apportions coupon before GST', function () {
  var items = [
    { id: 1, name: 'Rice', hsn: '1006', price: 640, qty: 1 },
    { id: 8, name: 'Tea', hsn: '0902', price: 140, qty: 2 }
  ];

  var result = pricing.computeTotals(items, 'SAVE10');

  assert.deepEqual({
    subtotal: result.subtotal,
    discount: result.discount,
    taxable: result.taxable,
    tax: result.tax,
    cgst: result.cgst,
    sgst: result.sgst,
    total: result.total
  }, {
    subtotal: 920,
    discount: 92,
    taxable: 828,
    tax: 74.16,
    cgst: 37.08,
    sgst: 37.08,
    total: 902.16
  });
  assert.deepEqual(result.lines.map(function (line) {
    return [line.gstPercent, line.discount, line.taxable, line.tax];
  }), [[5, 64, 576, 28.8], [18, 28, 252, 45.36]]);
});

test('invoice uses HSN tax rates when order lines do not store gstRate', function () {
  var order = {
    id: 42,
    items: [{ id: 1, name: 'Rice', hsn: '1006', price: 640, qty: 1 }],
    coupon: ''
  };

  var billed = pricing.computeTotals(order.items, '');
  var invoiced = invoice.computeInvoiceFigures(order);

  assert.equal(billed.tax, 32);
  assert.equal(billed.total, 672);
  assert.equal(invoiced.rows[0].gstPercent, 5);
  assert.equal(invoiced.tax, billed.tax);
  assert.equal(invoiced.total, billed.total);
});

test('invoice uses the billed coupon amount and tax basis including maxDiscount', function () {
  var order = {
    id: 43,
    items: [{ id: 1, name: 'Rice', hsn: '1006', price: 2240, qty: 1 }],
    coupon: 'SAVE10'
  };

  var billed = pricing.computeTotals(order.items, 'SAVE10');
  var invoiced = invoice.computeInvoiceFigures(order);

  assert.equal(billed.discount, 150);
  assert.equal(billed.tax, 104.5);
  assert.equal(billed.total, 2194.5);
  assert.equal(invoiced.discount, billed.discount);
  assert.equal(invoiced.tax, billed.tax);
  assert.equal(invoiced.total, billed.total);
});

test('reconciliation reports a match when invoice agrees with the amount billed', function () {
  var order = {
    id: 44,
    date: '01/01/2024',
    customer: 'Walk-in',
    status: 'completed',
    items: [{ id: 1, name: 'Rice', hsn: '1006', price: 640, qty: 1 }],
    coupon: '',
    subtotal: 640,
    discount: 0,
    tax: 32,
    total: 672
  };
  var db = { orders: [order] };

  var result = reports.getGstReconciliation(db);

  assert.equal(result.totalChecked, 1);
  assert.equal(result.mismatchCount, 0);
  assert.equal(result.rows[0].invoiceTax, 32);
  assert.equal(result.rows[0].invoiceTotal, 672);
  assert.equal(result.rows[0].delta, 0);
  assert.equal(result.rows[0].matched, true);
});

test('rendered invoice omits the mismatch notice when invoice agrees with billed total', function () {
  var html = invoice.render({
    id: 45,
    date: '01/01/2024',
    status: 'completed',
    items: [{ id: 1, name: 'Rice', hsn: '1006', price: 640, qty: 1 }],
    coupon: '',
    total: 672
  });

  assert.doesNotMatch(html, /Accountant Reconciliation Notice/);
  assert.match(html, /Invoice Total</);
});
