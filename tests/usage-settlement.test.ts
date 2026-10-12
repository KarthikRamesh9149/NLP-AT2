import { createServer } from 'node:http';
import { afterEach, expect, it, vi } from 'vitest';
import { costMicroUsd, settleUsage } from '../lib/server/usage-budget';

afterEach(() => vi.unstubAllEnvs());

it('settles known usage but retains the full reservation when a failed call has unknown usage', async () => {
  const payloads: Array<{ p_actual_cost: number }> = [];
  const server = createServer(async (request,response) => {
    let raw=''; for await (const chunk of request) raw+=chunk;
    payloads.push(JSON.parse(raw)); response.setHeader('Content-Type','application/json'); response.end('null');
  });
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL',`http://127.0.0.1:${(server.address() as {port:number}).port}`);
  vi.stubEnv('SUPABASE_SECRET_KEY','local-test-only-key');
  const usage = {inputTokens:100,outputTokens:80,model:'gpt-6.1-sol'};
  try {
    await settleUsage('known-usage',usage);
    expect(payloads).toHaveLength(1); expect(payloads[0].p_actual_cost).toBe(costMicroUsd(usage.model,100,80));
    await settleUsage('unknown-primary-usage',{...usage,incomplete:true,attemptedCalls:2});
    expect(payloads).toHaveLength(1);
  } finally { await new Promise<void>(resolve=>server.close(()=>resolve())); }
});
