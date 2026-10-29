export type UserRole = 'viewer' | 'runner' | 'approver' | 'admin';

export interface AuthUser {
  id: string;
  email: string;
  role: UserRole;
  name?: string;
}

const ROLE_HIERARCHY: Record<UserRole, number> = {
  viewer: 1,
  runner: 2,
  approver: 3,
  admin: 4,
};

export function hasMinimumRole(userRole: UserRole, requiredRole: UserRole): boolean {
  return ROLE_HIERARCHY[userRole] >= ROLE_HIERARCHY[requiredRole];
}

export function parseAuthHeader(headers: Record<string, string | string[] | undefined>): AuthUser {
  const authHeader = typeof headers['authorization'] === 'string' ? headers['authorization'] : '';

  const explicitRole =
    typeof headers['x-user-role'] === 'string'
      ? (headers['x-user-role'].toLowerCase() as UserRole)
      : undefined;

  const email =
    typeof headers['x-user-email'] === 'string' ? headers['x-user-email'] : 'user@company.local';

  // Check explicit role header
  if (explicitRole && ['viewer', 'runner', 'approver', 'admin'].includes(explicitRole)) {
    return {
      id: email,
      email,
      role: explicitRole,
      name: email.split('@')[0],
    };
  }

  // Parse Bearer token
  if (authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7).trim();
    if (token.includes('admin')) {
      return { id: email, email, role: 'admin', name: 'Admin User' };
    }
    if (token.includes('approver')) {
      return { id: email, email, role: 'approver', name: 'Approver User' };
    }
    if (token.includes('runner')) {
      return { id: email, email, role: 'runner', name: 'Runner User' };
    }
    if (token.includes('viewer')) {
      return { id: email, email, role: 'viewer', name: 'Viewer User' };
    }
  }

  // Default to runner if no auth provided (allows normal CLI/Web dev runs)
  return {
    id: email,
    email,
    role: 'runner',
    name: 'Default User',
  };
}
