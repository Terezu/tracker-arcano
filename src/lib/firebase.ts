import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyANs44w2GgU1FCSUeDpchtJ0OtVmGWUPKQ",
  authDomain: "tracker-arcano.firebaseapp.com",
  projectId: "tracker-arcano",
  storageBucket: "tracker-arcano.firebasestorage.app",
  messagingSenderId: "476310231615",
  appId: "1:476310231615:web:b37db76d3a4b11c94ef68a",
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
