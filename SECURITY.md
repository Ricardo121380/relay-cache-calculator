# Security Policy

## Reporting a vulnerability

Please do not publish API keys, tokens, cookies, private endpoints, or proof-of-concept details in a public issue.

Use GitHub's **Report a vulnerability** / private security advisory flow for this repository. Include the affected version, reproduction steps, impact, and the smallest safe proof of concept. If private vulnerability reporting is unavailable, open a public issue containing no sensitive details and ask the maintainer to establish a private channel.

## Scope

Security reports are especially useful for:

- API Key leakage or persistence;
- requests carrying credentials to the wrong origin;
- SSRF, redirect, DNS, or private-network bypasses in the Pages Function;
- cross-site scripting or unsafe HTML rendering;
- bypasses of response-size, timeout, or fixed-endpoint restrictions.

Do not test against third-party relay services without their permission. Use a local mock server or an endpoint you control.
