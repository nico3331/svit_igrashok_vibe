import { openDatabase } from './db.js';
import { createApp } from './app.js';
const db = openDatabase();
const port = Number(process.env.PORT || 3000),
  host = process.env.HOST || '127.0.0.1';
const server = createApp(db).listen(port, host, () =>
  console.log(`Світ Іграшок: http://${host}:${port}`),
);
function shutdown() {
  server.close(() => {
    db.close();
    process.exit(0);
  });
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
