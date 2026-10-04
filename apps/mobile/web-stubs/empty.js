// Web-export stub (screenshots only): native-only modules are replaced by an inert module. Never used by iOS/Android builds.
const noop = () => {};
module.exports = new Proxy({ __esModule: true, default: noop }, { get: (t, k) => (k in t ? t[k] : noop) });
