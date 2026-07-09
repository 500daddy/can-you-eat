# Security Policy

## Supported Versions

This project is in early development. Please report security issues against the
current default branch or the latest release candidate branch.

## Reporting a Vulnerability

If you find a vulnerability or accidentally discover exposed credentials,
please do not open a public issue with secrets in the body.

Instead, contact the repository owner privately through GitHub, or open a
minimal issue that says a private security report is needed.

## Secrets And Local Configuration

Do not commit real values for:

- WeChat Cloud environment IDs used by your own deployment.
- WeChat subscribe message template IDs.
- DashScope, Qwen, OpenAI, or other model API keys.
- `.env` files or `*.local.js` files.

Use the checked-in `*.example.js` files as templates, then create local files
that are ignored by git.
