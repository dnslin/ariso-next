import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { expect, it } from 'vitest';
import { resetCliPassword } from '../../../src/server/identity/reset-password.ts';

it.each([
  {
    password: 'secret!',
    confirmation: 'secret!',
    message: '密码至少 8 个字符',
  },
  {
    password: 'private'.repeat(19),
    confirmation: 'private'.repeat(19),
    message: '密码最多 128 个字符',
  },
  {
    password: 'private-password',
    confirmation: 'different-password',
    message: '两次输入的密码不一致',
  },
])(
  'CLI recovery rejects invalid input with only the user-facing reason: $message',
  async ({ password, confirmation, message }) => {
    // No business tables: invalid input must be rejected before any database work.
    const client = new Database(':memory:');
    try {
      await expect(
        resetCliPassword(drizzle(client), password, confirmation),
      ).rejects.toHaveProperty('message', message);
    } finally {
      client.close();
    }
  },
);

it('an already cancelled recovery retains the cancellation reason before database work', async () => {
  const client = new Database(':memory:');
  const cancellation = new AbortController();
  const reason = new Error('已取消');
  cancellation.abort(reason);
  try {
    await expect(
      resetCliPassword(
        drizzle(client),
        'private-password',
        'private-password',
        cancellation.signal,
      ),
    ).rejects.toBe(reason);
  } finally {
    client.close();
  }
});
