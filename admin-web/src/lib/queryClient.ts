import { QueryClient } from '@tanstack/react-query';

// The entire caching strategy: fresh for 60s, one retry, no refetch storms.
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});
