/*jshint sub:true, boss:true*/
// Source

// Returns an object that represents a source of data
analyst.source = function(type) {
  // Check that the driver is installed
  if (!drivers[type]) {
    throw new Error("Source type '" + type + "' unknown");
  }

  var source = {},
    filterStack = [],
    sanitizer,
    fieldMap = {},
    cf = crossfilter(),
    dimensions = {},
    fetch,
    timeout;

  // Add `on`, `off`, and `trigger` methods for handling events
  addEventHandling(source);

  // Add raw data to the crossfilter
  source.add = function(data) {
    if (!isArray(data)) {
      throw new Error('Input data must be an array');
    }

    var ready = !cf.size(),
      clean;

    // Apply the sanitizer function before adding the data
    if (sanitizer) {
      data = data.reduce(function(cleansed, d) {
        if (clean = sanitizer.call(source, d)) {
          cleansed.push(clean);
        }
        return cleansed;
      }, []);
    }

    // Add the data to the crossfilter
    cf.add(data);

    // Notify of initial data load
    if (ready) {
      source.trigger('ready');
    }

    // Notify of changes to the underlying data
    source.trigger('change');

    return source;
  };

  // Get or set a function that sanitizes/rejects data as it's added to the source
  source.sanitizer = function(func) {
    if (!arguments.length) {
      return sanitizer;
    }

    if (!isFunction(func)) {
      throw new Error('Sanitizer must be a function');
    }

    sanitizer = func;
    return source;
  };

  // Get or set an object that maps field names to their indicies in the
  // raw row data
  source.fieldMap = function(map) {
    if (!arguments.length) {
      return fieldMap;
    }

    if (!isObject(map)) {
      throw new Error('Field map must be a plain object');
    }

    fieldMap = map;
    return source;
  };

  // Gets the index for a field given the current field mapping
  source.indexFor = function(field) {
    return field in fieldMap ? fieldMap[field] : null;
  };

  // Fetch data asynchronously
  source.fetch = function() {
    // This is the method returned by the driver; it is expected to call
    // `souce.add()` in order to add data once it's been fetched
    if (isFunction(fetch)) {
      fetch();
    }

    return source;
  };

  source.start = function(interval) {
    source.stop();

    // TODO: add logic for fetching only new records
    timeout = root.setTimeout(function send() {
      source.fetch(function() {
        root.setTimeout(send, interval);
      });
    }, interval);

    return source;
  };

  source.stop = function() {
    if (timeout) {
      timeout = root.clearTimeout(timeout);
    }

    return source;
  };

  // Creates a new metric using the current source
  source.metric = function() {
    return analyst.metric(source);
  };

  // Gets the underlying crossfilter (does not currently support setting)
  source.crossfilter = function() {
    return cf;
  };

  // Gets the dimension associated with the value function/field
  source.dimension = function(value) {
    // Dimensions are expensive, so reuse them when possible
    if (!dimensions[value]) {
      // Create an indexing function if a field name was given
      var valueFunc = makeIndexer(value, source),
        dimension = cf.dimension(valueFunc),
        filter = dimension.filter;

      // Wrap the filter method so that other metrics can be notified of
      // potential changes (also save value of the current filter)
      dimension.filter = function(value) {
        filter.call(dimension, value);
        dimension._value = value;
        source.trigger('filter', dimension, value);
        return dimension;
      };

      // All dimensions start out unfiltered
      dimension._value = null;

      dimensions[value] = dimension;
    }

    return dimensions[value];
  };

  // Call the driver function, and store the function it returns locally
  fetch = drivers[type].apply(source, slice(arguments, 1));

  return source;
};
