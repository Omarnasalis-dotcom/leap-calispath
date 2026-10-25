import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchPromoCodes, savePromoCode, PROMO_OFFERS, type AdminPromoCode, type PromoCodeInput } from '@/api/promoCodes';
import { DataTable, type Column } from '@/components/DataTable';
import { Badge, CopyCode, ErrorNote } from '@/components/bits';
import { formatDate } from '@/shared/constants';

interface FormState {
  create: boolean;
  code: string;
  offerKey: string;
  label: string;
  limit: string;
  newOnly: boolean;
  startsAt: string; // datetime-local, this browser's time zone
  endsAt: string;
  isActive: boolean;
}

const offerKey = (productId: string, offerId: string) => `${productId}|${offerId}`;

function toLocalInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function emptyForm(): FormState {
  const now = new Date();
  const inAWeek = new Date(now.getTime() + 7 * 24 * 3600 * 1000);
  return {
    create: true,
    code: '',
    offerKey: offerKey(PROMO_OFFERS[0].product_id, PROMO_OFFERS[0].offer_id),
    label: '',
    limit: '',
    newOnly: true,
    startsAt: toLocalInput(now.toISOString()),
    endsAt: toLocalInput(inAWeek.toISOString()),
    isActive: true,
  };
}

function formFrom(c: AdminPromoCode): FormState {
  return {
    create: false,
    code: c.code,
    offerKey: offerKey(c.product_id, c.offer_id),
    label: c.label,
    limit: c.max_redemptions == null ? '' : String(c.max_redemptions),
    newOnly: c.new_customers_only,
    startsAt: toLocalInput(c.starts_at),
    endsAt: toLocalInput(c.ends_at),
    isActive: c.is_active,
  };
}

function offerLabel(c: AdminPromoCode): string {
  return PROMO_OFFERS.find((o) => o.product_id === c.product_id && o.offer_id === c.offer_id)?.label
    ?? `${c.product_id} · ${c.offer_id}`;
}

function status(c: AdminPromoCode): { label: string; tone?: 'ok' | 'warn' } {
  const now = Date.now();
  if (!c.is_active) return { label: 'off' };
  if (new Date(c.starts_at).getTime() > now) return { label: 'scheduled', tone: 'warn' };
  if (c.ends_at && new Date(c.ends_at).getTime() <= now) return { label: 'expired' };
  if (c.max_redemptions != null && c.claimed_count >= c.max_redemptions) return { label: 'used up' };
  return { label: 'live', tone: 'ok' };
}

function toInput(f: FormState): PromoCodeInput | string {
  const code = f.code.replace(/\s+/g, '').toUpperCase();
  if (!/^[A-Z0-9]{3,32}$/.test(code)) return 'Codes are 3–32 letters and digits (no spaces or symbols).';
  const offer = PROMO_OFFERS.find((o) => offerKey(o.product_id, o.offer_id) === f.offerKey);
  if (!offer) return 'Pick an offer.';
  const limit = f.limit.trim() === '' ? null : Number(f.limit);
  if (limit != null && (!Number.isInteger(limit) || limit < 1)) return 'The limit must be a whole number, 1 or more, or empty for no limit.';
  const startsAt = f.startsAt ? new Date(f.startsAt).toISOString() : null;
  const endsAt = f.endsAt ? new Date(f.endsAt).toISOString() : null;
  if (endsAt && startsAt && endsAt <= startsAt) return 'The end must be after the start.';
  return {
    create: f.create,
    code,
    product_id: offer.product_id,
    offer_id: offer.offer_id,
    label: f.label.trim(),
    max_redemptions: limit,
    new_customers_only: f.newOnly,
    starts_at: startsAt,
    ends_at: endsAt,
    is_active: f.isActive,
  };
}

export function PromoCodesPage() {
  const queryClient = useQueryClient();
  const codesQ = useQuery({ queryKey: ['promo-codes'], queryFn: fetchPromoCodes });
  const [form, setForm] = useState<FormState | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const saveMutation = useMutation({
    mutationFn: savePromoCode,
    onSuccess: () => {
      setForm(null);
      void queryClient.invalidateQueries({ queryKey: ['promo-codes'] });
    },
    onError: (err) => setFormError(err instanceof Error ? err.message : 'Could not save.'),
  });

  const toggleMutation = useMutation({
    mutationFn: (c: AdminPromoCode) => {
      const input = toInput({ ...formFrom(c), isActive: !c.is_active });
      if (typeof input === 'string') throw new Error(input);
      return savePromoCode(input);
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['promo-codes'] }),
  });

  function save() {
    if (!form) return;
    const input = toInput(form);
    if (typeof input === 'string') {
      setFormError(input);
      return;
    }
    setFormError(null);
    saveMutation.mutate(input);
  }

  const locked = !!form && !form.create && (codesQ.data?.find((c) => c.code === form.code)?.claimed_count ?? 0) > 0;

  const columns: Column<AdminPromoCode>[] = [
    { key: 'code', header: 'Code', render: (c) => <CopyCode value={c.code} /> },
    { key: 'offer', header: 'Offer', render: (c) => (
      <div>
        <div>{offerLabel(c)}</div>
        {c.label && <div className="sub">{c.label}</div>}
      </div>
    ) },
    { key: 'window', header: 'Window', render: (c) => `${formatDate(c.starts_at)} – ${c.ends_at ? formatDate(c.ends_at) : 'no end'}` },
    { key: 'who', header: 'Who', render: (c) => (c.new_customers_only ? 'New customers' : 'Anyone without a plan') },
    { key: 'status', header: 'Status', render: (c) => { const s = status(c); return <Badge tone={s.tone}>{s.label}</Badge>; } },
    { key: 'claimed', header: 'Claimed', align: 'right', render: (c) => (
      <span className="num">{c.claimed_count}{c.max_redemptions != null ? ` / ${c.max_redemptions}` : ''}</span>
    ) },
    { key: 'bought', header: 'Bought', align: 'right', render: (c) => <span className="num">{c.purchased_count}</span> },
    { key: 'actions', header: '', align: 'right', render: (c) => (
      <div className="row" style={{ justifyContent: 'flex-end' }}>
        <button className="btn small" onClick={() => { setForm(formFrom(c)); setFormError(null); }}>Edit</button>
        <button className="btn small" disabled={toggleMutation.isPending} onClick={() => toggleMutation.mutate(c)}>
          {c.is_active ? 'Switch off' : 'Switch on'}
        </button>
      </div>
    ) },
  ];

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Promo codes</h1>
          <div className="sub">
            Android only. People type the code in Settings → Redeem a Code and buy the chosen Google Play offer.
            iPhone codes are made in App Store Connect. "Bought" is reported by the app; access itself always comes from the store.
          </div>
        </div>
        <button className="btn primary" onClick={() => { setForm(emptyForm()); setFormError(null); }}>New code</button>
      </div>

      {codesQ.error && <ErrorNote error={codesQ.error} />}
      {toggleMutation.error && <ErrorNote error={toggleMutation.error} />}

      {form && (
        <section className="panel">
          <div className="panel-head">
            <h2>{form.create ? 'New code' : `Edit ${form.code}`}</h2>
            <button className="btn small" onClick={() => setForm(null)}>Cancel</button>
          </div>
          <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {locked && <div className="sub">People already claimed this code, so its offer can no longer change.</div>}
            <div className="row">
              <label className="row" style={{ gap: 6 }}>
                <span className="label">Code</span>
                <input
                  className="field"
                  placeholder="LEAP30"
                  maxLength={32}
                  disabled={!form.create}
                  value={form.code}
                  onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                />
              </label>
              <label className="row" style={{ gap: 6 }}>
                <span className="label">Offer</span>
                <select
                  className="field"
                  disabled={locked}
                  value={form.offerKey}
                  onChange={(e) => setForm({ ...form, offerKey: e.target.value })}
                >
                  {PROMO_OFFERS.map((o) => (
                    <option key={offerKey(o.product_id, o.offer_id)} value={offerKey(o.product_id, o.offer_id)}>{o.label}</option>
                  ))}
                </select>
              </label>
            </div>
            <input
              className="field"
              placeholder="Note for admins (e.g. Instagram, coach Ahmed)"
              maxLength={80}
              value={form.label}
              onChange={(e) => setForm({ ...form, label: e.target.value })}
            />
            <div className="row">
              <label className="row" style={{ gap: 6 }}>
                <span className="label">Max people (empty = no limit)</span>
                <input
                  className="field num"
                  inputMode="numeric"
                  value={form.limit}
                  onChange={(e) => setForm({ ...form, limit: e.target.value.replace(/[^0-9]/g, '') })}
                />
              </label>
              <label className="row" style={{ gap: 6 }}>
                <span className="label">Starts</span>
                <input className="field" type="datetime-local" value={form.startsAt} onChange={(e) => setForm({ ...form, startsAt: e.target.value })} />
              </label>
              <label className="row" style={{ gap: 6 }}>
                <span className="label">Ends</span>
                <input className="field" type="datetime-local" value={form.endsAt} onChange={(e) => setForm({ ...form, endsAt: e.target.value })} />
              </label>
            </div>
            <div className="row">
              <label className="row" style={{ gap: 6 }}>
                <input type="checkbox" checked={form.newOnly} onChange={(e) => setForm({ ...form, newOnly: e.target.checked })} />
                <span>New customers only (never had a paid plan)</span>
              </label>
              <label className="row" style={{ gap: 6 }}>
                <input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} />
                <span>On</span>
              </label>
            </div>
            <div className="row" style={{ justifyContent: 'flex-end' }}>
              <button className="btn primary" disabled={saveMutation.isPending} onClick={save}>
                {form.create ? 'Create code' : 'Save'}
              </button>
            </div>
            {formError && <div className="error-note">{formError}</div>}
          </div>
        </section>
      )}

      <section className="panel">
        <DataTable
          columns={columns}
          rows={codesQ.data}
          rowKey={(c) => c.code}
          loading={codesQ.isLoading}
          emptyLabel="No codes yet"
          emptyHint="Create one, then share it. People redeem it in Settings → Redeem a Code on Android."
        />
      </section>
    </div>
  );
}
