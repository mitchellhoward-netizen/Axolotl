import { handleInquiry } from '../src/integrations/inquiry.js';

export async function POST(req: Request): Promise<Response> {
  return handleInquiry(req.body);
}
