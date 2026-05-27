import React from 'react';
import { LockedFeature } from '../src/components/LockedFeature';
import { SpartanLayout } from '../src/components/SpartanLayout';

export default function Route() {
  return (
    <SpartanLayout>
      <LockedFeature 
        title="CLASH ARENA" 
        description="Real-time competitive multiplayer is currently under development."
      />
    </SpartanLayout>
  );
}
