'use client';

import { useCallback, useState } from 'react';
import { Check, Copy, Loader2, Plus, ShieldCheck, Trash2 } from 'lucide-react';
import PageTopBar from '@/components/PageTopBar';
import { copyText } from '@/lib/clipboard';
import { PERMISSIONS } from '@/lib/permissions';
import { isOwner, membersOnly, type StaffRow } from '@/lib/projectShared';

/**
 * Карточка владельца. Прав у него полный набор, и он тут только для справки:
 * ни снять права, ни убрать самого владельца из проекта нельзя.
 */
function OwnerCard({ owner }: { owner: StaffRow }) {
  return (
    <div className="rounded-control border border-border bg-surface p-4">
      <div className="flex items-center gap-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-hover text-[12px] font-semibold text-text-muted">
          {owner.name.slice(0, 1).toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-[13px] font-semibold">{owner.name}</span>
            <span
              className="shrink-0 rounded-plate px-1.5 py-0.5 text-[11px] font-medium"
              style={{ backgroundColor: 'rgba(245,158,11,0.16)', color: '#f59e0b' }}
            >
              Владелец
            </span>
          </div>
          <div className="truncate text-[12px] text-text-muted">
            {owner.contact || 'создатель проекта'} · полный доступ ко всем разделам
          </div>
        </div>
        <ShieldCheck size={15} className="shrink-0 text-text-dim" />
      </div>
    </div>
  );
}

export default function StaffView({ initialStaff }: { initialStaff: StaffRow[] }) {
  const [staff, setStaff] = useState(initialStaff);
  const owner = staff.find(isOwner) ?? null;
  const members = membersOnly(staff);
  const [name, setName] = useState('');
  const [contact, setContact] = useState('');
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const res = await fetch('/api/staff', { cache: 'no-store' });
      if (!res.ok) return;
      const data = (await res.json()) as { staff: StaffRow[] };
      setStaff(data.staff);
    } catch (err) {
      console.error(err);
    }
  }, []);

  const invite = async () => {
    if (name.trim().length < 2 || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/staff', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), contact: contact.trim() }),
      });
      const body = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(body.error ?? 'Не удалось пригласить.');
        return;
      }
      setName('');
      setContact('');
      await reload();
    } finally {
      setBusy(false);
    }
  };

  const togglePermission = async (member: StaffRow, key: string) => {
    const next = member.permissions.includes(key)
      ? member.permissions.filter((p) => p !== key)
      : [...member.permissions, key];

    setSaving(member.id);
    try {
      await fetch(`/api/staff/${member.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ permissions: next }),
      });
      await reload();
    } finally {
      setSaving(null);
    }
  };

  const remove = async (id: string) => {
    await fetch(`/api/staff/${id}`, { method: 'DELETE' });
    await reload();
  };

  const copyInvite = async (member: StaffRow) => {
    const link = `${window.location.origin}/invite/${member.inviteCode}`;
    if (!(await copyText(link))) return;
    setCopiedId(member.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <>
      <PageTopBar title="Сотрудники" />

      <div className="mx-auto max-w-[860px] px-8 py-8">
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void invite();
          }}
        >
          <input
            className="field w-[180px] flex-1"
            placeholder="Ник модератора"
            maxLength={32}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <input
            className="field w-[180px] flex-1"
            placeholder="Discord или Steam"
            maxLength={64}
            value={contact}
            onChange={(e) => setContact(e.target.value)}
          />
          <button type="submit" disabled={name.trim().length < 2 || busy} className="btn-primary">
            <Plus size={15} />
            Пригласить
          </button>
        </form>

        {error && (
          <div className="mt-2 text-[12px]" style={{ color: 'var(--danger)' }}>
            {error}
          </div>
        )}

        <div className="mt-6 space-y-3">
          {owner && <OwnerCard owner={owner} />}

          {members.length === 0 && (
            <div className="rounded-control border border-border py-16 text-center text-[13px] text-text-muted">
              В проекте пока только вы
            </div>
          )}

          {members.map((member) => (
            <div key={member.id} className="rounded-control border border-border bg-surface p-4">
              <div className="flex items-center gap-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-hover text-[12px] font-semibold text-text-muted">
                  {member.name.slice(0, 1).toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-semibold">{member.name}</div>
                  <div className="truncate text-[12px] text-text-muted">
                    {member.contact || 'контакт не указан'} ·{' '}
                    {member.acceptedAt ? 'принял приглашение' : 'приглашён'}
                  </div>
                </div>

                {saving === member.id && (
                  <Loader2 size={14} className="shrink-0 animate-spin text-text-muted" />
                )}

                <button
                  type="button"
                  onClick={() => void copyInvite(member)}
                  className="btn-ghost shrink-0 px-3 py-1.5 text-[12px]"
                >
                  {copiedId === member.id ? <Check size={13} /> : <Copy size={13} />}
                  Ссылка
                </button>

                <button
                  type="button"
                  onClick={() => void remove(member.id)}
                  aria-label={`Убрать ${member.name}`}
                  className="shrink-0 text-text-muted transition-colors hover:text-[color:var(--danger)]"
                >
                  <Trash2 size={15} />
                </button>
              </div>

              <div className="mt-3 grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
                {PERMISSIONS.map((permission) => {
                  const on = member.permissions.includes(permission.key);
                  return (
                    <label
                      key={permission.key}
                      title={permission.hint}
                      className={`flex cursor-pointer items-center gap-2.5 rounded-control border px-3 py-2 text-[13px] transition-colors ${
                        on
                          ? 'border-[color:var(--accent)] bg-[rgba(59,130,246,0.1)]'
                          : 'border-border bg-surface-hover hover:bg-surface-raised'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() => void togglePermission(member, permission.key)}
                        className="sr-only"
                      />
                      <span
                        className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                          on ? 'border-transparent bg-accent text-white' : 'border-border-strong'
                        }`}
                      >
                        {on && <Check size={11} />}
                      </span>
                      <span className="truncate">{permission.label}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
