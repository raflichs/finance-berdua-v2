export const memberName = (workspace, uid) => {
  const name = workspace?.members?.[uid]?.displayName;
  return typeof name === 'string' ? name.trim() : '';
};

export const partnerUid = (workspace, uid) =>
  Object.keys(workspace?.members || {}).find((id) => id !== uid) || null;
