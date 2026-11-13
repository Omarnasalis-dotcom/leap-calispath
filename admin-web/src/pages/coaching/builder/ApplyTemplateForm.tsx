import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  applyTemplateToExistingClient,
  assignTemplate,
  fetchAssignedTemplateIds,
  fetchProgramTemplates,
  type ClientProgramWriteMode,
} from '@/api/coaching';
import { ConfirmButton, ErrorNote } from '@/components/bits';
import { useAuth } from '@/auth/AuthProvider';
import { isMasterTemplate } from '@/shared/constants';

type Mode = ClientProgramWriteMode | 'new_program';

const MODE_LABELS: Record<Mode, string> = {
  new_program: 'Start as a new program (current one moves to past programs)',
  append: 'Add as new weeks (keeps everything)',
  archive: 'Archive current weeks, then add new (keeps everything, hides old from warrior)',
  overwrite: 'Overwrite (deletes logged workouts, notes, and existing weeks)',
};

/** Pushes an updated master/library template onto a client who's already
 * assigned — the plain "Assign a program" flow (ClientsPage.tsx's
 * AssignForm) only ever clones a fresh copy, with no way to bring new weeks
 * into an existing assignment without wiping it via full reassignment. */
export function ApplyTemplateForm({
  warriorProgramId,
  initialTemplateId,
  onApplied,
  embedded,
  startNew,
}: {
  warriorProgramId: string;
  /** Pre-fills the source template — e.g. the Assign form already had one
   * selected before discovering the warrior has an active program. */
  initialTemplateId?: string;
  onApplied: (result?: { newProgramId: string | null }) => void;
  /** Just the controls, no panel of its own (inside another box). */
  embedded?: boolean;
  /** Offers "Start as a new program" (assign_program_template: the current
   * program moves to the athlete's past programs, restorable). Only pass it
   * when the caller may replace this program. */
  startNew?: { coachId: string; warriorId: string; warriorName: string | null };
}) {
  const { isAdmin, isCoach } = useAuth();
  const queryClient = useQueryClient();
  const [sourceTemplateId, setSourceTemplateId] = useState(initialTemplateId ?? '');
  const [mode, setMode] = useState<Mode>('append');
  // Overwrite is coach-only — a delegated assistant can append or archive an
  // already-assigned client's program, but never wipe it outright.
  const availableModes = (Object.keys(MODE_LABELS) as Mode[]).filter(
    (m) => (isCoach || m !== 'overwrite') && (m !== 'new_program' || !!startNew),
  );

  const templatesQ = useQuery({ queryKey: ['program-templates'], queryFn: fetchProgramTemplates });
  const assignedIdsQ = useQuery({ queryKey: ['assigned-template-ids'], queryFn: fetchAssignedTemplateIds });
  // Master templates only (plus published library templates for admins),
  // never another athlete's program copy.
  const assignableTemplates = templatesQ.data?.filter(
    (t) => isMasterTemplate(t, assignedIdsQ.data) || (isAdmin && t.is_library_template && t.status === 'published'),
  );

  const applyMutation = useMutation({
    mutationFn: async (): Promise<string | null> => {
      if (mode === 'new_program' && startNew) {
        const templateName = templatesQ.data?.find((t) => t.id === sourceTemplateId)?.name ?? 'Program';
        return assignTemplate({
          coachId: startNew.coachId,
          warriorId: startNew.warriorId,
          templateId: sourceTemplateId,
          customName: `${templateName} — ${startNew.warriorName ?? 'athlete'}`,
        });
      }
      await applyTemplateToExistingClient(mode as ClientProgramWriteMode, warriorProgramId, sourceTemplateId);
      return null;
    },
    onSuccess: (newProgramId) => {
      void queryClient.invalidateQueries({ queryKey: ['template-weeks'] });
      void queryClient.invalidateQueries({ queryKey: ['archived-weeks'] });
      void queryClient.invalidateQueries({ queryKey: ['assignments'] });
      void queryClient.invalidateQueries({ queryKey: ['coach-dashboard'] });
      onApplied(mode === 'new_program' ? { newProgramId } : undefined);
    },
  });

  const controls = (
      <div className={embedded ? undefined : 'panel-body'} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {applyMutation.error && <ErrorNote error={applyMutation.error} />}
        <div className="row">
          <select
            className="field"
            style={{ flex: 1, minWidth: 200 }}
            value={sourceTemplateId}
            onChange={(e) => setSourceTemplateId(e.target.value)}
            aria-label="Source template"
          >
            <option value="">Template…</option>
            {assignableTemplates?.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
                {t.is_library_template ? ' (library)' : ''}
              </option>
            ))}
          </select>
          <select
            className="field"
            style={{ flex: 1, minWidth: 260 }}
            value={mode}
            onChange={(e) => setMode(e.target.value as Mode)}
            aria-label="Apply mode"
          >
            {availableModes.map((m) => (
              <option key={m} value={m}>
                {MODE_LABELS[m]}
              </option>
            ))}
          </select>
          {mode === 'overwrite' && isCoach ? (
            <ConfirmButton
              label="Apply"
              danger
              disabled={!sourceTemplateId}
              title="Overwrite this client's entire program?"
              body="Permanently deletes all logged workouts, coach notes, and existing weeks for this client, then replaces them with the selected template. This cannot be undone."
              confirmLabel="Overwrite"
              onConfirm={async () => { await applyMutation.mutateAsync(); }}
            />
          ) : (
            <button
              className="btn primary"
              disabled={!sourceTemplateId || applyMutation.isPending}
              onClick={() => applyMutation.mutate()}
            >
              {applyMutation.isPending ? 'Applying…' : 'Apply'}
            </button>
          )}
        </div>
        {mode === 'new_program' && (
          <p style={{ margin: 0, maxWidth: '68ch', fontSize: 'var(--text-sm)', color: 'var(--ink-2)', lineHeight: 1.5 }}>
            The current program moves to their past programs with every week and logged workout. They can switch
            back in the app (Training Center, restore), and you can from Clients (Activate).
          </p>
        )}
      </div>
  );
  if (embedded) return controls;
  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Apply a template to this client</h2>
      </div>
      {controls}
    </section>
  );
}
