import { LockedFeature } from '../src/components/LockedFeature';
import { SpartanLayout } from '../src/components/SpartanLayout';

export default function CoachRoute() {
  return (
    <SpartanLayout hideToggle>
      <LockedFeature 
        title="COACHING HUB" 
        description="The elite mentorship program is currently in private beta."
      />
    </SpartanLayout>
  );
}
