import { describe, expect, it } from 'vitest';
import { POST } from '../app/api/analyze/route';

const endpoint = 'http://localhost:3000/api/analyze';
const post = (body: string) => POST(new Request(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body }));

describe('analysis endpoint', () => {
  it('rejects malformed and oversized requests before analysis', async () => {
    expect((await post('{invalid')).status).toBe(400);
    expect((await post('x'.repeat(48_001))).status).toBe(413);
  });

  it('rejects duplicate evidence IDs', async () => {
    const response = await post(JSON.stringify({ mode: 'rules', messages: [
      { id: 'm1', speaker: 'customer', text: 'Four people' },
      { id: 'm1', speaker: 'customer', text: 'Five people' },
    ] }));
    expect(response.status).toBe(400);
  });

  it('returns a rule prediction without an OpenAI key', async () => {
    const response = await post(JSON.stringify({ mode: 'rules', messages: [
      { id: 'm1', speaker: 'customer', text: 'A table for four people at 7 pm.' },
      { id: 'm2', speaker: 'customer', text: 'Actually make that five people, sometime after 8 pm.' },
    ] }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.brief.fields.partySize.value).toBe('5');
    expect(body.brief.fields.time.status).toBe('needs_clarification');
  });
});
