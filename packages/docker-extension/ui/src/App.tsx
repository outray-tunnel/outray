import { createHashRouter, RouterProvider } from 'react-router-dom';
import { Index } from './routes';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Dashboard } from './routes/dashboard';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
    },
  },
});

const router = createHashRouter([
  {
    path: "/",
    Component: Index,
  },
  {
    path: "/dashboard",
    Component: Dashboard,
  },
]);

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
}
