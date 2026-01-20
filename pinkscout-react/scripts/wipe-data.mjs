/**
 * =============================================================================
 * WIPE-DATA.MJS - Script to wipe all user and scouting data from Firebase
 * =============================================================================
 * 
 * Run with: node scripts/wipe-data.mjs
 * 
 * This script will:
 * 1. Delete all documents in the 'scouting' collection
 * 2. Delete all documents in the 'users' collection
 * 3. Reset the 'settings/admins' document to only have rtmbe20@gmail.com
 * 
 * =============================================================================
 */

import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, deleteDoc, doc, setDoc } from 'firebase/firestore';

// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyCqUoIrwQdBFlaF0P9NfTRN7pVfji5p3-M",
  authDomain: "pinkscout-470d1.firebaseapp.com",
  projectId: "pinkscout-470d1",
  storageBucket: "pinkscout-470d1.firebasestorage.app",
  messagingSenderId: "386591970958",
  appId: "1:386591970958:web:a7a9483684c3418cea1bdf"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const PRIMARY_ADMIN_EMAIL = 'rtmbe20@gmail.com';

async function wipeCollection(collectionName, preserveEmails = []) {
  console.log(`\n🗑️  Wiping collection: ${collectionName}...`);
  const snapshot = await getDocs(collection(db, collectionName));
  let deleted = 0;
  let preserved = 0;

  for (const docSnap of snapshot.docs) {
    const data = docSnap.data();
    // Check if this document should be preserved (for users collection)
    if (preserveEmails.length > 0 && data.email && 
        preserveEmails.includes(data.email.toLowerCase())) {
      console.log(`   ✓ Preserved: ${data.email}`);
      preserved++;
      continue;
    }
    
    await deleteDoc(doc(db, collectionName, docSnap.id));
    deleted++;
  }

  console.log(`   ✅ Deleted ${deleted} documents, preserved ${preserved}`);
  return { deleted, preserved };
}

async function resetAdminSettings() {
  console.log(`\n🔐 Resetting admin settings...`);
  await setDoc(doc(db, 'settings', 'admins'), {
    emails: [PRIMARY_ADMIN_EMAIL.toLowerCase()]
  });
  console.log(`   ✅ Admin set to: ${PRIMARY_ADMIN_EMAIL}`);
}

async function main() {
  console.log('='.repeat(60));
  console.log('  PINKSCOUT DATA WIPE SCRIPT');
  console.log('='.repeat(60));
  console.log(`\n⚠️  This will delete ALL scouting data and user profiles!`);
  console.log(`   Only ${PRIMARY_ADMIN_EMAIL} will be preserved as admin.\n`);

  try {
    // Wipe scouting data
    const scoutingResult = await wipeCollection('scouting');
    
    // Wipe user data (preserve the primary admin)
    const usersResult = await wipeCollection('users', [PRIMARY_ADMIN_EMAIL.toLowerCase()]);
    
    // Reset admin settings
    await resetAdminSettings();

    console.log('\n' + '='.repeat(60));
    console.log('  WIPE COMPLETE');
    console.log('='.repeat(60));
    console.log(`\n📊 Summary:`);
    console.log(`   - Scouting entries deleted: ${scoutingResult.deleted}`);
    console.log(`   - User profiles deleted: ${usersResult.deleted}`);
    console.log(`   - User profiles preserved: ${usersResult.preserved}`);
    console.log(`   - Admin reset to: ${PRIMARY_ADMIN_EMAIL}`);
    console.log('\n✅ Data wipe completed successfully!\n');

    process.exit(0);
  } catch (error) {
    console.error('\n❌ Error during data wipe:', error);
    process.exit(1);
  }
}

main();

