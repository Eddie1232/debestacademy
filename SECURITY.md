# Security Policy

## Supported Versions

Use this section to tell people about which versions of your project are
currently being supported with security updates.

| Version | Supported          |
| ------- | ------------------ |
| 5.1.x   | :white_check_mark: |
| 5.0.x   | :x:                |
| 4.0.x   | :white_check_mark: |
| < 4.0   | :x:                |

## Reporting a Vulnerability

Use this section to tell people how to report a vulnerability.

Tell them where to go, how often they can expect to get an update on a
reported vulnerability, what to expect if the vulnerability is accepted or
declined, etc.

## Supported Versions

The DeBest Academy website is a small project maintained locally. Security
fixes and maintenance are targeted at the `main` branch and the current
stable release. Use the following guidance for supported versions:

| Version | Supported          |
| ------- | ------------------ |
| main (development) | :white_check_mark: |
| 1.x (initial public release) | :white_check_mark: |
| < 1.0   | :x:                |


## How to Report a Vulnerability

If you discover a security vulnerability in this project, please report it
privately so it can be fixed before public disclosure. Provide:

- A short summary of the issue
- Steps to reproduce (commands, sample requests, or minimal repro) or a
	proof-of-concept
- The affected version(s)
- Your contact details for follow-up

Send reports by opening an email to the project maintainer listed in
`package.json` (if present) or by filing an issue titled "PRIVATE: Security"
in the repository and marking it with that keyword so maintainers can triage
privately. The maintainer will acknowledge receipt within 72 hours and
provide an estimated timeline for a fix.

If you need to share sensitive details (PoC exploit, logs, tokens), prefer
encrypted email or a private issue with an attached encrypted file.


## Security Best Practices (Express, JWT, bcrypt, and general setup)

These recommendations are tailored to the tech used in this project:

- Secrets and configuration:
	- Keep all secrets (JWT secret, bcrypt salt rounds config) out of source
		control. Use environment variables or a secrets manager.
	- Never commit `.env` files. Add them to `.gitignore`.

- Authentication and tokens:
	- Use `bcrypt` (or `bcryptjs`) with a reasonable cost factor (e.g. 10-12)
		for hashing passwords.
	- Sign JWTs with a long, random secret and set appropriate expiry times
		(e.g. short-lived access tokens + optional refresh tokens).
	- Validate tokens on every protected API endpoint and handle expired or
		malformed tokens with 401 responses.

- Server configuration and headers:
	- Use `helmet` middleware to set safe HTTP headers.
	- Enable CORS only for trusted origins and avoid wildcard `*` in production.
	- Rate-limit login and other sensitive endpoints to mitigate brute-force
		attacks.

- Input validation and output encoding:
	- Validate and sanitize all user input server-side before use or storage.
	- Escape or encode content rendered into HTML pages to prevent XSS.

- Data storage and backups:
	- If using `lowdb` (file-based JSON storage), ensure the storage path has
		correct file permissions and is not world-readable on multi-user hosts.
	- Regularly back up data files and rotate backups securely.

- Logging and error handling:
	- Do not log sensitive data (passwords, full tokens, PII).
	- Return generic error messages to clients; log detailed errors server-side
		for debugging with restricted access.

- Dependencies and updates:
	- Run `npm audit` regularly and update dependencies when security
		advisories are published.
	- Pin known-good versions in `package.json` and test upgrades locally.

- Local development guidance:
	- When developing locally, use separate credentials and do not reuse
		production secrets.
	- Provide a `README.md` entry with `npm audit` and how to test the app
		locally.

If you'd like, I can open a PR that applies these changes and additionally
add a short checklist to the project's `README.md` describing how to run
`npm audit` and rotate secrets.
