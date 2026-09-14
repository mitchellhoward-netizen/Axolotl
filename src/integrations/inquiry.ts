import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';

const inquirySchema = z.object({
  email: z.string().trim().max(254).email(),
  company: z.string().trim().max(160).optional().default(''),
  message: z.string().trim().max(2000).optional().default(''),
});

/** Shared by the Vercel endpoint and Railway server. Never sends email or SMS. */
export async function handleInquiry(body: AsyncIterable<Uint8Array> | null): Promise<Response> {
  let input: unknown;
  try {
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    if (body) {
      for await (const chunk of body) {
        bytes += chunk.byteLength;
        if (bytes > 12_288) {
          return Response.json({ ok: false, error: 'Request too large' }, { status: 413 });
        }
        chunks.push(chunk);
      }
    }
    input = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    return Response.json({ ok: false, error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = inquirySchema.safeParse(input);
  if (!parsed.success) {
    return Response.json({ ok: false, error: 'Invalid inquiry details' }, { status: 400 });
  }
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    return Response.json({ ok: false, error: 'Inquiries are temporarily unavailable' }, { status: 503 });
  }
  try {
    const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    const { error } = await client.from('website_inquiries').insert(parsed.data).abortSignal(AbortSignal.timeout(10_000));
    if (error) throw new Error('Insert failed');
    return Response.json({ ok: true }, { status: 201 });
  } catch {
    // Do not expose submitted personal information or database details.
    return Response.json({ ok: false, error: 'Unable to save inquiry' }, { status: 503 });
  }
}
