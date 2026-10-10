export type UserRole = 
  | 'SUPER_ADMIN'
  | 'ADMIN'
  | 'SUPPORT'
  | 'FINANCE'
  | 'USER';

export const VALID_ROLES: readonly UserRole[] = [
  'SUPER_ADMIN',
  'ADMIN',
  'SUPPORT',
  'FINANCE',
  'USER',
] as const;

export const ADMIN_ROLES: readonly UserRole[] = ['SUPER_ADMIN', 'ADMIN'] as const;

export interface AuthenticatedUser {
  uid: string;
  email: string | null;
  role: UserRole;
  isAdmin: boolean;
  claims: Record<string, unknown>;
}

/**
 * Validates whether an arbitrary string is a legitimate system role
 */
export function isValidRole(role: unknown): role is UserRole {
  return typeof role === 'string' && (VALID_ROLES as readonly string[]).includes(role);
}

/**
 * Checks whether a role has general administrative access
 */
export function hasAdminRole(role: string | null | undefined): boolean {
  if (!role) return false;
  return role === 'SUPER_ADMIN' || role === 'ADMIN';
}

/**
 * Only SUPER_ADMIN can assign or modify user roles
 */
export function canAssignRoles(role: string | null | undefined): boolean {
  return role === 'SUPER_ADMIN';
}

/**
 * Checks permissions for specific administrative domains
 */
export function canAccessAdminDashboard(role: string | null | undefined): boolean {
  return hasAdminRole(role);
}

export function canManageApiKeys(role: string | null | undefined): boolean {
  return hasAdminRole(role);
}

export function canManagePayments(role: string | null | undefined): boolean {
  return hasAdminRole(role) || role === 'FINANCE';
}

export function canManageSettings(role: string | null | undefined): boolean {
  return hasAdminRole(role);
}
