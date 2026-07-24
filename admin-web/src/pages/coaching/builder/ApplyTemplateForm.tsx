import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  applyTemplateToExistingClient,
  fetchProgramTemplates,
  type ClientProgramWriteMode,
} from '@/api/coaching';
import { ConfirmButton, ErrorNote } from '@/components/bits';

const MODE_LABELS: Record<ClientProgramWriteMode, string> = {
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
  onApplied,
}: {
  warriorProgramId: string;
  onApplied: () => void;
}) {
  const queryClient = useQueryClient();
  const [sourceTemplateId, setSourceTemplateId] = useState('');
  const [mode, setMode] = useState<ClientProgramWriteMode>('append');

  const templatesQ = useQuery({ queryKey: ['program-templates'], queryFn: fetchProgramTemplates });

  const applyMutation = useMutation({
    mutationFn: () => applyTemplateToExistingClient(mode, warriorProgramId, sourceTemplateId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['template-weeks'] });
      void queryClient.invalidateQueries({ queryKey: ['archived-weeks'] });
      onApplied();
    },
  });

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Apply a template to this client</h2>
      </div>
      <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
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
            {templatesQ.data?.map((t) => (
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
            onChange={(e) => setMode(e.target.value as ClientProgramWriteMode)}
            aria-label="Apply mode"
          >
            {(Object.keys(MODE_LABELS) as ClientProgramWriteMode[]).map((m) => (
              <option key={m} value={m}>
                {MODE_LABELS[m]}
              </option>
            ))}
          </select>
          {mode === 'overwrite' ? (
            <ConfirmButton
              label="Apply"
              danger
              disabled={!sourceTemplateId}
              title="Overwrite this client's entire program?"
              body="Permanently deletes all logged workouts, coach notes, and existing weeks for this client, then replaces them with the selected template. This cannot be undone."
              confirmLabel="Overwrite"
              onConfirm={() => applyMutation.mutateAsync()}
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
      </div>
    </section>
  );
}
