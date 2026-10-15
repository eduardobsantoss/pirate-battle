import { QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createQueryClient } from './api/queries';
import { App } from './App';
import { startMockApi } from './mocks/browser';
import './styles.css';

const root = document.getElementById('root');
if (!root) throw new Error('Root element not found');

const queryClient = createQueryClient();

// The mock API must be ready before the first ranking/history request.
// Even if it fails to start, the game renders (API calls will show errors).
void startMockApi().finally(() => {
  createRoot(root).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </StrictMode>,
  );
});
