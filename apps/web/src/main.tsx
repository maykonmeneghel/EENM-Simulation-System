import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AuthStore } from './application/authStore';
import { SavedSimulations } from './application/savedSimulations';
import { SimulationController } from './application/simulationController';
import { createApiClient } from './infrastructure/apiClient';
import { firebaseConfigFromEnv } from './infrastructure/authConfig';
import { firebaseBackend } from './infrastructure/firebaseAuth';
import { defaultSavedSimulationStore } from './infrastructure/savedSimulationStore';
import { App } from './ui/App';
import { AuthGate } from './ui/AuthGate';
import './ui/styles.css';

// Same-origin '/api' by default (Vite proxy in dev, nginx in Docker, CloudFront when hosted). Override with
// VITE_API_BASE_URL.
const baseUrl = import.meta.env.VITE_API_BASE_URL ?? '';
// Sign-in only when the build has the VITE_FIREBASE_* variables (docs/deployment.md); otherwise as before.
// (named one by one, so that only these are inlined in the bundle, not every VITE_ variable)
const firebase = firebaseConfigFromEnv({
  VITE_FIREBASE_API_KEY: import.meta.env.VITE_FIREBASE_API_KEY,
  VITE_FIREBASE_AUTH_DOMAIN: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  VITE_FIREBASE_PROJECT_ID: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  VITE_FIREBASE_APP_ID: import.meta.env.VITE_FIREBASE_APP_ID,
  VITE_FIREBASE_MESSAGING_SENDER_ID: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  VITE_FIREBASE_STORAGE_BUCKET: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
});
const publicApi = createApiClient({ baseUrl });
const auth = firebase
  ? new AuthStore(firebaseBackend(firebase), (token) => publicApi.checkAccess!(token))
  : null;
const api = auth ? createApiClient({ baseUrl, auth }) : publicApi;
const controller = new SimulationController(api);
const saved = new SavedSimulations(defaultSavedSimulationStore());

const root = document.getElementById('root');
if (!root) throw new Error('#root not found');
createRoot(root).render(
  <StrictMode>
    {auth ? (
      <AuthGate store={auth}>{(account) => <App api={api} controller={controller} saved={saved} account={account} />}</AuthGate>
    ) : (
      <App api={api} controller={controller} saved={saved} />
    )}
  </StrictMode>,
);
