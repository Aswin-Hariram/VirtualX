import firebase from 'firebase/app';
import 'firebase/firestore';
import 'firebase/auth';

const firebaseConfig = {
  apiKey: "AIzaSyC32Ue5WAMQ0SCL0BwKkdrCnz3BGcoTjMU",
  authDomain: "videocall-6d485.firebaseapp.com",
  projectId: "videocall-6d485",
  storageBucket: "videocall-6d485.appspot.com",
  messagingSenderId: "338090343580",
  appId: "1:338090343580:web:420094ceb23553891e8159",
  measurementId: "G-LBEC7L80Q5"
};

// Initialize Firebase
let firebaseApp;
try {
  if (!firebase.apps.length) {
    firebaseApp = firebase.initializeApp(firebaseConfig);
  } else {
    firebaseApp = firebase.app();
  }
} catch (error) {
  console.error("Firebase initialization error:", error);
  throw error;
}

const db = firebaseApp.firestore();
const auth = firebaseApp.auth();

// Initialize anonymous auth
const initAuth = async () => {
  try {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      try {
        await auth.signInAnonymously();
        console.log("Signed in anonymously");
      } catch (authError) {
        if (authError.code === 'auth/internal-error') {
          console.warn("Anonymous auth not enabled. Proceeding without authentication.");
          // Create a mock user for development
          return {
            uid: 'anonymous-' + Math.random().toString(36).substr(2, 9),
            isAnonymous: true
          };
        }
        throw authError;
      }
    }
    return currentUser;
  } catch (error) {
    console.error("Error in auth initialization:", error);
    // Don't throw the error, just log it and continue
    return null;
  }
};

// Initialize auth and export the promise
export const authInitialized = initAuth();

// Export Firebase instances
export { db, auth, firebaseApp }; 