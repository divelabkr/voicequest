// watchman 데몬이 Documents 폴더 접근 권한(macOS TCC)이 없어 node crawler로 대체.
const { getDefaultConfig } = require("expo/metro-config");
const config = getDefaultConfig(__dirname);
config.resolver.useWatchman = false;
module.exports = config;
