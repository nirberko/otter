# [1.4.0](https://github.com/nirberko/otter/compare/v1.3.2...v1.4.0) (2026-07-17)


### Features

* classify catalog entries as official/unofficial/unknown ([#4](https://github.com/nirberko/otter/issues/4)) ([f8df462](https://github.com/nirberko/otter/commit/f8df4624b4e9206ca0ac8e7bb3952b7696dd7795))

## [1.3.2](https://github.com/nirberko/otter/compare/v1.3.1...v1.3.2) (2026-07-17)


### Bug Fixes

* skip result files that parse but lack scan-report shape ([1b82b79](https://github.com/nirberko/otter/commit/1b82b79d0867f847c4c181e6f41699c755bf36f6))

## [1.3.1](https://github.com/nirberko/otter/compare/v1.3.0...v1.3.1) (2026-07-17)


### Bug Fixes

* tolerate corrupt result files in scan-batch and build-site ([#3](https://github.com/nirberko/otter/issues/3)) ([f52ad0b](https://github.com/nirberko/otter/commit/f52ad0b8143248fbce27cb7ace56f348b545ca47))

# [1.3.0](https://github.com/nirberko/otter/compare/v1.2.1...v1.3.0) (2026-07-16)


### Features

* classify catalog entries as official/unofficial/unknown ([#2](https://github.com/nirberko/otter/issues/2)) ([bf9eaa7](https://github.com/nirberko/otter/commit/bf9eaa72ba6005f24faa41ae2efa159e7652ee87))

## [1.2.1](https://github.com/nirberko/otter/compare/v1.2.0...v1.2.1) (2026-07-16)


### Bug Fixes

* dedupe slug-colliding server ids to stop torn result files ([0b19204](https://github.com/nirberko/otter/commit/0b1920423e3bad61db86d731d6420e37ba7e45d6))

# [1.2.0](https://github.com/nirberko/otter/compare/v1.1.0...v1.2.0) (2026-07-16)


### Features

* implement framework evaluation and add corresponding tests ([52c2238](https://github.com/nirberko/otter/commit/52c2238e16e668f3213d7820ea563ae528229a0f))

# [1.1.0](https://github.com/nirberko/mcpscan/compare/v1.0.0...v1.1.0) (2026-07-16)


### Features

* add detection rules, tests, and samples for malicious tool poisoning, rug pull, and toxic flow scenarios ([183efd9](https://github.com/nirberko/mcpscan/commit/183efd9b3d25ac8bb51f492be78f55e4dd414498))

# 1.0.0 (2026-07-16)


### Features

* add --version/-v flag printing scanner version and checks fingerprint ([f932f9d](https://github.com/nirberko/mcpscan/commit/f932f9dc51622f55a2b258ace5a324573eecacad))
* batch scanner, static catalog site, and scan-publish workflow ([bc2cdf9](https://github.com/nirberko/mcpscan/commit/bc2cdf9b52da259b4cef74bbd5cd63c8302c2ab1))
* CI workflow + registry discovery ([412cc9c](https://github.com/nirberko/mcpscan/commit/412cc9ccbffb66dae98a007d62af0d32e88c0bc0))
* incremental + sharded full-rescan pipeline for full-registry coverage ([07c9851](https://github.com/nirberko/mcpscan/commit/07c98513b9ca2c2d87e7191151a416c4d2fd7246))
* mcpscan — MCP server security scanner (POC) ([9e90e5d](https://github.com/nirberko/mcpscan/commit/9e90e5dea6a522d9b4998fdbe229e69f494f1c26))
* release-driven versioning via semantic-release + auto checks-hash ([c5fe4e7](https://github.com/nirberko/mcpscan/commit/c5fe4e77af862180185d091b72d52382151955b7))
* scanner versioning + staleness labeling on the catalog ([0f81c9c](https://github.com/nirberko/mcpscan/commit/0f81c9c9e7a5c6f4ede7882771de9a10254b66aa))
