'use client';

import { useEffect, useState, useMemo } from 'react';
import { adminApi } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { Card, CardContent, CardHeader } from '@/components/Card';
import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { Input } from '@/components/Input';
import { Avatar } from '@/components/Avatar';
import type { UserDetail, UserInvitation } from '@/lib/types';

export default function AdminUsersPage() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<UserDetail[]>([]);
  const [invitations, setInvitations] = useState<UserInvitation[]>([]);
  const [activeTab, setActiveTab] = useState<'users' | 'invitations'>('users');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  // Modals
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'agent' | 'admin' | 'super_admin'>('agent');
  const [inviteFullName, setInviteFullName] = useState('');
  const [isInviting, setIsInviting] = useState(false);
  const [inviteSuccessLink, setInviteSuccessLink] = useState<string | null>(null);

  const [editingUser, setEditingUser] = useState<UserDetail | null>(null);
  const [editName, setEditName] = useState('');
  const [editRole, setEditRole] = useState<'agent' | 'admin' | 'super_admin'>('agent');
  const [editIsActive, setEditIsActive] = useState(true);
  const [isUpdating, setIsUpdating] = useState(false);

  const isSuperAdmin = currentUser?.role === 'super_admin';

  const loadData = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [usersData, invitesData] = await Promise.all([
        adminApi.listUsers(),
        adminApi.listInvitations(),
      ]);
      setUsers(usersData);
      setInvitations(invitesData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load user management data');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      if (roleFilter && u.role !== roleFilter) return false;
      if (statusFilter === 'active' && !u.is_active) return false;
      if (statusFilter === 'inactive' && u.is_active) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesName = u.full_name.toLowerCase().includes(q);
        const matchesEmail = u.email.toLowerCase().includes(q);
        if (!matchesName && !matchesEmail) return false;
      }
      return true;
    });
  }, [users, roleFilter, statusFilter, searchQuery]);

  const filteredInvitations = useMemo(() => {
    return invitations.filter((inv) => {
      if (roleFilter && inv.role !== roleFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        if (!inv.email.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [invitations, roleFilter, searchQuery]);

  // Invite handler
  const handleInviteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim()) return;
    setIsInviting(true);
    setError(null);
    setSuccessMsg(null);
    setInviteSuccessLink(null);

    try {
      const created = await adminApi.inviteUser({
        email: inviteEmail.trim(),
        role: inviteRole,
        full_name: inviteFullName.trim() || undefined,
      });

      setInvitations((prev) => [created, ...prev]);
      const link = `${window.location.origin}/accept-invitation?token=${created.token}`;
      setInviteSuccessLink(link);
      setSuccessMsg(`Invitation created for ${created.email}.`);
      setInviteEmail('');
      setInviteFullName('');
      setInviteRole('agent');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to invite user');
    } finally {
      setIsInviting(false);
    }
  };

  // Edit user handler
  const handleOpenEdit = (targetUser: UserDetail) => {
    setEditingUser(targetUser);
    setEditName(targetUser.full_name);
    setEditRole(targetUser.role as 'agent' | 'admin' | 'super_admin');
    setEditIsActive(targetUser.is_active);
    setError(null);
  };

  const handleUpdateUserSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    setIsUpdating(true);
    setError(null);
    setSuccessMsg(null);

    try {
      const updated = await adminApi.updateUser(editingUser.id, {
        full_name: editName.trim() !== editingUser.full_name ? editName.trim() : undefined,
        role: editRole !== editingUser.role ? editRole : undefined,
        is_active: editIsActive !== editingUser.is_active ? editIsActive : undefined,
      });

      setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
      setSuccessMsg(`User ${updated.full_name} (${updated.email}) updated successfully.`);
      setEditingUser(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update user');
    } finally {
      setIsUpdating(false);
    }
  };

  // Resend invitation handler
  const handleResend = async (invitationId: number) => {
    try {
      const updated = await adminApi.resendInvitation(invitationId);
      setInvitations((prev) => prev.map((i) => (i.id === updated.id ? updated : i)));
      setSuccessMsg(`Invitation resent for ${updated.email}. Token renewed for 7 days.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to resend invitation');
    }
  };

  // Revoke invitation handler
  const handleRevoke = async (invitationId: number) => {
    if (!confirm('Are you sure you want to revoke this invitation?')) return;
    try {
      await adminApi.revokeInvitation(invitationId);
      setInvitations((prev) =>
        prev.map((i) => (i.id === invitationId ? { ...i, status: 'revoked' as const } : i))
      );
      setSuccessMsg('Invitation revoked successfully.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to revoke invitation');
    }
  };

  const renderRoleBadge = (role: string) => {
    if (role === 'super_admin') {
      return (
        <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold bg-purple-100 text-purple-800 dark:bg-purple-950/60 dark:text-purple-300 border border-purple-300 dark:border-purple-800">
          ⭐ Super Admin
        </span>
      );
    }
    if (role === 'admin') {
      return (
        <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300 border border-blue-300 dark:border-blue-800">
          🛡️ Admin
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
        🎧 Agent
      </span>
    );
  };

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Users & Access Control</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Manage your support team accounts, invite new staff members, and control role-based permissions.
          </p>
        </div>
        <Button onClick={() => setShowInviteModal(true)} className="flex items-center gap-2">
          <span>+</span> Invite User
        </Button>
      </div>

      {/* Notifications */}
      {error && (
        <div className="p-4 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      )}
      {successMsg && (
        <div className="p-4 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900 text-sm text-emerald-700 dark:text-emerald-300">
          {successMsg}
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-slate-200 dark:border-slate-800 gap-4">
        <button
          onClick={() => setActiveTab('users')}
          className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'users'
              ? 'border-blue-600 text-blue-600 dark:text-blue-400'
              : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
          }`}
        >
          Staff Directory ({users.length})
        </button>
        <button
          onClick={() => setActiveTab('invitations')}
          className={`pb-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === 'invitations'
              ? 'border-blue-600 text-blue-600 dark:text-blue-400'
              : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
          }`}
        >
          Invitations ({invitations.filter((i) => i.status === 'pending').length} pending)
        </button>
      </div>

      {/* Search & Filters */}
      <Card>
        <CardContent className="p-4 flex flex-col md:flex-row gap-4 items-center justify-between">
          <div className="w-full md:w-80">
            <Input
              placeholder="Search by name or email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full"
            />
          </div>
          <div className="flex flex-wrap gap-3 w-full md:w-auto">
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            >
              <option value="">All Roles</option>
              <option value="super_admin">Super Admin</option>
              <option value="admin">Admin</option>
              <option value="agent">Agent</option>
            </select>

            {activeTab === 'users' && (
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              >
                <option value="">All Statuses</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            )}

            {(searchQuery || roleFilter || statusFilter) && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setSearchQuery('');
                  setRoleFilter('');
                  setStatusFilter('');
                }}
              >
                Reset
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Content */}
      {isLoading ? (
        <div className="flex items-center justify-center h-48">
          <div className="animate-spin rounded-full h-10 w-10 border-4 border-blue-600 border-t-transparent" />
        </div>
      ) : activeTab === 'users' ? (
        /* Users Table */
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-600 dark:text-slate-300">
              <thead className="bg-slate-50 dark:bg-slate-900/60 text-xs uppercase text-slate-700 dark:text-slate-300 border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="px-6 py-3.5">User</th>
                  <th className="px-6 py-3.5">Role</th>
                  <th className="px-6 py-3.5">Status</th>
                  <th className="px-6 py-3.5">Created By</th>
                  <th className="px-6 py-3.5">Last Role Change</th>
                  <th className="px-6 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {filteredUsers.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-8 text-center text-slate-400">
                      No users match the selected filters.
                    </td>
                  </tr>
                ) : (
                  filteredUsers.map((targetUser) => {
                    const canEdit =
                      isSuperAdmin ||
                      (currentUser?.role === 'admin' && targetUser.role !== 'super_admin');

                    return (
                      <tr key={targetUser.id} className="hover:bg-slate-50 dark:hover:bg-slate-900/40 transition-colors">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <Avatar name={targetUser.full_name} size="md" />
                            <div>
                              <div className="font-medium text-slate-900 dark:text-white flex items-center gap-2">
                                {targetUser.full_name}
                                {currentUser?.id === targetUser.id && (
                                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500">
                                    You
                                  </span>
                                )}
                              </div>
                              <div className="text-xs text-slate-400">{targetUser.email}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">{renderRoleBadge(targetUser.role)}</td>
                        <td className="px-6 py-4">
                          {targetUser.is_active ? (
                            <span className="inline-flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                              <span className="h-2 w-2 rounded-full bg-emerald-500" />
                              Active
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 text-xs text-slate-400 font-medium">
                              <span className="h-2 w-2 rounded-full bg-slate-400" />
                              Inactive
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-xs">
                          {targetUser.created_by ? (
                            <div>
                              <span className="font-medium text-slate-900 dark:text-slate-200">
                                {targetUser.created_by.full_name}
                              </span>
                              <span className="block text-slate-400">{targetUser.created_by.email}</span>
                            </div>
                          ) : (
                            <span className="italic text-slate-400">Initial Setup</span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-xs">
                          {targetUser.last_role_changed_by ? (
                            <div>
                              <span className="font-medium text-slate-900 dark:text-slate-200">
                                {targetUser.last_role_changed_by.full_name}
                              </span>
                              {targetUser.role_changed_at && (
                                <span className="block text-slate-400">
                                  {new Date(targetUser.role_changed_at).toLocaleDateString()}
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="italic text-slate-400">—</span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-right">
                          {canEdit ? (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleOpenEdit(targetUser)}
                            >
                              Edit Details
                            </Button>
                          ) : (
                            <span className="text-xs text-slate-400 italic">Protected</span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </Card>
      ) : (
        /* Invitations Table */
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-600 dark:text-slate-300">
              <thead className="bg-slate-50 dark:bg-slate-900/60 text-xs uppercase text-slate-700 dark:text-slate-300 border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="px-6 py-3.5">Email</th>
                  <th className="px-6 py-3.5">Assigned Role</th>
                  <th className="px-6 py-3.5">Status</th>
                  <th className="px-6 py-3.5">Invited By</th>
                  <th className="px-6 py-3.5">Expires</th>
                  <th className="px-6 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {filteredInvitations.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-8 text-center text-slate-400">
                      No invitations recorded.
                    </td>
                  </tr>
                ) : (
                  filteredInvitations.map((inv) => {
                    const isPending = inv.status === 'pending';
                    const canManageInv = isSuperAdmin || inv.role !== 'super_admin';

                    return (
                      <tr key={inv.id} className="hover:bg-slate-50 dark:hover:bg-slate-900/40 transition-colors">
                        <td className="px-6 py-4 font-medium text-slate-900 dark:text-white">
                          {inv.email}
                        </td>
                        <td className="px-6 py-4">{renderRoleBadge(inv.role)}</td>
                        <td className="px-6 py-4">
                          {inv.status === 'pending' && <Badge variant="warning">Pending</Badge>}
                          {inv.status === 'accepted' && <Badge variant="success">Accepted</Badge>}
                          {inv.status === 'expired' && <Badge variant="danger">Expired</Badge>}
                          {inv.status === 'revoked' && <Badge variant="default">Revoked</Badge>}
                        </td>
                        <td className="px-6 py-4 text-xs">
                          {inv.invited_by ? inv.invited_by.full_name : 'System Bootstrap'}
                        </td>
                        <td className="px-6 py-4 text-xs text-slate-400">
                          {new Date(inv.expires_at).toLocaleDateString()}
                        </td>
                        <td className="px-6 py-4 text-right space-x-2">
                          {isPending && canManageInv && (
                            <>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleResend(inv.id)}
                              >
                                Resend
                              </Button>
                              <Button
                                variant="danger"
                                size="sm"
                                onClick={() => handleRevoke(inv.id)}
                              >
                                Revoke
                              </Button>
                            </>
                          )}
                          {isPending && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                const url = `${window.location.origin}/accept-invitation?token=${inv.token}`;
                                navigator.clipboard.writeText(url);
                                alert(`Invitation setup URL copied to clipboard:\n${url}`);
                              }}
                            >
                              Copy Link
                            </Button>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Invite Modal */}
      {showInviteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-xl max-w-md w-full">
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Invite Team Member</h2>
              <Button variant="ghost" size="sm" onClick={() => setShowInviteModal(false)}>
                ✕
              </Button>
            </div>
            <form onSubmit={handleInviteSubmit} className="p-4 space-y-4">
              {inviteSuccessLink && (
                <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-xs text-emerald-800 dark:text-emerald-200 space-y-2">
                  <div><strong>Invitation Created!</strong> You can share this setup link with the user:</div>
                  <div className="p-2 rounded bg-white dark:bg-slate-900 font-mono text-[11px] break-all border border-emerald-200">
                    {inviteSuccessLink}
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={() => {
                      navigator.clipboard.writeText(inviteSuccessLink);
                      alert('Setup link copied to clipboard!');
                    }}
                  >
                    Copy Link
                  </Button>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Email Address *
                </label>
                <Input
                  type="email"
                  required
                  placeholder="colleague@vananam.com"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  className="w-full"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Full Name (Optional)
                </label>
                <Input
                  placeholder="Jane Smith"
                  value={inviteFullName}
                  onChange={(e) => setInviteFullName(e.target.value)}
                  className="w-full"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Assigned Role *
                </label>
                <select
                  id="invite-role-select"
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value as any)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                >
                  <option value="agent">Agent (Support Portal & Inbox Access)</option>
                  <option value="admin">Admin (Operational, KB & Workspace Management)</option>
                  {isSuperAdmin && (
                    <option value="super_admin">⭐ Super Admin (Full Security & Role Control)</option>
                  )}
                </select>
                {!isSuperAdmin && (
                  <p className="text-[11px] text-slate-400 mt-1">
                    Super Admin role can only be granted by an active Super Admin.
                  </p>
                )}
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
                <Button variant="secondary" onClick={() => setShowInviteModal(false)}>
                  Close
                </Button>
                <Button type="submit" disabled={isInviting || !inviteEmail.trim()}>
                  {isInviting ? 'Inviting...' : 'Send Invitation'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit User Modal */}
      {editingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-xl max-w-md w-full">
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Edit User Account</h2>
              <Button variant="ghost" size="sm" onClick={() => setEditingUser(null)}>
                ✕
              </Button>
            </div>
            <form onSubmit={handleUpdateUserSubmit} className="p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Email (Read-only)
                </label>
                <Input value={editingUser.email} disabled className="w-full bg-slate-50 dark:bg-slate-800" />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Full Name *
                </label>
                <Input
                  required
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Role *
                </label>
                <select
                  value={editRole}
                  onChange={(e) => setEditRole(e.target.value as any)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  disabled={!isSuperAdmin && editingUser.role === 'super_admin'}
                >
                  <option value="agent">Agent</option>
                  <option value="admin">Admin</option>
                  {isSuperAdmin && <option value="super_admin">⭐ Super Admin</option>}
                </select>
                {!isSuperAdmin && (
                  <p className="text-[11px] text-slate-400 mt-1">
                    Only a Super Admin can promote to or manage Super Admin accounts.
                  </p>
                )}
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input
                  id="user-is-active"
                  type="checkbox"
                  checked={editIsActive}
                  onChange={(e) => setEditIsActive(e.target.checked)}
                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                <label htmlFor="user-is-active" className="text-sm font-medium text-slate-700 dark:text-slate-300 cursor-pointer">
                  Account is Active (Unchecking will instantly deactivate the account and revoke active sessions)
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
                <Button variant="secondary" onClick={() => setEditingUser(null)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={isUpdating}>
                  {isUpdating ? 'Saving...' : 'Save Changes'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
