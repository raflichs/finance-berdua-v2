import { db, ref, get, set, update } from '../config/firebase';

const workspacePath = (workspaceId, path = '') => `finance_berdua_v2/workspaces/${workspaceId}${path ? `/${path}` : ''}`;

export const workspaceRef = (workspaceId) => ref(db, workspacePath(workspaceId));
export const workspaceMemberRef = (workspaceId, uid) => ref(db, workspacePath(workspaceId, `members/${uid}`));

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
