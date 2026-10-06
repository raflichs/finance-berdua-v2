import { db, ref, get, set, update } from '../config/firebase';
import { memberName, partnerUid } from './memberNames';

export { memberName, partnerUid };

const workspacePath = (workspaceId, path = '') => `finance_berdua_v2/workspaces/${workspaceId}${path ? `/${path}` : ''}`;
const membershipPath = (uid, workspaceId = '') => `finance_berdua_v2/memberships/${uid}${workspaceId ? `/${workspaceId}` : ''}`;

export const workspaceRef = (workspaceId) => ref(db, workspacePath(workspaceId));
export const workspaceMemberRef = (workspaceId, uid) => ref(db, workspacePath(workspaceId, `members/${uid}`));
export const membershipRef = (uid) => ref(db, membershipPath(uid));

const validUid = (uid) => typeof uid === 'string' && uid.length > 0;

export const createWorkspace = async (workspaceId, ownerUid, partnerUid) => {
  if (!workspaceId || !validUid(ownerUid) || !validUid(partnerUid) || ownerUid === partnerUid) {
    throw new Error('Invalid workspace membership');
  }
  return set(workspaceRef(workspaceId), {
    ownerUid,
    partnerUid,
    members: {
      [ownerUid]: { uid: ownerUid, role: 'owner' },
      [partnerUid]: { uid: partnerUid, role: 'member' },
    },
  });
};

// Deliberately no anonymous invite flow yet: membership must be bound to a known UID.
// Upgrade path: replace this with a server-issued, expiring invite token before exposing it in UI.

export const getWorkspace = async (workspaceId) => (await get(workspaceRef(workspaceId))).val();
export const addWorkspaceMember = (workspaceId, uid) => {
  if (!workspaceId || !validUid(uid)) throw new Error('Invalid workspace member');
  return set(workspaceMemberRef(workspaceId, uid), { uid, role: 'member' });
};
export const updateWorkspace = (workspaceId, changes) => update(workspaceRef(workspaceId), changes);

// Resolve user workspace dari membership index. MVP: one workspace per user (deterministic pick).
export const resolveUserWorkspace = async (uid) => {
  if (!validUid(uid)) return null;
  try {
    const memberships = (await get(membershipRef(uid))).val();
    if (!memberships || typeof memberships !== 'object') return null;
    
    const workspaceIds = Object.keys(memberships).sort();
    if (workspaceIds.length === 0) return null;
    
    // ponytail: MVP single workspace. Upgrade: add workspace selector when multiple exist.
    const workspaceId = workspaceIds[0];
    const workspace = await getWorkspace(workspaceId);
    
    // Validate membership
    if (!workspace || !workspace.members || !workspace.members[uid]) {
      console.warn(`[Workspace] UID ${uid} membership index exists but not in workspace ${workspaceId} members`);
      return null;
    }
    
    return { workspaceId, workspace };
  } catch (error) {
    console.error('[Workspace] Resolution failed:', error.message);
    return null;
  }
};
