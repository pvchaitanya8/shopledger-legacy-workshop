'use strict';
var test = require('node:test');
var assert = require('node:assert/strict');
var dates = require('../lib/dates');
var orders = require('../lib/orders');
var ledger = require('../lib/ledger');

function order(id, date, customer) {
  return { id: id, date: date, customer: customer || 'Walk-in', status: 'completed' };
}
function database() {
  return { orders: [
    order(1004, '30/01/2022', 'Kalyani Foods'),
    order(1001, '28/12/2021'),
    order(1008, '15/03/2022'),
    order(1007, '04/03/2022'),
    order(1002, '05/01/2022')
  ] };
}
function customerDb() {
  return {
    customers: [{ id: 3, name: 'Meera Joshi', openingBalance: 450, totalBilled: 1982.01, totalSettled: 1200 }],
    settlements: [], nextSettlementId: 501
  };
}

test('sorts Indian display dates chronologically (newest first)', function () {
  assert.deepEqual(orders.list(database(), {}).map(function (o) { return o.id; }), [1008, 1007, 1004, 1002, 1001]);
});
test('inclusive date range with ISO HTML date inputs', function () {
  assert.deepEqual(orders.list(database(), { from: '2022-01-01', to: '2022-01-31' })
    .map(function (o) { return o.id; }), [1004, 1002]);
});
test('date-range filtering works across a calendar year boundary', function () {
  assert.deepEqual(orders.list(database(), { from: '2021-12-28', to: '2022-01-05' })
    .map(function (o) { return o.id; }), [1002, 1001]);
});
test('date filter and customer search preserve order input', function () {
  var data = database();
  var original = data.orders.slice();
  assert.deepEqual(orders.list(data, { search: 'Kalyani', from: '2022-01-01', to: '2022-02-01' })
    .map(function (o) { return o.id; }), [1004]);
  assert.deepEqual(data.orders, original);
});
test('fiscal-year calculations stay compatible with both date formats', function () {
  assert.equal(dates.getFiscalYear('2022-01-15'), 'FY21-22');
  assert.equal(dates.getFiscalYear('02/04/2022'), 'FY22-23');
});
test('numeric-string settlement updates actual numeric balance and entry', function () {
  var data = customerDb();
  var response = ledger.recordSettlement(data, 3, '500', 'upi', 'Partial');
  assert.equal(response.ok, true);
  assert.equal(data.customers[0].totalSettled, 1700);
  assert.equal(data.customers[0].balance, 732.01);
  assert.equal(data.settlements[0].amount, 500);
  assert.equal(data.nextSettlementId, 502);
});
test('invalid and non-positive settlements fail without mutations', function () {
  for (var amount of ['abc', '', ' ', 0, '-1', 'Infinity']) {
    var data = customerDb();
    assert.equal(ledger.recordSettlement(data, 3, amount).ok, false, String(amount));
    assert.equal(data.customers[0].totalSettled, 1200);
    assert.equal(data.settlements.length, 0);
    assert.equal(data.nextSettlementId, 501);
  }
});
test('small decimal payments preserve two-decimal totals', function () {
  var data = customerDb();
  var response = ledger.recordSettlement(data, 3, '0.10');
  assert.equal(response.ok, true);
  assert.equal(data.customers[0].totalSettled, 1200.10);
  assert.equal(data.customers[0].balance, 1231.91);
});
