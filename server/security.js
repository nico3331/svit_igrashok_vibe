import { randomBytes, scrypt as scryptCallback, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
const scrypt = promisify(scryptCallback);
export const hashToken = (token) => createHash('sha256').update(token).digest('hex');
export const randomToken = () => randomBytes(32).toString('hex');
export async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${(await scrypt(password, salt, 64)).toString('hex')}`;
}
export async function verifyPassword(password, stored) {
  const [salt, hex] = stored.split(':');
  const actual = await scrypt(password, salt, 64);
  const expected = Buffer.from(hex, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
export function assert(condition, message, status = 400) {
  if (!condition) throw new HttpError(status, message);
}
export function text(value, label, max = 200, min = 1) {
  assert(typeof value === 'string', `Заповніть поле «${label}».`);
  const result = value.trim();
  assert(
    result.length >= min && result.length <= max,
    `Поле «${label}»: від ${min} до ${max} символів.`,
  );
  return result;
}
export function integer(value, label, min = 0, max = 1_000_000_000) {
  assert(
    Number.isSafeInteger(value) && value >= min && value <= max,
    `Некоректне поле «${label}».`,
  );
  return value;
}
export function email(value) {
  const result = text(value, 'Email', 254).toLowerCase();
  assert(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result), 'Вкажіть коректний email.');
  return result;
}
export function password(value) {
  assert(
    typeof value === 'string' && value.length >= 10 && value.length <= 128,
    'Пароль має містити від 10 до 128 символів.',
  );
  return value;
}
