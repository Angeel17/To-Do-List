// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// ✅ Your Firebase configuration
// NOTE: These values are project-specific and should be kept secure 
// or loaded from environment variables in a production environment.
const firebaseConfig = {
  apiKey: "AIzaSyBPi27BImveZdt6S6yNDEzIJBtS1DOOIzg",
  authDomain: "to-do-list-8048d.firebaseapp.com",
  projectId: "to-do-list-8048d",
  storageBucket: "to-do-list-8048d.firebasestorage.app",
  messagingSenderId: "33032021971",
  appId: "1:33032021971:web:bf5d76e87b6589f7b7b126",
  measurementId: "G-C9SB06Z271" // Optional
};

// ✅ Initialize Firebase
const app = initializeApp(firebaseConfig);

// 🔑 Initialize Firebase Auth and Firestore
export const auth = getAuth(app);
export const db = getFirestore(app);