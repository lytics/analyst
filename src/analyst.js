// 'Root' object, `window` in browsers, `global` in Node
var root = this,
  d3 = root.d3,
  crossfilter = root.crossfilter;

// Namespace object
var analyst = {
  version: '0.1.0'
};

/*jshint sub:true, boss:true*/
(function() {
  'use strict';

  // Internal list of available drivers
  var drivers = {};

  // Add a source adapter implementation
  analyst.addDriver = function(name, driver) {
    var constructor = driver.hasOwnProperty('constructor') ? driver.constructor : Driver;

    // Default driver constructor, just saves options
    function Driver(options) {
      this.options = options;
    }

    constructor.prototype = driver;

    drivers[name] = constructor;
  };

  // Object that represents a source of data that 'metrics' can be drawn from
  analyst.source = function(type, options) {
    // Check that the driver is installed
    if (!drivers[type]) {
      throw new Error("Source type '" + type + "' unknown");
    }

    var source = {},
      filterStack = [],
      cf = crossfilter(),
      dimensions = {},
      // TODO: bind all functions in the driver instance to use the source as their context
      driver = new drivers[type](options),
      indexFor = driver.indexFor.bind(driver),
      dispatch = d3.dispatch('ready', 'change', 'filter'),
      metricId = 1,
      timeout;

    // Dimensions are expensive, so reuse them when possible
    function getDimension(value) {
      if (!dimensions[value]) {
        // Create an indexing function if a field name was given (if it's already a
        // value function it will pass straight through)
        var dimension = cf.dimension(valueFor(indexFor, value)),
          filter = dimension.filter;

        // Wrap the filter method so that other metrics can be notified of
        // potential changes (also save value of the current filter)
        dimension.filter = function(value) {
          filter.call(dimension, value);
          dimension._value = value;
          dispatch.filter.call(dimension);
          return dimension;
        };

        // All dimensions start out unfiltered
        dimension._value = null;

        dimensions[value] = dimension;
      }

      return dimensions[value];
    }

    source.on = function(event, listener) {
      dispatch.on(event, listener);

      return source;
    };

    source.filter = function(filter) {
      filterStack.push(valueFor(indexFor, filter));
      return source;
    };

    source.fetch = function(callback) {
      driver.fetch(function(data) {
        var ready = !cf.size();

        // Filter the data and add it to the crossfilter
        cf.add(filterStack.reduce(function(data, filter) {
          return data.filter(filter);
        }, data));

        // Notify of initial data load
        if (ready) {
          dispatch.ready.call(source);
        }

        // Notify of changes to the underlying data
        dispatch.change.call(source);

        if (callback) {
          callback.call(source);
        }
      });

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

    // Object encapsualting a single value that is the end result of a set of
    // manipulations like reducing or shaping
    source.metric = function() {
      var metric = {},
        dimension,
        group,
        outputFields = {},
        reduceStack = [],
        transformStack = [ applyAliases ],
        dateValue = valueFor(indexFor, '_date'),
        applyAdd = applyReduce('add'),
        applyRemove = applyReduce('remove'),
        applyInitial = applyReduce('initial'),
        dispatch = d3.dispatch('ready', 'change');

      // Create a new output object that contains only the fields specified
      // by the reduce functions applied
      function applyAliases(output) {
        var fields = keys(outputFields);
        return fields.length ? fields.reduce(function(data, field) {
          data[outputFields[field]] = output[field];
          return data;
        }, {}) : output;
      }

      // Apply all post-reduce transform functions
      function applyTransforms(initial) {
        var fields = keys(outputFields),
          output = transformStack.reduce(function(v, transform) {
            return transform(v);
          }, initial);

        // Default behavior is to return the raw value if a single reduce
        // function was appied, otherwise return the full output object
        return fields.length === 1 ? output[fields[0]] : output;
      }

      // Returns a function that applies all reduce functions of the given
      // type (add, remove, initial)
      function applyReduce(type) {
        return function(result, d) {
          // Apply the set of reduce functions by modifying its value in the
          // result object (as specified by its particular field)
          return reduceStack.reduce(function(data, reduction) {
            data[reduction.field] = reduction[type](data[reduction.field], d);
            return data;
          }, result || {});
        };
      }

      metric.on = function(event, listener) {
        dispatch.on(event, listener);
        return metric;
      };

      // Specify how to segment data, results in creating a crossfilter dimension
      metric.by = function(field) {
        if (dimension) {
          throw new Error('A metric can only be dimensioned once');
        }

        dimension = getDimension(field);
        return metric;
      };

      [ 'hour', 'day', 'week', 'month' ].forEach(function(interval) {
        var methodName = 'by' + capitalize(interval);

        metric[methodName] = function() {
          return metric.by(function(d) {
            return d3.time[interval](dateValue(d));
          });
        };
      });

      metric.byDate = function(value) {
        return metric.by(function(d) {
          return value ? value(dateValue(d)) : dateValue(d);
        });
      };

      metric.byDateFormat = function(formatStr) {
        var format = d3.time.format(formatStr);
        return metric.by(function(d) {
          return format(dateValue(d));
        });
      };

      metric.byDayOfWeek = function(string, abbr) {
        string = string === undefined || string;
        return string ? metric.byDateFormat(abbr ? '%a' : '%A') : function(d) {
          return dateValue(d).getDay();
        };
      };

      metric.byHourOfDay = function() {
        return metric.by(function(d) {
          return dateValue(d).getHours();
        });
      };

      // Apply a set of reduction functions for adding and removing data
      metric.reduce = function(reduceAdd, reduceRemove, initialValue, outputField) {
        outputField = outputField || 'output';

        // Don't add reduction if it's duplicating an existing one
        if (!(outputField in applyInitial())) {
          reduceStack.push({
            add: reduceAdd,
            remove: reduceRemove,
            initial: initialValue,
            field: outputField
          });
        }

        return metric;
      };

      // Returns a function that uses the given function and output field suffix
      // to add reduce functions
      function addReduce(reduce, suffix) {
        // The second argument is optionally an alias to give the value in the
        // result object, and the rest of the arguments are treated as transforms
        return function(field) {
          var transforms = slice(arguments, 1),
            outputField = fieldName(field, suffix),
            alias = isFunction(transforms[0]) ? outputField : transforms.shift() || outputField;

          // Keep track of the output field for aliasing later
          outputFields[outputField] = alias;

          // Wrap transform functions such that they apply to the correct
          // aliased field, before flattening
          transforms.forEach(function(transform) {
            transformStack.push(function(d) {
              d[alias] = transform(d[alias]);
              return d;
            });
          });

          return reduce(field, outputField);
        };
      }

      // Count all rows
      metric.count = addReduce(countReduce);

      function countReduce() {
        return metric.reduce(
          function (count) {
            return count + 1;
          },
          function (count) {
            return count - 1;
          },
          zero,
          'count'
        );
      }

      // Sum the given field
      metric.sum = addReduce(sumReduce, 'total');

      function sumReduce(field, outputField) {
        var value = valueFor(indexFor, field);

        return metric.reduce(
          function(sum, d) {
            return sum + value(d);
          },
          function(sum, d) {
            return sum - value(d);
          },
          zero,
          outputField
        );
      }

      // average the given field
      metric.average = addReduce(averageReduce, 'average');

      function averageReduce(field, outputField) {
        var totalField = fieldName(field, 'total');

        if (!(outputField in applyInitial())) {
          countReduce();
          sumReduce(field, totalField);

          // Perform the average at the end, since it can be computed from
          // intermediate calculations (but before aliases are applied)
          transformStack.unshift(function(d) {
            d[outputField] = d.count? d[totalField] / d.count : 0;
            return d;
          });
        }

        return metric;
      }

      // Find distinct values for the field
      metric.distinct = addReduce(distinctReduce, 'distincts');

      function distinctReduce(field, outputField) {
        var value = valueFor(indexFor, field);

        return metric.reduce(
          function(distinct, d) {
            var v = value(d);
            if (v in distinct) {
              distinct[v]++;
            } else {
              distinct[v] = 1;
            }
            return distinct;
          },
          function(distinct, d) {
            var v = value(d);
            if (v in distinct) {
              distinct[v]--;
              if (!distinct[v]) {
                delete distinct[v];
              }
            }
            return distinct;
          },
          object,
          outputField
        );
      }

      // Find count of distinct values for the field
      metric.distinctCount = addReduce(distinctCountReduce, 'distinct_total');

      function distinctCountReduce(field, outputField) {
        var value = valueFor(indexFor, field),
          distinctsField = fieldName(field, 'distincts');

        if (!(outputField in applyInitial())) {
          distinctReduce(field, distinctsField);

          // The count of distincts relies on actually calculating the distincts,
          // which can be done afterwards (but before aliases are applied)
          transformStack.unshift(function(d) {
            d[outputField] = keys(d[distinctsField]).length;
            return d;
          });
        }

        return metric;
      }

      // Get the underlying crossfilter dimension
      metric.dimension = function() {
        return dimension;
      };

      // Filter the underlying dimension
      metric.filter = function(value) {
        if (!dimension) {
          throw new Error('A metric can only be filtered after being dimensioned');
        }

        return value === undefined ? dimension._value : dimension.filter.call(dimension, value);
      };

      // Get the underlying crossfilter group
      metric.group = function() {
        if (!group) {
          group = dimension ? dimension.group() : cf.groupAll();

          if (reduceStack.length) {
            group.reduce(applyAdd, applyRemove, applyInitial);
          }

          // Create a wrapper around the group that applies all transforms
          if (group.all) {
            var all = group.all;
            group.all = function() {
              return all.call(group).map(function(result) {
                return {
                  key: result.key,
                  value: applyTransforms(result.value)
                };
              });
            };
          } else {
            var value = group.value;
            group.value = function() {
              return applyTransforms(value.call(group));
            };
          }
        }

        return group;
      };

      // Get the calculated result of the metric
      metric.value = function() {
        var group = metric.group();
        return group[group.value ? 'value' : 'all']();
      };

      // Get the full domain of the dimension
      metric.domain = function() {
        if (!dimension) {
          return null;
        }

        return metric.group().all().map(valueAt('key'));
      };

      // Extract a single value from the result, or each result
      metric.extract = function(field) {
        transformStack.push(valueAt(field));
        return metric;
      };

      // Add a transform function to the stack
      metric.transform = function(transform) {
        var transforms = slice(arguments);
        transformStack = transformStack.concat(transforms);
        return metric;
      };

      // Propagate source changes down to its metrics
      // Add a unique 'name' to the event so as not to clobber other listeners
      source.on('change.' + metricId, function() {
        // Trigger change on listeners
        dispatch.change.call(metric);
      });

      source.on('ready.' + metricId, function() {
        // Trigger change on listeners
        dispatch.ready.call(metric);
      });

      // Trigger an update if necessary when a filter is applied
      source.on('filter.' + metricId, function(filteredDimension) {
        // If this metric's dimension was filtered, then the metric won't change
        if (!dimension || filteredDimension !== dimension) {
          dispatch.change.call(metric);
        }
      });

      // Metric ids need only be unique among metric objects
      metricId++;

      return metric;
    };

    return source;
  };

  // Utilities

  // Courtesy of Ben Alman: http://benalman.com/news/2012/09/partial-application-in-javascript/#extra-credit
  var slice = Function.prototype.call.bind(Array.prototype.slice);

  // Returns an array of an object's keys
  var keys = Object.keys;

  // Capitalizes the first letter of the given string
  function capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  // Use Object.toString technique to determine a variable's true type
  function is(type) {
    var constructor = capitalize(type);
    return function(obj) {
      return Object.prototype.toString.call(obj) === '[object ' + constructor + ']';
    };
  }

  // Checks if the object is a function
  var isFunction = is('function');

  // Checks if the object is a plain object
  var isObject = is('object');

  // Checks if the object is an array
  var isArray = Array.isArray;

  // Function that just returns zero
  function zero() {
    return 0;
  }

  // Function that returns a new object
  function object() {
    return {};
  }

  // Returns a name combining the field and modifier uniquely
  function fieldName(field, modifier) {
    return (field ? field + '.' : '') + modifier;
  }

  // Returns a function that returns the value of the first arg at the index given
  // by the specified field and field mapping
  function valueFor(indexer, field) {
    if (isFunction(field)) {
      // Add the field mapping function as a parameter so that fields can be
      // accessed by name
      return function(d) {
        return field(d, indexer);
      };
    }

    return function(d) {
      var index = indexer(field);
      return index !== null ? d[index] : null;
    };
  }

  // Returns a function that returns the value of the first arg at the given index
  function valueAt(index) {
    return function(d) {
      return d[index];
    };
  }
}());
