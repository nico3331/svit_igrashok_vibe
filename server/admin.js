import { Router } from 'express';
import multer from 'multer';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { assert, integer, text } from './security.js';
import { productSelect } from './catalog.js';
import { orderDetail, changeOrderStatus } from './orders.js';

function imagePath(value, publicDir) {
  const path = text(value, 'Зображення', 300);
  assert(
    /^\/(img|uploads)\/[\w\s./-]+\.(png|jpg|jpeg|webp|svg)$/i.test(path) && !path.includes('..'),
    'Оберіть локальне зображення або завантажте фото.',
  );
  assert(existsSync(join(publicDir, path)), 'Файл зображення не знайдено.');
  return path;
}
function productData(body, db, publicDir) {
  const title = text(body.title, 'Назва', 180, 3),
    description = text(body.description, 'Опис', 4000, 10);
  const category = integer(body.category_id, 'Категорія', 1);
  assert(
    db.prepare('SELECT id FROM categories WHERE id=?').get(category),
    'Категорію не знайдено.',
  );
  const price = integer(body.price, 'Ціна в копійках', 1, 100000000);
  const old =
    body.old_price === null || body.old_price === undefined
      ? null
      : integer(body.old_price, 'Стара ціна', price + 1, 100000000);
  return [
    title,
    description,
    category,
    text(body.brand, 'Бренд', 80),
    integer(body.age_min, 'Вік', 0, 18),
    price,
    old,
    integer(body.stock, 'Залишок', 0, 100000),
    imagePath(body.image, publicDir),
    integer(body.active, 'Активність', 0, 1),
  ];
}
export function adminRouter(db, publicDir) {
  const router = Router();
  router.get('/summary', (req, res) =>
    res.json({
      products: db.prepare('SELECT COUNT(*) n FROM products WHERE active=1').get().n,
      orders: db.prepare('SELECT COUNT(*) n FROM orders').get().n,
      customers: db.prepare("SELECT COUNT(*) n FROM users WHERE role='customer'").get().n,
      revenue: db
        .prepare("SELECT COALESCE(SUM(total),0) n FROM orders WHERE status='completed'")
        .get().n,
    }),
  );
  router.get('/products', (req, res) =>
    res.json(db.prepare(`${productSelect} ORDER BY p.id DESC`).all()),
  );
  router.post('/products', (req, res) => {
    const data = productData(req.body, db, publicDir);
    const row = db
      .prepare(
        'INSERT INTO products(title,description,category_id,brand,age_min,price,old_price,stock,image,active) VALUES (?,?,?,?,?,?,?,?,?,?)',
      )
      .run(...data);
    res.status(201).json({ id: Number(row.lastInsertRowid) });
  });
  router.put('/products/:id', (req, res) => {
    const id = integer(Number(req.params.id), 'Товар', 1);
    const data = productData(req.body, db, publicDir);
    assert(
      db
        .prepare(
          'UPDATE products SET title=?,description=?,category_id=?,brand=?,age_min=?,price=?,old_price=?,stock=?,image=?,active=? WHERE id=?',
        )
        .run(...data, id).changes,
      'Товар не знайдено.',
      404,
    );
    res.json({ ok: true });
  });
  router.delete('/products/:id', (req, res) => {
    assert(
      db
        .prepare('UPDATE products SET active=0 WHERE id=?')
        .run(integer(Number(req.params.id), 'Товар', 1)).changes,
      'Товар не знайдено.',
      404,
    );
    res.json({ ok: true });
  });
  function categoryData(body, id = null) {
    const name = text(body.name, 'Назва', 80, 2),
      slug = text(body.slug, 'Адреса категорії', 80, 2);
    assert(/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug), 'Адреса: латинські літери, цифри та дефіс.');
    const parent =
      body.parent_id === null || body.parent_id === undefined
        ? null
        : integer(body.parent_id, 'Батьківська категорія', 1);
    if (parent !== null) {
      assert(
        db.prepare('SELECT id FROM categories WHERE id=?').get(parent),
        'Батьківську категорію не знайдено.',
      );
      if (id !== null) {
        const descendants = db
          .prepare(
            'WITH RECURSIVE tree(id) AS (SELECT id FROM categories WHERE id=? UNION ALL SELECT c.id FROM categories c JOIN tree t ON c.parent_id=t.id) SELECT id FROM tree',
          )
          .all(id);
        assert(
          !descendants.some((x) => x.id === parent),
          'Категорія не може бути вкладена у себе або власну підкатегорію.',
        );
      }
    }
    const icon = body.icon ? imagePath(body.icon, publicDir) : '/img/category/lego.svg';
    return [name, slug, parent, icon];
  }
  router.post('/categories', (req, res) => {
    const data = categoryData(req.body);
    const result = db
      .prepare('INSERT INTO categories(name,slug,parent_id,icon) VALUES (?,?,?,?)')
      .run(...data);
    res.status(201).json({ id: Number(result.lastInsertRowid) });
  });
  router.put('/categories/:id', (req, res) => {
    const id = integer(Number(req.params.id), 'Категорія', 1),
      data = categoryData(req.body, id);
    assert(
      db
        .prepare('UPDATE categories SET name=?,slug=?,parent_id=?,icon=? WHERE id=?')
        .run(...data, id).changes,
      'Категорію не знайдено.',
      404,
    );
    res.json({ ok: true });
  });
  router.delete('/categories/:id', (req, res) => {
    const id = integer(Number(req.params.id), 'Категорія', 1);
    assert(
      !db.prepare('SELECT id FROM products WHERE category_id=? LIMIT 1').get(id) &&
        !db.prepare('SELECT id FROM categories WHERE parent_id=? LIMIT 1').get(id),
      'Спочатку перенесіть товари та підкатегорії до іншої категорії.',
      409,
    );
    assert(
      db.prepare('DELETE FROM categories WHERE id=?').run(id).changes,
      'Категорію не знайдено.',
      404,
    );
    res.json({ ok: true });
  });
  router.get('/orders', (req, res) =>
    res.json(
      db
        .prepare('SELECT id FROM orders ORDER BY id DESC')
        .all()
        .map((x) => orderDetail(db, x.id)),
    ),
  );
  router.patch('/orders/:id', (req, res) =>
    res.json(
      changeOrderStatus(db, integer(Number(req.params.id), 'Замовлення', 1), req.body.status),
    ),
  );
  router.get('/users', (req, res) =>
    res.json(
      db.prepare('SELECT id,name,email,role,active,created_at FROM users ORDER BY id DESC').all(),
    ),
  );
  router.patch('/users/:id', (req, res) => {
    const id = integer(Number(req.params.id), 'Користувач', 1),
      active = integer(req.body.active, 'Активність', 0, 1);
    assert(['admin', 'customer'].includes(req.body.role), 'Невідома роль.');
    assert(id !== req.user.id, 'Власну роль та активність змінювати не можна.');
    assert(
      db.prepare('UPDATE users SET role=?,active=? WHERE id=?').run(req.body.role, active, id)
        .changes,
      'Користувача не знайдено.',
      404,
    );
    db.prepare('DELETE FROM sessions WHERE user_id=?').run(id);
    res.json({ ok: true });
  });
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 0 },
  });
  router.post('/uploads', upload.single('image'), (req, res) => {
    assert(req.file, 'Оберіть зображення до 5 МБ.');
    const bytes = req.file.buffer;
    let ext;
    if (
      bytes.length > 8 &&
      bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    )
      ext = 'png';
    if (bytes.length > 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) ext = 'jpg';
    if (
      bytes.length > 12 &&
      bytes.toString('ascii', 0, 4) === 'RIFF' &&
      bytes.toString('ascii', 8, 12) === 'WEBP'
    )
      ext = 'webp';
    assert(ext, 'Дозволені лише PNG, JPG та WebP.');
    mkdirSync(join(publicDir, 'uploads'), { recursive: true });
    const filename = `${randomUUID()}.${ext}`;
    writeFileSync(join(publicDir, 'uploads', filename), bytes, { flag: 'wx' });
    res.status(201).json({ path: `/uploads/${filename}` });
  });
  return router;
}
