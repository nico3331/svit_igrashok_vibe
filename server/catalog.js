import { Router } from 'express';
import { assert, integer } from './security.js';

export const productSelect = `SELECT p.*, c.name AS category_name, c.slug AS category_slug
 FROM products p JOIN categories c ON c.id=p.category_id`;
export function catalogRouter(db) {
  const router = Router();
  router.get('/categories', (req, res) =>
    res.json(db.prepare('SELECT * FROM categories ORDER BY id').all()),
  );
  router.get('/brands', (req, res) =>
    res.json(
      db
        .prepare('SELECT DISTINCT brand FROM products WHERE active=1 ORDER BY brand')
        .all()
        .map((x) => x.brand),
    ),
  );
  router.get('/products', (req, res) => {
    const q = req.query;
    const where = ['p.active=1'];
    const args = [];
    if (q.q) {
      assert(typeof q.q === 'string' && q.q.length <= 100, 'Пошук: максимум 100 символів.');
      where.push("(uk_lower(p.title) LIKE ? ESCAPE '!' OR uk_lower(p.brand) LIKE ? ESCAPE '!')");
      const term = '%' + q.q.trim().toLocaleLowerCase('uk-UA').replace(/[!%_]/g, '!$&') + '%';
      args.push(term, term);
    }
    if (q.category) {
      const id = integer(Number(q.category), 'Категорія', 1);
      where.push(
        `p.category_id IN (WITH RECURSIVE tree(id) AS (SELECT id FROM categories WHERE id=? UNION ALL SELECT c.id FROM categories c JOIN tree t ON c.parent_id=t.id) SELECT id FROM tree)`,
      );
      args.push(id);
    }
    if (q.brand) {
      assert(typeof q.brand === 'string' && q.brand.length <= 80, 'Некоректний бренд.');
      where.push('p.brand=?');
      args.push(q.brand);
    }
    for (const [key, op] of [
      ['min', '>='],
      ['max', '<='],
    ])
      if (q[key] !== undefined && q[key] !== '') {
        const price = Number(q[key]);
        assert(Number.isFinite(price) && price >= 0 && price <= 10000000, 'Некоректна ціна.');
        where.push(`p.price ${op} ?`);
        args.push(Math.round(price * 100));
      }
    if (q.age !== undefined && q.age !== '') {
      where.push('p.age_min<=?');
      args.push(integer(Number(q.age), 'Вік', 0, 18));
    }
    if (q.stock === '1') where.push('p.stock>0');
    if (q.sale === '1') where.push('p.old_price IS NOT NULL');
    if (q.favorites === '1') {
      assert(req.user, 'Увійдіть, щоб переглянути обране.', 401);
      where.push('p.id IN (SELECT product_id FROM favorites WHERE user_id=?)');
      args.push(req.user.id);
    }
    const sorts = {
      newest: 'p.id DESC',
      price_asc: 'p.price ASC,p.id ASC',
      price_desc: 'p.price DESC,p.id ASC',
      title: 'uk_lower(p.title),p.id ASC',
    };
    const sort = Object.hasOwn(sorts, q.sort) ? sorts[q.sort] : sorts.newest;
    const page = integer(Number(q.page || 1), 'Сторінка', 1, 100000);
    const limit = integer(Number(q.limit || 12), 'Кількість', 1, 48);
    const clause = where.join(' AND ');
    const total = db
      .prepare(`SELECT COUNT(*) AS count FROM products p WHERE ${clause}`)
      .get(...args).count;
    const items = db
      .prepare(`${productSelect} WHERE ${clause} ORDER BY ${sort} LIMIT ? OFFSET ?`)
      .all(...args, limit, (page - 1) * limit);
    res.json({ items, total, page, pages: Math.ceil(total / limit) });
  });
  router.get('/products/:id', (req, res) => {
    const product = db
      .prepare(`${productSelect} WHERE p.id=? AND p.active=1`)
      .get(Number(req.params.id));
    assert(product, 'Товар не знайдено.', 404);
    res.json(product);
  });
  return router;
}
