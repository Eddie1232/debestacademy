# Security Policy

## Supported versions

The project is maintained with the latest `main` branch as the active development branch. Security fixes are applied to the current branch and tested before release.

| Version | Supported |
| --- | --- |
| `main` | Yes |
| older release branches | Only if still maintained |
| archived or experimental branches | No |

## Reporting a vulnerability

Please do not disclose security issues publicly in GitHub issues, pull requests, or comments. If you discover a vulnerability, report it privately using one of the following methods:

- Email the project maintainer directly using the contact listed in the repository owner profile or package metadata.
- Open a private security report through GitHub if available for this repository.
- Use a private channel approved by the project owner and include a clear reproduction or proof of concept.

Include the following in your report:

- A summary of the issue
- Steps to reproduce it
- The affected version or branch
- The impact or risk level
- Your preferred contact details for follow-up

Do not include secrets, tokens, private keys, passwords, logs, or screenshots containing sensitive data in public channels.

We will acknowledge receipt within 72 hours, confirm triage, and provide a remediation timeline when available.

## Security expectations

- Keep all secrets in environment variables or a secrets manager.
- Never commit `.env`, `.env.*`, private keys, or credential files.
- Use strong credentials and rotate them regularly.
- Validate and sanitize all user input server-side.
- Use secure headers and limited CORS settings in production.
- Keep dependencies updated and run `npm audit` regularly.
- Do not expose demo or default credentials in public-facing pages or docs.
- Restrict administrative functionality to trusted users and approved support channels.

## Local security checks

Before deployment or release, run:

- `npm audit`
- `npm test` (if the project has automated tests)
- a review of any newly added environment variables and secrets
- a check that no demo credentials are present in code, docs, or public pages

If a vulnerability is confirmed, the maintainer will coordinate a fix and a safe disclosure plan.
