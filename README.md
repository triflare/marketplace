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

## Releases

Development happens on `alpha`, and pull requests target it. Pushes to `alpha`, `beta`, and `latest` run [semantic-release](https://github.com/semantic-release/semantic-release), which picks the next version from the conventional commit messages and updates `CHANGELOG.md`, both apps' `package.json` files, and both `product.yml` files. Do not bump versions or push tags by hand.

| Branch   | Publishes                            | Docker tags               |
| -------- | ------------------------------------ | ------------------------- |
| `latest` | Stable releases                      | `1.2.3`, `1.2`, `latest`  |
| `beta`   | Pre-releases such as `1.3.0-beta.1`  | `1.3.0-beta.1`            |
| `alpha`  | Pre-releases such as `1.3.0-alpha.1` | `1.3.0-alpha.1`           |

## Feedback and Contributing

Open an [issue](https://github.com/triflare/marketplace/issues) for a bug or feature request, or send a [pull request](https://github.com/triflare/marketplace/pulls) with your change.
