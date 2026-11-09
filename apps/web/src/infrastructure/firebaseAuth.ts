import type { AuthBackend, AuthUser } from '../application/authStore';
import type { FirebaseWebConfig } from './authConfig';

type FirebaseAuth = typeof import('firebase/auth');
type Auth = import('firebase/auth').Auth;

/**
 * Google sign-in through the Firebase JS SDK, loaded on first use: a build without the `VITE_FIREBASE_*` variables
 * never downloads it. Sign-in uses a popup (`signInWithPopup`): the page and its unsaved form stay as they are, and it
 * does not depend on third-party storage the way a redirect from another domain does. The session persists in the
 * browser (the SDK's default, local persistence); the SDK refreshes the hour-long ID token before it expires.
 */
export function firebaseBackend(config: FirebaseWebConfig): AuthBackend {
  let loaded: Promise<{ sdk: FirebaseAuth; auth: Auth }> | null = null;
  const load = () =>
    (loaded ??= (async () => {
      const [{ initializeApp }, sdk] = await Promise.all([import('firebase/app'), import('firebase/auth')]);
      const auth = sdk.getAuth(initializeApp(config));
      return { sdk, auth };
    })());

  return {
    onUserChanged(listener) {
      let unsubscribe: (() => void) | null = null;
      let stopped = false;
      void load().then(({ sdk, auth }) => {
        if (stopped) return;
        unsubscribe = sdk.onAuthStateChanged(auth, (user) => listener(user ? toUser(user) : null));
      }, () => listener(null));
      return () => {
        stopped = true;
        unsubscribe?.();
      };
    },
    async signIn() {
      const { sdk, auth } = await load();
      const provider = new sdk.GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      await sdk.signInWithPopup(auth, provider);
    },
    async signOut() {
      const { sdk, auth } = await load();
      await sdk.signOut(auth);
    },
    async idToken(forceRefresh) {
      const { auth } = await load();
      return auth.currentUser ? auth.currentUser.getIdToken(forceRefresh) : null;
    },
  };
}

function toUser(user: import('firebase/auth').User): AuthUser {
  return { uid: user.uid, email: user.email, displayName: user.displayName };
}
