import React from 'react';
import { CoachingReviewScreen } from '../src/screens/CoachingReviewScreen';
import { SpartanLayout } from '../src/components/SpartanLayout';

// Opened from the coaching review push (?reviewId=…) or the Journey card.
export default function Route() {
  return (
    <SpartanLayout noBottomInset>
      <CoachingReviewScreen />
    </SpartanLayout>
  );
}

export { RouteErrorBoundary as ErrorBoundary } from '../src/components/RouteErrorBoundary';
