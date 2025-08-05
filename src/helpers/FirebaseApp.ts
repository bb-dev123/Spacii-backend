import firebaseAdmin from "firebase-admin";
import serviceAccount from "../constants/fcm-cred.json";

// Type assertion
firebaseAdmin.initializeApp({
  credential: firebaseAdmin.credential.cert(serviceAccount as firebaseAdmin.ServiceAccount),
});

export { firebaseAdmin };
