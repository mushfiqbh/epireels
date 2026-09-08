// Metro bundler config. Kept minimal — extend when you add custom
// transformers or asset extensions.
const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

module.exports = config;
