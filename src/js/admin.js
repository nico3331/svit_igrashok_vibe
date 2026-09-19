import { api, session, setCsrf } from './api.js';
import {
  $,
  esc,
  money,
  toast,
  showDialog,
  closeDialog,
  initializeDialog,
  submitForm,
  orderCard,
  statusLabels,
} from './ui.js';
let user,
  categories = [],
  products = [],
  users = [],
  orders = [];
let version = 0;
const option = (value, label, selected) =>
  `<option value="${esc(value)}" ${String(value) === String(selected) ? 'selected' : ''}>${esc(label)}</option>`;
function categoryOptions(selected, exclude) {
  return (
    '<option value="">Оберіть категорію</option>' +
    categories
      .filter((c) => c.id !== exclude)
      .map((c) => option(c.id, (c.parent_id ? '↳ ' : '') + c.name, selected))
      .join('')
  );
}
function pageHeading(title, button = '') {
  return `<div class="section-heading"><h1>${title}</h1>${button}</div>`;
}
function productRows(items) {
  return items
    .map(
      (p) =>
        `<tr class="${p.active ? '' : 'admin-row-muted'}"><td><img src="${esc(p.image)}" alt=""></td><td class="table-title"><strong>${esc(p.title)}</strong><small>SI-${p.id} · ${esc(p.brand)}${p.active ? '' : ' · Прихований'}</small></td><td>${esc(p.category_name)}</td><td>${money(p.price)}</td><td>${p.stock}</td><td><div class="row-actions"><button class="button secondary" data-edit-product="${p.id}">Редагувати</button>${p.active ? `<button class="button danger" data-archive="${p.id}">Приховати</button>` : ''}</div></td></tr>`,
    )
    .join('');
}
async function render() {
  const current = ++version,
    page = location.hash.slice(1) || 'dashboard';
  document
    .querySelectorAll('#admin-tabs a')
    .forEach((a) => a.classList.toggle('active', a.hash === '#' + page));
  try {
    let html = '';
    categories = await api('/categories');
    if (page === 'dashboard') {
      const summary = await api('/admin/summary');
      html =
        pageHeading('Магазин у цифрах') +
        `<div class="stats"><div class="stat"><strong>${summary.products}</strong><span>Активних товарів</span></div><div class="stat"><strong>${summary.orders}</strong><span>Замовлень</span></div><div class="stat"><strong>${summary.customers}</strong><span>Покупців</span></div><div class="stat"><strong>${money(summary.revenue)}</strong><span>Виконані замовлення</span></div></div><section class="info-page" style="background:white;border-radius:16px;margin:0;max-width:none"><p class="eyebrow">Вітаємо, ${esc(user.name)}</p><h2>Усе для маленьких відкриттів</h2><p>Додавайте товари, оновлюйте залишки та супроводжуйте замовлення. Усі зміни зберігаються в базі даних і одразу доступні покупцям.</p><div class="notice">Демонстраційні товари та замовлення навчальні. Онлайн-платежі не підключені.</div></section>`;
    } else if (page === 'products') {
      products = await api('/admin/products');
      html =
        pageHeading('Товари', '<button class="button" data-new-product>+ Додати товар</button>') +
        '<input id="admin-search" class="admin-search" placeholder="Пошук за назвою або брендом" aria-label="Пошук товарів"><p class="muted" style="margin:12px 0">Ціни в гривнях. Приховані товари залишаються в історії замовлень.</p><div class="table-wrap"><table><thead><tr><th>Фото</th><th>Товар</th><th>Категорія</th><th>Ціна</th><th>Залишок</th><th>Дії</th></tr></thead><tbody id="product-rows">' +
        productRows(products) +
        '</tbody></table></div>';
    } else if (page === 'categories') {
      html =
        pageHeading(
          'Категорії',
          '<button class="button" data-new-category>+ Додати категорію</button>',
        ) +
        `<div class="table-wrap"><table><thead><tr><th>Категорія</th><th>Адреса</th><th>Батьківська категорія</th><th>Дії</th></tr></thead><tbody>${categories.map((c) => `<tr><td><strong>${esc(c.name)}</strong></td><td>${esc(c.slug)}</td><td>${esc(categories.find((x) => x.id === c.parent_id)?.name || '—')}</td><td><div class="row-actions"><button class="button secondary" data-edit-category="${c.id}">Редагувати</button><button class="button danger" data-delete-category="${c.id}">Видалити</button></div></td></tr>`).join('')}</tbody></table></div>`;
    } else if (page === 'orders') {
      orders = await api('/admin/orders');
      html =
        pageHeading('Замовлення') +
        `<label>Статус <select id="order-filter" class="admin-search"><option value="">Усі замовлення</option>${Object.entries(
          statusLabels,
        )
          .map(([s, label]) => option(s, label, ''))
          .join(
            '',
          )}</select></label><div id="order-list">${orders.length ? orders.map((o) => orderCard(o, true)).join('') : '<div class="empty-state admin-empty">Замовлень ще немає.</div>'}</div>`;
    } else if (page === 'users') {
      users = await api('/admin/users');
      html =
        pageHeading('Користувачі') +
        `<div class="table-wrap"><table><thead><tr><th>Ім’я</th><th>Email</th><th>Роль</th><th>Стан</th><th>Дії</th></tr></thead><tbody>${users.map((u) => `<tr><td>${esc(u.name)}</td><td>${esc(u.email)}</td><td>${u.role === 'admin' ? 'Адміністратор' : 'Покупець'}</td><td>${u.active ? 'Активний' : 'Заблокований'}</td><td>${u.id === user.id ? '<span class="muted">Це ви</span>' : `<button class="button secondary" data-edit-user="${u.id}">Редагувати</button>`}</td></tr>`).join('')}</tbody></table></div>`;
    } else
      html =
        '<div class="empty-state">Розділ не знайдено. <a href="#dashboard">До огляду</a></div>';
    if (current === version) $('#admin-app').innerHTML = html;
  } catch (error) {
    if (current === version)
      $('#admin-app').innerHTML =
        `<div class="empty-state"><h1>Немає доступу або сталася помилка</h1><p>${esc(error.message)}</p><a class="button" href="/">До магазину</a></div>`;
  }
}
function productForm(id) {
  const p = products.find((x) => x.id === id) || {
    title: '',
    description: '',
    brand: 'Світ Іграшок',
    age_min: 3,
    price: 10000,
    old_price: null,
    stock: 1,
    image: '/img/category/lego.svg',
    active: 1,
  };
  showDialog(
    id ? 'Редагування товару' : 'Новий товар',
    `<form id="product-form" class="form-grid" data-id="${id || ''}"><label class="span-2">Назва<input name="title" required minlength="3" maxlength="180" value="${esc(p.title)}"></label><label>Категорія<select name="category_id" required>${categoryOptions(p.category_id)}</select></label><label>Бренд<input name="brand" required maxlength="80" value="${esc(p.brand)}"></label><label>Ціна, ₴<input name="price" type="number" min="0.01" max="1000000" step="0.01" required value="${p.price / 100}"></label><label>Стара ціна, ₴<input name="old_price" type="number" min="0.01" max="1000000" step="0.01" value="${p.old_price ? p.old_price / 100 : ''}"><small>Залиште порожнім, якщо знижки немає</small></label><label>Кількість на складі<input name="stock" type="number" min="0" max="100000" step="1" required value="${p.stock}"></label><label>Мінімальний вік<input name="age_min" type="number" min="0" max="18" step="1" required value="${p.age_min}"></label><label class="span-2">Опис<textarea name="description" required minlength="10" maxlength="4000" rows="4">${esc(p.description)}</textarea></label><label class="span-2">Фотографія<input id="image-file" type="file" accept="image/png,image/jpeg,image/webp"><small>PNG, JPG або WebP, до 5 МБ. Завантажується під час збереження товару.</small></label><div class="span-2"><img id="image-preview" class="image-preview" src="${esc(p.image)}" alt="Фото товару"></div><input name="image" type="hidden" value="${esc(p.image)}"><label class="check-label span-2"><input name="active" type="checkbox" ${p.active ? 'checked' : ''}>Показувати в каталозі</label><p class="form-error span-2" role="alert"></p><button type="submit" class="button span-2">Зберегти товар</button></form>`,
    { wide: true },
  );
}
function categoryForm(id) {
  const c = categories.find((x) => x.id === id) || {
    name: '',
    slug: '',
    parent_id: null,
    icon: '/img/category/lego.svg',
  };
  showDialog(
    id ? 'Редагування категорії' : 'Нова категорія',
    `<form id="category-form" class="stack" data-id="${id || ''}"><label>Назва<input name="name" required minlength="2" maxlength="80" value="${esc(c.name)}"></label><label>Адреса латиницею<input name="slug" required minlength="2" maxlength="80" pattern="[a-z0-9]+(-[a-z0-9]+)*" placeholder="new-category" value="${esc(c.slug)}"></label><label>Батьківська категорія<select name="parent_id"><option value="">Основна категорія</option>${categories
      .filter((x) => x.id !== id)
      .map((x) => option(x.id, x.name, c.parent_id))
      .join(
        '',
      )}</select></label><label>Іконка<select name="icon">${[...new Set(categories.map((x) => x.icon))].map((icon) => option(icon, categories.find((x) => x.icon === icon).name, c.icon)).join('')}</select></label><p class="form-error" role="alert"></p><button type="submit" class="button">Зберегти категорію</button></form>`,
  );
}
function userForm(id) {
  const u = users.find((x) => x.id === id);
  showDialog(
    'Користувач: ' + u.name,
    `<form id="user-form" data-id="${id}" class="stack"><p class="muted">${esc(u.email)}</p><label>Роль<select name="role">${option('customer', 'Покупець', u.role)}${option('admin', 'Адміністратор', u.role)}</select></label><label class="check-label"><input name="active" type="checkbox" ${u.active ? 'checked' : ''}>Акаунт активний</label><p class="muted">Після зміни користувачу потрібно буде увійти знову.</p><p class="form-error" role="alert"></p><button class="button" type="submit">Зберегти</button></form>`,
  );
}
initializeDialog();
document.addEventListener('click', async (event) => {
  const button = event.target.closest('button');
  if (!button) return;
  try {
    if (button.hasAttribute('data-new-product')) productForm();
    if (button.hasAttribute('data-edit-product')) productForm(Number(button.dataset.editProduct));
    if (button.hasAttribute('data-new-category')) categoryForm();
    if (button.hasAttribute('data-edit-category'))
      categoryForm(Number(button.dataset.editCategory));
    if (button.hasAttribute('data-edit-user')) userForm(Number(button.dataset.editUser));
    if (button.hasAttribute('data-archive')) {
      if (!confirm('Приховати товар із каталогу?')) return;
      await api('/admin/products/' + button.dataset.archive, { method: 'DELETE' });
      await render();
      toast('Товар приховано');
    }
    if (button.hasAttribute('data-delete-category')) {
      if (!confirm('Видалити порожню категорію?')) return;
      await api('/admin/categories/' + button.dataset.deleteCategory, { method: 'DELETE' });
      await render();
      toast('Категорію видалено');
    }
  } catch (error) {
    toast(error.message);
  }
});
let previewUrl;
document.addEventListener('change', (event) => {
  if (event.target.id === 'image-file') {
    const file = event.target.files[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast('Максимальний розмір — 5 МБ');
      event.target.value = '';
      return;
    }
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = URL.createObjectURL(file);
    $('#image-preview').src = previewUrl;
  }
  if (event.target.id === 'order-filter') {
    $('#order-list').innerHTML =
      orders
        .filter((o) => !event.target.value || o.status === event.target.value)
        .map((o) => orderCard(o, true))
        .join('') || '<div class="empty-state admin-empty">Таких замовлень немає.</div>';
  }
});
document.addEventListener('input', (event) => {
  if (event.target.id === 'admin-search') {
    const q = event.target.value.toLocaleLowerCase('uk-UA');
    $('#product-rows').innerHTML = productRows(
      products.filter((p) => (p.title + ' ' + p.brand).toLocaleLowerCase('uk-UA').includes(q)),
    );
  }
});
document.addEventListener('submit', (event) => {
  const form = event.target;
  event.preventDefault();
  submitForm(form, async () => {
    const data = Object.fromEntries(new FormData(form)),
      id = form.dataset.id;
    if (form.id === 'product-form') {
      for (const key of ['stock', 'age_min', 'category_id']) data[key] = Number(data[key]);
      data.price = Math.round(Number(data.price) * 100);
      data.old_price = data.old_price ? Math.round(Number(data.old_price) * 100) : null;
      data.active = data.active ? 1 : 0;
      if (data.old_price !== null && data.old_price <= data.price)
        throw new Error('Стара ціна має бути більшою за поточну.');
      const file = $('#image-file').files[0];
      if (file) {
        const upload = new FormData();
        upload.append('image', file);
        data.image = (await api('/admin/uploads', { method: 'POST', body: upload })).path;
      }
      await api('/admin/products' + (id ? '/' + id : ''), {
        method: id ? 'PUT' : 'POST',
        body: data,
      });
    } else if (form.id === 'category-form') {
      data.parent_id = data.parent_id ? Number(data.parent_id) : null;
      await api('/admin/categories' + (id ? '/' + id : ''), {
        method: id ? 'PUT' : 'POST',
        body: data,
      });
    } else if (form.id === 'user-form') {
      data.active = data.active ? 1 : 0;
      await api('/admin/users/' + id, { method: 'PATCH', body: data });
    } else if (form.classList.contains('status-form')) {
      await api('/admin/orders/' + form.dataset.order, { method: 'PATCH', body: data });
    } else return;
    closeDialog();
    await render();
    toast('Зміни збережено');
  });
});
window.addEventListener('hashchange', () => {
  if (user?.role === 'admin') render();
});
(async () => {
  try {
    user = await session();
    if (user?.role !== 'admin') {
      $('#admin-app').innerHTML =
        '<div class="empty-state admin-empty"><h1>Вхід для адміністратора</h1><p>Увійдіть в адміністративний акаунт на сторінці магазину.</p><a class="button" href="/#account">Увійти в магазин</a></div>';
      return;
    }
    $('#admin-tabs').hidden = false;
    await render();
  } catch (error) {
    $('#admin-app').textContent = error.message;
  }
})();
