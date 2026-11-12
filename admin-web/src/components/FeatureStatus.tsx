import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { Badge } from '@/components/bits';

type Flag = 'team_challenge_enabled' | 'live_tournament_enabled';

async function fetchFlag(flag: Flag): Promise<Array<{ platform: string; on: boolean }>> {
  const { data, error } = await supabase.from('app_config').select(`platform, ${flag}`).order('platform');
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as Array<Record<string, unknown>>).map((r) => ({
    platform: String(r.platform),
    on: r[flag] === true,
  }));
}

const PLATFORM: Record<string, string> = { ios: 'iPhone', android: 'Android' };

/** Whether the app shows this feature right now (app_config, per
 * platform), so a challenge published here isn't silently invisible. */
export function FeatureStatus({ flag, name }: { flag: Flag; name: string }) {
  const q = useQuery({ queryKey: ['app-config', flag], queryFn: () => fetchFlag(flag) });
  if (q.isLoading || !q.data) return null;
  if (q.error) return <span className="dim">Couldn't read the app setting for {name}.</span>;
  const off = q.data.filter((p) => !p.on);
  if (off.length === 0) {
    return (
      <span className="row" style={{ gap: 6 }}>
        <Badge tone="ok">on in the app</Badge>
        <span className="dim">{name} shows on {q.data.map((p) => PLATFORM[p.platform] ?? p.platform).join(' and ')}.</span>
      </span>
    );
  }
  return (
    <span className="row" style={{ gap: 6 }}>
      <Badge tone="warn">{off.length === q.data.length ? 'off in the app' : 'partly off'}</Badge>
      <span className="dim">
        {name} is switched off on {off.map((p) => PLATFORM[p.platform] ?? p.platform).join(' and ')}: athletes there don't see what you publish.
      </span>
    </span>
  );
}
