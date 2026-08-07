import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  assignAssistant,
  fetchAssignments,
  fetchCoachAssistants,
  fetchCoaches,
  fetchMyCommunities,
  fetchMyCommunityMembers,
  fetchProfilesByIds,
  removeAssistant,
} from '@/api/coaching';
import { useAuth } from '@/auth/AuthProvider';
import { DataTable, type Column } from '@/components/DataTable';
import { Badge, ConfirmButton, CopyCode, ErrorNote } from '@/components/bits';
import { AssignForm } from './AssignForm';

interface MemberRow {
  id: string;
  display_name: string | null;
}

function AssistantsPanel({ coachId }: { coachId: string }) {
  const queryClient = useQueryClient();
  const [pickedId, setPickedId] = useState('');

  const membersQ = useQuery({
    queryKey: ['community-members', coachId],
    queryFn: () => fetchMyCommunityMembers(coachId),
  });
  const assistantsQ = useQuery({
    queryKey: ['coach-assistants', coachId],
    queryFn: () => fetchCoachAssistants(coachId),
  });

  const assistantIds = new Set((assistantsQ.data ?? []).map((a) => a.assistant_id));
  const eligible = (membersQ.data ?? []).filter((m) => m.id !== coachId && !assistantIds.has(m.id));

  const assignMutation = useMutation({
    mutationFn: () => assignAssistant(pickedId, coachId),
    onSuccess: () => {
      setPickedId('');
      void queryClient.invalidateQueries({ queryKey: ['coach-assistants', coachId] });
    },
  });
  const removeMutation = useMutation({
    mutationFn: (assistantId: string) => removeAssistant(coachId, assistantId),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['coach-assistants', coachId] }),
  });

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Assistants</h2>
      </div>
      <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div className="label">
          Assistants get full access to your clients, templates, and exercise library — pick them
          from your own community.
        </div>
        {assignMutation.error && <ErrorNote error={assignMutation.error} />}
        {removeMutation.error && <ErrorNote error={removeMutation.error} />}
        <div className="row" style={{ gap: 8 }}>
          <select
            className="field"
            style={{ flex: 1, minWidth: 220 }}
            value={pickedId}
            onChange={(e) => setPickedId(e.target.value)}
          >
            <option value="">
              {eligible.length === 0 ? 'No eligible community members' : 'Pick a community member…'}
            </option>
            {eligible.map((m) => (
              <option key={m.id} value={m.id}>
                {m.display_name || m.id.slice(0, 8)}
              </option>
            ))}
          </select>
          <button
            className="btn small primary"
            disabled={!pickedId || assignMutation.isPending}
            onClick={() => assignMutation.mutate()}
          >
            Grant access
          </button>
        </div>

        {(assistantsQ.data?.length ?? 0) === 0 ? (
          <div className="dim">No assistants yet.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {assistantsQ.data!.map((a) => (
              <div
                key={a.assistant_id}
                className="row"
                style={{ justifyContent: 'space-between', alignItems: 'center' }}
              >
                <span>{a.assistant_name || a.assistant_id.slice(0, 8)}</span>
                <ConfirmButton
                  label="Remove"
                  title="Remove assistant access?"
                  body={`${a.assistant_name || 'This user'} will immediately lose access to your clients, templates, and exercise library.`}
                  confirmLabel="Remove"
                  danger
                  onConfirm={() => removeMutation.mutateAsync(a.assistant_id)}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

export function CommunityPage() {
  const { profile, isAdmin, isCoach, isCoachPaused, assistingCoachIds } = useAuth();
  const [coachId, setCoachId] = useState(isCoach ? profile?.id ?? '' : assistingCoachIds[0] ?? '');
  const [assigningTo, setAssigningTo] = useState<MemberRow | null>(null);
  const [showAssistants, setShowAssistants] = useState(false);
  const [filter, setFilter] = useState('');

  const assistedCoachesQ = useQuery({
    queryKey: ['assisted-coaches', assistingCoachIds],
    queryFn: () => fetchProfilesByIds(assistingCoachIds),
    enabled: !isCoach && assistingCoachIds.length > 1,
  });
  // Admin isn't a coach and doesn't assist anyone — they get a full coach
  // picker instead, defaulting to the first coach once the list loads.
  const coachesQ = useQuery({ queryKey: ['coaches'], queryFn: fetchCoaches, enabled: isAdmin });
  useEffect(() => {
    if (isAdmin && !coachId && coachesQ.data && coachesQ.data.length > 0) {
      setCoachId(coachesQ.data[0].id);
    }
  }, [isAdmin, coachId, coachesQ.data]);
  const communitiesQ = useQuery({
    queryKey: ['my-communities', coachId],
    queryFn: () => fetchMyCommunities(coachId),
    enabled: !!coachId,
  });
  const membersQ = useQuery({
    queryKey: ['community-members', coachId],
    queryFn: () => fetchMyCommunityMembers(coachId),
    enabled: !!coachId,
  });
  // A coach shouldn't show up as an assignable member of their own
  // roster, even if their own profile happens to sit in their own
  // community.
  const members = membersQ.data?.filter((m) => m.id !== coachId);
  const filteredMembers = members?.filter(
    (m) => !filter || (m.display_name ?? '').toLowerCase().includes(filter.toLowerCase()),
  );
  // Shares the ['assignments'] cache with ClientsPage — used here only to
  // show, per member, whether they already have an active program.
  const assignmentsQ = useQuery({ queryKey: ['assignments'], queryFn: fetchAssignments });

  const columns: Column<MemberRow>[] = [
    {
      key: 'name',
      header: 'Member',
      render: (m) => <span style={{ fontWeight: 700 }}>{m.display_name || m.id.slice(0, 8)}</span>,
    },
    {
      key: 'program',
      header: 'Program',
      render: (m) => {
        const active = assignmentsQ.data?.find(
          (a) => a.warrior_id === m.id && a.status === 'active' && a.coach_id === coachId,
        );
        return active ? (
          <Badge tone="ok">{active.template_name ?? 'Active program'}</Badge>
        ) : (
          <span className="dim">No active program</span>
        );
      },
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (m) => {
        const active = assignmentsQ.data?.find(
          (a) => a.warrior_id === m.id && a.status === 'active' && a.coach_id === coachId,
        );
        return (
          <span onClick={(e) => e.stopPropagation()}>
            <button
              className="btn small primary"
              disabled={isCoachPaused}
              onClick={() => setAssigningTo(assigningTo?.id === m.id ? null : m)}
            >
              {active ? 'Change program' : 'Assign'}
            </button>
          </span>
        );
      },
    },
  ];

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Community</h1>
          <div className="sub">
            {communitiesQ.data && communitiesQ.data.length > 0
              ? communitiesQ.data.map((c) => (
                  <span key={c.id} className="row" style={{ gap: 6, display: 'inline-flex' }}>
                    {c.name} · join code <CopyCode value={c.join_code} />
                  </span>
                ))
              : 'Members who’ve joined your community.'}
          </div>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <input
            className="field"
            placeholder="Filter members…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            aria-label="Filter members"
          />
          {(isCoach || isAdmin) && (
            <button className="btn" disabled={isCoachPaused} onClick={() => setShowAssistants((s) => !s)}>
              {showAssistants ? 'Close' : 'Assistants'}
            </button>
          )}
          {isAdmin && (
            <select
              className="field"
              value={coachId}
              onChange={(e) => {
                setCoachId(e.target.value);
                setAssigningTo(null);
                setShowAssistants(false);
              }}
              aria-label="Viewing community for"
            >
              {coachesQ.data?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.display_name || c.id.slice(0, 8)}
                </option>
              ))}
            </select>
          )}
          {!isAdmin && !isCoach && assistingCoachIds.length > 1 && (
            <select
              className="field"
              value={coachId}
              onChange={(e) => {
                setCoachId(e.target.value);
                setAssigningTo(null);
              }}
              aria-label="Viewing community for"
            >
              {assistedCoachesQ.data?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.display_name || c.id.slice(0, 8)}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      {isCoachPaused && (
        <div className="notice">
          Your coaching access is paused by an admin. You can still view your community, but
          assigning programs is disabled until it's resumed.
        </div>
      )}
      {communitiesQ.error && <ErrorNote error={communitiesQ.error} />}
      {membersQ.error && <ErrorNote error={membersQ.error} />}

      {showAssistants && isCoach && <AssistantsPanel coachId={coachId} />}

      {assigningTo && (
        <AssignForm
          presetWarriorId={assigningTo.id}
          presetWarriorName={assigningTo.display_name || assigningTo.id.slice(0, 8)}
          onDone={() => setAssigningTo(null)}
        />
      )}

      <div className="panel">
        <DataTable
          columns={columns}
          rows={filteredMembers}
          rowKey={(m) => m.id}
          loading={membersQ.isLoading}
          emptyLabel="No members yet"
          emptyHint="Members appear here as soon as a warrior joins your community with its join code."
        />
      </div>
    </div>
  );
}
