module.exports = {
    norpc: true,
    copyPackages: [
        '@monesign/os',
        '@monesign/apps-finance',
        '@monesign/apps-vault',
        '@monesign/ppf-contracts',
        '@monesign/test-helpers'
    ],
    skipFiles: [
        'test',
        'examples',
        '@monesign/os',
        '@monesign/apps-vault',
        '@monesign/apps-finance',
        '@monesign/ppf-contracts',
        '@monesign/test-helpers',
    ],
    // Turn on deep skip to avoid preprocessing (e.g. removing view/pure modifiers) for skipped files
    deepSkip: true
}
