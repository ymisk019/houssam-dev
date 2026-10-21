# Yazan dev

An indie-game catalog and publishing site. Firebase is used only for Authentication and the trusted `admin` custom claim. A separate Node.js API verifies Firebase ID tokens and uses a **private GitHub repository** for submission files, review metadata, the public catalog, and audit records. It proxies only approved games and downloads; the source repository stays private.

The service is not activated by this repository alone. A private game staging repository has been created at [ymisk019/houssam-dev-games-private](https://github.com/ymisk019/houssam-dev-games-private). The frontend is configured to use `https://houssam-publishing-api.onrender.com`, whose public `/healthz` endpoint responds successfully. This health check does not verify the GitHub token or first administrator setup; authenticated publishing and admin flows require those settings.

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

- A Render account, a Firebase project, and Node.js 22 for local validation.
- Firebase Authentication with Email/Password and Google providers enabled. Add the deployed website's domain to Firebase Authentication's authorized domains.
- One **private** GitHub repository for staged and approved source files. Create a fine-grained GitHub token restricted to that repository with Contents read/write permission. Store it as a Render environment secret; never put it in the browser or commit it.
- A Render web service for `backend/`. The API verifies Firebase ID tokens using Firebase's public signing keys and the project ID; it does not need a Firebase service-account key. Firebase remains limited to Authentication and admin custom claims; the API does not use Firebase Storage, Firestore, or Firebase Functions.
- Gemini and Groq keys/model IDs are optional. If AI review is missing, fails, or is uncertain, the submission still requires human review. Configure both providers if using AI assistance.

## Configure Firebase Authentication

The existing public Firebase web configuration in `index.html` points to project `d-1288b`. This browser configuration is public and must not contain service-account credentials or the GitHub token. Google sign-in uses a redirect rather than a popup. In Firebase Console, verify this is the intended project, enable Email/Password and Google under Authentication providers, and add `ymisk019.github.io` under Authentication authorized domains. The API validates ID-token signatures, issuer, audience, and expiry against this project and checks the server-assigned `admin` custom claim. It does not check revocation: a revoked token or token belonging to a disabled user can remain authorized until the ID token expires (about one hour). App Check, Firebase Hosting, Firestore, Storage, and Functions are not part of this architecture.

## Deploy the API to Render

The repository includes a `render.yaml` Blueprint for the Node.js 22 API. It sets `backend/` as the service root, runs `npm ci` and `npm start`, configures `/healthz` as the health check, and supplies the non-secret project/repository settings. Render provides `PORT` and `RENDER_EXTERNAL_URL`; the server binds to `0.0.0.0` and uses the generated HTTPS URL automatically. Set `PUBLIC_API_ORIGIN` only if using a custom HTTPS domain.

1. In Render, create the web service from this repository's Blueprint. The Blueprint supplies the Firebase project ID and non-secret repository settings; the API does not need a Firebase service-account Secret File or `GOOGLE_APPLICATION_CREDENTIALS`.
2. Set the Blueprint's `GITHUB_TOKEN` environment variable to a fine-grained GitHub token restricted to [ymisk019/houssam-dev-games-private](https://github.com/ymisk019/houssam-dev-games-private) with Contents read/write permission. Mark it secret in Render. This private repository is where staged submissions, approved assets, catalog metadata, and audit records are stored; it is not the API host. Keep the API publicly reachable for the public catalog and game proxy; all submission/review writes require a verified Firebase ID token, and admin routes additionally require the server-assigned `admin` claim.
3. Wait for the Render deployment to become healthy, then copy its HTTPS service URL from the Render dashboard. Render supplies this as `RENDER_EXTERNAL_URL`, which the API uses for public game and download URLs automatically. Confirm `FRONTEND_ORIGIN` is exactly `https://ymisk019.github.io`. If you use a custom API domain, set `PUBLIC_API_ORIGIN` to its HTTPS origin and add that domain to the frontend Content Security Policy in `index.html`.
4. The frontend's `API_BASE` in `index.html` is set to `https://houssam-publishing-api.onrender.com`. If you use a different Render URL or custom API domain, update it and add any custom domain to the frontend Content Security Policy. The existing policy allows Render's `*.onrender.com` service domains.
5. Optionally add `GEMINI_API_KEY` and `GROQ_API_KEY` as Render secret environment variables, plus `GEMINI_MODEL` and `GROQ_MODEL` as ordinary environment variables for model IDs available to those accounts. AI assistance is limited to identifying pornographic or sexually explicit content. It never approves or publishes a game; every submission still requires an administrator's approval. Never put provider keys or the GitHub token in `index.html`, `.env.example`, or game files.

The Blueprint uses Render's free web-service plan. Free services can spin down when idle; choose an appropriate always-on plan in Render if the API needs to remain warm. After changing environment variables or secret files, trigger a new deployment/restart in Render. Later pushes to the configured branch will also redeploy the API when auto-deploy is enabled.

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

This trusted operator credential is needed only to provision the first administrator; it is not required by the Render API. Keep the service-account key outside this repository and revoke it when no longer needed. The administrator must refresh their Firebase ID token (sign out and back in if needed). Server endpoints verify the signed token and require `admin: true`; an editable profile or browser value is never trusted for authorization.

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
