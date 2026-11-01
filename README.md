<div align="center">

<img src="assets/icon.svg" width="75" alt="The Triflare Extend logo" style="padding-bottom: 20px;"/>

# Triflare Marketplace

Find extensions, and share yours.

</div>

## Table of Contents

<!-- START doctoc generated TOC please keep comment here to allow auto update -->
<!-- DON'T EDIT THIS SECTION, INSTEAD RE-RUN doctoc TO UPDATE -->

- [Highlights](#highlights)
- [Overview](#overview)
- [Usage](#usage)
- [Installation](#installation)
- [Feedback and Contributing](#feedback-and-contributing)

<!-- END doctoc generated TOC please keep comment here to allow auto update -->

## Highlights

- **Share your extensions:** WIth Triflare Marketplace, you can share your TurboWarp extensions that are built with [Triflare Extend](https://github.com/triflare/extend), a build tool for extensions.
- **Driver-powered system:** Instead of flat configs for non-modular services, you can add and remove drivers for things like authentication, email, and compiler services.

<!-- Finish this -->

## Overview

Triflare Marketplace is the official registry of TurboWarp, PenguinMod, and MistWarp extensions that were built with Triflare Extend.

You can download others' extensions, create and publish your own, embed your user profile and your extensions to other services, show badges for your extensions, manage your organizations, and gather with the community.

Public instance is at [marketplace.sdisk.us](https://marketplace.sdisk.us)

## Installation

**Requirements:**

- Any recent Docker version

You can use this repository's `docker-compose.yml` to deploy Triflare Marketplace to your own server. It deploys both the API and the web UI; if you want only the API, you can remove the web UI container from the compose file.

```bash
docker compose up -d
```

## Feedback and Contributing

If you've found a bug, or you want a new feature, please [open an issue](https://github.com/triflare/marketplace/issues). If you'd rather implement it yourself, make your changes and [open a pull request](https://github.com/triflare/marketplace/pulls).

Thank you for improving Triflare Extend! It's people like you who make open-source projects like these thrive.
