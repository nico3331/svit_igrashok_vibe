import { Router } from 'express';
import { assert, integer, text } from './security.js';
import { transaction } from './db.js';
import { preparePayment } from './payments.js';

export function getCart(db, userId) {
  const items = db
    .prepare(
      `SELECT p.*, c.quantity FROM cart_items c JOIN products p ON p.id=c.product_id WHERE c.user_id=? ORDER BY p.id`,
    )
    .all(userId);
  return { items, total: items.reduce((sum, p) => sum + p.price * p.quantity, 0) };
}
export function orderDetail(db, id) {
  const order = db.prepare('SELECT * FROM orders WHERE id=?').get(id);
  return order
    ? { ...order, items: db.prepare('SELECT * FROM order_items WHERE order_id=?').all(id) }
    : null;
}
export const transitions = {
  new: ['confirmed', 'cancelled'],
  confirmed: ['shipped', 'completed', 'cancelled'],
  shipped: ['completed'],
  completed: [],
  cancelled: [],
};
export function changeOrderStatus(db, id, status) {
  return transaction(db, () => {
    const order = orderDetail(db, id);
    assert(order, 'Замовлення не знайдено.', 404);
    assert(
      transitions[order.status].includes(status),
      'Цей перехід статусу замовлення недоступний.',
    );
    if (status === 'cancelled')
      for (const item of order.items)
        db.prepare('UPDATE products SET stock=stock+? WHERE id=?').run(
          item.quantity,
          item.product_id,
        );
    db.prepare('UPDATE orders SET status=?, payment_status=? WHERE id=?').run(
      status,
      status === 'completed' ? 'paid' : order.payment_status,
      id,
    );
    return orderDetail(db, id);
  });
}
export function customerRouter(db) {
  const router = Router();
  router.get('/cart', (req, res) => res.json(getCart(db, req.user.id)));
  router.put('/cart/:id', (req, res) => {
    const id = integer(Number(req.params.id), 'Товар', 1);
    const quantity = integer(req.body.quantity, 'Кількість', 0, 99);
    if (quantity === 0)
      db.prepare('DELETE FROM cart_items WHERE user_id=? AND product_id=?').run(req.user.id, id);
    else {
      const product = db.prepare('SELECT * FROM products WHERE id=? AND active=1').get(id);
      assert(product, 'Товар недоступний.', 404);
      assert(product.stock >= quantity, 'Недостатньо товару на складі.', 409);
      db.prepare(
        'INSERT INTO cart_items(user_id,product_id,quantity) VALUES (?,?,?) ON CONFLICT(user_id,product_id) DO UPDATE SET quantity=excluded.quantity',
      ).run(req.user.id, id, quantity);
    }
    res.json(getCart(db, req.user.id));
  });
  router.get('/favorites', (req, res) =>
    res.json(
      db
        .prepare('SELECT product_id FROM favorites WHERE user_id=?')
        .all(req.user.id)
        .map((x) => x.product_id),
    ),
  );
  router.put('/favorites/:id', (req, res) => {
    const id = integer(Number(req.params.id), 'Товар', 1);
    assert(
      db.prepare('SELECT id FROM products WHERE id=? AND active=1').get(id),
      'Товар недоступний.',
      404,
    );
    assert(typeof req.body.saved === 'boolean', 'Вкажіть стан обраного.');
    if (req.body.saved)
      db.prepare('INSERT OR IGNORE INTO favorites(user_id,product_id) VALUES (?,?)').run(
        req.user.id,
        id,
      );
    else db.prepare('DELETE FROM favorites WHERE user_id=? AND product_id=?').run(req.user.id, id);
    res.json({ saved: req.body.saved });
  });
  router.get('/orders', (req, res) =>
    res.json(
      db
        .prepare('SELECT id FROM orders WHERE user_id=? ORDER BY id DESC')
        .all(req.user.id)
        .map((x) => orderDetail(db, x.id)),
    ),
  );
  router.post('/orders', (req, res) => {
    const body = req.body;
    const key = text(req.get('Idempotency-Key'), 'Ідентифікатор замовлення', 80, 16);
    const name = text(body.name, 'Ім’я', 80, 2);
    const phone = text(body.phone, 'Телефон', 30, 10);
    assert(
      /^\+?[\d\s()-]{10,25}$/.test(phone) && phone.replace(/\D/g, '').length >= 10,
      'Вкажіть коректний телефон.',
    );
    assert(['pickup', 'delivery'].includes(body.delivery), 'Оберіть спосіб доставки.');
    const address = body.delivery === 'pickup' ? 'Самовивіз' : text(body.address, 'Адреса', 300, 8);
    const note = text(body.note || '', 'Коментар', 1000, 0);
    assert(body.payment === 'offline', 'Цей спосіб оплати ще недоступний.');
    const order = transaction(db, () => {
      const existing = db
        .prepare('SELECT id FROM orders WHERE user_id=? AND request_key=?')
        .get(req.user.id, key);
      if (existing) return orderDetail(db, existing.id);
      const { items, total } = getCart(db, req.user.id);
      assert(items.length > 0, 'Кошик порожній.');
      for (const item of items)
        assert(
          item.active && item.stock >= item.quantity,
          `Недостатньо товару «${item.title}». Оновіть кошик.`,
          409,
        );
      const payment = preparePayment(body.payment);
      const result = db
        .prepare(
          `INSERT INTO orders(user_id,request_key,customer_name,phone,delivery_method,address,note,total,payment_provider,payment_status) VALUES (?,?,?,?,?,?,?,?,?,?)`,
        )
        .run(
          req.user.id,
          key,
          name,
          phone,
          body.delivery,
          address,
          note,
          total,
          payment.provider,
          payment.status,
        );
      const id = Number(result.lastInsertRowid);
      for (const item of items) {
        db.prepare(
          'INSERT INTO order_items(order_id,product_id,title,image,price,quantity) VALUES (?,?,?,?,?,?)',
        ).run(id, item.id, item.title, item.image, item.price, item.quantity);
        const updated = db
          .prepare('UPDATE products SET stock=stock-? WHERE id=? AND stock>=?')
          .run(item.quantity, item.id, item.quantity);
        assert(updated.changes === 1, 'Залишок товару змінився. Повторіть замовлення.', 409);
      }
      db.prepare('DELETE FROM cart_items WHERE user_id=?').run(req.user.id);
      return orderDetail(db, id);
    });
    res.status(201).json(order);
  });
  return router;
}
