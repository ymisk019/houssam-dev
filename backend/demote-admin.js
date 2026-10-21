"use strict";

const { initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");

function removeAdminClaim(customClaims = {}) {
  const remainingClaims = { ...customClaims };
  delete remainingClaims.admin;
  return remainingClaims;
}

async function main() {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const uid = process.env.ADMIN_UID;
  if (!projectId || !uid) throw new Error("Set FIREBASE_PROJECT_ID and ADMIN_UID before running this utility.");
  initializeApp({ projectId });
  const auth = getAuth();
  const user = await auth.getUser(uid);
  await auth.setCustomUserClaims(uid, removeAdminClaim(user.customClaims));
  console.log(`Administrator claim removed from ${uid} in ${projectId}. Have the user refresh their ID token.`);
}

if (require.main === module) {
  main().catch(error => {
    console.error("Unable to remove administrator claim:", error.message);
    process.exitCode = 1;
  });
}

module.exports = { removeAdminClaim };
