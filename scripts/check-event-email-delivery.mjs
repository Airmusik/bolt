import { connectProjectDatabase, readProjectEnvironment } from './db-connection.mjs';

const ids = process.argv.slice(2).map(Number).filter(Number.isFinite);
const db = await connectProjectDatabase(await readProjectEnvironment(), 'event_email_delivery_check');
try {
  const result = await db.query(
    `select id, status_code, content from net._http_response where id = any($1::bigint[]) order by id`,
    [ids],
  );
  console.log(JSON.stringify(result.rows));
} finally { await db.end(); }
