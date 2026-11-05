import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { SimulationController } from './application/simulationController';
import { createApiClient } from './infrastructure/apiClient';
import { App } from './ui/App';
import './ui/styles.css';

// Same-origin '/api' by default (Vite proxy in dev, nginx in Docker). Override with VITE_API_BASE_URL.
const api = createApiClient({ baseUrl: import.meta.env.VITE_API_BASE_URL ?? '' });
const controller = new SimulationController(api);

const root = document.getElementById('root');
if (!root) throw new Error('#root not found');
createRoot(root).render(
  <StrictMode>
    <App api={api} controller={controller} />
  </StrictMode>,
);
