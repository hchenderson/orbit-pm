import { getApp, getApps, initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { clearIndexedDbPersistence, collection, deleteDoc, doc, getDocs, initializeFirestore, persistentLocalCache, persistentMultipleTabManager, query, setDoc, terminate, where, type Firestore } from "firebase/firestore";
import { getFunctions } from "firebase/functions";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

let appCheckPromise: Promise<unknown> | null = null;
let firestore: Firestore | null = null;

export const isFirebaseConfigured = Boolean(
  firebaseConfig.apiKey && firebaseConfig.authDomain && firebaseConfig.projectId && firebaseConfig.appId,
);

export const isDemoMode = process.env.NEXT_PUBLIC_DEMO_MODE !== "false";

export function getFirebaseApp() {
  if (!isFirebaseConfigured) return null;
  return getApps().length ? getApp() : initializeApp(firebaseConfig);
}

export function getFirebaseAuth() {
  const app = getFirebaseApp();
  if (!app) return null;
  return getAuth(app);
}

export function getFirebaseFirestore() {
  const app = getFirebaseApp();
  if (!app) return null;
  if (!firestore) {
    firestore = initializeFirestore(app, {
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
    });
  }
  return firestore;
}

export function getFirebaseStorage() {
  const app = getFirebaseApp();
  if (!app) return null;
  return getStorage(app);
}

export function getFirebaseFunctions() {
  const app = getFirebaseApp();
  if (!app) return null;
  return getFunctions(app, "us-central1");
}

export async function clearFirebaseOfflineCache() {
  if (!firestore) return;
  const current = firestore;
  firestore = null;
  await terminate(current);
  await clearIndexedDbPersistence(current).catch(() => {
    // Another open Orbit tab may still own the cache. Authentication still prevents server access.
  });
}

export async function enableFirebaseAppCheck() {
  const app = getFirebaseApp();
  const siteKey = process.env.NEXT_PUBLIC_FIREBASE_APP_CHECK_SITE_KEY;
  if (!app || typeof window === "undefined" || !siteKey || isDemoMode) return null;
  if (!appCheckPromise) {
    appCheckPromise = import("firebase/app-check").then(({ initializeAppCheck, ReCaptchaEnterpriseProvider }) => initializeAppCheck(app, {
      provider: new ReCaptchaEnterpriseProvider(siteKey),
      isTokenAutoRefreshEnabled: true,
    }));
  }
  return appCheckPromise;
}

export async function enableFirebaseAnalytics() {
  const app = getFirebaseApp();
  if (!app || typeof window === "undefined" || !firebaseConfig.measurementId) return null;
  const { getAnalytics, isSupported } = await import("firebase/analytics");
  return (await isSupported()) ? getAnalytics(app) : null;
}

export type PushRegistrationResult = "enabled" | "denied" | "unsupported" | "needs-vapid-key";

async function pushSubscriptionId(userId: string, fid: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(fid));
  const fidHash = [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("").slice(0, 32);
  return `${userId}_${fidHash}`;
}

/** Requests browser push permission and stores this device's Firebase Installation ID. */
export async function enablePushNotifications(workspaceId: string, userId: string): Promise<PushRegistrationResult> {
  if (typeof window === "undefined" || !("Notification" in window) || !("serviceWorker" in navigator)) return "unsupported";
  const app = getFirebaseApp();
  const db = getFirebaseFirestore();
  const vapidKey = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY;
  if (!app || !db || !workspaceId || !userId) return "unsupported";
  if (!vapidKey) return "needs-vapid-key";
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return "denied";
  const { getMessaging, isSupported, onRegistered, register } = await import("firebase/messaging");
  if (!(await isSupported())) return "unsupported";
  const serviceWorkerRegistration = await navigator.serviceWorker.register("/firebase-messaging-sw.js", { scope: "/firebase-cloud-messaging-push-scope" });
  const messaging = getMessaging(app);
  await new Promise<void>((resolve, reject) => {
    let complete = false;
    let unsubscribe = () => {};
    const timeout = window.setTimeout(() => {
      unsubscribe();
      if (!complete) reject(new Error("Firebase did not finish registering this device. Please try again."));
    }, 15_000);
    unsubscribe = onRegistered(messaging, (fid) => {
      void (async () => {
        const id = await pushSubscriptionId(userId, fid);
        await setDoc(doc(db, "workspaces", workspaceId, "pushSubscriptions", id), {
          id,
          userId,
          fid,
          userAgent: navigator.userAgent.slice(0, 240),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }, { merge: true });
        complete = true;
        window.clearTimeout(timeout);
        unsubscribe();
        resolve();
      })().catch((error) => {
        window.clearTimeout(timeout);
        unsubscribe();
        reject(error);
      });
    });
    void register(messaging, { vapidKey, serviceWorkerRegistration }).catch((error) => {
      window.clearTimeout(timeout);
      unsubscribe();
      reject(error);
    });
  });
  return "enabled";
}

/** Stops FCM delivery and removes every saved push registration for this user. */
export async function disablePushNotifications(workspaceId: string, userId: string) {
  const app = getFirebaseApp();
  const db = getFirebaseFirestore();
  if (!app || !db || !workspaceId || !userId) return;
  const snapshot = await getDocs(query(collection(db, "workspaces", workspaceId, "pushSubscriptions"), where("userId", "==", userId)));
  await Promise.all(snapshot.docs.map((item) => deleteDoc(item.ref)));
  if (typeof window !== "undefined" && "serviceWorker" in navigator) {
    const { getMessaging, isSupported, unregister } = await import("firebase/messaging");
    if (await isSupported()) await unregister(getMessaging(app));
  }
}
