// Module export
if (typeof module !== 'undefined') {
  // CommonJS
  module.exports = analyst;
} else if (typeof define === 'function' && define.amd) {
  // AMD using a named module
  define('analyst', function() {
    return analyst;
  });
} else {
  // Normal global
  root['analyst'] = analyst;
}
