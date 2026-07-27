import { useEffect, useState } from 'react';
import { Users, Car, BadgeCheck, Flag, Bell, TrendingUp, ShieldCheck, MessageSquare, Check, X, Ban } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { Profile, Vehicle, Report } from '@/lib/types';
import { Avatar } from '@/components/Avatar';
import { VerifiedBadge } from '@/components/VerifiedBadge';
import { cn, timeAgo } from '@/lib/utils';
import { useToast } from '@/components/Toast';

export function AdminPage() {
  const { toast } = useToast();
  const [tab, setTab] = useState<'overview' | 'users' | 'listings' | 'verifications' | 'reports'>('overview');
  const [users, setUsers] = useState<Profile[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    const [{ data: u }, { data: v }, { data: r }] = await Promise.all([
      supabase.from('profiles').select('*').order('created_at', { ascending: false }),
      supabase.from('vehicles').select('*').order('created_at', { ascending: false }),
      supabase.from('reports').select('*').order('created_at', { ascending: false }),
    ]);
    setUsers((u as Profile[]) || []);
    setVehicles((v as Vehicle[]) || []);
    setReports((r as Report[]) || []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const approveVerification = async (p: Profile) => {
    await supabase.from('profiles').update({ is_verified: true, verification_status: 'approved' }).eq('id', p.id);
    await supabase.from('notifications').insert({ user_id: p.id, type: 'verification', title: 'Verification approved', body: 'Your account is now verified on GariLink.' });
    toast('Verification approved.');
    load();
  };
  const rejectVerification = async (p: Profile) => {
    await supabase.from('profiles').update({ is_verified: false, verification_status: 'rejected' }).eq('id', p.id);
    toast('Verification rejected.');
    load();
  };
  const suspend = async (p: Profile) => {
    await supabase.from('profiles').update({ verification_status: 'rejected', is_verified: false }).eq('id', p.id);
    toast('User suspended.');
    load();
  };
  const resolveReport = async (r: Report, status: 'resolved' | 'dismissed') => {
    await supabase.from('reports').update({ status }).eq('id', r.id);
    toast('Report ' + status + '.');
    load();
  };

  const pendingVerifications = users.filter((u) => u.verification_status === 'pending');
  const stats = [
    { label: 'Total users', value: users.length, icon: Users },
    { label: 'Active listings', value: vehicles.filter((v) => v.status === 'active').length, icon: Car },
    { label: 'Verified drivers', value: users.filter((u) => u.role === 'driver' && u.is_verified).length, icon: BadgeCheck },
    { label: 'Verified owners', value: users.filter((u) => u.role === 'owner' && u.is_verified).length, icon: ShieldCheck },
    { label: 'Pending verifications', value: pendingVerifications.length, icon: TrendingUp },
    { label: 'Open reports', value: reports.filter((r) => r.status === 'open').length, icon: Flag },
    { label: 'New registrations', value: users.length, icon: Bell },
    { label: 'Total listings', value: vehicles.length, icon: Car },
  ];

  return (
    <div className="container-content py-8">
      <h1 className="font-display text-2xl font-bold text-ink-900">Admin dashboard</h1>
      <p className="mt-1 text-sm text-ink-500">Moderate users, listings, verifications and reports.</p>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="card p-4">
            <s.icon className="h-5 w-5 text-brand-600" />
            <p className="mt-2 font-display text-xl font-bold text-ink-900">{s.value}</p>
            <p className="text-xs text-ink-500">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="mt-8 flex gap-1 overflow-x-auto border-b border-ink-100">
        {(['overview', 'users', 'listings', 'verifications', 'reports'] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={cn('whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-medium capitalize', tab === t ? 'border-brand-600 text-brand-700' : 'border-transparent text-ink-500 hover:text-ink-800')}>{t}</button>
        ))}
      </div>

      <div className="mt-6">
        {tab === 'overview' && (
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="card p-5">
              <h3 className="font-semibold text-ink-900">Pending verifications</h3>
              <div className="mt-3 space-y-2">
                {pendingVerifications.slice(0, 5).map((p) => (
                  <div key={p.id} className="flex items-center justify-between">
                    <span className="text-sm text-ink-700">{p.full_name} <span className="capitalize text-ink-400">({p.role})</span></span>
                    <button onClick={() => approveVerification(p)} className="btn-primary px-3 py-1 text-xs">Approve</button>
                  </div>
                ))}
                {pendingVerifications.length === 0 && <p className="text-sm text-ink-400">No pending verifications.</p>}
              </div>
            </div>
            <div className="card p-5">
              <h3 className="font-semibold text-ink-900">Open reports</h3>
              <div className="mt-3 space-y-2">
                {reports.filter((r) => r.status === 'open').slice(0, 5).map((r) => (
                  <div key={r.id} className="flex items-center justify-between">
                    <span className="text-sm text-ink-700">{r.reason} <span className="capitalize text-ink-400">({r.target_type})</span></span>
                    <button onClick={() => resolveReport(r, 'resolved')} className="btn-secondary px-3 py-1 text-xs">Resolve</button>
                  </div>
                ))}
                {reports.filter((r) => r.status === 'open').length === 0 && <p className="text-sm text-ink-400">No open reports.</p>}
              </div>
            </div>
          </div>
        )}

        {tab === 'users' && (
          <div className="space-y-2">
            {users.map((u) => (
              <div key={u.id} className="card flex items-center gap-3 p-4">
                <Avatar name={u.full_name} src={u.avatar_url} size={40} verified={u.is_verified} />
                <div className="flex-1">
                  <p className="flex items-center gap-1 font-medium text-ink-900">{u.full_name} <VerifiedBadge verified={u.is_verified} size={12} /></p>
                  <p className="text-xs capitalize text-ink-500">{u.role} · {u.phone} · {timeAgo(u.created_at)}</p>
                </div>
                <button onClick={() => suspend(u)} className="btn-ghost text-danger text-sm"><Ban className="h-4 w-4" /> Suspend</button>
              </div>
            ))}
          </div>
        )}

        {tab === 'listings' && (
          <div className="space-y-2">
            {vehicles.map((v) => (
              <div key={v.id} className="card flex items-center gap-3 p-4">
                <div className="flex-1">
                  <p className="font-medium text-ink-900">{v.make} {v.model} ({v.year})</p>
                  <p className="text-xs text-ink-500">{v.location} · {v.status} · {timeAgo(v.created_at)}</p>
                </div>
                <button onClick={async () => { await supabase.from('vehicles').update({ status: v.status === 'active' ? 'closed' : 'active' }).eq('id', v.id); load(); }} className="btn-secondary text-sm">
                  {v.status === 'active' ? 'Remove' : 'Restore'}
                </button>
              </div>
            ))}
          </div>
        )}

        {tab === 'verifications' && (
          <div className="space-y-2">
            {pendingVerifications.map((p) => (
              <div key={p.id} className="card flex items-center gap-3 p-4">
                <Avatar name={p.full_name} src={p.avatar_url} size={40} />
                <div className="flex-1">
                  <p className="font-medium text-ink-900">{p.full_name}</p>
                  <p className="text-xs capitalize text-ink-500">{p.role} · {p.phone}</p>
                </div>
                <button onClick={() => approveVerification(p)} className="btn-primary px-3 py-1.5 text-sm"><Check className="h-4 w-4" /> Approve</button>
                <button onClick={() => rejectVerification(p)} className="btn-secondary px-3 py-1.5 text-sm"><X className="h-4 w-4" /> Reject</button>
              </div>
            ))}
            {pendingVerifications.length === 0 && <p className="text-sm text-ink-500">No pending verifications.</p>}
          </div>
        )}

        {tab === 'reports' && (
          <div className="space-y-2">
            {reports.map((r) => (
              <div key={r.id} className="card p-4">
                <div className="flex items-center justify-between">
                  <p className="font-medium text-ink-900">{r.reason} <span className="capitalize text-ink-400">({r.target_type})</span></p>
                  <span className={cn('badge capitalize', r.status === 'open' && 'badge-warning', r.status === 'resolved' && 'badge-brand', r.status === 'dismissed' && 'badge-neutral')}>{r.status}</span>
                </div>
                {r.description && <p className="mt-1 text-sm text-ink-600">{r.description}</p>}
                <p className="mt-1 text-xs text-ink-400">{timeAgo(r.created_at)}</p>
                {r.status === 'open' && (
                  <div className="mt-2 flex gap-2">
                    <button onClick={() => resolveReport(r, 'resolved')} className="btn-primary px-3 py-1 text-xs">Resolve</button>
                    <button onClick={() => resolveReport(r, 'dismissed')} className="btn-secondary px-3 py-1 text-xs">Dismiss</button>
                  </div>
                )}
              </div>
            ))}
            {reports.length === 0 && <p className="text-sm text-ink-500">No reports.</p>}
          </div>
        )}
      </div>
    </div>
  );
}
