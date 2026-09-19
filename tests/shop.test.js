import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, mkdirSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDatabase } from '../server/db.js';
import { createApp } from '../server/app.js';
import { hashPassword } from '../server/security.js';

let db, server, base, customer, admin, other, folder, dbPath;
const headers = { 'X-Requested-With': 'svit-shop' };
async function request(path, { method = 'GET', body, client, extra = {} } = {}) {
  const response = await fetch(base + '/api' + path, {
    method,
    headers: {
      ...headers,
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(client ? { Cookie: client.cookie, 'X-CSRF-Token': client.csrf } : {}),
      ...extra,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return {
    status: response.status,
    data: await response.json(),
    cookie: response.headers.get('set-cookie')?.split(';')[0],
  };
}
async function register(email) {
  const r = await request('/auth/register', {
    method: 'POST',
    body: { name: 'Тестовий Покупець', email, password: 'Test-password-123' },
  });
  assert.equal(r.status, 200);
  return { cookie: r.cookie, csrf: r.data.csrfToken, id: r.data.user.id };
}
async function add(id, quantity = 1, client = customer) {
  return request('/cart/' + id, { method: 'PUT', body: { quantity }, client });
}
async function checkout(key, client = customer, extraBody = {}) {
  return request('/orders', {
    method: 'POST',
    client,
    extra: { 'Idempotency-Key': key },
    body: {
      name: 'Тестовий Покупець',
      phone: '+380991234567',
      delivery: 'pickup',
      payment: 'offline',
      ...extraBody,
    },
  });
}
before(async () => {
  folder = mkdtempSync(join(tmpdir(), 'svit-test-'));
  dbPath = join(folder, 'test.sqlite');
  db = openDatabase(dbPath);
  db.prepare("INSERT INTO users(name,email,password_hash,role) VALUES (?,?,?,'admin')").run(
    'Адмін',
    'admin@test.example',
    await hashPassword('Test-password-123'),
  );
  const publicDir = join(folder, 'public');
  mkdirSync(join(publicDir, 'img', 'category'), { recursive: true });
  copyFileSync(
    new URL('../src/img/category/lego.svg', import.meta.url),
    join(publicDir, 'img', 'category', 'lego.svg'),
  );
  server = createApp(db, { publicDir }).listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  base = 'http://127.0.0.1:' + server.address().port;
  customer = await register('customer@test.example');
  other = await register('other@test.example');
  const login = await request('/auth/login', {
    method: 'POST',
    body: { email: 'admin@test.example', password: 'Test-password-123' },
  });
  assert.equal(login.status, 200);
  admin = { cookie: login.cookie, csrf: login.data.csrfToken, id: login.data.user.id };
});
after(async () => {
  await new Promise((resolve) => server.close(resolve));
  db.close();
  rmSync(folder, { recursive: true, force: true });
});

test('catalog seeds every category, pagination and case-insensitive Ukrainian search', async () => {
  const all = await request('/products');
  assert.equal(all.status, 200);
  assert.equal(all.data.total, 28);
  assert.equal(all.data.items.length, 12);
  const search = await request('/products?q=' + encodeURIComponent('ЛЯЛЬКА'));
  assert.equal(search.status, 200);
  assert.equal(search.data.total, 2);
  const category = await request('/products?category=1');
  assert.equal(category.data.total, 5);
  assert.ok(category.data.items.some((p) => p.category_id === 15));
  const filtered = await request('/products?min=500&max=1500&stock=1&sort=price_asc');
  assert.ok(filtered.data.items.every((p) => p.price >= 50000 && p.price <= 150000 && p.stock > 0));
  assert.ok(filtered.data.items.every((p, i, a) => i === 0 || a[i - 1].price <= p.price));
  assert.equal((await request('/products?q=' + encodeURIComponent("%' OR 1=1 --"))).data.total, 0);
  assert.equal((await request('/products?limit=-2')).status, 400);
});
test('auth sessions, password hashes and duplicate registration', async () => {
  const me = await request('/auth/me', { client: customer });
  assert.equal(me.data.user.role, 'customer');
  assert.ok(!('password_hash' in me.data.user));
  assert.notEqual(
    db.prepare('SELECT password_hash FROM users WHERE id=?').get(customer.id).password_hash,
    'Test-password-123',
  );
  const duplicate = await request('/auth/register', {
    method: 'POST',
    body: { name: 'Test', email: 'CUSTOMER@test.example', password: 'Test-password-123' },
  });
  assert.equal(duplicate.status, 409);
  assert.equal(
    (
      await request('/auth/login', {
        method: 'POST',
        body: { email: 'customer@test.example', password: 'Wrong-password-123' },
      })
    ).status,
    401,
  );
});
test('admin and private routes reject unauthenticated customers', async () => {
  assert.equal((await request('/admin/products')).status, 401);
  assert.equal((await request('/admin/products', { client: customer })).status, 403);
  assert.equal((await request('/orders')).status, 401);
  assert.equal((await request('/admin/products', { client: admin })).status, 200);
  assert.equal(
    (await request('/admin/products/1', { method: 'DELETE', client: customer })).status,
    403,
  );
});
test('CSRF token and request origin are checked', async () => {
  assert.equal(
    (
      await request('/cart/1', {
        method: 'PUT',
        body: { quantity: 1 },
        client: customer,
        extra: { 'X-CSRF-Token': 'wrong' },
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await request('/cart/1', {
        method: 'PUT',
        body: { quantity: 1 },
        client: customer,
        extra: { Origin: 'https://untrusted.example' },
      })
    ).status,
    403,
  );
  assert.equal(
    (await request('/auth/login', { method: 'POST', body: {}, extra: { 'X-Requested-With': '' } }))
      .status,
    403,
  );
});
test('cart enforces stock and quantity, favorites remain private', async () => {
  assert.equal((await add(4)).status, 409);
  assert.equal((await add(1, -1)).status, 400);
  assert.equal((await add(1, 1000)).status, 400);
  assert.equal((await add(1, 2)).status, 200);
  assert.equal((await request('/cart', { client: other })).data.items.length, 0);
  await request('/favorites/1', { method: 'PUT', client: customer, body: { saved: true } });
  assert.deepEqual((await request('/favorites', { client: customer })).data, [1]);
  assert.deepEqual((await request('/favorites', { client: other })).data, []);
  assert.equal((await request('/products?favorites=1', { client: customer })).data.total, 1);
});
test('checkout snapshots server prices, deducts stock atomically and is idempotent', async () => {
  const initial = db.prepare('SELECT * FROM products WHERE id=1').get();
  const result = await checkout('checkout-key-00000001', customer, { total: 1, price: 1 });
  assert.equal(result.status, 201);
  assert.equal(result.data.total, initial.price * 2);
  assert.equal(result.data.items[0].price, initial.price);
  assert.equal(result.data.payment_status, 'pending');
  assert.equal(db.prepare('SELECT stock FROM products WHERE id=1').get().stock, initial.stock - 2);
  assert.equal((await request('/cart', { client: customer })).data.items.length, 0);
  const again = await checkout('checkout-key-00000001');
  assert.equal(again.data.id, result.data.id);
  assert.equal(db.prepare('SELECT stock FROM products WHERE id=1').get().stock, initial.stock - 2);
  assert.equal((await request('/orders', { client: other })).data.length, 0);
  db.prepare('UPDATE products SET price=price+100 WHERE id=1').run();
  assert.equal(
    (await request('/orders', { client: customer })).data[0].items[0].price,
    initial.price,
  );
});
test('cancel restores stock once and blocks invalid transitions', async () => {
  const order = (await request('/orders', { client: customer })).data[0],
    before = db.prepare('SELECT stock FROM products WHERE id=1').get().stock;
  const update = () =>
    request('/admin/orders/' + order.id, {
      method: 'PATCH',
      client: admin,
      body: { status: 'cancelled' },
    });
  assert.equal((await update()).status, 200);
  assert.equal(db.prepare('SELECT stock FROM products WHERE id=1').get().stock, before + 2);
  assert.equal((await update()).status, 400);
  assert.equal(db.prepare('SELECT stock FROM products WHERE id=1').get().stock, before + 2);
});
test('last unit cannot be sold twice and failed checkout preserves cart', async () => {
  db.prepare('UPDATE products SET stock=1 WHERE id=2').run();
  assert.equal((await add(2, 1)).status, 200);
  assert.equal((await add(2, 1, other)).status, 200);
  const results = await Promise.all([
    checkout('concurrent-key-00000001'),
    checkout('concurrent-key-00000002', other),
  ]);
  assert.deepEqual(results.map((r) => r.status).sort(), [201, 409]);
  assert.equal(db.prepare('SELECT stock FROM products WHERE id=2').get().stock, 0);
  const failedClient = results[0].status === 409 ? customer : other;
  assert.equal((await request('/cart', { client: failedClient })).data.items.length, 1);
});
test('category edits prevent cycles and deletion of non-empty categories', async () => {
  const c = await request('/admin/categories', {
    method: 'POST',
    client: admin,
    body: {
      name: 'Тестова категорія',
      slug: 'test-category',
      parent_id: 1,
      icon: '/img/category/lego.svg',
    },
  });
  assert.equal(c.status, 201);
  const cycle = await request('/admin/categories/1', {
    method: 'PUT',
    client: admin,
    body: { name: 'Конструктори', slug: 'constructors', parent_id: c.data.id },
  });
  assert.equal(cycle.status, 400);
  assert.equal(
    (await request('/admin/categories/1', { method: 'DELETE', client: admin })).status,
    409,
  );
  assert.equal(
    (await request('/admin/categories/' + c.data.id, { method: 'DELETE', client: admin })).status,
    200,
  );
});
test('product create/update/archive validates values and keeps past orders', async () => {
  const payload = {
    title: 'Тестовий конструктор',
    description: 'Докладний опис тестового конструктора',
    category_id: 1,
    brand: 'Test',
    age_min: 3,
    price: 10000,
    old_price: null,
    stock: 3,
    image: '/img/category/lego.svg',
    active: 1,
  };
  const created = await request('/admin/products', {
    method: 'POST',
    client: admin,
    body: payload,
  });
  assert.equal(created.status, 201);
  const id = created.data.id;
  assert.equal((await request('/products/' + id)).data.title, payload.title);
  assert.equal(
    (
      await request('/admin/products/' + id, {
        method: 'PUT',
        client: admin,
        body: { ...payload, price: -5 },
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await request('/admin/products/' + id, {
        method: 'PUT',
        client: admin,
        body: { ...payload, stock: 5 },
      })
    ).status,
    200,
  );
  assert.equal(
    (await request('/admin/products/' + id, { method: 'DELETE', client: admin })).status,
    200,
  );
  assert.equal((await request('/products/' + id)).status, 404);
  assert.equal(
    (await request('/admin/products/1', { method: 'DELETE', client: admin })).status,
    200,
  );
  assert.ok(
    (await request('/orders', { client: customer })).data.some((o) =>
      o.items.some((i) => i.product_id === 1),
    ),
  );
});
test('uploads reject disguised executable and accept actual PNG signature', async () => {
  const upload = async (bytes, name) => {
    const data = new FormData();
    data.append('image', new Blob([bytes]), name);
    return fetch(base + '/api/admin/uploads', {
      method: 'POST',
      headers: { ...headers, Cookie: admin.cookie, 'X-CSRF-Token': admin.csrf },
      body: data,
    });
  };
  assert.equal((await upload('<svg onload="alert(1)"></svg>', 'fake.png')).status, 400);
  const response = await upload(
    Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aA+sAAAAASUVORK5CYII=',
      'base64',
    ),
    'actual.png',
  );
  assert.equal(response.status, 201);
  const image = await response.json();
  assert.match(image.path, /^\/uploads\/[a-f0-9-]+\.png$/);
  assert.equal((await fetch(base + image.path)).status, 200);
});
test('blocking a user revokes sessions and self-demotion is blocked', async () => {
  assert.equal(
    (
      await request('/admin/users/' + admin.id, {
        method: 'PATCH',
        client: admin,
        body: { role: 'customer', active: 0 },
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await request('/admin/users/' + other.id, {
        method: 'PATCH',
        client: admin,
        body: { role: 'customer', active: 0 },
      })
    ).status,
    200,
  );
  assert.equal((await request('/auth/me', { client: other })).data.user, null);
  assert.equal((await request('/cart', { client: other })).status, 401);
});
test('database data survives closing and reopening a connection', () => {
  const another = openDatabase(dbPath);
  assert.equal(another.prepare('SELECT COUNT(*) n FROM users').get().n, 3);
  assert.ok(another.prepare('SELECT COUNT(*) n FROM orders').get().n >= 2);
  another.close();
});
test('logout invalidates the server-side session', async () => {
  assert.equal((await request('/auth/logout', { method: 'POST', client: customer })).status, 200);
  assert.equal((await request('/auth/me', { client: customer })).data.user, null);
});
