import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { compare } from 'bcryptjs';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { createSession } from '@/lib/auth/session';
import { checkRateLimit, recordLoginAttempt } from '@/lib/auth/rate-limit';

const loginSchema = z.object({
  email: z.string().email('Invalid email'),
  password: z.string().min(1, 'Password is required'),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = loginSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });
    }

    const { email, password } = parsed.data;
    const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || '0.0.0.0';

    // Rate limiting
    const rateCheck = await checkRateLimit(email, ip);
    if (!rateCheck.allowed) {
      return NextResponse.json(
        { error: `Too many login attempts. Try again in ${Math.ceil((rateCheck.retryAfter || 900) / 60)} minutes.` },
        { status: 429 }
      );
    }

    // Find user
    const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
    if (!user) {
      await recordLoginAttempt(email, ip, false);
      return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
    }

    // Verify password
    const valid = await compare(password, user.passwordHash);
    if (!valid) {
      await recordLoginAttempt(email, ip, false);
      return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
    }

    // Record success and create session
    await recordLoginAttempt(email, ip, true);
    await createSession({ userId: user.id, email: user.email });

    return NextResponse.json({ user: { id: user.id, email: user.email, name: user.name } });
  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json({ error: 'Login failed' }, { status: 500 });
  }
}
