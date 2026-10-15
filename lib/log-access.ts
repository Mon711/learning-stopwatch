export type LogIdentity = { userId: string; email: string };
export type LogAccess = { ownerId: string; readOnly: boolean; ownerName: string | null };
export type LogSharing = {
  ownerId?: string;
  viewerEmail?: string;
  ownerName?: string;
};

// Identity comes only from Sites' verified request headers. Never accept a
// viewer email or a target owner from a URL, request body, or MCP arguments.
export function resolveLogAccess(user: LogIdentity | null, sharing: LogSharing): LogAccess | null {
  if (!user?.userId || !user.email) return null;
  if (sharing.viewerEmail?.trim().toLowerCase() === user.email.trim().toLowerCase()) {
    // An incomplete grant fails closed, including for write requests.
    if (!sharing.ownerId?.trim()) return null;
    return { ownerId: sharing.ownerId.trim(), readOnly: true, ownerName: sharing.ownerName?.trim() || 'Shared learner' };
  }
  return { ownerId: user.userId, readOnly: false, ownerName: null };
}

// All browser mutations use this gate before reading input or touching D1.
export function withLogWriteAccess(access: LogAccess | null, write: (ownerId: string) => Promise<Response>): Promise<Response> {
  if (!access || access.readOnly) {
    return Promise.resolve(Response.json({ error: access ? 'These learning logs are shared with you as read-only.' : 'Please sign in to change your records.' }, {
      status: access ? 403 : 401, headers: { 'Cache-Control': 'no-store' },
    }));
  }
  return write(access.ownerId);
}
