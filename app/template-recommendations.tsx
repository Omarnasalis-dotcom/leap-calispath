import React from 'react';
import { useRouter } from 'expo-router';
import { TemplateRecommendationsScreen } from '../src/screens/TemplateRecommendationsScreen';
import { SpartanLayout } from '../src/components/SpartanLayout';

export default function Route() {
  const router = useRouter();

  return (
    <SpartanLayout>
      <TemplateRecommendationsScreen onClose={() => router.back()} />
    </SpartanLayout>
  );
}
