# Yazan dev

An English-only indie-game discovery and publishing site. The repository contains a single-file vanilla-JavaScript frontend, Firebase Authentication/Firestore/Storage integration, Firebase Functions v2 backend, locked-down Firestore and Storage rules, and server-side Gemini, Groq, and GitHub integrations. The public catalog starts empty: no demo titles or pretend downloads are included.

This is a deployable implementation, but it is not live until you configure the external accounts below. With placeholder Firebase/App Check values, authentication-dependent actions and publishing remain disabled. AI moderation is advisory and never publishes a game by itself.

## Project layout

```text
index.html                 Responsive storefront, Firebase Auth, catalog, player, creator/admin interfaces
functions/index.js         Callable backend, ZIP inspection, dual-provider moderation, admin review, GitHub publishing
functions/package.json     Firebase Functions runtime dependencies
firestore.rules            Public catalog read / private metadata write rules
storage.rules              Owner-only quarantine upload rules and size limits
firebase.json              Firebase Hosting, Functions and rules deployment settings
firestore.indexes.json     Composite indexes for catalog and review queues
functions/.env.example     Non-secret backend configuration template
functions/set-admin.js     One-time server-side custom-claim management utility
docs/PRIVACY.md            Data handling summary
docs/TERMS.md              User and game-submission terms
```

## Requirements and limits

- Node.js 22, Firebase CLI, a Firebase project with Authentication, Firestore, Storage, App Check, and Cloud Functions enabled. Cloud Functions deployment requires a billing-enabled Firebase plan.
- Enable Email/Password and Google providers in Firebase Authentication.
- Register the deployed site with reCAPTCHA v3 in Firebase App Check. Put the web site key in `APP_CHECK_SITE_KEY`; the key is public and is not an API secret.
- Browser ZIP: 25 MB compressed, 100 MB extracted, 200 files, 5 MB per entry, maximum 12 path levels and 100:1 compression ratio. A root-level `index.html` is required. The per-entry cap matches the 5 MB GitHub Git Data API publishing limit.
- Cover and screenshots: 5 MB each. Accepted formats are JPG, PNG and WebP; the backend verifies each image signature. Up to 5 optional screenshots are supported per submission.
- Download ZIP: 25 MB incoming; the GitHub Release publishing limit in this implementation is 100 MB. The lower upload cap applies. Release assets and published game files are public.
- Submissions are stored under private Firebase Storage paths until an administrator publishes them. ZIP contents are never executed by the backend.

The archive scanner rejects traversal, absolute paths, duplicate names (case-insensitive), symbolic links, oversized entries/archives, excessive compression, and unsupported file types. It reports heuristic source findings for human review. No antivirus engine is bundled. Neither static checks nor AI analysis prove that a game is safe.

The backend `.env` values can lower these archive/image limits within the hard caps shown above. Keep the matching Firebase Storage rule limits and the upload dialog's displayed default limits in sync if you lower them.

## Configure Firebase

1. Create a Firebase project and a Web App. Copy its web configuration into the clearly marked `firebaseConfig` object near the beginning of the module script in `index.html`.
2. Configure Authentication providers and allowed domains. Configure reCAPTCHA v3 / App Check and set `APP_CHECK_SITE_KEY` in `index.html`. The callable functions require App Check.
3. Create Firestore and a default Storage bucket in the same project. Review the rules in this repository; do not add public catalog writes or public quarantine reads.
4. Install the Firebase CLI, authenticate, then select the project:

   ```powershell
   npm install -g firebase-tools
   firebase login
   firebase use --add
   ```

5. Install backend packages and deploy:

   ```powershell
   cd functions
   npm install
   cd ..
   firebase deploy --only firestore,storage,functions,hosting
   ```

The Firestore catalog is publicly readable only for documents whose server-controlled status is `Published`. Client writes to game records, submissions, moderation results, and audit logs are denied. User profiles are self-readable and have a narrow client update surface.

## Configure the backend secrets and providers

Set API keys as Firebase-managed function secrets; never put them in `index.html`, `.env` files committed to Git, game archives, or the GitHub Pages site:

```powershell
firebase functions:secrets:set GEMINI_API_KEY
firebase functions:secrets:set GROQ_API_KEY
firebase functions:secrets:set GITHUB_TOKEN
```

Create `functions/.env.<firebase-project-id>` locally or configure equivalent non-secret runtime environment values in your deployment environment. Start from `functions/.env.example`. Set `GEMINI_MODEL` and `GROQ_MODEL` to model identifiers currently available to your own accounts; the functions do not assume a provider model is available. Set:

- `GITHUB_OWNER`, `GITHUB_REPO`, `GITHUB_BRANCH`
- `GITHUB_PAGES_ORIGIN`, including the repo path for a project Pages site (for example `https://OWNER.github.io/REPOSITORY`)
- `GEMINI_MODEL`, `GROQ_MODEL`

The GitHub token should be a fine-grained token limited to the one public game repository with repository Contents and Releases read/write access. For a production deployment, prefer a GitHub App installation token with equivalent minimum permissions and rotate credentials regularly. The publishing function creates unique `games/<submission-id>/...` paths, commits browser files without force-pushing, uploads downloadable ZIPs as versioned GitHub Release assets, and waits for the game entry and cover to answer successfully over HTTPS before adding the public Firestore catalog record. A failed publication remains unavailable to the public catalog and is logged for administrator follow-up.

For a project GitHub Pages deployment, enable Pages for the publishing branch and set `PUBLIC_GAMES_ORIGIN` in `index.html` to the exact origin configured above (without the repository path). The player accepts only approved `/games/<id>/index.html` paths on the current site origin or that exact configured origin. The iframe sandbox intentionally omits `allow-same-origin`, forms, popups, and top-navigation privileges.

Firebase callable functions do not require a custom CORS allowlist: Firebase handles callable transport and verifies auth/App Check tokens. Do not expose an HTTP endpoint or widen Firebase's rules to bypass these checks.

## Assign an administrator

An administrator is identified only by a Firebase Authentication custom claim. Never set an editable Firestore `isAdmin` field.

Use a trusted operator workstation with Application Default Credentials for the intended Firebase project:

```powershell
$env:GOOGLE_APPLICATION_CREDENTIALS = 'C:\secure\firebase-admin.json'
$env:FIREBASE_PROJECT_ID = 'your-project-id'
$env:ADMIN_UID = 'the-user-auth-uid'
cd functions
npm run set-admin
```

Keep the service-account key outside this project and remove access when finished. The admin panel re-checks a verified token claim in every privileged function. Publication, suspension, restoration, rejection, and report-review actions are audited.

## Creator workflow

1. Sign in with Google or email/password.
2. Select **Publish** and provide metadata, a JPG/PNG/WebP cover, up to five optional screenshots, and one ZIP. Use a ZIP whose root contains `index.html` for browser builds; keep every required asset in the archive and use relative asset paths.
3. The authenticated client uploads only to its own private staging prefix. The trusted function checks metadata, file signatures, ZIP structure and limits, runs static checks, and independently calls Gemini and Groq using bounded text excerpts.
4. If both provider requests succeed and do not surface high-risk findings or conflicting recommendations, the submission enters `Pending Review`; otherwise it is explicitly marked for human review or failure. Only a server-verified administrator can publish.
5. The admin reviews the evidence and can approve/publish, reject, or request changes. GitHub Pages availability is checked before the public catalog entry is written.

Unapproved uploads are not placed in the public GitHub repository. A browser game is hosted under the configured public Pages origin after approval. A download is a public, versioned GitHub Release asset; do not upload private material.

## Built-in games

`builtInGames` in `index.html` is the single built-in catalog array and is intentionally empty. Add an object only after the matching game files exist in the repository. Include real relative `cover`, `gameUrl`, and `downloadUrl` paths and only set a download URL for an existing file. Built-in entries are static content; the Firestore collection is the trusted catalog for creator submissions.

## Local checks and deployment

```powershell
cd functions
npm install
npm run lint
cd ..
firebase emulators:start --only functions,firestore,storage,hosting
```

Use a non-production Firebase project and a dedicated test GitHub repository for end-to-end upload and publishing tests. Before launch, verify App Check, authentication providers, rules, all provider secrets/models, GitHub permissions, Pages deployment, and administrator claims. Deploy using `firebase deploy` after review. A static GitHub Pages frontend can serve `index.html`, but GitHub Pages does not run Firebase backend code; deploy Functions, Auth, Firestore, and Storage separately through Firebase.

### Manual acceptance checklist

- Browse the empty catalog, then verify search, genre filters and Latest / Most Played / Featured sorting after publishing approved test content.
- Verify email/password, Google sign-in, sign-out and password reset using Firebase test users.
- Upload a valid root-index ZIP and cover. Verify a bad signature, oversized ZIP, traversal entry, duplicate path, oversized extracted archive, and missing root `index.html` fail; confirm the upload stays private.
- Configure both providers and confirm distinct Gemini/Groq reports are stored. Then disable one provider and verify the submission is not auto-approved and its error appears only in the admin report.
- With a non-admin account, call admin functions and verify permission denial. Verify a creator cannot publish their own submission.
- Approve a test submission as admin. Confirm Pages and a GitHub Release asset are available before the public catalog entry appears.
- Suspend a published game and verify it disappears from discovery. Restore it and verify it returns.
- Inspect browser devtools/network and deployed source for secrets; the only public Firebase/App Check values should be web configuration identifiers and the reCAPTCHA site key.
- Test at mobile and desktop widths and use keyboard controls for navigation, dialogs and player controls.

## Security and known operational constraints

- Browser configuration and App Check site keys are public. Firebase Security Rules and authenticated callable functions enforce trust; frontend state is never authorization.
- The functions use per-user Firestore rate limits, App Check, server-side input checks, private staging storage, and server-assigned admin claims. Firebase Authentication also applies its own abuse controls.
- AI requests include game metadata, heuristic findings, and limited text excerpts from submitted source files. Do not include secrets in a game. Provider outages, invalid model names, malformed responses, disagreements, or high-risk findings prevent automatic clearance. A human decision is mandatory regardless.
- Uploaded code is not executed during review. There is no malware scanner bundled in this project. Configure a separately maintained scanning service before accepting higher-risk or high-volume uploads.
- The implementation uses the Contents-compatible Git data/blob/tree APIs and limits each published file to 5 MB, avoiding the assumption that the GitHub Contents API supports arbitrary files. Large downloadable builds are GitHub Release assets; repository/Pages growth and GitHub bandwidth/rate limits remain operational costs to monitor.
- Publication is idempotent at the game/release-tag level and never makes the Firestore record public before asset availability checks. A failed commit or Pages rollout may leave unlisted files in the designated publishing repository; inspect and clean those using the operator's normal retention policy, never by overwriting another game's unique path.
- GitHub Pages is a static file host, not a backend. Pages may take time to deploy. This implementation waits up to 60 seconds for the game and cover; a timeout leaves the submission unpublished for an administrator retry.
- The player sandbox does not pass user identity, credentials, or tokens to game frames. There is no game-to-parent `postMessage` bridge.
- Review Firebase quotas, cost alerts, retention/deletion policy, domain ownership, GitHub release storage, and legal/content moderation requirements before production launch.

## Troubleshooting

- **Publishing shows setup required:** configure Firebase web values, App Check reCAPTCHA site key, deploy Functions, and ensure the browser's site domain is registered for App Check/Auth.
- **Callable requests fail with App Check errors:** register the correct production and preview domains, ensure App Check is initialized in the client, and deploy current functions.
- **Gemini/Groq review fails:** check secret versions, function logs, model names available to the account, quota, and provider status. Failed AI review never implies approval.
- **GitHub publishing fails:** check secret access, token repository scope, Contents/Releases permissions, repository branch, Pages origin, release limits, rate limits, and Pages deployment status.
- **Browser game is unavailable:** confirm a root `index.html`, relative paths, supported file types, <=5 MB individual files, Pages build source, correct origin/path configuration, and that the deployment has completed.
- **Firestore reports a missing index:** deploy the checked-in `firestore.indexes.json` or follow the Firebase error's index link and verify the created index matches this repository's query.
- **Admin panel is denied:** assign the custom claim with `set-admin`, sign out/in or refresh the ID token, and confirm the correct Firebase project and UID.
- **Cover rejected:** re-export a valid JPG, PNG or WebP file within 5 MB; the browser MIME label alone is not accepted.

## Support and content policy

Use the official [GitHub profile](https://github.com/ymisk019) to contact the project maintainer. Read [Privacy](docs/PRIVACY.md) and [Terms](docs/TERMS.md) before publishing.
