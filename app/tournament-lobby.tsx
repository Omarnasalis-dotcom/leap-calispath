import React from 'react';
import { LockedFeature } from '../src/components/LockedFeature';
import { SpartanLayout } from '../src/components/SpartanLayout';

export default function Route() {
  return (
    <SpartanLayout hideToggle>
      <LockedFeature
        title="TOURNAMENT ARENA"
        description="Tournament Arena is currently locked and will be available in Season 2."
        season={2}
      />
    </SpartanLayout>
  );
}
