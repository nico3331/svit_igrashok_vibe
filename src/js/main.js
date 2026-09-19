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
  productCard,
  orderCard,
} from './ui.js';

const state = {
  user: null,
  categories: [],
  brands: [],
  favorites: [],
  cart: { items: [], total: 0 },
};
let renderVersion = 0,
  checkoutKey;
const guestKey = 'svit-guest-cart-v1';
function readGuest() {
  try {
    const data = JSON.parse(localStorage.getItem(guestKey) || '[]');
    return Array.isArray(data)
      ? data
          .filter(
            (x) =>
              Number.isInteger(x.id) &&
              Number.isInteger(x.quantity) &&
              x.quantity > 0 &&
              x.quantity <= 99,
          )
          .slice(0, 100)
      : [];
  } catch {
    return [];
  }
}
function saveGuest(items) {
  localStorage.setItem(guestKey, JSON.stringify(items));
}
function updateHeader() {
  $('#account-button span').textContent = state.user ? state.user.name.split(' ')[0] : 'Увійти';
  $('#admin-link').hidden = state.user?.role !== 'admin';
  const count = state.cart.items.reduce((n, p) => n + p.quantity, 0);
  $('#cart-count').textContent = count;
  $('#cart-count').hidden = !count;
}
async function refreshCart() {
  if (state.user) state.cart = await api('/cart');
  else {
    const rows = await Promise.all(
      readGuest().map(async (item) => {
        try {
          return { ...(await api('/products/' + item.id)), quantity: item.quantity };
        } catch (error) {
          if (error.status === 404) return null;
          throw error;
        }
      }),
    );
    const items = rows.filter(Boolean);
    saveGuest(items.map(({ id, quantity }) => ({ id, quantity })));
    state.cart = { items, total: items.reduce((sum, p) => sum + p.price * p.quantity, 0) };
  }
  updateHeader();
}
async function setQuantity(id, quantity) {
  if (state.user) state.cart = await api('/cart/' + id, { method: 'PUT', body: { quantity } });
  else {
    let items = readGuest().filter((p) => p.id !== id);
    if (quantity > 0) {
      const p = await api('/products/' + id);
      if (quantity > p.stock || quantity > 99) throw new Error('Недостатньо товару на складі.');
      items.push({ id, quantity });
    }
    saveGuest(items);
    await refreshCart();
  }
  checkoutKey = null;
  updateHeader();
}
async function mergeGuestCart() {
  const guest = readGuest();
  if (!guest.length) return;
  const current = await api('/cart');
  for (const item of guest) {
    try {
      const p = await api('/products/' + item.id);
      const quantity = Math.min(
        99,
        p.stock,
        item.quantity + (current.items.find((x) => x.id === item.id)?.quantity || 0),
      );
      if (quantity > 0) await api('/cart/' + item.id, { method: 'PUT', body: { quantity } });
      if (quantity < item.quantity) toast('Кількість у кошику скориговано за залишком на складі.');
    } catch (error) {
      if (error.status !== 404) throw error;
    }
    saveGuest(readGuest().filter((x) => x.id !== item.id));
  }
}
function authDialog(register = false) {
  showDialog(
    register ? 'Створити акаунт' : 'Раді бачити знову!',
    `<p class="muted">${register ? 'Зберігайте улюблене та стежте за замовленнями.' : 'Увійдіть, щоб продовжити покупки.'}</p><form id="auth-form" class="stack" data-register="${register}">
    ${register ? '<label>Ваше ім’я<input name="name" required minlength="2" maxlength="80" autocomplete="name"></label>' : ''}
    <label>Email<input name="email" type="email" required maxlength="254" autocomplete="email"></label>
    <label>Пароль<input name="password" type="password" required minlength="10" maxlength="128" autocomplete="${register ? 'new-password' : 'current-password'}"><small>Від 10 символів</small></label>
    <p class="form-error" role="alert"></p><button type="submit" class="button">${register ? 'Зареєструватися' : 'Увійти'}</button>
    <p class="center">${register ? 'Уже є акаунт?' : 'Ще немає акаунту?'} <button type="button" class="text-link" data-auth-toggle="${!register}">${register ? 'Увійти' : 'Зареєструватися'}</button></p></form>`,
  );
}
function cartDialog() {
  showDialog(
    'Ваш кошик',
    state.cart.items.length
      ? `<div class="cart-list">${state.cart.items.map((p) => `<div class="cart-row"><img src="${esc(p.image)}" alt="${esc(p.title)}"><div><a href="#product/${p.id}" data-close>${esc(p.title)}</a><strong>${money(p.price)}</strong>${!p.active || p.quantity > p.stock ? '<small class="form-error">Перевірте доступність та кількість</small>' : ''}<div class="quantity"><button data-quantity="${p.id}" data-value="${p.quantity - 1}" aria-label="Зменшити кількість">−</button><span>${p.quantity}</span><button data-quantity="${p.id}" data-value="${p.quantity + 1}" ${p.quantity >= Math.min(99, p.stock) ? 'disabled' : ''} aria-label="Збільшити кількість">+</button></div></div><button class="icon-button" data-quantity="${p.id}" data-value="0" aria-label="Видалити товар">×</button></div>`).join('')}</div><div class="cart-total"><span>Разом</span><strong>${money(state.cart.total)}</strong></div><button id="checkout-button" class="button full">Оформити замовлення →</button><button class="button secondary full" data-close>Продовжити покупки</button>`
      : '<div class="empty-state"><span class="empty-icon">♧</span><h3>Тут починається радість</h3><p>Додайте до кошика щось цікаве з каталогу.</p><a class="button" href="#catalog" data-close>До іграшок</a></div>',
  );
}
function checkoutDialog() {
  if (!state.user) {
    toast('Для оформлення замовлення увійдіть або зареєструйтеся.');
    authDialog();
    return;
  }
  if (!state.cart.items.length) return;
  checkoutKey ||= crypto.randomUUID();
  showDialog(
    'Оформлення замовлення',
    `<p class="muted">${state.cart.items.length} позицій · <strong>${money(state.cart.total)}</strong></p><form id="checkout-form" class="stack"><label>Одержувач<input name="name" required minlength="2" maxlength="80" value="${esc(state.user.name)}" autocomplete="name"></label><label>Телефон<input name="phone" type="tel" required minlength="10" maxlength="25" placeholder="+380…" autocomplete="tel"></label><label>Як отримати<select name="delivery" id="delivery-method"><option value="pickup">Самовивіз · безкоштовно</option><option value="delivery">Доставка за адресою</option></select></label><label id="address-label" hidden>Місто, вулиця, будинок або відділення<input name="address" minlength="8" maxlength="300" autocomplete="street-address"></label><p class="muted" id="delivery-note">Самовивіз: Київ, вул. Іграшкова, 1 (демонстраційна адреса).</p><label>Оплата<select name="payment"><option value="offline">При отриманні</option></select></label><label>Коментар<textarea name="note" maxlength="1000" rows="2"></textarea></label><div class="notice">Навчальне замовлення. Гроші не списуються, фактична доставка не виконується.</div><p class="form-error" role="alert"></p><button type="submit" class="button">Підтвердити · ${money(state.cart.total)}</button></form>`,
  );
}
// The landing page uses live catalog data; layout content does not duplicate products.
function landingSection(title, subtitle, items, link) {
  return `<section class="landing-section"><div class="landing-heading"><div><span class="overline">ОБИРАЙТЕ З РАДІСТЮ</span><h2>${title}</h2><p>${subtitle}</p></div><a class="landing-link" href="${link}">До каталогу <span aria-hidden="true">↗</span></a></div><div class="product-grid">${items.map((p) => productCard(p, state.favorites)).join('') || '<p>Незабаром тут з’являться нові іграшки.</p>'}</div></section>`;
}
async function home() {
  const selection = await api('/products?brand=LEGO&stock=1&limit=4&sort=newest');
  const featured = selection.items.find((p) => p.image.includes('77254')) || selection.items[0];
  const rootCategories = state.categories.filter((c) => !c.parent_id);
  const preferred = ['constructors', 'dolls', 'plush', 'vehicles', 'creative', 'board-games'];
  const picks = preferred
    .map((slug) => rootCategories.find((c) => c.slug === slug))
    .filter(Boolean);
  const shortNames = {
    constructors: 'Конструктори',
    dolls: 'Ляльки',
    plush: 'М’які іграшки',
    vehicles: 'Машинки та роботи',
    creative: 'Творчість',
    'board-games': 'Настільні ігри',
  };
  return `<div class="landing">
    <section class="landing-hero" aria-labelledby="hero-title">
      <div class="hero-copy"><span class="hero-label"><span></span> МІСЦЕ, ДЕ ЖИВЕ ДИТИНСТВО</span>
        <h1 id="hero-title">Маленька іграшка.<br>Велика <em>радість.</em></h1>
        <p>Для перших відкриттів, сміливих мрій<br class="desktop-break"> і ще однієї години «ну будь ласка».</p>
        <a href="#catalog" class="hero-cta">Знайти свою іграшку <span aria-hidden="true">↗</span></a>
        <div class="hero-footnote"><span aria-hidden="true">✧</span> Гратися. Досліджувати. Зростати.</div>
      </div>
      <div class="hero-scene"><span class="hero-orbit" aria-hidden="true"></span><span class="hero-spark spark-one" aria-hidden="true">✳</span><span class="hero-spark spark-two" aria-hidden="true">✧</span>
        ${featured ? `<a class="hero-product" href="#product/${featured.id}"><img src="${esc(featured.image)}" alt="${esc(featured.title)}" width="600" height="430" fetchpriority="high"></a><a class="hero-product-caption" href="#product/${featured.id}"><span><small>У ФОКУСІ · ${esc(featured.brand)}</small><b>${esc(featured.title.replace('Конструктор LEGO® Speed Champions ', '').replace('Конструктор ', ''))}</b></span><strong>${money(featured.price)} <span aria-hidden="true">↗</span></strong></a>` : '<span class="hero-empty">Відкрийте світ гри</span>'}
        <span class="hero-edition">PLAY IS A BIG DEAL.</span>
      </div>
    </section>
    <div class="landing-benefits"><div><span class="benefit-number">01</span><span><b>За віком та інтересами</b><small>Саме те, що захоплює вашу дитину</small></span></div><div><span class="benefit-number">02</span><span><b>Зручно обирати</b><small>Зберігайте улюблене й порівнюйте</small></span></div><div><span class="benefit-number">03</span><span><b>Оплата при отриманні</b><small>Деталі — у розділі оплати й доставки</small></span></div></div>
    <section class="landing-section category-section"><div class="landing-heading"><div><span class="overline">СТІЛЬКИ ВСЬОГО ЦІКАВОГО</span><h2>А що любить ваша дитина?</h2></div><a class="landing-link" href="#catalog">Усі категорії <span aria-hidden="true">↗</span></a></div>
      <div class="landing-categories">${picks.map((c, i) => `<a class="category-tile tone-${i}" href="#catalog?category=${c.id}"><span class="category-art"><img src="${esc(c.icon)}" alt="" width="52" height="52"></span><span>${esc(shortNames[c.slug] || c.name)}</span><span class="tile-arrow" aria-hidden="true">↗</span></a>`).join('')}</div>
    </section>
    ${landingSection('Зібрати. Захопитися. Повторити.', 'Конструктори LEGO для маленьких і великих відкриттів.', selection.items, '#catalog?brand=LEGO')}
    <section class="editorial-grid" aria-label="Ідеї для гри"><a class="editorial-card editorial-play" href="#catalog?category=${rootCategories.find((c) => c.slug === 'board-games')?.id || ''}"><div><span class="overline">ЧАС РАЗОМ — БЕЗЦІННИЙ</span><h2>Відкладіть екрани.<br>Розкладіть гру.</h2><p>Маленькі традиції для великих вечорів.</p><span class="editorial-action">Настільні ігри <span aria-hidden="true">↗</span></span></div><span class="editorial-symbol" aria-hidden="true"><img src="/img/category/dice 1.svg" alt=""></span></a><a class="editorial-card editorial-create" href="#catalog?category=${rootCategories.find((c) => c.slug === 'creative')?.id || ''}"><div><span class="overline">МІСЦЕ ДЛЯ ФАНТАЗІЇ</span><h2>Трішки фарби.<br>Безліч можливостей.</h2><p>Для тих, хто бачить світ по-своєму.</p><span class="editorial-action">Усе для творчості <span aria-hidden="true">↗</span></span></div><span class="editorial-symbol" aria-hidden="true"><img src="/img/category/paint-board-and-brush 1.svg" alt=""></span></a></section>
    <section class="age-discovery"><div><span class="overline">ЗРОСТАЄМО РАЗОМ</span><h2>Кожному віку — своє диво.</h2><p>Оберіть вік, а ми покажемо відповідні іграшки.</p></div><div class="age-links">${[
      [1, '1', 'перші відкриття'],
      [3, '3', 'час досліджувати'],
      [6, '6', 'простір фантазії'],
      [9, '9', 'нові захоплення'],
      [12, '12', 'великі ідеї'],
    ]
      .map(
        ([age, label, sub]) =>
          `<a href="#catalog?age=${age}"><b>${label}</b><span>${age === 1 ? 'рік' : age === 3 ? 'роки' : 'років'}</span><small>${sub}</small></a>`,
      )
      .join('')}</div></section>
    <section class="landing-story"><span class="story-mark" aria-hidden="true">✳</span><div><span class="overline">СВІТ ІГРАШОК</span><h2>Дитинство складається<br>з моментів гри.</h2></div><div><p>Перший конструктор. Улюблений ведмедик. Настільна гра, за якою збирається вся родина. Ми допомагаємо знаходити речі, що стають частиною маленьких великих історій.</p><a class="landing-link" href="#about">Познайомимось ближче <span aria-hidden="true">↗</span></a></div></section>
  </div>`;
}
function options(list, value, valueKey = 'id', labelKey = 'name') {
  return list
    .map(
      (x) =>
        `<option value="${esc(x[valueKey])}" ${String(x[valueKey]) === String(value) ? 'selected' : ''}>${esc(x[labelKey])}</option>`,
    )
    .join('');
}
async function catalog(params, favorites = false) {
  if (favorites && !state.user)
    return '<section class="product-section empty-state"><h1>Ваше обране</h1><p>Увійдіть, щоб зберігати улюблені іграшки.</p><button class="button" data-login>Увійти</button></section>';
  if (favorites) params.set('favorites', '1');
  const result = await api('/products?' + params);
  const category = state.categories.find((c) => c.id === Number(params.get('category')));
  const title = favorites
    ? 'Ваше обране'
    : params.get('q')
      ? `Пошук: «${params.get('q')}»`
      : category?.name || (params.get('sale') === '1' ? 'Гарячі знижки' : 'Каталог іграшок');
  const children = state.categories.filter((c) => c.parent_id === (category?.id || null));
  const pageLink = (page) => {
    const p = new URLSearchParams(params);
    p.set('page', page);
    return '#' + (favorites ? 'favorites' : 'catalog') + '?' + p;
  };
  return `<div class="breadcrumb"><a href="#home">Головна</a> / ${esc(title)}</div><div class="section-heading page-heading"><div><h1>${esc(title)}</h1><p class="muted">Знайдено ${result.total} товарів</p></div></div><div class="catalog-layout"><aside class="filter-panel"><form id="filter-form" class="stack" data-favorites="${favorites}"><h2>Знайти своє</h2><input type="hidden" name="q" value="${esc(params.get('q') || '')}"><label>Категорія<select name="category"><option value="">Усі категорії</option>${options(state.categories, params.get('category'))}</select></label><label>Бренд<select name="brand"><option value="">Усі бренди</option>${options(
    state.brands.map((b) => ({ id: b, name: b })),
    params.get('brand'),
  )}</select></label><div><label>Ціна, ₴</label><div class="price-range"><input name="min" type="number" min="0" max="10000000" step="0.01" placeholder="Від" aria-label="Ціна від" value="${esc(params.get('min') || '')}"><input name="max" type="number" min="0" max="10000000" step="0.01" placeholder="До" aria-label="Ціна до" value="${esc(params.get('max') || '')}"></div></div><label>Вік дитини<select name="age"><option value="">Будь-який вік</option>${[0, 1, 2, 3, 4, 6, 8, 9, 10, 12, 16, 18].map((a) => `<option value="${a}" ${params.get('age') === String(a) ? 'selected' : ''}>${a === 0 ? 'До року' : a + ' ' + (a === 1 ? 'рік' : a < 5 ? 'роки' : 'років')}</option>`).join('')}</select><small>Товари з рекомендованим віком не вище обраного</small></label><label>Сортування<select name="sort">${options(
    [
      { id: 'newest', name: 'Спочатку нові' },
      { id: 'price_asc', name: 'Спочатку дешевші' },
      { id: 'price_desc', name: 'Спочатку дорожчі' },
      { id: 'title', name: 'За назвою' },
    ],
    params.get('sort') || 'newest',
  )}</select></label><label class="check-label"><input type="checkbox" name="stock" value="1" ${params.get('stock') === '1' ? 'checked' : ''}>Тільки в наявності</label><label class="check-label"><input type="checkbox" name="sale" value="1" ${params.get('sale') === '1' ? 'checked' : ''}>Зі знижкою</label><p class="form-error" role="alert"></p><button class="button" type="submit">Застосувати</button><a href="#${favorites ? 'favorites' : 'catalog'}" class="text-link center">Скинути фільтри</a></form></aside><section class="catalog-results"><div class="category-chips">${children.map((c) => `<a href="#catalog?category=${c.id}">${esc(c.name)}</a>`).join('')}</div>${result.items.length ? `<div class="product-grid">${result.items.map((p) => productCard(p, state.favorites)).join('')}</div>` : '<div class="empty-state"><span class="empty-icon">⌕</span><h2>Нічого не знайшлося</h2><p>Спробуйте іншу назву або змініть фільтри.</p></div>'}<nav class="pagination" aria-label="Сторінки каталогу">${result.page > 1 ? `<a class="button secondary" href="${pageLink(result.page - 1)}">← Назад</a>` : ''}${result.pages > 0 ? `<span>${result.page} / ${result.pages}</span>` : ''}${result.page < result.pages ? `<a class="button secondary" href="${pageLink(result.page + 1)}">Далі →</a>` : ''}</nav></section></div>`;
}
async function product(id) {
  const p = await api('/products/' + id);
  return `<div class="breadcrumb"><a href="#catalog">Каталог</a> / <a href="#catalog?category=${p.category_id}">${esc(p.category_name)}</a></div><section class="product-section product-detail"><div class="detail-image"><img src="${esc(p.image)}" alt="${esc(p.title)}"></div><div class="stack"><span class="eyebrow">${esc(p.brand)} · Артикул SI-${p.id}</span><h1>${esc(p.title)}</h1><p class="product-status ${p.stock ? 'in-stock' : 'out-of-stock'}">${p.stock ? 'В наявності · ' + p.stock + ' шт.' : 'Немає в наявності'}</p><div>${p.old_price ? `<span class="product-old-price">${money(p.old_price)}</span>` : ''}<div class="detail-price">${money(p.price)}</div></div><div class="product-actions"><button class="button" data-buy="${p.id}" ${!p.stock ? 'disabled' : ''}>Додати у кошик</button><button class="button secondary" data-favorite="${p.id}">${state.favorites.includes(p.id) ? '♥ В обраному' : '♡ В обране'}</button></div><dl class="specs"><div><dt>Рекомендований вік</dt><dd>${p.age_min}+</dd></div><div><dt>Бренд</dt><dd>${esc(p.brand)}</dd></div><div><dt>Категорія</dt><dd>${esc(p.category_name)}</dd></div></dl><h2>Про іграшку</h2><p class="description">${esc(p.description)}</p><p class="muted">Оплата при отриманні. Самовивіз або доставка за адресою.</p></div></section>`;
}
async function account() {
  if (!state.user)
    return '<section class="product-section empty-state"><h1>Особистий кабінет</h1><p>Ваші покупки та улюблені іграшки в одному місці.</p><button class="button" data-login>Увійти або зареєструватися</button></section>';
  const orders = await api('/orders');
  return `<section class="product-section"><div class="section-heading"><div><p class="eyebrow">Особистий кабінет</p><h1>Вітаємо, ${esc(state.user.name)}!</h1><p class="muted">${esc(state.user.email)}</p></div><button class="button secondary" id="logout-button">Вийти</button></div><h2>Мої замовлення</h2>${orders.length ? orders.map((o) => orderCard(o)).join('') : '<div class="empty-state"><p>Тут з’являться ваші замовлення.</p><a class="button" href="#catalog">Обрати іграшки</a></div>'}</section>`;
}
function info(page) {
  const content = {
    about: [
      'Гра починається тут',
      'Світ Іграшок — навчальний інтернет-магазин, створений для вивчення повного циклу веброзробки. Обирайте іграшки за категорією, віком і ціною, зберігайте обране та створюйте демонстраційні замовлення. Усі дані асортименту є прикладами.',
    ],
    delivery: [
      'Оплата та доставка',
      'Оплата при отриманні — єдиний доступний спосіб. Онлайн-платежі не підключені. Самовивіз у демонстраційному магазині безкоштовний. Для доставки залиште адресу; її вартість не входить до суми замовлення та потребуватиме окремого узгодження. Замовлення навчальні: фактичні платежі й відправлення не виконуються.',
    ],
    contacts: [
      'Магазин та контакти',
      'Демонстраційна адреса: Київ, вул. Іграшкова, 1. Години роботи: щодня, 09:00–20:00. Це навчальний проєкт; за цією адресою магазин не обслуговує реальних покупців.',
    ],
    privacy: [
      'Ваші дані',
      'Магазин зберігає ім’я, email, хеш пароля, кошик, обране та дані оформлених замовлень у локальній базі даних. Для входу використовується cookie сесії, для гостьового кошика — сховище браузера. У навчальному середовищі використовуйте вигадані персональні дані.',
    ],
  };
  const [title, body] = content[page] || [
    'Сторінку не знайдено',
    'Перейдіть до каталогу, щоб продовжити покупки.',
  ];
  return `<section class="product-section info-page"><p class="eyebrow">Світ Іграшок</p><h1>${title}</h1><p>${body}</p><a href="#catalog" class="button">До каталогу →</a></section>`;
}
async function render() {
  const version = ++renderVersion;
  const [path, query = ''] = (location.hash.slice(1) || 'home').split('?');
  const params = new URLSearchParams(query);
  $('#search-form input').value = params.get('q') || '';
  $('#app').setAttribute('aria-busy', 'true');
  try {
    let html;
    if (path === 'home') html = await home();
    else if (path === 'catalog' || path === 'favorites')
      html = await catalog(params, path === 'favorites');
    else if (path.startsWith('product/')) html = await product(path.slice(8));
    else if (path === 'account') html = await account();
    else html = info(path);
    if (version !== renderVersion) return;
    $('#app').innerHTML = html;
    document.title =
      ($('#app h1')?.innerText.replace(/\s+/g, ' ') || 'Іграшки для щасливого дитинства') +
      ' — Світ Іграшок';
  } catch (error) {
    if (version === renderVersion)
      $('#app').innerHTML =
        `<section class="product-section empty-state"><h1>Не вдалося завантажити</h1><p>${esc(error.message)}</p><button class="button" data-retry>Спробувати знову</button></section>`;
  } finally {
    if (version === renderVersion) $('#app').removeAttribute('aria-busy');
  }
}
initializeDialog();
$('#search-form').addEventListener('submit', (event) => {
  event.preventDefault();
  location.hash = 'catalog?q=' + encodeURIComponent(new FormData(event.target).get('q').trim());
});
$('#account-button').addEventListener('click', () =>
  state.user ? (location.hash = 'account') : authDialog(),
);
$('#cart-button').addEventListener('click', async () => {
  try {
    await refreshCart();
    cartDialog();
  } catch (e) {
    toast(e.message);
  }
});
window.addEventListener('hashchange', () => {
  closeDialog();
  render();
  window.scrollTo({ top: 0, behavior: 'instant' });
});
document.addEventListener('change', (event) => {
  if (event.target.id === 'delivery-method') {
    const delivery = event.target.value === 'delivery';
    $('#address-label').hidden = !delivery;
    $('#address-label input').required = delivery;
    $('#delivery-note').textContent = delivery
      ? 'Вартість доставки узгоджується окремо та не входить до суми товарів.'
      : 'Самовивіз: Київ, вул. Іграшкова, 1 (демонстраційна адреса).';
  }
});
document.addEventListener('click', async (event) => {
  const node = event.target.closest('button,a');
  if (!node) return;
  try {
    if (node.hasAttribute('data-close')) closeDialog();
    if (node.hasAttribute('data-login')) authDialog();
    if (node.hasAttribute('data-auth-toggle')) authDialog(node.dataset.authToggle === 'true');
    if (node.hasAttribute('data-retry')) await render();
    if (node.hasAttribute('data-buy')) {
      node.disabled = true;
      await refreshCart();
      const id = Number(node.dataset.buy),
        quantity = (state.cart.items.find((p) => p.id === id)?.quantity || 0) + 1;
      await setQuantity(id, quantity);
      toast('Іграшку додано до кошика');
    }
    if (node.hasAttribute('data-quantity')) {
      node.disabled = true;
      await setQuantity(Number(node.dataset.quantity), Number(node.dataset.value));
      cartDialog();
    }
    if (node.hasAttribute('data-favorite')) {
      if (!state.user) {
        authDialog();
        return;
      }
      node.disabled = true;
      const id = Number(node.dataset.favorite),
        saved = !state.favorites.includes(id);
      await api('/favorites/' + id, { method: 'PUT', body: { saved } });
      state.favorites = saved ? [...state.favorites, id] : state.favorites.filter((x) => x !== id);
      await render();
      toast(saved ? 'Додано до обраного' : 'Прибрано з обраного');
    }
    if (node.id === 'checkout-button') checkoutDialog();
    if (node.id === 'logout-button') {
      await api('/auth/logout', { method: 'POST' });
      state.user = null;
      state.favorites = [];
      setCsrf(null);
      await refreshCart();
      await render();
      toast('Ви вийшли з акаунту');
    }
  } catch (error) {
    toast(error.message);
  } finally {
    if (
      node.hasAttribute('data-buy') ||
      node.hasAttribute('data-favorite') ||
      node.hasAttribute('data-quantity')
    )
      node.disabled = false;
  }
});
document.addEventListener('submit', (event) => {
  const form = event.target;
  if (!['auth-form', 'checkout-form', 'filter-form'].includes(form.id)) return;
  event.preventDefault();
  submitForm(form, async () => {
    const data = Object.fromEntries(new FormData(form));
    if (form.id === 'auth-form') {
      const result = await api(
        '/auth/' + (form.dataset.register === 'true' ? 'register' : 'login'),
        { method: 'POST', body: data },
      );
      state.user = result.user;
      setCsrf(result.csrfToken);
      await mergeGuestCart();
      state.favorites = await api('/favorites');
      await refreshCart();
      closeDialog();
      await render();
      toast('Вітаємо, ' + state.user.name + '!');
    }
    if (form.id === 'checkout-form') {
      const order = await api('/orders', {
        method: 'POST',
        body: data,
        headers: { 'Idempotency-Key': checkoutKey },
      });
      checkoutKey = null;
      await refreshCart();
      closeDialog();
      location.hash = 'account';
      await render();
      toast('Замовлення №' + order.id + ' успішно створено!');
    }
    if (form.id === 'filter-form') {
      if (data.min && data.max && Number(data.min) > Number(data.max))
        throw new Error('Мінімальна ціна не може перевищувати максимальну.');
      const params = new URLSearchParams(Object.entries(data).filter(([, v]) => v !== ''));
      location.hash = (form.dataset.favorites === 'true' ? 'favorites' : 'catalog') + '?' + params;
    }
  });
});
async function boot() {
  try {
    [state.user, state.categories, state.brands] = await Promise.all([
      session(),
      api('/categories'),
      api('/brands'),
    ]);
    if (state.user) state.favorites = await api('/favorites');
    await refreshCart();
    await render();
  } catch (error) {
    $('#app').innerHTML =
      `<div class="empty-state"><h1>Магазин тимчасово недоступний</h1><p>${esc(error.message)}</p><p>Перевірте, чи запущений сервер, та оновіть сторінку.</p></div>`;
  }
}
boot();
