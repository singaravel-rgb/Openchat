'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import { teamApi } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/Card';
import { Button } from '@/components/Button';
import { Input } from '@/components/Input';
import { Badge } from '@/components/Badge';
import type { Team, TeamCreate, TeamUpdate, Department, DepartmentCreate, DepartmentUpdate } from '@/lib/types';

interface TeamWithMembers extends Team {
  members?: { id: number; full_name: string; email: string }[];
}

export default function TeamsPage() {
  const { user, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const [teams, setTeams] = useState<TeamWithMembers[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'teams' | 'departments'>('teams');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Team form state
  const [showTeamModal, setShowTeamModal] = useState(false);
  const [editingTeam, setEditingTeam] = useState<TeamWithMembers | null>(null);
  const [teamForm, setTeamForm] = useState({ name: '', slug: '', description: '', is_active: true });

  // Department form state
  const [showDeptModal, setShowDeptModal] = useState(false);
  const [editingDept, setEditingDept] = useState<Department | null>(null);
  const [deptForm, setDeptForm] = useState({ name: '', slug: '', description: '', team_id: '', is_active: true });

  // Member management
  const [addingMember, setAddingMember] = useState<{ teamId: number; userId: string } | null>(null);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
    } else if (user && user.role !== 'admin' && user.role !== 'super_admin') {
      router.push('/agent');
    }
  }, [user, authLoading, router]);

  useEffect(() => {
    if (user && (user.role === 'admin' || user.role === 'super_admin')) {
      loadData();
    }
  }, [user]);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [teamsData, deptsData] = await Promise.all([
        teamApi.list(),
        teamApi.listDepartments(),
      ]);
      setTeams(teamsData);
      setDepartments(deptsData);
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to load data' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleTeamSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    try {
      if (editingTeam) {
        await teamApi.update(editingTeam.id, teamForm);
        setMessage({ type: 'success', text: 'Team updated successfully' });
      } else {
        await teamApi.create(teamForm);
        setMessage({ type: 'success', text: 'Team created successfully' });
      }
      setShowTeamModal(false);
      resetTeamForm();
      loadData();
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to save team' });
    }
  };

  const handleDeptSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    try {
      const payload = {
        ...deptForm,
        team_id: deptForm.team_id ? parseInt(deptForm.team_id, 10) : undefined,
      };
      if (editingDept) {
        await teamApi.updateDepartment(editingDept.id, payload);
        setMessage({ type: 'success', text: 'Department updated successfully' });
      } else {
        await teamApi.createDepartment(payload);
        setMessage({ type: 'success', text: 'Department created successfully' });
      }
      setShowDeptModal(false);
      resetDeptForm();
      loadData();
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to save department' });
    }
  };

  const handleDeleteTeam = async (id: number) => {
    if (!confirm('Are you sure you want to delete this team?')) return;
    setMessage(null);
    try {
      await teamApi.delete(id);
      setMessage({ type: 'success', text: 'Team deleted successfully' });
      loadData();
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to delete team' });
    }
  };

  const handleDeleteDept = async (id: number) => {
    if (!confirm('Are you sure you want to delete this department?')) return;
    setMessage(null);
    try {
      await teamApi.deleteDepartment(id);
      setMessage({ type: 'success', text: 'Department deleted successfully' });
      loadData();
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to delete department' });
    }
  };

  const handleAddMember = async (teamId: number, userId: number) => {
    setMessage(null);
    try {
      await teamApi.addMember(teamId, userId);
      setMessage({ type: 'success', text: 'Member added successfully' });
      setAddingMember(null);
      loadData();
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to add member' });
    }
  };

  const handleRemoveMember = async (teamId: number, userId: number) => {
    if (!confirm('Remove this member from the team?')) return;
    setMessage(null);
    try {
      await teamApi.removeMember(teamId, userId);
      setMessage({ type: 'success', text: 'Member removed successfully' });
      loadData();
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to remove member' });
    }
  };

  const openTeamModal = (team?: TeamWithMembers) => {
    if (team) {
      setEditingTeam(team);
      setTeamForm({ name: team.name, slug: team.slug, description: team.description || '', is_active: team.is_active });
    } else {
      setEditingTeam(null);
      resetTeamForm();
    }
    setShowTeamModal(true);
  };

  const openDeptModal = (dept?: Department) => {
    if (dept) {
      setEditingDept(dept);
      setDeptForm({ name: dept.name, slug: dept.slug, description: dept.description || '', team_id: dept.team_id?.toString() || '', is_active: dept.is_active });
    } else {
      setEditingDept(null);
      resetDeptForm();
    }
    setShowDeptModal(true);
  };

  const resetTeamForm = () => {
    setTeamForm({ name: '', slug: '', description: '', is_active: true });
    setEditingTeam(null);
  };

  const resetDeptForm = () => {
    setDeptForm({ name: '', slug: '', description: '', team_id: '', is_active: true });
    setEditingDept(null);
  };

  if (authLoading || isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-600 border-t-transparent"></div>
      </div>
    );
  }

  if (!user || (user.role !== 'admin' && user.role !== 'super_admin')) return null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white">Teams & Departments</h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">Manage teams, departments, and member assignments</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => openDeptModal()}>Add Department</Button>
          <Button onClick={() => openTeamModal()}>Add Team</Button>
        </div>
      </div>

      {message && (
        <div className={`p-4 rounded-lg ${message.type === 'success' ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400' : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400'}`}>
          {message.text}
        </div>
      )}

      <div className="border-b border-slate-200 dark:border-slate-800">
        <nav className="flex gap-4 -mb-px" aria-label="Teams and Departments tabs">
          <button
            onClick={() => setActiveTab('teams')}
            className={`pb-3 px-1 border-b-2 font-medium text-sm ${activeTab === 'teams' ? 'border-blue-500 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
          >
            Teams ({teams.length})
          </button>
          <button
            onClick={() => setActiveTab('departments')}
            className={`pb-3 px-1 border-b-2 font-medium text-sm ${activeTab === 'departments' ? 'border-blue-500 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
          >
            Departments ({departments.length})
          </button>
        </nav>
      </div>

      {activeTab === 'teams' && (
        <TeamsTab
          teams={teams}
          onEdit={openTeamModal}
          onDelete={handleDeleteTeam}
          onAddMember={setAddingMember}
          addingMember={addingMember}
          onAddMemberSubmit={handleAddMember}
          onRemoveMember={handleRemoveMember}
        />
      )}

      {activeTab === 'departments' && (
        <DepartmentsTab
          departments={departments}
          teams={teams}
          onEdit={openDeptModal}
          onDelete={handleDeleteDept}
        />
      )}

      {/* Team Modal */}
      {showTeamModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <Card className="w-full max-w-md mx-4">
            <CardHeader>
              <CardTitle>{editingTeam ? 'Edit Team' : 'Create Team'}</CardTitle>
            </CardHeader>
            <form onSubmit={handleTeamSubmit}>
              <CardContent className="space-y-4">
                <Input
                  label="Name"
                  value={teamForm.name}
                  onChange={(e) => setTeamForm(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="Enter team name"
                  required
                />
                <Input
                  label="Slug (unique)"
                  value={teamForm.slug}
                  onChange={(e) => setTeamForm(prev => ({ ...prev, slug: e.target.value }))}
                  placeholder="e.g., support-team"
                  required
                />
                <Input
                  label="Description"
                  value={teamForm.description}
                  onChange={(e) => setTeamForm(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Optional description"
                />
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="team_active"
                    checked={teamForm.is_active}
                    onChange={(e) => setTeamForm(prev => ({ ...prev, is_active: e.target.checked }))}
                    className="w-4 h-4 text-blue-600 border-slate-300 rounded focus:ring-blue-500"
                  />
                  <label htmlFor="team_active" className="text-sm text-slate-700 dark:text-slate-300">Active</label>
                </div>
                <div className="flex justify-end gap-2 pt-4">
                  <Button type="button" variant="outline" onClick={() => setShowTeamModal(false)}>Cancel</Button>
                  <Button type="submit" variant="primary">{editingTeam ? 'Update' : 'Create'}</Button>
                </div>
              </CardContent>
            </form>
          </Card>
        </div>
      )}

      {/* Department Modal */}
      {showDeptModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <Card className="w-full max-w-md mx-4">
            <CardHeader>
              <CardTitle>{editingDept ? 'Edit Department' : 'Create Department'}</CardTitle>
            </CardHeader>
            <form onSubmit={handleDeptSubmit}>
              <CardContent className="space-y-4">
                <Input
                  label="Name"
                  value={deptForm.name}
                  onChange={(e) => setDeptForm(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="Enter department name"
                  required
                />
                <Input
                  label="Slug (unique)"
                  value={deptForm.slug}
                  onChange={(e) => setDeptForm(prev => ({ ...prev, slug: e.target.value }))}
                  placeholder="e.g., billing"
                  required
                />
                <Input
                  label="Description"
                  value={deptForm.description}
                  onChange={(e) => setDeptForm(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Optional description"
                />
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Team (optional)</label>
                  <select
                    value={deptForm.team_id}
                    onChange={(e) => setDeptForm(prev => ({ ...prev, team_id: e.target.value }))}
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">None</option>
                    {teams.map(t => (
                      <option key={t.id} value={t.id.toString()}>{t.name}</option>
                    ))}
                  </select>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="dept_active"
                    checked={deptForm.is_active}
                    onChange={(e) => setDeptForm(prev => ({ ...prev, is_active: e.target.checked }))}
                    className="w-4 h-4 text-blue-600 border-slate-300 rounded focus:ring-blue-500"
                  />
                  <label htmlFor="dept_active" className="text-sm text-slate-700 dark:text-slate-300">Active</label>
                </div>
                <div className="flex justify-end gap-2 pt-4">
                  <Button type="button" variant="outline" onClick={() => setShowDeptModal(false)}>Cancel</Button>
                  <Button type="submit" variant="primary">{editingDept ? 'Update' : 'Create'}</Button>
                </div>
              </CardContent>
            </form>
          </Card>
        </div>
      )}

      {/* Add Member Modal */}
      {addingMember && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <Card className="w-full max-w-md mx-4">
            <CardHeader>
              <CardTitle>Add Member to Team</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Input
                label="User ID"
                type="number"
                value={addingMember.userId}
                onChange={(e) => setAddingMember(prev => prev ? { ...prev, userId: e.target.value } : null)}
                placeholder="Enter user ID"
              />
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setAddingMember(null)}>Cancel</Button>
                <Button variant="primary" onClick={() => handleAddMember(addingMember.teamId, parseInt(addingMember.userId, 10))}>
                  Add Member
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

function TeamsTab({
  teams,
  onEdit,
  onDelete,
  onAddMember,
  addingMember,
  onAddMemberSubmit,
  onRemoveMember,
}: {
  teams: TeamWithMembers[];
  onEdit: (team: TeamWithMembers) => void;
  onDelete: (id: number) => void;
  onAddMember: (data: { teamId: number; userId: string }) => void;
  addingMember: { teamId: number; userId: string } | null;
  onAddMemberSubmit: (teamId: number, userId: number) => void;
  onRemoveMember: (teamId: number, userId: number) => void;
}) {
  if (teams.length === 0) {
    return (
      <div className="text-center py-12">
        <svg className="w-16 h-16 text-slate-300 dark:text-slate-700 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
        <h3 className="text-lg font-medium text-slate-900 dark:text-white">No teams yet</h3>
        <p className="text-slate-500 dark:text-slate-400 mt-1">Create your first team to organize agents</p>
      </div>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {teams.map(team => (
        <Card key={team.id} className="overflow-hidden">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-lg">{team.name}</CardTitle>
              <p className="text-sm text-slate-500 dark:text-slate-400">{team.slug}</p>
            </div>
            <Badge variant={team.is_active ? 'success' : 'default'}>
              {team.is_active ? 'Active' : 'Inactive'}
            </Badge>
          </CardHeader>
          <CardContent className="space-y-4">
            {team.description && <p className="text-sm text-slate-600 dark:text-slate-400">{team.description}</p>}
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-500 dark:text-slate-400">{team.member_count} members</span>
            </div>
            <div className="pt-2 border-t border-slate-200 dark:border-slate-800">
              {team.members && team.members.length > 0 && (
                <div className="space-y-2 mb-3">
                  <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Members</p>
                  {team.members.map(member => (
                    <div key={member.id} className="flex items-center justify-between px-2 py-1.5 bg-slate-50 dark:bg-slate-800/50 rounded">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-indigo-600 flex items-center justify-center text-white text-xs font-medium">
                          {member.full_name.charAt(0).toUpperCase()}
                        </div>
                        <span className="text-sm text-slate-900 dark:text-white">{member.full_name}</span>
                        <span className="text-xs text-slate-500 dark:text-slate-400">{member.email}</span>
                      </div>
                      <Button variant="ghost" size="icon" onClick={() => onRemoveMember(team.id, member.id)} aria-label="Remove member">
                        <svg className="w-4 h-4 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </Button>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => onAddMember({ teamId: team.id, userId: '' })}>
                  <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Add Member
                </Button>
                <Button variant="outline" size="sm" onClick={() => onEdit(team)}>
                  <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                  Edit
                </Button>
                <Button variant="ghost" size="sm" className="text-red-500 hover:text-red-600" onClick={() => onDelete(team.id)}>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function DepartmentsTab({
  departments,
  teams,
  onEdit,
  onDelete,
}: {
  departments: Department[];
  teams: TeamWithMembers[];
  onEdit: (dept: Department) => void;
  onDelete: (id: number) => void;
}) {
  if (departments.length === 0) {
    return (
      <div className="text-center py-12">
        <svg className="w-16 h-16 text-slate-300 dark:text-slate-700 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
        </svg>
        <h3 className="text-lg font-medium text-slate-900 dark:text-white">No departments yet</h3>
        <p className="text-slate-500 dark:text-slate-400 mt-1">Create departments to organize teams by function</p>
      </div>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {departments.map(dept => (
        <Card key={dept.id} className="overflow-hidden">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-lg">{dept.name}</CardTitle>
              <p className="text-sm text-slate-500 dark:text-slate-400">{dept.slug}</p>
            </div>
            <Badge variant={dept.is_active ? 'success' : 'default'}>
              {dept.is_active ? 'Active' : 'Inactive'}
            </Badge>
          </CardHeader>
          <CardContent className="space-y-4">
            {dept.description && <p className="text-sm text-slate-600 dark:text-slate-400">{dept.description}</p>}
            {dept.team_name && (
              <div className="flex items-center gap-2 text-sm">
                <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
                <span className="text-slate-600 dark:text-slate-400">Team: {dept.team_name}</span>
              </div>
            )}
            <div className="pt-2 border-t border-slate-200 dark:border-slate-800 flex gap-2">
              <Button variant="outline" size="sm" onClick={() => onEdit(dept)}>
                <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
                Edit
              </Button>
              <Button variant="ghost" size="sm" className="text-red-500 hover:text-red-600" onClick={() => onDelete(dept.id)}>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}