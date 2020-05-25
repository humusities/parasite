var commonjsGlobal = typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : typeof global !== 'undefined' ? global : typeof self !== 'undefined' ? self : {};
var key = '__global_unique_id__';

var gud = function gud() {
  return commonjsGlobal[key] = (commonjsGlobal[key] || 0) + 1;
};

export default gud;