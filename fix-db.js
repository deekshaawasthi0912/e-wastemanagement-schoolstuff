import mongoose from 'mongoose';

const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/ewaste';

async function fixDatabase() {
    try {
        console.log('🔗 Connecting to MongoDB...');
        await mongoose.connect(mongoUri);
        console.log('✅ Connected to MongoDB');

        const db = mongoose.connection.db;
        
        // Get all indexes on users collection
        try {
            const indexes = await db.collection('users').listIndexes().toArray();
            console.log('\n📋 Current indexes:');
            indexes.forEach(idx => console.log('  -', idx.name));
            
            // Drop problematic indexes
            const problematicIndexes = ['orders.orderId_1', 'orders_orderId_1'];
            for (const indexName of problematicIndexes) {
                try {
                    await db.collection('users').dropIndex(indexName);
                    console.log(`✅ Dropped index: ${indexName}`);
                } catch (err) {
                    if (!err.message.includes('index not found')) {
                        console.log(`⚠️  Could not drop ${indexName}: ${err.message}`);
                    }
                }
            }
        } catch (err) {
            console.log('⚠️  Could not list indexes:', err.message);
        }

        // Delete all existing user documents to start fresh
        const result = await db.collection('users').deleteMany({});
        console.log(`✅ Deleted ${result.deletedCount} existing users\n`);

        console.log('✅ Database fixed! You can now register new users.');
        process.exit(0);
    } catch (err) {
        console.error('❌ Error fixing database:', err.message);
        process.exit(1);
    }
}

fixDatabase();
