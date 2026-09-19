export const $ = (selector, root = document) => root.querySelector(selector);
export const esc = (value) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
export const money = (value) =>
  new Intl.NumberFormat('uk-UA', {
    style: 'currency',
    currency: 'UAH',
    maximumFractionDigits: 2,
  }).format(value / 100);
export const date = (value) =>
  new Intl.DateTimeFormat('uk-UA', { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(value.replace(' ', 'T') + 'Z'),
  );
export const statusLabels = {
  new: 'Нове',
  confirmed: 'Підтверджене',
  shipped: 'Відправлене',
  completed: 'Виконане',
  cancelled: 'Скасоване',
};
let toastTimeout;
export function toast(message) {
  const node = $('#toast');
  node.textContent = message;
  node.hidden = false;
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => (node.hidden = true), 5000);
}
export function showDialog(title, html, { wide = false } = {}) {
  const dialog = $('#modal');
  $('#modal-title').textContent = title;
  $('#modal-body').innerHTML = html;
  dialog.classList.toggle('wide', wide);
  if (!dialog.open) dialog.showModal();
}
export function closeDialog() {
  $('#modal').close();
}
export function initializeDialog() {
  $('#close-modal').addEventListener('click', closeDialog);
  $('#modal').addEventListener('click', (event) => {
    if (event.target === $('#modal')) {
      const r = event.target.getBoundingClientRect();
      if (
        event.clientX < r.left ||
        event.clientX > r.right ||
        event.clientY < r.top ||
        event.clientY > r.bottom
      )
        closeDialog();
    }
  });
}
export async function submitForm(form, action) {
  const button = form.querySelector('[type=submit]');
  const error = form.querySelector('.form-error');
  if (button.disabled) return;
  button.disabled = true;
  if (error) error.textContent = '';
  try {
    await action();
  } catch (e) {
    if (error) error.textContent = e.message;
    else toast(e.message);
  } finally {
    button.disabled = false;
  }
}
export function productCard(p, favorites = []) {
  return `<article class="product-card">
    ${p.old_price ? `<div class="discount-badge">−${Math.round((1 - p.price / p.old_price) * 100)}%</div>` : ''}
    <button class="btn-favorite ${favorites.includes(p.id) ? 'saved' : ''}" data-favorite="${p.id}" aria-label="${favorites.includes(p.id) ? 'Прибрати з обраного' : 'Додати до обраного'}" aria-pressed="${favorites.includes(p.id)}">♥</button>
    <a class="product-image-wrap" href="#product/${p.id}"><img class="product-image" src="${esc(p.image)}" alt="${esc(p.title)}" loading="lazy"></a>
    <div class="product-meta">${esc(p.brand)} <span>${p.age_min}+</span></div>
    <h3 class="product-title"><a href="#product/${p.id}">${esc(p.title)}</a></h3>
    <div class="product-status ${p.stock > 0 ? 'in-stock' : 'out-of-stock'}"><span class="status-icon"></span>${p.stock > 0 ? 'В наявності' : 'Немає в наявності'}</div>
    <div class="product-price-wrap">${p.old_price ? `<span class="product-old-price">${money(p.old_price)}</span>` : ''}<span class="product-price ${p.old_price ? 'discount' : ''}">${money(p.price)}</span></div>
    <div class="product-actions"><button class="btn-buy" data-buy="${p.id}" ${p.stock < 1 ? 'disabled' : ''}><img src="/img/products/cart.svg" alt="">У кошик</button><a class="btn-one-click" href="#product/${p.id}">Детальніше</a></div>
  </article>`;
}
export function orderCard(order, admin = false) {
  return `<article class="order-card"><div class="section-heading"><div><strong>Замовлення №${order.id}</strong><div class="muted">${date(order.created_at)}</div></div><span class="status-pill status-${esc(order.status)}">${statusLabels[order.status]}</span></div>
    ${order.items.map((item) => `<div class="order-line"><img src="${esc(item.image)}" alt=""><span>${esc(item.title)}<small>${item.quantity} × ${money(item.price)}</small></span><b>${money(item.price * item.quantity)}</b></div>`).join('')}
    <div class="order-bottom"><span>${esc(order.customer_name)} · ${esc(order.phone)}<br>${esc(order.address)}${order.note ? `<br>${esc(order.note)}` : ''}</span><strong>${money(order.total)}</strong></div>
    <p class="muted">Оплата при отриманні · ${order.payment_status === 'paid' ? 'Сплачено' : 'Очікує оплати'}</p>
    ${admin ? `<form class="status-form" data-order="${order.id}"><label>Новий статус<select name="status">${{ new: ['confirmed', 'cancelled'], confirmed: ['shipped', 'completed', 'cancelled'], shipped: ['completed'], completed: [], cancelled: [] }[order.status].map((s) => `<option value="${s}">${statusLabels[s]}</option>`).join('')}</select></label><button type="submit" class="button" ${['completed', 'cancelled'].includes(order.status) ? 'disabled' : ''}>Змінити статус</button><p class="form-error" role="alert"></p></form>` : ''}
  </article>`;
}
