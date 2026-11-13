import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  assignTemplate,
  fetchAssignedTemplateIds,
  fetchAssignments,
  fetchCoaches,
  fetchProfilesByIds,
  fetchProgramTemplates,
} from '@/api/coaching';
import { searchUsers } from '@/api/users';
import { useAuth } from '@/auth/AuthProvider';
import { isMasterTemplate, PROGRAM_SOURCE_LABEL, programSource } from '@/shared/constants';
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
  const assignedIdsQ = useQuery({ queryKey: ['assigned-template-ids'], queryFn: fetchAssignedTemplateIds });
  // Only master templates (and, for admins, library templates): never an
  // athlete's own program copy or a leftover copy, which would clone someone
  // else's weeks. Library templates are admin-assigned only.
  const assignableTemplates = templatesQ.data?.filter(
    (t) => isMasterTemplate(t, assignedIdsQ.data) || (isAdmin && t.is_library_template && t.status === 'published'),
  );
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
  // Their own program (library pick or AI Coach) vs a coach's.
  const existingSource = existingActiveAssignment ? programSource(existingActiveAssignment.coach_id) : null;
  const existingIsOwn = existingSource === 'library' || existingSource === 'ai';
  const existingIsThisCoach = !!existingActiveAssignment && existingActiveAssignment.coach_id === coachId;
  // "Start as a new program": assign_program_template completes the current
  // program and creates the new one in one go; the old one stays in the
  // athlete's past programs (restorable in the app, Activate in Clients).
  // The server refuses it for an assistant replacing their coach's own
  // program, so it isn't offered there.
  const canStartNew = existingIsOwn || (existingIsThisCoach && (isAdmin || coachId === me?.id));
  const who = presetWarriorName || warriorQuery || 'This warrior';

  const queryClient = useQueryClient();
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
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['coach-dashboard'] });
      onDone();
    },
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

        {existingActiveAssignment && !existingIsOwn && !existingIsThisCoach && (
          <div className="notice">
            {who} already has an active program with a different coach (
            {existingActiveAssignment.coach_name ?? 'unknown'}). Resolve it with that coach first.
          </div>
        )}

        {existingActiveAssignment && (existingIsOwn || existingIsThisCoach) && templateId && (
          <div className="assign-choice">
            <p className="assign-choice-lead">
              {who} is on{' '}
              {existingIsOwn ? `their own ${PROGRAM_SOURCE_LABEL[existingSource!].toLowerCase()} program` : 'your program'}{' '}
              <strong>{existingActiveAssignment.template_name ?? ''}</strong>
              {existingActiveAssignment.current_week ? ` (week ${existingActiveAssignment.current_week})` : ''}.
            </p>

            <div className="assign-option">
              <div>
                <h3>Start as a new program</h3>
                <p>
                  The current program moves to their past programs with every week and logged workout. They can
                  switch back from the app (Training Center, restore), and you can from Clients (Activate).
                </p>
              </div>
              {canStartNew ? (
                <button
                  className="btn primary"
                  disabled={!coachId || assignMutation.isPending || isCoachPaused}
                  onClick={() => assignMutation.mutate()}
                >
                  {assignMutation.isPending ? 'Starting…' : 'Start new program'}
                </button>
              ) : (
                <span className="label">Only the coach can replace their own program.</span>
              )}
            </div>

            {existingIsThisCoach && (
              <div className="assign-option stacked">
                <div>
                  <h3>Or add it to the current program</h3>
                  <p>Keeps one program: add the weeks after the current ones, archive the current weeks first, or overwrite.</p>
                </div>
                <ApplyTemplateForm
                  warriorProgramId={existingActiveAssignment.id}
                  initialTemplateId={templateId}
                  onApplied={onDone}
                  embedded
                />
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
