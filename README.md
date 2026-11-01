<div align="center">

<img src="assets/icon.svg" width="75" alt="The Triflare Extend logo" style="padding-bottom: 20px;"/>

# Triflare Marketplace

Find extensions, and share yours.

</div>

## Overview

Triflare Marketplace is a registry of TurboWarp, PenguinMod, and MistWarp extensions built with [Triflare Extend](https://github.com/triflare/extend). The public instance is at [marketplace.sdisk.us](https://marketplace.sdisk.us).

You can download extensions, publish your own, embed a profile or an extension on another site, show badges, and manage organizations. An instance can add or remove drivers for authentication, email, and compiler services instead of editing a flat config for each one.

## Installation

You need Docker Engine with Compose v2.

```bash
docker compose up -d
```

This starts the API and the web UI. To run the API alone, remove the `ui` service from `docker-compose.yml`.

## Feedback and Contributing

Open an [issue](https://github.com/triflare/marketplace/issues) for a bug or feature request, or send a [pull request](https://github.com/triflare/marketplace/pulls) with your change.
