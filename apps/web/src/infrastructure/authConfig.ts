/**
 * Firebase web configuration from the build-time `VITE_FIREBASE_*` variables (docs/deployment.md). These values are
 * public by design: Vite inlines every `VITE_` variable into the JavaScript bundle, so nothing secret may use that
 * prefix, and the app never reads any other variable. Without the four required values there is no sign-in.
 */
export interface FirebaseWebConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  appId: string;
  messagingSenderId?: string;
  storageBucket?: string;
}

type Env = Readonly<Record<string, string | boolean | undefined>>;

const text = (env: Env, name: string): string => {
  const v = env[name];
  return typeof v === 'string' ? v.trim() : '';
};

/** The configuration, or null (no sign-in) unless the API key, auth domain, project id and app id are all set. */
export function firebaseConfigFromEnv(env: Env): FirebaseWebConfig | null {
  const config = {
    apiKey: text(env, 'VITE_FIREBASE_API_KEY'),
    authDomain: text(env, 'VITE_FIREBASE_AUTH_DOMAIN'),
    projectId: text(env, 'VITE_FIREBASE_PROJECT_ID'),
    appId: text(env, 'VITE_FIREBASE_APP_ID'),
  };
  if (!config.apiKey || !config.authDomain || !config.projectId || !config.appId) return null;
  const sender = text(env, 'VITE_FIREBASE_MESSAGING_SENDER_ID');
  const bucket = text(env, 'VITE_FIREBASE_STORAGE_BUCKET');
  return { ...config, ...(sender ? { messagingSenderId: sender } : {}), ...(bucket ? { storageBucket: bucket } : {}) };
}
