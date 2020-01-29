module.exports = {
    norpc: true,
    copyPackages: ['@monesign/os', '@monesign/apps-shared-minime', '@monesign/test-helpers', '@monesign/apps-vault'],
    skipFiles: [
        'test',
        'examples',
        '@monesign/os',
        '@monesign/apps-vault',
        '@monesign/test-helpers',
        '@monesign/apps-shared-minime',
    ],
    // Turn on deep skip to avoid preprocessing (e.g. removing view/pure modifiers) for skipped files
    deepSkip: true
}
