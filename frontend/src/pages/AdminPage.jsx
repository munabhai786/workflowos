import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, FolderKanban, ListChecks, Users } from "lucide-react";

import MainLayout from "../layouts/MainLayout";

import api from "../services/api";

import InviteUserModal from "../components/InviteUserModal";
import StatCard from "../components/ui/StatCard";


function ToastHost({ toasts, onDismiss }) {
  return (
    <div className="fixed right-3 top-3 z-[60] w-[calc(100vw-1.5rem)] max-w-[360px] space-y-2 sm:right-4 sm:top-4">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={
            "rounded-2xl border px-4 py-3 shadow-sm dark:shadow-slate-900/50 max-w-[360px] " +
            (t.type === "success"
              ? "bg-emerald-50 border-emerald-200 text-emerald-900"
              : t.type === "error"
                ? "bg-rose-50 border-rose-200 text-rose-900"
                : "bg-sky-50 border-sky-200 text-sky-900")
          }
          role="status"
          aria-live="polite"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="text-sm font-medium leading-5">{t.message}</div>
            <button
              type="button"
              onClick={() => onDismiss(t.id)}
              className="text-slate-500 dark:text-slate-400 hover:text-slate-800 transition"
              aria-label="Dismiss toast"
            >
              ×
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}


export default function AdminPage() {
  const [stats, setStats] = useState(null);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isInviteOpen, setIsInviteOpen] = useState(false);

  const [toasts, setToasts] = useState([]);
  const [deleteConfirm, setDeleteConfirm] = useState(null); // { user }
  const [deletingId, setDeletingId] = useState(null);

  const toast = useCallback((type, message) => {
    const id = String(Date.now()) + Math.random().toString(16).slice(2);
    setToasts((current) => [...current, { id, type, message }]);
    window.setTimeout(() => {
      setToasts((current) => current.filter((t) => t.id !== id));
    }, 4200);
  }, []);

  const dismissToast = (id) => {
    setToasts((current) => current.filter((t) => t.id !== id));
  };

  // =========================================
  // FETCH ADMIN DATA
  // =========================================
  const fetchAdminData = useCallback(async () => {
    try {
      const statsResponse = await api.get("/admin/stats");
      const usersResponse = await api.get("/admin/users");

      setStats(statsResponse.data.data);
      setUsers(usersResponse.data.data);
    } catch (error) {
      console.error(error);
      toast("error", "Failed to load admin data");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    const timer = window.setTimeout(fetchAdminData, 0);
    return () => window.clearTimeout(timer);
  }, [fetchAdminData]);

  // =========================================
  // DELETE USER
  // =========================================
  const optimisticRemove = (targetUser) => {
    const prevUsers = users;
    setUsers((current) => current.filter((u) => u.id !== targetUser.id));
    return prevUsers;
  };

  const rollbackRemove = (prevUsers) => {
    setUsers(prevUsers);
  };

  const confirmDeleteUser = async () => {
    if (!deleteConfirm?.user) return;

    const targetUser = deleteConfirm.user;
    setDeletingId(targetUser.id);

    const prevUsers = optimisticRemove(targetUser);

    try {
      await api.delete(`/admin/users/${targetUser.id}`);

      toast("success", `Deleted ${targetUser.full_name}`);
      setDeleteConfirm(null);

      // Stats may be stale; refetch lightly.
      setLoading(true);
      await fetchAdminData();
    } catch (error) {
      console.error(error);
      rollbackRemove(prevUsers);
      toast(
        "error",
        error?.response?.data?.detail ||
          "Failed to delete user. Please try again."
      );
    } finally {
      setDeletingId(null);
      setLoading(false);
    }
  };

  // =========================================
  // LOADING
  // =========================================
  const visibleUsers = useMemo(() => users || [], [users]);

  if (loading) {
    return (
      <MainLayout>
        <div className="p-10">Loading Admin Panel...</div>
        <ToastHost toasts={toasts} onDismiss={dismissToast} />
      </MainLayout>
    );
  }

  // =========================================
  // UI
  // =========================================
  return (
    <MainLayout>
      <ToastHost toasts={toasts} onDismiss={dismissToast} />

      {/* HEADER */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="workspace-title">Admin Panel</h1>
          <p className="workspace-subtitle mt-0.5">
            Manage users, invitations and workflow operations
          </p>
        </div>

        <button
          onClick={() => setIsInviteOpen(true)}
          className="button-primary"
        >
          Invite User
        </button>
      </div>

      {/* STATS */}
      <div className="mb-10 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard title="Total Users" value={stats?.total_users || 0} icon={Users} accentColor="info" />
        <StatCard title="Total Projects" value={stats?.total_projects || 0} icon={FolderKanban} accentColor="purple" />
        <StatCard title="Total Tasks" value={stats?.total_tasks || 0} icon={ListChecks} accentColor="warning" />
        <StatCard title="Completed Tasks" value={stats?.completed_tasks || 0} icon={CheckCircle2} accentColor="success" />
      </div>

      {/* USER MANAGEMENT */}
      <div className="overflow-hidden rounded-xl border border-border bg-white dark:bg-slate-800 shadow-card">
        <div className="flex items-center justify-between border-b border-border p-6">
          <div>
            <h2 className="text-lg font-bold text-text-primary">User Management</h2>
            <p className="mt-1 text-sm text-text-tertiary">Manage platform collaborators</p>
          </div>
        </div>

        {/* TABLE */}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px]">
            <thead className="bg-slate-50 dark:bg-slate-900">
              <tr>
                <th className="text-left p-5 text-slate-500 dark:text-slate-400 text-sm font-medium">Full Name</th>
                <th className="text-left p-5 text-slate-500 dark:text-slate-400 text-sm font-medium">Email</th>
                <th className="text-left p-5 text-slate-500 dark:text-slate-400 text-sm font-medium">Role</th>
                <th className="text-left p-5 text-slate-500 dark:text-slate-400 text-sm font-medium">Actions</th>
              </tr>
            </thead>

            <tbody>
              {visibleUsers.map((user) => (
                <tr
                  key={user.id}
                  className="border-t border-slate-100 dark:border-slate-800 hover:bg-slate-50 transition"
                >
                  <td className="p-5 font-medium text-slate-900 dark:text-slate-100">{user.full_name}</td>
                  <td className="p-5 text-slate-500 dark:text-slate-400">{user.email}</td>
                  <td className="p-5">
                    <span
                      className="
                        bg-blue-100
                        text-blue-700
                        px-3
                        py-1
                        rounded-full
                        text-sm
                        font-medium
                      "
                    >
                      {user.role}
                    </span>
                  </td>
                  <td className="p-5">
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => setDeleteConfirm({ user })}
                        disabled={deletingId === user.id}
                        className="
                          inline-flex
                          items-center
                          justify-center
                          px-4
                          py-2
                          rounded-2xl
                          border
                          border-rose-200
                          hover:bg-rose-50
                          transition
                          text-rose-700
                          disabled:opacity-60
                          disabled:cursor-not-allowed
                        "
                        title="Delete user"
                      >
                        {deletingId === user.id ? "Deleting..." : "Delete"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* CONFIRM MODAL */}
      {deleteConfirm?.user && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 px-4">
          <div className="max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-3xl border border-slate-100 bg-white p-6 shadow-2xl animate-fadeIn dark:border-slate-800 dark:bg-slate-800 sm:p-8">
            <div className="flex items-start justify-between gap-4 mb-6">
              <div>
                <h2 className="text-3xl font-bold text-slate-900">Delete user</h2>
                <p className="text-slate-500 dark:text-slate-400 mt-2">
                  This will unassign tasks, remove notifications, and revoke pending invitations.
                  Comments and activity history will be preserved.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDeleteConfirm(null)}
                className="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 transition text-xl"
              >
                ×
              </button>
            </div>

            <div className="rounded-2xl bg-rose-50 border border-rose-100 p-4 mb-6">
              <div className="text-sm text-rose-800 font-medium">
                Target: {deleteConfirm.user.full_name} ({deleteConfirm.user.email})
              </div>
            </div>

            <div className="flex justify-end gap-4">
              <button
                type="button"
                onClick={() => setDeleteConfirm(null)}
                disabled={deletingId === deleteConfirm.user.id}
                className="px-5 py-3 rounded-2xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 transition disabled:opacity-60 disabled:cursor-not-allowed"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDeleteUser}
                disabled={deletingId === deleteConfirm.user.id}
                className="px-6 py-3 rounded-2xl bg-rose-600 hover:bg-rose-700 transition text-white font-medium disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {deletingId === deleteConfirm.user.id ? "Deleting..." : "Delete User"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* INVITE MODAL */}
      <InviteUserModal
        isOpen={isInviteOpen}
        onClose={() => setIsInviteOpen(false)}
      />
    </MainLayout>
  );
}

