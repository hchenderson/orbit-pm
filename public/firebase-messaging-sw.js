/* Firebase Web Push worker. The Firebase browser configuration is public by design. */
importScripts("https://www.gstatic.com/firebasejs/12.16.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/12.16.0/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyDuw6FHO9zYCrTRnycO5pEum2Ci4nqYUAg",
  authDomain: "orbit-pm-79c3b.firebaseapp.com",
  projectId: "orbit-pm-79c3b",
  storageBucket: "orbit-pm-79c3b.firebasestorage.app",
  messagingSenderId: "822633127977",
  appId: "1:822633127977:web:ff801d59f75c8c85ff3c38",
});

firebase.messaging().onBackgroundMessage((payload) => {
  const notification = payload.notification || payload.data || {};
  self.registration.showNotification(notification.title || "Orbit reminder", {
    body: notification.body || "You have an update in Orbit.",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    data: { url: payload.fcmOptions?.link || payload.data?.url || "/" },
  });
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(clients.openWindow(event.notification.data?.url || "/"));
});
