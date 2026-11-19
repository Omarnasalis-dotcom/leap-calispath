import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  checkDelivery,
  deliverMessage,
  fetchMessages,
  messageError,
  previewAudience,
  sendMessage,
  MESSAGE_SCREENS,
  SKIP_REASONS,
  type AdminMessage,
  type GiftTier,
  type MessageAudience,
  type MessageKind,
  type MessagePayload,
} from '@/api/messages';
import { fetchCommunities } from '@/api/communities';
import { searchUsers } from '@/api/users';
import { useAuth } from '@/auth/AuthProvider';
import { DataTable, type Column } from '@/components/DataTable';
import { Badge, ErrorNote } from '@/components/bits';
import { Field, PageHeader } from '@/components/layout';
import { useToast } from '@/components/Toast';
import { formatDateTime } from '@/shared/constants';

const KINDS: Array<{ value: MessageKind; label: string; hint: string }> = [
  { value: 'news', label: 'News', hint: 'A new feature, an update, anything to announce.' },
  { value: 'discount', label: 'Discount code', hint: 'Gives each person the code for their phone and opens Redeem a Code.' },
  { value: 'gift', label: 'Gift', hint: 'Free access the person taps to claim. The time starts when they claim.' },
];

const TIERS: GiftTier[] = ['first', 'pro', 'max'];
const GIFT_DAYS = [7, 14, 30];

interface Picked {
  id: string;
  name: string;
}

interface FormState {
  kind: MessageKind;
  titleEn: string;
  bodyEn: string;
  titleAr: string;
  bodyAr: string;
  screen: string;
  codeIos: string;
  codeAndroid: string;
  giftTier: GiftTier;
  giftDays: number;
  claimDays: string;
  access: '' | 'free' | 'paid';
  language: '' | 'en' | 'ar';
  platform: '' | 'ios' | 'android';
  versionMode: '' | 'below' | 'at_least';
  version: string;
  activityMode: '' | 'active' | 'inactive';
  activityDays: string;
  minTier: string;
  maxTier: string;
  communityId: string;
  pushOnly: boolean;
  people: Picked[];
}

function emptyForm(): FormState {
  return {
    kind: 'news',
    titleEn: '',
    bodyEn: '',
    titleAr: '',
    bodyAr: '',
    screen: '',
    codeIos: '',
    codeAndroid: '',
    giftTier: 'pro',
    giftDays: 14,
    claimDays: '14',
    access: '',
    language: '',
    platform: '',
    versionMode: '',
    version: '',
    activityMode: '',
    activityDays: '14',
    minTier: '',
    maxTier: '',
    communityId: '',
    // The app has no inbox before 1.2.20, so a row without a push is unseen.
    pushOnly: true,
    people: [],
  };
}

function toInt(s: string): number | undefined {
  const n = Number(s);
  return s.trim() !== '' && Number.isInteger(n) && n >= 0 ? n : undefined;
}

function audienceOf(f: FormState): MessageAudience {
  const a: MessageAudience = {};
  if (f.people.length > 0) a.user_ids = f.people.map((p) => p.id);
  if (f.access) a.access = f.access;
  if (f.language) a.language = f.language;
  if (f.platform) a.platform = f.platform;
  const version = f.version.trim();
  if (f.versionMode === 'below' && version) a.version_below = version;
  if (f.versionMode === 'at_least' && version) a.version_at_least = version;
  const days = toInt(f.activityDays);
  if (f.activityMode === 'active' && days) a.active_days = days;
  if (f.activityMode === 'inactive' && days) a.inactive_days = days;
  const minTier = toInt(f.minTier);
  const maxTier = toInt(f.maxTier);
  if (minTier != null) a.min_tier = minTier;
  if (maxTier != null) a.max_tier = maxTier;
  if (f.communityId) a.community_id = f.communityId;
  if (f.pushOnly) a.push_only = true;
  return a;
}

function payloadOf(f: FormState, audience: MessageAudience = audienceOf(f)): MessagePayload {
  const p: MessagePayload = {
    kind: f.kind,
    title_en: f.titleEn.trim(),
    body_en: f.bodyEn.trim(),
    audience,
  };
  if (f.titleAr.trim()) p.title_ar = f.titleAr.trim();
  if (f.bodyAr.trim()) p.body_ar = f.bodyAr.trim();
  if (f.kind === 'news' && f.screen) p.screen = f.screen;
  if (f.kind === 'discount') {
    if (f.codeIos.trim()) p.code_ios = f.codeIos.trim().toUpperCase();
    if (f.codeAndroid.trim()) p.code_android = f.codeAndroid.trim().toUpperCase();
  }
  if (f.kind === 'gift') {
    p.gift_tier = f.giftTier;
    p.gift_days = f.giftDays;
    p.gift_claim_days = toInt(f.claimDays) ?? 14;
  }
  return p;
}

function describeAudience(a: MessageAudience, communityName: (id: string) => string): string {
  const parts: string[] = [];
  if (a.user_ids) parts.push(a.user_ids.length === 1 ? '1 named person' : `${a.user_ids.length} named people`);
  if (a.access) parts.push(a.access === 'free' ? 'free plan' : 'paid plan');
  if (a.language) parts.push(a.language === 'ar' ? 'Arabic' : 'English');
  if (a.platform) parts.push(a.platform === 'ios' ? 'iPhone' : 'Android');
  if (a.version_below) parts.push(`app below ${a.version_below}`);
  if (a.version_at_least) parts.push(`app ${a.version_at_least}+`);
  if (a.active_days) parts.push(`active in ${a.active_days} days`);
  if (a.inactive_days) parts.push(`away ${a.inactive_days}+ days`);
  if (a.min_tier != null || a.max_tier != null) parts.push(`tier ${a.min_tier ?? 0}–${a.max_tier ?? 9}`);
  if (a.community_id) parts.push(communityName(a.community_id));
  if (a.push_only) parts.push('push only');
  return parts.length === 0 || (parts.length === 1 && a.push_only) ? `Everyone${a.push_only ? ' with push' : ''}` : parts.join(' · ');
}

function Seg<T extends string | number>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={String(o.value)} type="button" className="seg-item" aria-pressed={value === o.value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Search box that adds named people to the audience. */
function PeoplePicker({ people, onChange }: { people: Picked[]; onChange: (p: Picked[]) => void }) {
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 300);
    return () => clearTimeout(t);
  }, [query]);

  const resultsQ = useQuery({
    queryKey: ['message-people', debounced],
    queryFn: () => searchUsers({ query: debounced, sort: 'created_at', desc: true, page: 0, pageSize: 8 }),
    enabled: debounced.length >= 2,
  });

  return (
    <div style={{ display: 'grid', gap: 8 }}>
      {people.length > 0 && (
        <div className="row" style={{ gap: 6 }}>
          {people.map((p) => (
            <button
              key={p.id}
              type="button"
              className="btn small"
              title="Remove"
              onClick={() => onChange(people.filter((x) => x.id !== p.id))}
            >
              {p.name} ✕
            </button>
          ))}
        </div>
      )}
      <input
        className="field"
        placeholder="Search a name or email to send to named people only"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {debounced.length >= 2 && (
        <div className="row" style={{ gap: 6 }}>
          {resultsQ.isLoading && <span className="sub">Searching…</span>}
          {resultsQ.data?.length === 0 && <span className="sub">Nobody found.</span>}
          {resultsQ.data
            ?.filter((u) => !people.some((p) => p.id === u.id))
            .map((u) => (
              <button
                key={u.id}
                type="button"
                className="btn small ghost"
                onClick={() => {
                  onChange([...people, { id: u.id, name: u.display_name || u.email || 'User' }]);
                  setQuery('');
                }}
              >
                + {u.display_name || u.email}
              </button>
            ))}
        </div>
      )}
    </div>
  );
}

/** The send button: the admin types the number of people to confirm. */
function SendDialog({
  count,
  title,
  disabled,
  onSend,
}: {
  count: number;
  title: string;
  disabled: boolean;
  onSend: () => Promise<void>;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const people = count === 1 ? '1 person' : `${count.toLocaleString()} people`;

  async function submit() {
    if (typed.trim() !== String(count)) {
      setError(`Type ${count} to confirm.`);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onSend();
      ref.current?.close();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The message was not sent.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className="btn primary"
        disabled={disabled}
        onClick={() => {
          setTyped('');
          setError(null);
          ref.current?.showModal();
        }}
      >
        Send to {people}
      </button>
      <dialog className="confirm" ref={ref}>
        <form
          method="dialog"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <h2 style={{ marginBottom: 8 }}>Send “{title}” to {people}?</h2>
          <p className="sub" style={{ margin: '0 0 12px' }}>
            This goes to real phones and cannot be taken back.
          </p>
          <label className="label" style={{ display: 'grid', gap: 6, marginBottom: 16 }}>
            Type {count} to confirm
            <input className="field num" autoFocus inputMode="numeric" value={typed} onChange={(e) => setTyped(e.target.value)} />
          </label>
          {error && (
            <p role="alert" style={{ color: 'var(--danger)', fontSize: 13, margin: '0 0 16px' }}>
              {error}
            </p>
          )}
          <div className="row" style={{ justifyContent: 'flex-end' }}>
            <button type="button" className="btn small" onClick={() => ref.current?.close()} disabled={busy}>
              Cancel
            </button>
            <button type="submit" className="btn small primary" disabled={busy}>
              {busy ? 'Sending…' : 'Send'}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}

const KIND_TONE: Record<MessageKind, 'accent' | 'ok' | 'warn'> = { news: 'accent', discount: 'warn', gift: 'ok' };

export function MessagesPage() {
  const { session } = useAuth();
  const myId = session?.user.id ?? null;
  const queryClient = useQueryClient();
  const toast = useToast();
  const [form, setForm] = useState<FormState>(emptyForm);
  const set = (patch: Partial<FormState>) => setForm((f) => ({ ...f, ...patch }));

  const communitiesQ = useQuery({ queryKey: ['communities'], queryFn: fetchCommunities });
  const messagesQ = useQuery({ queryKey: ['admin-messages'], queryFn: fetchMessages });

  const payload = useMemo(() => payloadOf(form), [form]);
  // The preview follows the form a moment after typing stops.
  const [previewPayload, setPreviewPayload] = useState(payload);
  useEffect(() => {
    const t = setTimeout(() => setPreviewPayload(payload), 400);
    return () => clearTimeout(t);
  }, [payload]);
  const previewQ = useQuery({
    queryKey: ['message-preview', previewPayload],
    queryFn: () => previewAudience(previewPayload),
  });
  const preview = previewQ.data;
  const previewIsCurrent = previewPayload === payload && !previewQ.isFetching;

  const communityName = (id: string) => communitiesQ.data?.find((c) => c.id === id)?.name ?? 'a community';

  function afterSend(result: Awaited<ReturnType<typeof sendMessage>>, isTest: boolean) {
    void queryClient.invalidateQueries({ queryKey: ['admin-messages'] });
    if (result.pushError) {
      toast(`Saved for ${result.count}, but the pushes did not go out. Use "Push again" in the list.`);
      return;
    }
    const pushed = result.push?.sent ?? 0;
    toast(isTest ? (pushed ? 'Test sent to your phone' : 'Test saved, but your account has no push token') : `Sent: ${pushed} pushes out of ${result.count} people`);
    if (!isTest) setForm(emptyForm());
  }

  const testMutation = useMutation({
    mutationFn: () => {
      if (!myId) throw new Error('Sign in again.');
      return sendMessage(payloadOf(form, { user_ids: [myId] }), 1);
    },
    onSuccess: (r) => afterSend(r, true),
  });

  async function sendForReal() {
    if (!preview) return;
    const result = await sendMessage(payload, preview.total);
    afterSend(result, false);
  }

  const deliverMutation = useMutation({
    mutationFn: (m: AdminMessage) => deliverMessage(m.id),
    onSuccess: (r) => {
      toast(`Pushed ${r.sent}${r.remaining ? `, ${r.remaining} still waiting` : ''}`);
      void queryClient.invalidateQueries({ queryKey: ['admin-messages'] });
    },
  });
  const receiptsMutation = useMutation({
    mutationFn: (m: AdminMessage) => checkDelivery(m.id),
    onSuccess: (r) => {
      toast(r.delivered + r.failed === 0 ? 'No delivery reports yet. Try again in 15 minutes.' : `Delivered ${r.delivered}, failed ${r.failed}`);
      void queryClient.invalidateQueries({ queryKey: ['admin-messages'] });
    },
  });

  const problem = preview?.problem ? messageError(preview.problem) : null;
  const canSend = previewIsCurrent && !!preview && !preview.problem && preview.total > 0;
  const skipped = Object.entries(preview?.skipped ?? {});
  // Arabic is optional, but an empty field sends those people the English text.
  const missingArabic = !!preview && preview.arabic > 0 && (!form.titleAr.trim() || !form.bodyAr.trim());

  const columns: Column<AdminMessage>[] = [
    { key: 'when', header: 'Sent', render: (m) => (
      <div>
        <div>{formatDateTime(m.created_at)}</div>
        <div className="sub">{m.created_by_name ?? ''}</div>
      </div>
    ) },
    { key: 'kind', header: 'Type', render: (m) => (
      <div className="row" style={{ gap: 6 }}>
        <Badge tone={KIND_TONE[m.kind]}>{KINDS.find((k) => k.value === m.kind)?.label ?? m.kind}</Badge>
        {m.is_test && <Badge>test</Badge>}
      </div>
    ) },
    { key: 'message', header: 'Message', render: (m) => (
      <div style={{ maxWidth: 360 }}>
        <div style={{ fontWeight: 600 }}>{m.title_en}</div>
        <div className="sub">{m.body_en}</div>
        {m.title_ar && <div className="sub" dir="rtl">{m.title_ar} — {m.body_ar}</div>}
        {m.kind === 'gift' && <div className="sub">{m.gift_tier} · {m.gift_days} days · claim by {formatDateTime(m.gift_claim_by)}</div>}
        {m.kind === 'discount' && <div className="sub">iPhone {m.code_ios ?? '—'} · Android {m.code_android ?? '—'}</div>}
      </div>
    ) },
    { key: 'audience', header: 'Who', render: (m) => <span className="sub">{describeAudience(m.audience, communityName)}</span> },
    { key: 'people', header: 'People', align: 'right', render: (m) => <span className="num">{m.recipients}</span> },
    { key: 'pushed', header: 'Pushed', align: 'right', render: (m) => (
      <div>
        <span className="num">{m.pushed}</span>
        {(m.failed > 0 || m.no_token > 0) && (
          <div className="sub">{[m.failed ? `${m.failed} failed` : '', m.no_token ? `${m.no_token} no push` : ''].filter(Boolean).join(' · ')}</div>
        )}
      </div>
    ) },
    { key: 'delivered', header: 'Delivered', align: 'right', render: (m) => (
      <span className="num">{m.delivered}{m.receipts_pending > 0 ? ` (+${m.receipts_pending}?)` : ''}</span>
    ) },
    { key: 'opened', header: 'Opened', align: 'right', render: (m) => <span className="num">{m.opened}</span> },
    { key: 'result', header: 'Result', align: 'right', render: (m) => (
      <span className="num">
        {m.kind === 'gift' ? `${m.claimed} claimed` : m.purchased > 0 ? `${m.purchased} bought` : '—'}
      </span>
    ) },
    { key: 'actions', header: '', align: 'right', render: (m) => (
      <div className="row" style={{ justifyContent: 'flex-end' }}>
        {m.pending > 0 && (
          <button className="btn small" disabled={deliverMutation.isPending} onClick={() => deliverMutation.mutate(m)}>
            Push again ({m.pending})
          </button>
        )}
        {m.receipts_pending > 0 && (
          <button className="btn small" disabled={receiptsMutation.isPending} onClick={() => receiptsMutation.mutate(m)}>
            Check delivery
          </button>
        )}
      </div>
    ) },
  ];

  return (
    <div className="page">
      <PageHeader
        title="Messages"
        sub={<>Send a push to people's phones: news, a discount code, or a gift they claim. Each person gets their own language. Always send a test to yourself first.</>}
      />

      <div className="grid-2">
        <section className="panel">
          <div className="panel-head"><strong>1. Message</strong></div>
          <div className="panel-body" style={{ display: 'grid', gap: 14 }}>
            <div style={{ display: 'grid', gap: 6 }}>
              <Seg label="Message type" value={form.kind} options={KINDS} onChange={(kind) => set({ kind })} />
              <span className="sub">{KINDS.find((k) => k.value === form.kind)?.hint}</span>
            </div>

            <Field label="Title (English)" hint={`${form.titleEn.length}/80`}>
              <input className="field" maxLength={80} value={form.titleEn} onChange={(e) => set({ titleEn: e.target.value })} />
            </Field>
            <Field label="Message (English)" hint={`${form.bodyEn.length}/400${form.kind === 'discount' ? ' · write {code} where the code goes' : ''}`}>
              <textarea className="field" rows={3} maxLength={400} value={form.bodyEn} onChange={(e) => set({ bodyEn: e.target.value })} />
            </Field>
            <Field label="Title (Arabic)" hint="Empty = people using the app in Arabic get the English text">
              <input className="field" dir="rtl" maxLength={80} value={form.titleAr} onChange={(e) => set({ titleAr: e.target.value })} />
            </Field>
            <Field label="Message (Arabic)">
              <textarea className="field" dir="rtl" rows={3} maxLength={400} value={form.bodyAr} onChange={(e) => set({ bodyAr: e.target.value })} />
            </Field>

            {form.kind === 'news' && (
              <Field label="A tap opens">
                <select className="field" value={form.screen} onChange={(e) => set({ screen: e.target.value })}>
                  {MESSAGE_SCREENS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </Field>
            )}

            {form.kind === 'discount' && (
              <div className="row" style={{ alignItems: 'flex-start' }}>
                <Field label="iPhone code" hint="Apple offer code from App Store Connect">
                  <input className="field" maxLength={32} value={form.codeIos} onChange={(e) => set({ codeIos: e.target.value.toUpperCase() })} />
                </Field>
                <Field label="Android code" hint="A live code from Promo codes">
                  <input className="field" maxLength={32} value={form.codeAndroid} onChange={(e) => set({ codeAndroid: e.target.value.toUpperCase() })} />
                </Field>
              </div>
            )}

            {form.kind === 'gift' && (
              <div style={{ display: 'grid', gap: 10 }}>
                <div className="row">
                  <span className="label">Plan</span>
                  <Seg label="Gift plan" value={form.giftTier} options={TIERS.map((t) => ({ value: t, label: t }))} onChange={(giftTier) => set({ giftTier })} />
                  <span className="label">For</span>
                  <Seg label="Gift length" value={form.giftDays} options={GIFT_DAYS.map((d) => ({ value: d, label: `${d} days` }))} onChange={(giftDays) => set({ giftDays })} />
                </div>
                <Field label="Days to claim it" hint="After this the gift is gone">
                  <input className="field num" inputMode="numeric" style={{ maxWidth: 120 }} value={form.claimDays} onChange={(e) => set({ claimDays: e.target.value.replace(/[^0-9]/g, '') })} />
                </Field>
                <span className="sub">Only people on app 1.2.20 or newer get a gift, because older apps cannot claim it. People with a store subscription are skipped.</span>
              </div>
            )}
          </div>
        </section>

        <div style={{ display: 'grid', gap: 16 }}>
          <section className="panel">
            <div className="panel-head"><strong>2. Who gets it</strong></div>
            <div className="panel-body" style={{ display: 'grid', gap: 12 }}>
              <PeoplePicker people={form.people} onChange={(people) => set({ people })} />
              <div className="row">
                <Seg label="Plan" value={form.access} options={[{ value: '', label: 'Any plan' }, { value: 'free', label: 'Free' }, { value: 'paid', label: 'Paid' }]} onChange={(access) => set({ access })} />
                <Seg label="Language" value={form.language} options={[{ value: '', label: 'Any language' }, { value: 'en', label: 'English' }, { value: 'ar', label: 'Arabic' }]} onChange={(language) => set({ language })} />
                <Seg label="Phone" value={form.platform} options={[{ value: '', label: 'Any phone' }, { value: 'ios', label: 'iPhone' }, { value: 'android', label: 'Android' }]} onChange={(platform) => set({ platform })} />
              </div>
              <div className="row">
                <select className="field" aria-label="App version rule" value={form.versionMode} onChange={(e) => set({ versionMode: e.target.value as FormState['versionMode'] })}>
                  <option value="">Any app version</option>
                  <option value="below">App version below</option>
                  <option value="at_least">App version at least</option>
                </select>
                {form.versionMode && (
                  <input className="field num" aria-label="App version" placeholder="1.2.19" style={{ maxWidth: 110 }} value={form.version} onChange={(e) => set({ version: e.target.value.replace(/[^0-9.]/g, '') })} />
                )}
                <select className="field" aria-label="Activity rule" value={form.activityMode} onChange={(e) => set({ activityMode: e.target.value as FormState['activityMode'] })}>
                  <option value="">Active or not</option>
                  <option value="active">Opened the app in the last</option>
                  <option value="inactive">Has not opened the app for</option>
                </select>
                {form.activityMode && (
                  <>
                    <input className="field num" aria-label="Days" inputMode="numeric" style={{ maxWidth: 80 }} value={form.activityDays} onChange={(e) => set({ activityDays: e.target.value.replace(/[^0-9]/g, '') })} />
                    <span className="sub">days</span>
                  </>
                )}
              </div>
              <div className="row">
                <span className="label">Strength tier</span>
                <input className="field num" aria-label="Lowest tier" placeholder="0" inputMode="numeric" style={{ maxWidth: 64 }} value={form.minTier} onChange={(e) => set({ minTier: e.target.value.replace(/[^0-9]/g, '') })} />
                <span className="sub">to</span>
                <input className="field num" aria-label="Highest tier" placeholder="9" inputMode="numeric" style={{ maxWidth: 64 }} value={form.maxTier} onChange={(e) => set({ maxTier: e.target.value.replace(/[^0-9]/g, '') })} />
                <select className="field" aria-label="Community" value={form.communityId} onChange={(e) => set({ communityId: e.target.value })}>
                  <option value="">Any community</option>
                  {communitiesQ.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <label className="row" style={{ gap: 6 }}>
                <input type="checkbox" checked={form.pushOnly} onChange={(e) => set({ pushOnly: e.target.checked })} />
                <span>Only people who can get a push</span>
              </label>
            </div>
          </section>

          <section className="panel">
            <div className="panel-head"><strong>3. Check and send</strong></div>
            <div className="panel-body" style={{ display: 'grid', gap: 12 }}>
              {previewQ.error && <ErrorNote error={previewQ.error} />}
              {preview && (
                <>
                  <div className="row" style={{ alignItems: 'baseline', opacity: previewIsCurrent ? 1 : 0.5 }}>
                    <span style={{ fontSize: 30, fontWeight: 800 }} className="num">{preview.total.toLocaleString()}</span>
                    <span>{preview.total === 1 ? 'person' : 'people'}</span>
                    <span className="sub">
                      {preview.with_push} can get a push · {preview.english} English · {preview.arabic} Arabic · {preview.ios} iPhone · {preview.android} Android
                    </span>
                  </div>
                  {preview.sample.length > 0 && (
                    <div className="sub">
                      {preview.sample.join(', ')}{preview.total > preview.sample.length ? ` and ${preview.total - preview.sample.length} more` : ''}
                    </div>
                  )}
                  {skipped.length > 0 && (
                    <div className="sub">
                      Left out: {skipped.map(([reason, n]) => `${n} ${SKIP_REASONS[reason] ?? reason}`).join('; ')}.
                    </div>
                  )}
                </>
              )}
              {missingArabic && (
                <div className="notice">
                  {preview!.arabic.toLocaleString()} {preview!.arabic === 1 ? 'person uses' : 'people use'} the app in Arabic and will get this in English.
                  Add the Arabic {!form.titleAr.trim() && !form.bodyAr.trim() ? 'title and message' : !form.titleAr.trim() ? 'title' : 'message'} first.
                </div>
              )}
              {problem && <div className="error-note">{problem}</div>}
              {testMutation.error && <ErrorNote error={testMutation.error} />}
              {deliverMutation.error && <ErrorNote error={deliverMutation.error} />}
              {receiptsMutation.error && <ErrorNote error={receiptsMutation.error} />}
              <div className="row" style={{ justifyContent: 'flex-end' }}>
                <button className="btn" disabled={!!problem || !preview || testMutation.isPending} onClick={() => testMutation.mutate()}>
                  {testMutation.isPending ? 'Sending…' : 'Send test to me'}
                </button>
                <SendDialog count={preview?.total ?? 0} title={form.titleEn.trim()} disabled={!canSend} onSend={sendForReal} />
              </div>
            </div>
          </section>
        </div>
      </div>

      <section className="panel" style={{ marginTop: 16 }}>
        <div className="panel-head">
          <strong>Sent messages</strong>
          <span className="sub">Delivered = confirmed by Apple or Google. Opened is counted from app 1.2.20.</span>
        </div>
        {messagesQ.error && <ErrorNote error={messagesQ.error} />}
        <DataTable
          columns={columns}
          rows={messagesQ.data}
          rowKey={(m) => m.id}
          loading={messagesQ.isLoading}
          emptyLabel="No messages yet"
          emptyHint="Write one above and send a test to yourself first."
        />
      </section>
    </div>
  );
}
