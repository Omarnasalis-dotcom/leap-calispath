import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  assignTemplate,
  fetchAssignments,
  fetchCoaches,
  fetchProfilesByIds,
  fetchProgramTemplates,
} from '@/api/coaching';
import { searchUsers } from '@/api/users';
import { useAuth } from '@/auth/AuthProvider';
import { ErrorNote } from '@/components/bits';
import { ApplyTemplateForm } from './builder/ApplyTemplateForm';

/** Shared by ClientsPage's general "Assign a program" flow (search-driven)
 * and CommunityPage's per-member "Assign" action (warrior already known —
 * pass presetWarriorId/presetWarriorName to skip the search UI). */
export function AssignForm({
  presetWarriorId,
  presetWarriorName,
  onDone,
}: {
  presetWarriorId?: string;
  presetWarriorName?: string;
  onDone: () => void;
}) {
  const { profile: me, isAdmin, isCoach, isCoachPaused, assistingCoachIds } = useAuth();
  const [warriorQuery, setWarriorQuery] = useState('');
  const [warriorId, setWarriorId] = useState(presetWarriorId ?? '');
  const [templateId, setTemplateId] = useState('');
  // A coach acts as themselves; a pure assistant (no is_coach of their own)
  // isn't authorized to act as their own id at all — default to the coach
  // they assist instead. Only matters when assistingCoachIds has more than
  // one entry (assisting several coaches at once) — assistedCoachesQ below
  // covers that case with a picker.
  const [coachId, setCoachId] = useState(isCoach ? me?.id ?? '' : assistingCoachIds[0] ?? '');
  const [customName, setCustomName] = useState('');

  const templatesQ = useQuery({
    queryKey: ['program-templates'],
    queryFn: fetchProgramTemplates,
  });
  // Library templates are admin-managed and admin-assigned only — a coach
  // (or their assistant) builds client programs from their own master
  // templates, not the shared recommendation catalog.
  const assignableTemplates = isAdmin
    ? templatesQ.data
    : templatesQ.data?.filter((t) => !t.is_library_template);
  const coachesQ = useQuery({ queryKey: ['coaches'], queryFn: fetchCoaches, enabled: isAdmin });
  const assistedCoachesQ = useQuery({
    queryKey: ['assisted-coaches', assistingCoachIds],
    queryFn: () => fetchProfilesByIds(assistingCoachIds),
    enabled: !isCoach && assistingCoachIds.length > 1,
  });
  const warriorsQ = useQuery({
    queryKey: ['warrior-search', warriorQuery],
    queryFn: () =>
      searchUsers({ query: warriorQuery, sort: 'display_name', desc: false, page: 0, pageSize: 20 }),
    enabled: !presetWarriorId && warriorQuery.trim().length >= 2,
  });
  // A coach shouldn't show up as an assignable "client" of their own
  // roster, even if their own profile happens to sit in their own
  // community.
  const warriorResults = warriorsQ.data?.filter((w) => w.id !== coachId);
  // Shares the ['assignments'] cache with the client table below — used
  // here only to check whether the selected warrior already has an active
  // program, so a re-assign doesn't silently clone-and-orphan their
  // existing weeks/history (assign_program_template auto-completes any
  // prior active assignment the instant a new one is created).
  const assignmentsQ = useQuery({ queryKey: ['assignments'], queryFn: fetchAssignments });
  const existingActiveAssignment = assignmentsQ.data?.find(
    (a) => a.warrior_id === warriorId && a.status === 'active',
  );

  const assignMutation = useMutation({
    mutationFn: () => {
      // assign_program_template clones the template under this name — the
      // column is NOT NULL, so mirror the mobile app's default naming.
      const templateName =
        templatesQ.data?.find((t) => t.id === templateId)?.name ?? 'Program';
      const warriorName =
        presetWarriorName ??
        warriorsQ.data?.find((w) => w.id === warriorId)?.display_name ??
        warriorQuery;
      return assignTemplate({
        coachId,
        warriorId,
        templateId,
        customName: customName.trim() || `${templateName} — ${warriorName}`,
      });
    },
    onSuccess: onDone,
  });

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>{presetWarriorName ? `Assign a program to ${presetWarriorName}` : 'Assign a program'}</h2>
      </div>
      <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {assignMutation.error && <ErrorNote error={assignMutation.error} />}
        <div className="row">
          {!presetWarriorId && (
            <div style={{ flex: 1, minWidth: 220 }}>
              <input
                className="field"
                style={{ width: '100%' }}
                placeholder="Search warrior (min 2 chars)…"
                value={warriorQuery}
                onChange={(e) => {
                  setWarriorQuery(e.target.value);
                  setWarriorId('');
                }}
                aria-label="Search warrior"
              />
              {warriorResults && !warriorId && (
                <div className="panel" style={{ marginTop: 6, maxHeight: 180, overflowY: 'auto' }}>
                  {warriorResults.map((w) => (
                    <button
                      key={w.id}
                      className="nav-item"
                      style={{ width: '100%', textAlign: 'left' }}
                      onClick={() => {
                        setWarriorId(w.id);
                        setWarriorQuery(w.display_name || w.email || w.id);
                      }}
                    >
                      {w.display_name || '—'}{' '}
                      <span style={{ color: 'var(--ink-2)' }}>{w.email}</span>
                    </button>
                  ))}
                  {warriorResults.length === 0 && <div className="empty">No matches</div>}
                </div>
              )}
            </div>
          )}
          <select
            className="field"
            style={{ flex: 1, minWidth: 180 }}
            value={templateId}
            onChange={(e) => setTemplateId(e.target.value)}
            aria-label="Template"
          >
            <option value="">Template…</option>
            {assignableTemplates?.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
                {t.is_library_template ? ' (library)' : ''}
              </option>
            ))}
          </select>
          {isAdmin && (
            <select
              className="field"
              style={{ flex: 1, minWidth: 160 }}
              value={coachId}
              onChange={(e) => setCoachId(e.target.value)}
              aria-label="Coach"
            >
              {coachesQ.data?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.display_name || c.id.slice(0, 8)}
                  {c.id === me?.id ? ' (me)' : ''}
                </option>
              ))}
            </select>
          )}
          {!isCoach && assistingCoachIds.length > 1 && (
            <select
              className="field"
              style={{ flex: 1, minWidth: 160 }}
              value={coachId}
              onChange={(e) => setCoachId(e.target.value)}
              aria-label="Assisting as"
            >
              {assistedCoachesQ.data?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.display_name || c.id.slice(0, 8)}
                </option>
              ))}
            </select>
          )}
          <input
            className="field"
            style={{ flex: 1, minWidth: 160 }}
            placeholder="Custom name (optional)"
            value={customName}
            onChange={(e) => setCustomName(e.target.value)}
            aria-label="Custom program name"
          />
          <button
            className="btn primary"
            disabled={
              !warriorId || !templateId || !coachId || assignMutation.isPending || !!existingActiveAssignment || isCoachPaused
            }
            onClick={() => assignMutation.mutate()}
          >
            {assignMutation.isPending ? 'Assigning…' : 'Assign'}
          </button>
        </div>
        {!isAdmin && !presetWarriorId && (
          <div className="label">Search only finds warriors in your own community.</div>
        )}

        {existingActiveAssignment && existingActiveAssignment.coach_id !== coachId && (
          <div className="notice">
            {presetWarriorName || warriorQuery || 'This warrior'} already has an active program with a different
            coach ({existingActiveAssignment.coach_name ?? 'unknown'}). Assigning here would silently complete
            that program — resolve it with that coach first.
          </div>
        )}

        {existingActiveAssignment && existingActiveAssignment.coach_id === coachId && templateId && (
          <>
            <div className="notice">
              {presetWarriorName || warriorQuery || 'This warrior'} already has an active program. Assigning here
              would clone a fresh copy and auto-complete their current one, orphaning its weeks and history —
              choose how to combine it instead.
            </div>
            <ApplyTemplateForm
              warriorProgramId={existingActiveAssignment.id}
              initialTemplateId={templateId}
              onApplied={onDone}
            />
          </>
        )}
      </div>
    </section>
  );
}
