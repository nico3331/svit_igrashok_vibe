// Payment boundary: a future provider implements this contract. No card data is stored here.
const offline = {
  code: 'offline',
  label: 'Оплата при отриманні',
  prepare() {
    return { provider: 'offline', status: 'pending' };
  },
};
export const paymentProviders = { offline };
export function preparePayment(code) {
  const provider = paymentProviders[code];
  if (!Object.hasOwn(paymentProviders, code)) throw new Error('Unsupported payment provider');
  return provider.prepare();
}
