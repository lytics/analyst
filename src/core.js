/*jshint sub:true, boss:true*/
// 'Root' object, `window` in browsers, `global` in Node
var root = this,
  d3 = root.d3,
  crossfilter = root.crossfilter;

// Namespace object
var analyst = {
  version: '0.1.0'
};

// Internal list of available drivers
var drivers = {};

// Add a source adapter implementation
analyst.addDriver = function(name, driver) {
  if (analyst[name]) {
    throw new Error("Attempting to add a driver that already exists or is protected: '" + name + "'");
  }

  // Add driver to list
  drivers[name] = driver;

  // Add a shortcut method to the namespace object
  analyst[name] = function() {
    var args = [ name ].concat(slice(arguments));
    return analyst.source.apply(analyst, args);
  };

  return analyst;
};
