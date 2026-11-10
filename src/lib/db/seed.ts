import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { hash } from 'bcryptjs';
import * as schema from './schema';

async function seed() {
  const DATABASE_URL = process.env.DATABASE_URL;
  if (!DATABASE_URL) {
    console.error('DATABASE_URL is required');
    process.exit(1);
  }

  const sql = neon(DATABASE_URL);
  const db = drizzle(sql, { schema });

  console.log('Seeding database...');

  // Check if demo user already exists
  const existing = await db
    .select()
    .from(schema.users)
    .where(
      require('drizzle-orm').eq(schema.users.email, 'demo@gapfinder.ai')
    )
    .limit(1);

  if (existing.length > 0) {
    console.log('Demo user already exists, skipping seed.');
    return;
  }

  // Create demo user
  const passwordHash = await hash('demo1234', 10);
  await db.insert(schema.users).values({
    email: 'demo@gapfinder.ai',
    name: 'Demo Student',
    passwordHash,
  });

  console.log('Demo user created:');
  console.log('  Email: demo@gapfinder.ai');
  console.log('  Password: demo1234');
  console.log('Seed complete.');
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});

