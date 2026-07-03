import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { AssessmentScreen } from '../src/screens/AssessmentScreen';
import { SpartanLayout } from '../src/components/SpartanLayout';

export default function Route() {
  const params = useLocalSearchParams();

  return (
    <SpartanLayout>
      <AssessmentScreen
        {...params}
        // No navigation here — refreshProfile() inside AssessmentScreen updates
        // profile.assessed_at, which AuthGuard (app/_layout.tsx) already redirects
        // on declaratively. An imperative router.replace('/') here used to race
        // that Redirect and intermittently throw "REPLACE ... not handled by any
        // navigator" once the assessment stack started tearing down.
        onComplete={() => {}}
      />
    </SpartanLayout>
  );
}
