"use strict";

const { initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");

async function main() {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const uid = process.env.ADMIN_UID;
  if (!projectId || !uid) throw new Error("Set FIREBASE_PROJECT_ID and ADMIN_UID before running this utility.");
  initializeApp({ projectId });
  const auth = getAuth();
  const user = await auth.getUser(uid);
  await auth.setCustomUserClaims(uid, { ...user.customClaims, admin: true });
  console.log(`Administrator claim assigned to ${uid} in ${projectId}. Have the user refresh their ID token.`);
}

main().catch(error => {
  console.error("Unable to assign administrator claim:", error.message);
  process.exitCode = 1;
});
