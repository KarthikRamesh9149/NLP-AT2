import { createServer } from 'node:http';
import { afterEach, expect, it, vi } from 'vitest';
import { extractFullState } from '../lib/ai';

afterEach(() => vi.unstubAllEnvs());

it('can run the contextual baseline on a reasoning model without unsupported sampling settings', async () => {
  const state = {
    restaurantName: { value: null, status: 'missing', constraint: null },
    city: { value: 'Sydney', status: 'resolved', constraint: null },
    date: { value: null, status: 'missing', constraint: null },
    time: { value: null, status: 'missing', constraint: null },
    partySize: { value: '4', status: 'resolved', constraint: null },
  };
  let requestBody: Record<string, unknown> | undefined;
  const server = createServer(async (request, response) => {
    let raw = ''; for await (const chunk of request) raw += chunk;
    requestBody = JSON.parse(raw);
    response.setHeader('Content-Type', 'application/json');
    if (requestBody?.temperature !== undefined || (requestBody?.reasoning as { effort?: string })?.effort !== 'low') {
      response.writeHead(400); response.end(JSON.stringify({ error: { message: 'Reasoning request settings are invalid', type: 'invalid_request_error' } })); return;
    }
    response.end(JSON.stringify({ id: 'resp_test', object: 'response', created_at: 1, status: 'completed', model: 'gpt-6-luna',
      output: [{ id: 'msg_test', type: 'message', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: JSON.stringify(state), annotations: [] }] }],
      usage: { input_tokens: 20, output_tokens: 10, total_tokens: 30 } }));
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as { port: number };
  vi.stubEnv('OPENAI_API_KEY', 'test-only-key');
  vi.stubEnv('OPENAI_BASE_URL', `http://127.0.0.1:${address.port}/v1`);
  vi.stubEnv('OPENAI_MODEL', 'gpt-6-luna');
  try {
    const result = await extractFullState([{ id: 'm1', speaker: 'customer', text: 'Four in Sydney' }], null);
    expect(result.state.city.value).toBe('Sydney');
    expect(result.state.partySize.value).toBe('4');
    expect(result.usage).toEqual({ inputTokens: 20, outputTokens: 10, model: 'gpt-6-luna' });
    expect(requestBody?.model).toBe('gpt-6-luna');
    expect(requestBody?.store).toBe(false);
  } finally { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
});
