<img src="admin/uvr16xx-blnet.png" alt="Logo" style="width:20%;" />

# ioBroker.uvr16xx-blnet

[![NPM version](https://img.shields.io/npm/v/iobroker.uvr16xx-blnet.svg)](https://www.npmjs.com/package/iobroker.uvr16xx-blnet)
[![Downloads](https://img.shields.io/npm/dm/iobroker.uvr16xx-blnet.svg)](https://www.npmjs.com/package/iobroker.uvr16xx-blnet)
![Number of Installations](https://iobroker.live/badges/uvr16xx-blnet-installed.svg)
![Current version in stable repository](https://iobroker.live/badges/uvr16xx-blnet-stable.svg)

[![NPM](https://nodei.co/npm/iobroker.uvr16xx-blnet.png?downloads=true)](https://nodei.co/npm/iobroker.uvr16xx-blnet/)

**Tests:** ![Test and Release](https://github.com/weberk/ioBroker.uvr16xx-blnet/workflows/Test%20and%20Release/badge.svg)

## uvr16xx-blnet adapter for ioBroker

An ioBroker adapter for reading inputs and outputs of the UVR16xx controller from Technische Alternative using BL-NET.
![BL-NET](doc/BL-NET.png)
You can find the manual of this device here: https://www.ta.co.at/fileadmin/Downloads/Betriebsanleitungen/00_Auslauftypen/BL-NET/Manual_BL-Net_V2.19-2_EN.pdf

## Developer manual

This section is intended for the developer. It can be deleted later.

### DISCLAIMER

Please make sure that you consider copyrights and trademarks when you use names or logos of a company and add a disclaimer to your README.
You can check other adapters for examples or ask in the developer community. Using a name or logo of a company without permission may cause legal problems for you.

### Getting started

You are almost done, only a few steps left:

1. Create a new repository on GitHub with the name `ioBroker.uvr16xx-blnet`
1. Initialize the current folder as a new git repository:
    ```bash
    git init -b main
    git add .
    git commit -m "Initial commit"
    ```
1. Link your local repository with the one on GitHub:

    ```bash
    git remote add origin https://github.com/weberk/ioBroker.uvr16xx-blnet
    ```

1. Push all files to the GitHub repo:
    ```bash
    git push origin main
    ```
1. Add a new secret under https://github.com/weberk/ioBroker.uvr16xx_bl-net/settings/secrets. It must be named `AUTO_MERGE_TOKEN` and contain a personal access token with push access to the repository, e.g. yours. You can create a new token under https://github.com/settings/tokens.

1. Head over to [main.js](main.js) and start programming!

### Best Practices

We've collected some [best practices](https://github.com/ioBroker/ioBroker.repositories#development-and-coding-best-practices) regarding ioBroker development and coding in general. If you're new to ioBroker or Node.js, you should
check them out. If you're already experienced, you should also take a look at them - you might learn something new :)

### Scripts in `package.json`

Several npm scripts are predefined for your convenience. You can run them using `npm run <scriptname>`
| Script name | Description |
|-------------|-------------|
| `build` | Compile the React sources. |
| `watch` | Compile the React sources and watch for changes. |
| `test:js` | Executes the tests you defined in `*.test.js` files. |
| `test:package` | Ensures your `package.json` and `io-package.json` are valid. |
| `test:integration` | Tests the adapter startup with an actual instance of ioBroker. |
| `test` | Performs a minimal test run on package files and your tests. |
| `check` | Performs a type-check on your code (without compiling anything). |
| `lint` | Runs `ESLint` to check your code for formatting errors and potential bugs. |
| `translate` | Translates texts in your adapter to all required languages, see [`@iobroker/adapter-dev`](https://github.com/ioBroker/adapter-dev#manage-translations) for more details. |
| `release` | Creates a new release, see [`@alcalzone/release-script`](https://github.com/AlCalzone/release-script#usage) for more details. |

### Configuring the compilation

The adapter template uses [esbuild](https://esbuild.github.io/) to compile TypeScript and/or React code. You can configure many compilation settings
either in `tsconfig.json` or by changing options for the build tasks. These options are described in detail in the
[`@iobroker/adapter-dev` documentation](https://github.com/ioBroker/adapter-dev#compile-adapter-files).

### Writing tests

When done right, testing code is invaluable, because it gives you the
confidence to change your code while knowing exactly if and when
something breaks. A good read on the topic of test-driven development
is https://hackernoon.com/introduction-to-test-driven-development-tdd-61a13bc92d92.
Although writing tests before the code might seem strange at first, but it has very
clear upsides.

The template provides you with basic tests for the adapter startup and package files.
It is recommended that you add your own tests into the mix.

### Publishing the adapter

Using GitHub Actions, you can enable automatic releases on npm whenever you push a new git tag that matches the form
`v<major>.<minor>.<patch>`. We **strongly recommend** that you do. The necessary steps are described in `.github/workflows/test-and-release.yml`.

Since you installed the release script, you can create a new
release simply by calling:

```bash
npm run release
```

Additional command line options for the release script are explained in the
[release-script documentation](https://github.com/AlCalzone/release-script#command-line).

To get your adapter released in ioBroker, please refer to the documentation
of [ioBroker.repositories](https://github.com/ioBroker/ioBroker.repositories#requirements-for-adapter-to-get-added-to-the-latest-repository).

### Test the adapter manually with dev-server

Since you set up `dev-server`, you can use it to run, test and debug your adapter.

You may start `dev-server` by calling from your dev directory:

```bash
dev-server watch
```

The ioBroker.admin interface will then be available at http://localhost:8081/

Please refer to the [`dev-server` documentation](https://github.com/ioBroker/dev-server#command-line) for more details.

## Changelog

<!--
Placeholder for next version:  ### **WORK IN PROGRESS**
-->
### 1.0.15 (2024-11-24)

-   refactorings and improved code documentation

### 1.0.14 (2024-11-23)

-   added frame index to options

### 1.0.13 (2024-11-22)

-   improved CAN bus mode reading

### 1.0.12 (2024-11-22)

-   lint fixes

### 1.0.11 (2024-11-22)

-   improved CAN bus mode reading

### 1.0.10 (2024-11-21)

-   improved reading device info
-   fixed handling of negative temperatures

### 1.0.9 (2024-11-21)

-   improved logging and introduced a new socket for each command

### 1.0.8 (2024-11-21)

-   improving logging in order to analyse system using CAN bus
-   added retry for reading UVR HEADER in order to identify uvr_mode

### 1.0.7 (2024-11-19)

-   testing deployment via "npm run release"

### 1.0.6 (2024-11-19)

-   testing deployment via "npm run release"

### 1.0.5 (2024-11-17)

-   improve build and deploy using github workflow (workflow>test-and-release.yml, ioBroker Check and Service Bot)
-   added compliance with ioBrokers adapter repository (https://github.com/ioBroker/ioBroker.repositories?tab=readme-ov-file#how-to-publish-on-npm)

### 1.0.1 (2024-11-17)

-   improve build and deploy

### 1.0.0 (2024-11-17)

-   (Klaus Weber) initial release

### 0.0.1

-   initial working version

## License

MIT License

Copyright (c) 2024 Klaus Weber <klausatweberesprit@gmail.com>

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
