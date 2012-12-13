// Module export
if (typeof exports !== 'undefined') {
  // CommonJS
  exports.analyst = analyst;
} else if (typeof define === 'function' && define.amd) {
  // AMD using a named module
  define('analyst', function() {
    return analyst;
  });
} else {
  // Normal global
  root['analyst'] = analyst;
}
