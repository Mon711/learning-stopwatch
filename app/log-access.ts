import { env } from 'cloudflare:workers';
import { getChatGPTUser } from './chatgpt-auth';
import { resolveLogAccess } from '@/lib/log-access';

export async function getLogAccess() {
  return resolveLogAccess(await getChatGPTUser(), {
    ownerId: env.LEARNING_SHARED_OWNER_ID,
    viewerEmail: env.LEARNING_SHARED_VIEWER_EMAIL,
    ownerName: env.LEARNING_SHARED_OWNER_NAME,
  });
}
