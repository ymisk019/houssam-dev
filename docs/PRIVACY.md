# Privacy

Yazan dev is designed to collect only the information needed to provide accounts, game discovery, publishing, and moderation. The operator must configure Firebase and provider accounts before these services are active.

## Information handled

- Firebase Authentication processes account credentials and Google identity. Yazan dev does not store or receive account passwords.
- A user profile may contain the display name and profile image URL supplied by the sign-in provider or account holder.
- Authorization for administrator actions uses a server-verified Firebase custom claim.
- Game metadata, private submissions, moderation reports, user reports, review history, and audit records are stored in the configured private GitHub repository by the standalone publishing API.
- Submitted covers, optional screenshots, and game ZIP files are held in that private repository while awaiting review. The API verifies Firebase ID tokens and only allows a creator to upload to their own submission.
- If configured, bounded game-source excerpts and metadata are sent to Google Gemini and Groq for AI-assisted review limited to pornographic or sexually explicit content. Image content is not automatically inspected; human administrators make the final publication decision and should inspect images. Do not include passwords, API keys, private personal data, or other secrets in uploaded games.
- Approved games are served through the publishing API from the private repository. Although the source repository stays private, public browser games and approved downloads can be viewed or copied by players.

## Service providers and retention

Firebase Authentication, Google, Groq, GitHub, Google Cloud Run, and the configured hosting provider process data according to their own terms and privacy policies. Their availability and retention are controlled by the project operator. The application has no automated submission-retention or account-deletion job; operators must configure retention, deletion, and backup procedures before production.

Access to private submissions and privileged records is enforced by the standalone API using verified Firebase Authentication tokens and server-side administrator claims. Operational logs may include submission IDs and safe provider/hosting error summaries. API keys and authentication tokens must never be included in game files, descriptions, moderation excerpts, or client-visible logs.

## Choices and requests

You can choose not to create an account or submit a game. Publicly served game files may be copied and cannot be made private by removing a listing alone; contact the project maintainer through the official [GitHub profile](https://github.com/ymisk019) for data questions or a removal request. The operator must verify identity and apply applicable legal requirements.

This page is a project template, not legal advice. The operator must update it to identify the operating entity, jurisdiction, contact address, retention periods, and any additional analytics or integrations before public launch.
