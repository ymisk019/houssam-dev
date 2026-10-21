# Privacy

Yazan dev is designed to collect only the information needed to provide accounts, game discovery, publishing, and moderation. The operator must configure Firebase and provider accounts before these services are active.

## Information handled

- Firebase Authentication processes account credentials and Google identity. Yazan dev does not store or receive account passwords.
- A user profile may contain the display name and profile image URL supplied by the sign-in provider or account holder.
- The platform stores game metadata, private submission records, moderation reports, favorites, reports, review history, and publication records in Firestore.
- Submitted covers, optional screenshots, and game ZIP files are held in Firebase Storage quarantine while awaiting review. Firebase Storage paths are owner-scoped; administrator functions use privileged server credentials.
- Upload source excerpts and metadata are sent from the backend to the configured Google Gemini and Groq APIs for independent AI-assisted analysis. Do not include passwords, API keys, private personal data, or other secrets in uploaded games.
- Approved games, covers, and release archives are copied to the configured public GitHub repository and GitHub Pages / Releases destination. Those published files are public and may be copied or downloaded by anyone.
- Signed-in play events may increment a per-game play counter. Yazan dev does not display fabricated counts.

## Service providers and retention

Firebase, Google, Groq, GitHub, and the configured hosting provider process data according to their own terms and privacy policies. Their availability and retention are controlled by the project operator. The application has no automated quarantine-retention or account-deletion job; operators must configure retention, deletion, and backup procedures before production.

Access to private submissions and privileged records is limited by Firebase Security Rules and server-side administrator claims. Operational logs may include submission IDs and safe provider/hosting error summaries. API keys and authentication tokens must never be included in game files, descriptions, moderation excerpts, or client-visible logs.

## Choices and requests

You can choose not to create an account or submit a game. Published game files are public and cannot be made private by removing a listing alone; contact the project maintainer through the official [GitHub profile](https://github.com/ymisk019) for data questions or a removal request. The operator must verify identity and apply applicable legal requirements.

This page is a project template, not legal advice. The operator must update it to identify the operating entity, jurisdiction, contact address, retention periods, and any additional analytics or integrations before public launch.
