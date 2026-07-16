import PocketBase from 'pocketbase';
import * as dotenv from 'dotenv';
dotenv.config();

const pb = new PocketBase(process.env.POCKETBASE_URL);

async function run() {
	try {
		// Log in as regular user
		const authData = await pb.collection('users').authWithPassword('66050160', 'born5415');
		console.log('Logged in to PocketBase as regular user successfully.');
		console.log('User ID:', authData.record.id);
		console.log('User Email:', authData.record.email);

		// Test 1: Query with no filter (PocketBase will apply listRule automatically)
		try {
			const list1 = await pb.collection('instances').getList(1, 5, {
				expand: 'passion_group,email'
			});
			console.log('\nTest 1 (No filter) - Success! Count:', list1.items.length);
			if (list1.items.length > 0) {
				console.log('First item ID:', list1.items[0].id);
				console.log('First item email relation ID:', list1.items[0].email);
				console.log('First item expanded email:', list1.items[0].expand?.email?.email);
			}
		} catch (err) {
			console.error('\nTest 1 (No filter) - Failed:', err.message);
		}

		// Test 2: Query with filter email = user.id
		try {
			const list2 = await pb.collection('instances').getList(1, 5, {
				filter: `email = "${authData.record.id}"`,
				expand: 'passion_group,email'
			});
			console.log('\nTest 2 (Filter: email = user.id) - Success! Count:', list2.items.length);
		} catch (err) {
			console.error('\nTest 2 (Filter: email = user.id) - Failed:', err.message);
		}

		// Test 3: Query with filter email.email = user.email
		try {
			const list3 = await pb.collection('instances').getList(1, 5, {
				filter: `email.email = "${authData.record.email}"`,
				expand: 'passion_group,email'
			});
			console.log('\nTest 3 (Filter: email.email = user.email) - Success! Count:', list3.items.length);
		} catch (err) {
			console.error('\nTest 3 (Filter: email.email = user.email) - Failed:', err.message);
		}

	} catch (e) {
		console.error('Login/General Error:', e);
	}
}

run();
