import { openDatabase } from './db.js';
import { randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { hashPassword, email, password, text } from './security.js';
const db = openDatabase();
try {
  const address = email(process.env.ADMIN_EMAIL || 'admin@svit.local');
  const generated = !process.env.ADMIN_PASSWORD;
  const secret = password(process.env.ADMIN_PASSWORD || randomBytes(18).toString('base64url'));
  const name = text(process.env.ADMIN_NAME || 'Адміністратор', 'Ім’я', 80);
  if (db.prepare('SELECT id FROM users WHERE email=?').get(address))
    throw new Error('Email уже використовується. Оберіть інший email для нового адміністратора.');
  db.prepare("INSERT INTO users(name,email,password_hash,role) VALUES (?,?,?,'admin')").run(
    name,
    address,
    await hashPassword(secret),
  );
  if (generated) {
    mkdirSync('data', { recursive: true });
    writeFileSync(
      'data/admin-access.txt',
      `Локальний навчальний магазин\nEmail: ${address}\nПароль: ${secret}\n\nВхід: http://127.0.0.1:3000/#account\nАдмінка: http://127.0.0.1:3000/admin.html\nФайл не включається в Git. Збережіть пароль і приберіть цей файл перед публікацією.\n`,
      { mode: 0o600 },
    );
    console.log('Дані для входу збережено в data/admin-access.txt');
  }
  console.log(`Адміністратора ${address} створено.`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  db.close();
}
