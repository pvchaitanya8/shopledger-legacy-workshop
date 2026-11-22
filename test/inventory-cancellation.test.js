'use strict';
var test = require('node:test');
var assert = require('node:assert/strict');
var inventory = require('../lib/inventory');
var orders = require('../lib/orders');

function product(stock, reserved) {
  return { id: 1, name: 'A2 Gir Cow Ghee', stock: stock, reserved: reserved };
}
function db(stock, reserved, qty) {
  return {
    products: [product(stock, reserved)],
    orders: [{ id: 1007, status: 'pending', paymentMode: 'cash', items: [{ id: 1, qty: qty }] }]
  };
}
test('allows selling the exact final sellable unit', function () {
  assert.equal(inventory.check([product(1, 0)], [{ id: 1, qty: 1 }]).ok, true);
});
test('selling reserved stock boundary preserves wholesale reservations', function () {
  var products = [product(4, 3)];
  assert.equal(inventory.check(products, [{ id: 1, qty: 1 }]).ok, true);
  inventory.reserve(products, [{ id: 1, qty: 1 }]);
  assert.equal(products[0].stock, 3);
  assert.equal(products[0].reserved, 3);
  assert.equal(inventory.getSellableStock(products[0]), 0);
});
test('rejects overselling and unknown product ids', function () {
  assert.equal(inventory.check([product(4, 3)], [{ id: 1, qty: 2 }]).ok, false);
  assert.equal(inventory.check([product(4, 3)], [{ id: 9, qty: 1 }]).ok, false);
});
test('rejects duplicate lines whose combined quantity exceeds stock', function () {
  assert.equal(inventory.check([product(2, 0)], [{ id: 1, qty: 2 }, { id: 1, qty: 1 }]).ok, false);
});
test('cancelling returns committed units to physical stock, not to reserved stock', function () {
  var data = db(2, 1, 2);
  assert.equal(orders.cancel(data, 1007).ok, true);
  assert.equal(data.products[0].stock, 4);
  assert.equal(data.products[0].reserved, 1);
  assert.equal(inventory.getSellableStock(data.products[0]), 3);
});
test('cancelled order cannot restore stock twice', function () {
  var data = db(0, 0, 2);
  assert.equal(orders.cancel(data, 1007).ok, true);
  assert.equal(data.products[0].stock, 2);
  assert.equal(orders.cancel(data, 1007).ok, false);
  assert.equal(data.products[0].stock, 2);
});
test('placing and cancelling an order returns stock and reservations to their prior values', function () {
  var data = db(4, 1, 2);
  inventory.reserve(data.products, [{ id: 1, qty: 2 }]);
  assert.equal(data.products[0].stock, 2);
  assert.equal(orders.cancel(data, 1007).ok, true);
  assert.deepEqual({ stock: data.products[0].stock, reserved: data.products[0].reserved }, { stock: 4, reserved: 1 });
});
