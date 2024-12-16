// ioBroker eslint template configuration file for js and ts files
// Please note that esm or react based modules need additional modules loaded.
import config from "@iobroker/eslint-config";

export default [
    ...config,

    {
        // specify files to exclude from linting here
        ignores: [".dev-server/", ".vscode/", "*.test.js", "test/**/*.js", "*.config.mjs", "build/", "admin/build/", "admin/words.js", "admin/admin.d.ts", "**/adapter-config.d.ts", "node_modules/", "doc/", "package-lock.json", "package.json", "tsconfig.json", "tsconfig.check.json", ".DS_Store", ".create-adapter.json", ".github/", ".gitignore", ".prettierrc", ".releaseconfig.json", "LICENSE", "README.md", "admin/.watch/", "admin/i18n/", "admin/jsonConfig.json", "admin/kbs.png", "admin/ta-blnet.png", "admin/tsconfig.json", "custom-eslint-formatter.js", "io-package.json", "lib/adapter-config.d.ts", "main.test.js", "test/"],
    },
    {
        // you may disable some 'jsdoc' warnings - but using jsdoc is highly recommended
        // as this improves maintainability. jsdoc warnings will not block build process.
        rules: {
            // 'jsdoc/require-jsdoc': 'off',
            "prettier/prettier": [
                "error",
                {
                    singleQuote: false,
                    quoteProps: "consistent",
                },
            ],
            "quote-props": ["error", "consistent"],
            "jsdoc/no-types": "off",
            "jsdoc/no-defaults": "off",
            "no-template-curly-in-string": "error",
            "prefer-template": "off",
        },
    },
];
