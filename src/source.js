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
    fieldMap = {},
    indexer,
    cf = crossfilter(),
    dimensions = {},
    fetch,
    timeout;

  function defaultIndexer(field) {
    return field in fieldMap ? fieldMap[field] : null;
  }

  // Add `on`, `off`, and `trigger` methods for handling events
  addEventHandling(source);

  // Add raw data to the crossfilter
  source.add = function(data) {
    var ready = !cf.size();

    // Filter the data and add it to the crossfilter
    cf.add(filterStack.reduce(function(data, filter) {
      return data.filter(filter);
    }, data));

    // Notify of initial data load
    if (ready) {
      source.trigger('ready');
    }

    // Notify of changes to the underlying data
    source.trigger('change');

    return source;
  };

  source.filter = function(filter) {
    filterStack.push(valueFor(source.indexer(), filter));
    return source;
  };

  // Get or set an object that maps field names to their indicies in the
  // raw row data
  source.fieldMap = function(fm) {
    if (!arguments.length) {
      return fieldMap;
    }

    if (!isObject(fm)) {
      throw new Error('Field map must be a plain object');
    }

    fieldMap = fm;
    return source;
  };

  // Get or set the indexing function that turns a field name into a row index
  source.indexer = function(i) {
    if (!arguments.length) {
      return indexer || defaultIndexer;
    }

    if (!isFunction(i)) {
      throw new Error('Indexer must be a function');
    }

    indexer = i;
    return source;
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
      // Create an indexing function if a field name was given (if it's already a
      // value function it will pass straight through)
      var dimension = cf.dimension(valueFor(source.indexer(), value)),
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
