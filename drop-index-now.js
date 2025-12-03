import { MongoClient } from 'mongodb';

const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017';

async function run() {
    const client = new MongoClient(uri);
    try {
        console.log('Connecting to MongoDB server:', uri);
        await client.connect();

        const admin = client.db().admin();
        const { databases } = await admin.listDatabases();
        console.log('Databases found:', databases.map(d => d.name).join(', '));

        const candidates = ['orders.orderId_1', 'orders_orderId_1', 'orders.orderId'];

        for (const dbInfo of databases) {
            const dbName = dbInfo.name;
            const db = client.db(dbName);
            const collections = await db.listCollections().toArray();
            const hasUsers = collections.some(c => c.name === 'users');
            if (!hasUsers) continue;

            console.log(`\nChecking indexes in ${dbName}.users`);
            const coll = db.collection('users');
            const indexes = await coll.listIndexes().toArray();
            indexes.forEach(i => console.log(' -', i.name, JSON.stringify(i.key)));

            for (const name of candidates) {
                try {
                    await coll.dropIndex(name);
                    console.log(`Dropped index ${name} from ${dbName}.users`);
                } catch (err) {
                    if (err.codeName === 'IndexNotFound' || /index not found/i.test(err.message)) {
                        // ignore
                    } else {
                        console.warn(`Could not drop ${name} from ${dbName}.users:`, err.message);
                    }
                }
            }
        }

        console.log('\nDone. Restart your server to pick up changes.');
        await client.close();
        process.exit(0);
    } catch (err) {
        console.error('Error scanning/dropping indexes:', err.message);
        await client.close();
        process.exit(1);
    }
}

run();
