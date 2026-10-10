# Security

## Reporting a vulnerability

Do not publish credentials, private project data, exploit instructions, or an
unpatched vulnerability in a public issue or pull request.

Use GitHub's **Security → Advisories → Report a vulnerability** for this
repository when private vulnerability reporting is available. If the button is
unavailable, ask the maintainer to enable private reporting without including
vulnerability details in the public request.

Include the affected commit, reproduction steps using synthetic data, expected
and actual behavior, and the impact. Remove tokens, account details, production
URLs containing credentials, and other people's private assets from examples.
Coordinate publication of details with the maintainer after a fix is available.

## Supported code

Security fixes target the current `main` branch. No support commitment is made
for older commits or independently deployed forks. Repository checks do not
establish the security or deployment status of a running service.

## Local and deployment configuration

The credentials in `.env.example` and CI are disposable local test defaults.
Use separate credentials and a randomly generated authentication secret for any
deployment. Keep S3 buckets private and use the application's asset proxy.
Never commit `.env` files, database exports, authentication state, or production
test traces.

## Repository exposure checks

CI scans fetched Git history for committed credentials with a fixed, checksum-verified
Gitleaks release. This does not detect every secret or replace manual review of
personal data, screenshots, issue comments, logs, and attachments before publication.
Keep browser traces and authentication state out of public artifacts.
The npm E2E command redacts Cookie, Set-Cookie, Authorization and Proxy-Authorization
header values from runner output, including failed Playwright API-request call logs.
This does not sanitize arbitrary personal data or local trace/report files.
If a real credential is exposed, revoke or rotate it first; deleting the latest file alone
does not remove previous commits or copies. Report its location privately without
copying the credential into an issue, log, screenshot, or pull request.
