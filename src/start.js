// Universal Module Definition
// see https://github.com/umdjs/umd/blob/master/returnExports.js
(function(root, factory) {
  if (typeof exports === 'object') {
    module.exports = factory(require('crossfilter'), require('d3'));
  } else if (typeof define === 'function' && define.amd) {
    define(['crossfilter', 'd3'], factory);
  } else {
    root.analyst = factory(root.crossfilter, root.d3);
  }
})(this, function(crossfilter, d3) {
