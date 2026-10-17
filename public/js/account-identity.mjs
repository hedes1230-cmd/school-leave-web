// UI routing only. Server authorization and Firebase Rules remain authoritative.
export async function accountIdentity(user) {
  if (!user) return null;
  try {
    const result = await user.getIdTokenResult();
    const claims = result.claims || {};
    if (result.signInProvider === 'custom') {
      if (claims.acct !== 'username' || !/^[a-z][a-z0-9_]{2,23}$/.test(claims.uname || '')
        || !['student','teacher'].includes(claims.role) || !Number.isSafeInteger(claims.cv) || claims.cv < 1) return null;
      return {kind:'username',username:claims.uname,role:claims.role};
    }
    if (user.emailVerified !== true || typeof user.email !== 'string') return null;
    return {kind:'email',email:user.email};
  } catch { return null; }
}
export function directoryEntry(profile) {
  if (!profile || !['student','teacher'].includes(profile.role) || typeof profile.fullname !== 'string') return null;
  const entry={fullname:profile.fullname,role:profile.role,...(profile.role==='student' && /^ม\.[1-6]$/.test(profile.grade||'')?{grade:profile.grade}:{})};
  if (typeof profile.username === 'string' && /^[a-z][a-z0-9_]{2,23}$/.test(profile.username))
    return {...entry,username:profile.username};
  return entry;
}
export function createProfile(identity,fullname,role,createdAt) {
  const name=String(fullname || '').trim().replace(/\s+/g,' ');
  if (!identity || !name || name.length>120 || !['student','teacher'].includes(role)) throw new Error('invalid-profile');
  if (identity.kind === 'username') {
    if (role !== identity.role) throw new Error('role-mismatch');
    return {fullname:name,role,username:identity.username,createdAt};
  }
  if(identity.kind !== 'email' || !identity.email) throw new Error('invalid-identity');
  return {fullname:name,role,email:identity.email,createdAt};
}
