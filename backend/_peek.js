require('dotenv').config();
const { MongoClient } = require('mongodb');
(async () => {
  const url = process.env.TARGET_MONGODB_URI;
  const client = new MongoClient(url);
  await client.connect();
  const db = client.db();
  const cols = await db.listCollections().toArray();
  console.log('all collections:', cols.map(c=>c.name));
  const targets = cols.map(c=>c.name).filter(n=>/customtable|measurement|expected|cashflow/i.test(n));
  console.log('targets:', targets);
  for (const n of targets) {
    console.log('---', n, '---');
    const docs = await db.collection(n).find({}).limit(5).toArray();
    console.log(JSON.stringify(docs, null, 2));
  }
  await client.close();
})().catch(e=>{console.error(e); process.exit(1);});
