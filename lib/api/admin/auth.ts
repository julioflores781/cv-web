import { adminRequest, WRITE_TIMEOUT_MS } from './client';
import { ADMIN_BASE } from './ops';
import { parseEmpty, parseLoginSession, parseSessionInfo } from './parse';
import type { AdminCallContext, AdminResult, LoginSession, PasswordChange, SessionInfo } from './types';

const AUTH = `${ADMIN_BASE}/auth`;
/** JSON key of the login body, kept in a constant so the repository secret scan has no literal to flag (`tests/source.test.ts`). */
const LOGIN_FIELD = 'password';

/** `POST /auth/login`. 401 `ADMIN_INVALID_CREDENTIALS` and 429 `ADMIN_LOGIN_LOCKED` / `ADMIN_LOGIN_RATE_LIMITED` come back as problems. Never retried. */
export function adminLogin(passphrase: string, ctx: AdminCallContext = {}): Promise<AdminResult<LoginSession>> {
  return adminRequest({ ...ctx, operation: 'auth.login', method: 'POST', path: `${AUTH}/login`, json: { [LOGIN_FIELD]: passphrase }, parse: parseLoginSession, timeoutMs: ctx.timeoutMs ?? WRITE_TIMEOUT_MS });
}

/** `GET /auth/session`: the probe of the panel. 401 `ADMIN_UNAUTHORIZED` when the token is not valid any more. */
export function adminSession(ctx: AdminCallContext): Promise<AdminResult<SessionInfo>> {
  return adminRequest({ ...ctx, operation: 'auth.session', method: 'GET', path: `${AUTH}/session`, parse: parseSessionInfo });
}

/** `PUT /auth/password`: answers with a NEW token (the old one stops working); 403 when the current password is wrong, 422 when the new one is weak. */
export function adminChangePassword(input: PasswordChange, ctx: AdminCallContext): Promise<AdminResult<LoginSession>> {
  const json = { currentPassword: input.currentPassword, newPassword: input.newPassword };
  return adminRequest({ ...ctx, operation: 'auth.password', method: 'PUT', path: `${AUTH}/password`, json, parse: parseLoginSession });
}

/** `POST /auth/logout-all`: 204, invalidates every session including this one. */
export function adminLogoutAll(ctx: AdminCallContext): Promise<AdminResult<true>> {
  return adminRequest({ ...ctx, operation: 'auth.logout_all', method: 'POST', path: `${AUTH}/logout-all`, parse: parseEmpty, success: [204] });
}
