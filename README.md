# Yazan dev

An indie-game catalog and publishing site. Firebase is used only for Authentication and the trusted `admin` custom claim. A separate Node.js API verifies Firebase ID tokens and uses a **private GitHub repository** for submission files, review metadata, the public catalog, and audit records. It proxies only approved games and downloads; the source repository stays private.

The service is not activated by this repository alone. A private game staging repository has been created at [ymisk019/houssam-dev-games-private](https://github.com/ymisk019/houssam-dev-games-private). You must configure Firebase Authentication, deploy the standalone API, set server-side secrets, and point the frontend at the deployed API. The frontend currently has an `API_BASE` placeholder, so game publishing and the live catalog remain unavailable until setup is complete.

## Layout

```text
index.html              Storefront and Firebase Authentication client
backend/index.js        Standalone Node.js API, private GitHub storage, moderation and publishing
backend/archive.js      ZIP validation and bounded source inspection
backend/set-admin.js    Trusted one-time Firebase custom-claim utility
backend/.env.example    Non-secret backend configuration template
docs/                   Privacy and terms pages
```

## Required services

- Node.js 22, Google Cloud CLI, a Firebase project, and a Cloud Run-enabled Google Cloud project.
- Firebase Authentication with Email/Password and Google providers enabled. Add the deployed website's domain to Firebase Authentication's authorized domains.
- One **private** GitHub repository for staged and approved source files. Create a fine-grained GitHub token restricted to that repository with Contents read/write permission. Keep it in Google Secret Manager; never put it in the browser or commit it.
- A Cloud Run service account and Cloud Run service for `backend/`. The API needs Firebase project identity verification and GitHub/AI secrets, but does not use Firebase Storage, Firestore, or Firebase Functions.
- Gemini and Groq keys/model IDs are optional. If AI review is missing, fails, or is uncertain, the submission still requires human review. Configure both providers if using AI assistance.

## Configure Firebase Authentication

The existing public Firebase web configuration in `index.html` points to project `d-1288b`. In Firebase Console, verify this is the intended project, enable Email/Password and Google under Authentication providers, and add `ymisk019.github.io` under Authentication authorized domains. The API validates signed ID tokens against this same project and checks the server-assigned `admin` custom claim. App Check, Firebase Hosting, Firestore, Storage, and Functions are not part of this architecture.

## Deploy the API

1. The private repository [ymisk019/houssam-dev-games-private](https://github.com/ymisk019/houssam-dev-games-private) has been created for staging and approved assets. Create a fine-grained token with Contents read/write access to that repository only and add it to Google Secret Manager as `github-token`. Optionally create `gemini-api-key` and `groq-api-key` secrets.
2. Deploy the API from this directory using Google Cloud CLI. The project ID `d-1288b` comes from the Firebase web configuration in the site. The Cloud Run runtime service account needs `roles/secretmanager.secretAccessor` for each secret and `roles/firebaseauth.admin` to verify token revocation. The API must be publicly reachable for the public catalog and game proxy; all submission/review writes require a verified Firebase ID token, and admin routes additionally require the server-assigned `admin` claim.

   ```powershell
   gcloud run deploy houssam-publishing-api --source backend --project d-1288b --region us-central1 --allow-unauthenticated --no-traffic --memory 2Gi --concurrency 4 --set-env-vars GOOGLE_CLOUD_PROJECT=d-1288b,FRONTEND_ORIGIN=https://ymisk019.github.io,PUBLIC_API_ORIGIN=https://placeholder.invalid,GITHUB_OWNER=ymisk019,GITHUB_REPO=houssam-dev-games-private,GITHUB_BRANCH=main --set-secrets GITHUB_TOKEN=github-token:latest
   ```

   After the first deploy, copy the HTTPS service URL from Cloud Run. Replace the temporary `PUBLIC_API_ORIGIN` with that URL and add optional AI secrets/model IDs in Cloud Run. Then route traffic to the ready revision:

   ```powershell
   gcloud run services update houssam-publishing-api --project d-1288b --region us-central1 --update-env-vars PUBLIC_API_ORIGIN=https://YOUR-CLOUD-RUN-SERVICE-URL --update-secrets GEMINI_API_KEY=gemini-api-key:latest,GROQ_API_KEY=groq-api-key:latest
   gcloud run services update-traffic houssam-publishing-api --project d-1288b --region us-central1 --to-latest
   ```

   Add `GEMINI_MODEL` and `GROQ_MODEL` as Cloud Run environment variables if both optional AI secrets are configured. The `FRONTEND_ORIGIN` must exactly match the site origin (`https://ymisk019.github.io`).
3. Copy that HTTPS service URL into the `API_BASE` constant in `index.html`. The storefront is a static GitHub Pages site; commit the configured frontend and let the repository's Pages deployment publish it. Keep Firebase limited to Authentication and custom admin claims.

4. Add the AI provider keys as Cloud Run secrets if desired. Configure `GEMINI_MODEL` and `GROQ_MODEL` with model IDs available to the respective accounts. Never add provider keys or the GitHub token to `index.html`, `.env.example`, or game files.

The backend stores staging data under `submissions/<id>/` and approved game assets under `published/<id>/`, with public catalog metadata under `catalog/`. These paths are all in the private repository. It writes the public catalog record only after the approved assets have been committed. The public API serves files only when the corresponding catalog record is `Published`; suspension immediately blocks playback and downloads. Approved browser game URLs and ZIP download URLs use the API proxy, not GitHub Pages or a public GitHub repository.

## Create the first administrator

Never let users set their own admin status. Use an operator workstation with trusted Google Application Default Credentials authorized to update users in the intended Firebase project:

```powershell
cd backend
npm install
$env:GOOGLE_APPLICATION_CREDENTIALS = 'C:\secure\firebase-admin.json'
$env:FIREBASE_PROJECT_ID = 'd-1288b'
$env:ADMIN_UID = 'the-user-auth-uid'
npm run set-admin
```

Keep the service-account key outside this repository and revoke it when no longer needed. The administrator must refresh their Firebase ID token (sign out and back in if needed). Server endpoints verify the signed token and require `admin: true`; an editable profile or browser value is never trusted for authorization.

## Review and publication behavior

Creators upload files through the API, which writes them directly to the private GitHub repository. Browser ZIPs must have a root `index.html`; ZIP size is limited to 25 MB, extracted size to 100 MB, and entries to 5 MB. Covers/screenshots must be valid JPG, PNG, or WebP files up to 5 MB. The server does not execute uploaded code.

AI-assisted review is restricted to identifying **pornographic or sexually explicit content** in bounded source text and metadata. It does not automatically inspect images, moderate unrelated policy categories, or make the publication decision. Missing providers, provider errors, uncertainty, or a possible explicit-content finding are sent to the human review queue. Administrators must inspect cover and screenshot images themselves. Only an authenticated administrator can approve, reject, request changes, suspend, restore, feature, or close a report. Privileged actions are recorded in the private repository.

Approved game files and downloads are publicly playable/downloadable through the API. Keeping the source repository private does not prevent users from viewing or copying browser-delivered game content or downloaded files. Submission files, including rejected uploads, remain in private Git history; configure a retention and repository-cleanup procedure before production. Per-account API rate limits are in-memory best-effort limits and should be supplemented by a managed API gateway for higher-volume use.

## Validation

```powershell
cd backend
npm install
npm run lint
npm test
```

Before launch, test with a non-production Firebase project and a dedicated private GitHub repository. Verify non-admin API requests are denied, an ordinary user cannot publish, unapproved URLs return 404, only approved games are served, suspension blocks serving, and a failed repository write never creates a public catalog entry.

## Existing Firebase resources

The application uses Firebase Authentication only; this repository does not configure Firebase Hosting, Functions, Firestore, or Storage. If an earlier version created those resources, this change does not delete deployed data or cloud resources. Review them in the Firebase console, export any records you need, then disable/delete unused databases, buckets, or functions using the project operator's normal data-retention and deletion process.

The GitHub Pages frontend sets a meta Content Security Policy and referrer policy. GitHub Pages does not let this repository configure response headers such as `X-Frame-Options`; use a hosting service with configurable headers if those additional headers are required.

## Terms and privacy

Read [Privacy](docs/PRIVACY.md) and [Terms](docs/TERMS.md). These project templates must be updated with the operator's legal identity, contact, retention practices, and applicable jurisdiction before public launch.
