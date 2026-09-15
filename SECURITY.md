# Security Policy

## Supported Versions

Security fixes are generally applied to the latest published version of Max Headroom.

Older versions may not receive security updates.

## Reporting a Security Issue

Please do not publicly disclose a suspected security vulnerability before it can be reviewed.

If you believe you have found a security issue involving Max Headroom, the Chromium companion extension, Discord StreamKit integration, or Foundry VTT communication, please report it privately to the project maintainer through GitHub.

When reporting an issue, please include:

* A clear description of the problem.
* The affected version.
* Steps to reproduce it.
* Any relevant browser, Foundry VTT, or Discord details.
* Logs or screenshots if they help explain the issue.

Please avoid including passwords, authentication tokens, private Discord information, or other sensitive data.

## Scope

Security reports are especially useful for issues involving:

* Companion extension permissions or pairing.
* Unexpected access to Foundry pages.
* Discord StreamKit message handling.
* Cross-window or cross-origin behavior.
* Validation of browser extension messages.
* Foundry module socket communication.
* Exposure of Discord user information beyond what is required for the feature.

## Third-Party Services

Max Headroom depends on external platforms including Foundry VTT, Discord StreamKit, and Chromium-based browsers.

Security issues that originate entirely within those platforms should generally be reported to the appropriate vendor.

## Disclosure

After a valid issue is reviewed and fixed, a public advisory or release note may be published when appropriate.
