import type { Message } from './state';
import { assertRequestSize } from './limits';
import { createEmptyBrief } from './state';
export function parseTranscript(raw: string): Omit<Message, 'id'>[] {
  const text = raw.trim();
  if (!text) throw new Error('Paste a customer enquiry or a conversation first.');
  if (text.length > 32_000) throw new Error('Keep the conversation to 30 messages of up to 1,000 characters each.');
  const label = /^(customer|guest|user|staff|agent|assistant|system)\s*:\s*(.*)$/i;
  const lines = text.split(/\r?\n/);
  if (!lines.some((line) => label.test(line.trim()))) {
    if (text.length > 1000) throw new Error('Label each message Customer: or Staff: for conversations longer than 1,000 characters.');
    return [{ speaker: 'customer', text }];
  }
  const messages: Omit<Message, 'id'>[] = [];
  for (const line of lines) {
    const match = line.trim().match(label);
    if (match) messages.push({ speaker: /^(customer|guest|user)$/i.test(match[1]) ? 'customer' : 'staff', text: match[2] });
    else if (line.trim()) {
      if (!messages.length) throw new Error('Start the conversation with Customer: or Staff: so every message has a speaker.');
      messages[messages.length - 1].text += `\n${line}`;
    }
  }
  if (messages.length > 30) throw new Error('Use up to 30 messages in one booking brief.');
  if (messages.some((message) => !message.text.trim() || message.text.length > 1000)) throw new Error('Each message needs text and must be no longer than 1,000 characters.');
  if (!messages.some((message) => message.speaker === 'customer')) throw new Error('Include at least one customer message to create a booking brief.');
  const parsed = messages.map((message) => ({ ...message, text: message.text.trim() }));
  assertRequestSize({ messages: parsed.map((message, index) => ({ ...message, id: `m_${String(index).padStart(36, '0')}` })), brief: createEmptyBrief(), mode: 'formbridge', referenceDate: '2000-01-01' });
  return parsed;
}
