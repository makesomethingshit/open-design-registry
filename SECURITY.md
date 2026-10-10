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
