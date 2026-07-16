import PocketBase from 'pocketbase';
import * as dotenv from 'dotenv';
dotenv.config();

async function run() {
    const pb = new PocketBase(process.env.POCKETBASE_URL);
    await pb.admins.authWithPassword(process.env.PB_ADMIN_EMAIL, process.env.PB_ADMIN_PASSWORD);
    
    // Check collections
    const collections = await pb.collections.getFullList();
    console.log("Collections:", collections.map(c => c.name));
    
    // Find the user type collection (usually user_types or similar)
    const userTypeCollectionName = collections.find(c => c.name.startsWith('user_type'))?.name;
    if (userTypeCollectionName) {
        const roles = await pb.collection(userTypeCollectionName).getFullList();
        console.log(`Roles in ${userTypeCollectionName}:`, roles.map(r => ({ id: r.id, type: r.type, name: r.name })));
    } else {
        console.log("No user_type collection found!");
    }
}

run().catch(console.error);
