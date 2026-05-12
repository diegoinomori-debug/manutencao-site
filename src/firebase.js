import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDFmWMpOcScA-t_CchP7BzI1z4kkNIxtbU",
  authDomain: "manutencao-site.firebaseapp.com",
  projectId: "manutencao-site",
  storageBucket: "manutencao-site.firebasestorage.app",
  messagingSenderId: "527289002766",
  appId: "1:527289002766:web:e1c29a5e4c8dc91958855f",
  measurementId: "G-R89QGBXHRV"
};

const app = initializeApp(firebaseConfig);

export const db = getFirestore(app);