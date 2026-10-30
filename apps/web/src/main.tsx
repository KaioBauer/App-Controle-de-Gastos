import '@fontsource-variable/geist';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { App } from './App';
import { fixStandaloneSafeArea } from './lib/platform';
import { PrivacyProvider } from './lib/privacy';
import { keepAppUpdated } from './lib/sw-update';
import './styles.css';
import { ToastProvider } from './ui/Toast';
import { TransactionSheetProvider } from './ui/TransactionSheet';

keepAppUpdated();
fixStandaloneSafeArea();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: true },
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <PrivacyProvider>
        <ToastProvider>
          <BrowserRouter>
            <TransactionSheetProvider>
              <App />
            </TransactionSheetProvider>
          </BrowserRouter>
        </ToastProvider>
      </PrivacyProvider>
    </QueryClientProvider>
  </StrictMode>,
);
