import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/auth/AuthProvider';
import { ErrorNote } from '@/components/bits';
import { useToast } from '@/components/Toast';
import {
  fetchMyWhatsApp,
  fetchTestBlocks,
  fetchTestResults,
  gradeTestResult,
  saveMyWhatsApp,
  type TestBlock,
  type TestResult,
} from '@/api/tests';
import { fetchLoggedBlocks } from '@/api/coaching';
import { programSource } from '@/shared/constants';
import { TEST_KINDS, testMovementOptions } from '@/shared/testItems';

// Coach Test Week results for one client program: every test item of each
// test week, what the athlete logged (or why they skipped), whether it went
// into a world, the change since their last test of the same movement, and
// a pass / needs-work grade for form checks.

const HOLD_NAMES: Record<string, string> = {
  tuck_front_lever: 'Tuck front lever',
  straddle_front_lever: 'Straddle front lever',
  full_front_lever: 'Full front lever',
  tuck_back_lever: 'Tuck back lever',
  straddle_back_lever: 'Straddle back lever',
  full_back_lever: 'Full back lever',
  tuck_planche: 'Tuck planche',
  straddle_planche: 'Straddle planche',
  full_planche: 'Full planche',
  wall_handstand: 'Wall handstand',
  freestanding_handstand: 'Freestanding handstand',
  one_arm_handstand: 'One arm handstand',
};

const SKIP_LABEL: Record<NonNullable<TestResult['skip_reason']>, string> = {
  cant_do: "Can't do it yet",
  injury: 'Injury / pain',
  no_equipment: 'No equipment',
  no_time: 'No time',
  other: 'Other',
};

const WORLD_NAME: Record<TestBlock['test_kind'], string> = {
  max_reps: 'One Min Max',
  one_rm: 'Power World',
  max_hold: 'Static World',
  form_check: '',
};

function formatValue(r: TestResult): string {
  if (r.value == null) return '';
  const v = Number.isInteger(r.value) ? String(r.value) : r.value.toFixed(1);
  if (r.unit === 'reps') return `${v} reps`;
  if (r.unit === 'kg') return `${v} kg`;
  if (r.unit === 'seconds') return `${v} s`;
  return v;
}

function blockItemName(b: TestBlock): string {
  const i = b.name.indexOf(' | ');
  return (i >= 0 ? b.name.slice(i + 3) : b.name).trim() || 'Test item';
}

/** The athlete's previous done result of the same test (kind + movement). */
function previousOf(r: TestResult, all: TestResult[]): TestResult | null {
  let prev: TestResult | null = null;
  for (const x of all) {
    if (x.id === r.id || x.status !== 'done' || x.value == null) continue;
    if (x.test_kind !== r.test_kind || x.movement_id !== r.movement_id) continue;
    if (x.created_at >= r.created_at) continue;
    prev = x;
  }
  return prev;
}

function Delta({ r, all }: { r: TestResult; all: TestResult[] }) {
  if (r.status !== 'done' || r.value == null) return null;
  const prev = previousOf(r, all);
  if (!prev || prev.value == null) return <span className="tp-dim">First test</span>;
  const d = r.value - prev.value;
  const unit = r.unit === 'seconds' ? ' s' : r.unit === 'kg' ? ' kg' : ' reps';
  const when = prev.warrior_program_id === r.warrior_program_id ? `Week ${prev.week_number}` : 'last program';
  if (d === 0) return <span className="tp-dim">Same as {when}</span>;
  return (
    <span className={d > 0 ? 'tp-up' : 'tp-down'}>
      {d > 0 ? '+' : '−'}
      {Math.abs(Number.isInteger(d) ? d : Number(d.toFixed(1)))}
      {unit} vs {when}
    </span>
  );
}

function WorldChip({ r }: { r: TestResult }) {
  if (r.status !== 'done') return null;
  if (r.world_status === 'saved') {
    return (
      <span className="rv-chip yes">
        {WORLD_NAME[r.test_kind]}
        {r.is_new_pb ? ' · PB' : ''}
      </span>
    );
  }
  if (r.world_status === 'locked') return <span className="rv-chip">World locked · test only</span>;
  if (r.world_status === 'no_world') return <span className="rv-chip">Test record only</span>;
  return null;
}

function GradeForm({ r }: { r: TestResult }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [note, setNote] = useState(r.coach_note ?? '');
  const m = useMutation({
    mutationFn: (grade: 'pass' | 'needs_work' | null) => gradeTestResult(r.id, grade, note.trim()),
    onSuccess: (_d, grade) => {
      toast(grade ? 'Grade saved' : 'Grade cleared');
      qc.invalidateQueries({ queryKey: ['test-results', r.warrior_id] });
    },
    onError: (e) => toast(e instanceof Error ? e.message : 'Could not save the grade', 'error'),
  });
  return (
    <div className="tp-grade">
      <input
        className="field"
        placeholder="Note for the athlete (optional)"
        value={note}
        maxLength={1000}
        onChange={(e) => setNote(e.target.value)}
        aria-label="Coach note"
      />
      <div className="pkg-actions">
        <button
          type="button"
          className={`btn small${r.coach_grade === 'pass' ? ' primary' : ''}`}
          disabled={m.isPending}
          onClick={() => m.mutate('pass')}
        >
          Pass
        </button>
        <button
          type="button"
          className={`btn small${r.coach_grade === 'needs_work' ? ' primary' : ''}`}
          disabled={m.isPending}
          onClick={() => m.mutate('needs_work')}
        >
          Needs work
        </button>
        {r.coach_grade && (
          <button type="button" className="btn small ghost" disabled={m.isPending} onClick={() => m.mutate(null)}>
            Clear
          </button>
        )}
      </div>
    </div>
  );
}

function WhatsAppField() {
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({ queryKey: ['my-whatsapp'], queryFn: fetchMyWhatsApp });
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState('');
  const m = useMutation({
    mutationFn: (n: string) => saveMyWhatsApp(n),
    onSuccess: () => {
      toast('WhatsApp number saved');
      setEditing(false);
      qc.invalidateQueries({ queryKey: ['my-whatsapp'] });
    },
    onError: (e) => toast(e instanceof Error ? e.message : 'Could not save the number', 'error'),
  });
  if (q.isLoading) return null;
  const number = q.data ?? null;

  if (!editing) {
    return (
      <p className="pkg-hint">
        {number ? (
          <>
            Form-check videos come to your WhatsApp <strong>+{number}</strong>.{' '}
          </>
        ) : (
          <span className="tp-warn">Add your WhatsApp number so athletes can send you form-check videos. </span>
        )}
        <button
          type="button"
          className="btn small ghost"
          onClick={() => {
            setValue(number ? `+${number}` : '');
            setEditing(true);
          }}
        >
          {number ? 'Change' : 'Add number'}
        </button>
      </p>
    );
  }
  return (
    <form
      className="pkg-form-row"
      onSubmit={(e) => {
        e.preventDefault();
        m.mutate(value);
      }}
    >
      <label className="pkg-field pkg-grow">
        <span className="label">Your WhatsApp number</span>
        <input
          className="field"
          inputMode="tel"
          placeholder="+20 100 123 4567"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          autoFocus
        />
      </label>
      <div className="pkg-form-actions">
        <button type="submit" className="btn small primary" disabled={m.isPending}>
          Save
        </button>
        <button type="button" className="btn small ghost" onClick={() => setEditing(false)}>
          Cancel
        </button>
      </div>
    </form>
  );
}

export function TestsPanel({
  assignment,
}: {
  assignment: { id: string; template_id: string; warrior_id: string; coach_id: string };
}) {
  const { profile } = useAuth();
  const isCoachProgram = programSource(assignment.coach_id) === 'coach';
  const blocksQ = useQuery({
    queryKey: ['test-blocks', assignment.template_id],
    queryFn: () => fetchTestBlocks(assignment.template_id),
    enabled: isCoachProgram,
  });
  const resultsQ = useQuery({
    queryKey: ['test-results', assignment.warrior_id],
    queryFn: () => fetchTestResults(assignment.warrior_id),
    enabled: isCoachProgram,
  });
  // A test block logged with no test result was done on an app version
  // from before test weeks (it shows test items as normal blocks).
  const loggedQ = useQuery({
    queryKey: ['logged-blocks', assignment.id],
    queryFn: () => fetchLoggedBlocks(assignment.id),
    enabled: isCoachProgram && (blocksQ.data?.length ?? 0) > 0,
  });

  if (!isCoachProgram) return null;
  if (blocksQ.error || resultsQ.error) return <ErrorNote error={blocksQ.error ?? resultsQ.error} />;
  if (!blocksQ.data || !resultsQ.data) return null;

  const blocks = blocksQ.data;
  const all = resultsQ.data;
  const mine = all.filter((r) => r.warrior_program_id === assignment.id);
  if (blocks.length === 0 && mine.length === 0) return null;

  const byBlock = new Map(mine.filter((r) => r.block_id).map((r) => [r.block_id as string, r]));
  const weeks = Array.from(new Set(blocks.map((b) => b.week_number))).sort((a, b) => b - a);
  // Results whose block was removed from the program since.
  const orphans = mine.filter((r) => !r.block_id || !blocks.some((b) => b.id === r.block_id));
  const isProgramCoach = profile?.id === assignment.coach_id;

  return (
    <section className="pkg tp" aria-label="Test weeks">
      <span className="label">Tests</span>
      {isProgramCoach && <WhatsAppField />}
      {weeks.map((week) => {
        const items = blocks.filter((b) => b.week_number === week);
        const finished = items.filter((b) => byBlock.has(b.id)).length;
        return (
          <div key={week} className="tp-week">
            <div className="pkg-line">
              <span className="pkg-dates">Week {week} test</span>
              <span className={`pkg-state${finished === items.length ? ' ok' : ''}`}>
                {finished}/{items.length} done
              </span>
            </div>
            <ul className="rv-list">
              {items.map((b) => {
                const r = byBlock.get(b.id);
                const kind = TEST_KINDS.find((k) => k.value === b.test_kind)?.label ?? b.test_kind;
                const target =
                  b.test_kind === 'max_hold' && r?.movement_id
                    ? HOLD_NAMES[r.movement_id] ?? r.movement_id
                    : testMovementOptions(b.test_kind).find((m) => m.value === b.test_movement)?.label;
                return (
                  <li key={b.id}>
                    <span className="rv-kind">
                      {kind}
                      {target ? ` · ${target}` : ''}
                    </span>
                    <span className="rv-answers">
                      <strong>{r?.item_name || blockItemName(b)}</strong>
                      {!r && loggedQ.data?.has(b.id) ? (
                        <span className="rv-chip no" title="Their app is older than test weeks and logged this as a normal block.">
                          Logged without a result · ask them to update the app
                        </span>
                      ) : (
                        !r && <span className="tp-dim">Not done yet</span>
                      )}
                      {r?.status === 'done' && r.unit && <span className="tp-value">{formatValue(r)}</span>}
                      {r?.status === 'done' && b.test_kind === 'form_check' && (
                        <span className="tp-dim">Video sent on WhatsApp</span>
                      )}
                      {r?.status === 'skipped' && (
                        <span className="rv-chip no">Skipped · {r.skip_reason ? SKIP_LABEL[r.skip_reason] : ''}</span>
                      )}
                      {r && <WorldChip r={r} />}
                      {r && <Delta r={r} all={all} />}
                      {r?.coach_grade && (
                        <span className={`rv-chip ${r.coach_grade === 'pass' ? 'yes' : 'no'}`}>
                          {r.coach_grade === 'pass' ? 'Passed' : 'Needs work'}
                        </span>
                      )}
                    </span>
                    {r?.skip_detail && <span className="rv-comment">“{r.skip_detail}”</span>}
                    {r?.status === 'done' && b.test_kind === 'form_check' && <GradeForm key={r.updated_at} r={r} />}
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
      {orphans.length > 0 && (
        <div className="tp-week">
          <span className="pkg-dim">Results from items no longer in the program</span>
          <ul className="rv-list">
            {orphans.map((r) => (
              <li key={r.id}>
                <span className="rv-kind">Week {r.week_number}</span>
                <span className="rv-answers">
                  <strong>{r.item_name || 'Test item'}</strong>
                  {r.status === 'done' ? (
                    <span className="tp-value">{formatValue(r) || 'Done'}</span>
                  ) : (
                    <span className="rv-chip no">Skipped</span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
