import { getChatGPTUser } from '@/app/chatgpt-auth';
import { database } from '@/db';
import { handleLearningMcp } from '@/lib/learning-mcp';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  return handleLearningMcp(request, {
    userId: async () => (await getChatGPTUser())?.userId ?? null,
    database,
  });
}

// Stateless Streamable HTTP: no standalone event stream or session deletion.
export async function GET() {
  return new Response(null, { status: 405, headers: { Allow: 'POST' } });
}

export const DELETE = GET;
