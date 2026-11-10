import { db } from '@/lib/db';
import { loginAttempts } from '@/lib/db/schema';
import { and, gte, eq, sql } from 'drizzle-orm';
import { CONFIG } from '@/lib/config';

export async function checkRateLimit(email: string, ipAddress: string): Promise<{ allowed: boolean; retryAfter?: number }> {
  const windowStart = new Date(Date.now() - CONFIG.RATE_LIMIT_WINDOW_MS);

  // Count recent failed attempts for this email or IP
  const result = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(loginAttempts)
    .where(
      and(
        gte(loginAttempts.attemptedAt, windowStart),
        eq(loginAttempts.success, false),
        sql`(${loginAttempts.email} = ${email} OR ${loginAttempts.ipAddress} = ${ipAddress})`
      )
    );

  const count = result[0]?.count ?? 0;

  if (count >= CONFIG.RATE_LIMIT_MAX_ATTEMPTS) {
    const retryAfter = Math.ceil(CONFIG.RATE_LIMIT_WINDOW_MS / 1000);
    return { allowed: false, retryAfter };
  }

  return { allowed: true };
}

export async function recordLoginAttempt(email: string, ipAddress: string, success: boolean): Promise<void> {
  await db.insert(loginAttempts).values({ email, ipAddress, success });
}
