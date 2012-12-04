/*jshint sub:true, boss:true*/
(function() {
  // 'Root' object, `window` in browsers, `global` in Node
  var root = this,
    d3 = root.d3,
    crossfilter = root.crossfilter;

  // Namespace object
  var analyst = {};

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
      var source = {},
        cf = crossfilter(),
        driver = new drivers[type](options),
        dispatch = d3.dispatch('change'),
        metricId = 1,
        timeout;

      // Check that the driver is installed
      if (!drivers[type]) {
        throw new Error("Source type '" + type + "' unknown");
      }

      source.on = function(event, listener) {
        dispatch.on(event, listener);

        return source;
      };

      source.fetch = function(callback) {
        driver.fetch(function(data) {
          cf.add(data);
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
      source.metric = function(field) {
        var metric = {},
          dimension,
          group,
          reduceStack = [],
          shaperStack = [],
          indexFor = driver.indexFor.bind(driver),
          fieldValue = valueFor(indexFor, field),
          dateValue = valueFor(indexFor, '_date'),
          dispatch = d3.dispatch('change');

        function applyShapers(initial) {
          return shaperStack.reduce(function(value, shaper) {
            return shaper(value);
          }, initial);
        }

        metric.on = function(event, listener) {
          dispatch.on(event, listener);
          return metric;
        };

        // Specify how to segment data, results in creating a crossfilter dimension
        metric.by = function(field) {
          // If it's a value funciton, pass it straight through, otherwise create
          // an indexing function
          dimension = cf.dimension(isFunc(field) ? field : fieldValue);
          return metric;
        };

        [ 'hour', 'day', 'week', 'month' ].forEach(function(interval) {
          var methodName = 'by' + interval.charAt(0).toUpperCase() + interval.slice(1);

          metric[methodName] = function() {
            return metric.by(function(d) {
              return d3.time[interval](dateValue(d));
            });
          };
        });

        metric.reduce = function(funcs) {
          reduceStack.push(funcs);

          return metric;
        };

        metric.average = function() {
          return metric;
        };

        metric.count = function() {
          reduceStack.push({
            add: function(memo) {
              memo.count++;
            },
            remove: function(memo) {
              memo.count--;
            },
            initial: function(memo) {
              memo.count = 0;
            }
          });

          return metric;
        };

        metric.sum = function() {
          reduceStack.push({
            add: function(memo, row) {
              memo.total += fieldValue(row);
            },
            remove: function(memo, row) {
              memo.total -= fieldValue(row);
            },
            initial: function(memo) {
              memo.total = 0;
            }
          });

          return metric;
        };

        metric.average = function() {
          metric.count();
          metric.sum();

          function average(memo, row) {
            memo.average = memo.count ? memo.total / memo.count : 0;
          }

          reduceStack.push({
            add: average,
            remove: average,
            initial: function(memo) {
              memo.average = 0;
            }
          });

          return metric;
        };

        metric.distinct = function() {
          reduceStack.push({
            add: function(memo, row) {
              var value = fieldValue(row);
              if (value in memo.distincts) {
                memo.distincts[value]++;
              } else {
                memo.distincts[value] = 0;
                memo.distinctCount++;
              }
            },
            remove: function(memo, row) {
              var value = fieldValue(row);
              if (value in memo.distincts) {
                if (!--memo.distincts[field]) {
                  delete memo.distincts[field];
                  memo.distinctCount--;
                }
              }
            },
            initial: function(memo) {
              memo.distincts = [];
              memo.distinctCount = 0;
            }
          });

          return metric;
        };

        metric.dimension = function() {
          return dimension;
        };

        metric.group = function() {
          if (!group) {
            var dimension = metric.dimension(),
              cfGroup = dimension ? dimension.group() : cf.groupAll();

            cfGroup.reduce(function(memo, row) {
              return reduceStack.reduce(function(p, reduction) {
                reduction.add(p, row);
                return p;
              }, memo);
            }, function(memo, row) {
              return reduceStack.reduce(function(p, reduction) {
                reduction.remove(p, row);
                return p;
              }, memo);
            }, function() {
              return reduceStack.reduce(function(p, reduction) {
                reduction.initial(p);
                return p;
              }, {});
            });

            // Create a wrapper around the group that applies shaping functions
            if (cfGroup.all) {
              group = {
                all: function() {
                  return cfGroup.all().map(function(result) {
                    return {
                      key: result.key,
                      value: applyShapers(result.value)
                    };
                  });
                }
              };
            } else {
              group = {
                value: function() {
                  return applyShapers(cfGroup.value());
                }
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

        // Extract a single value from the result, or each result
        metric.extract = function(field) {
          shaperStack.push(valueAt(field));
          return metric;
        };

        // Propagate source changes down to its metrics
        // Add a unique 'name' to the event so as not to clobber other listeners
        source.on('change.' + metricId++, function() {
          // Trigger change on listeners
          dispatch.change.call(metric);
        });

        return metric;
      };

      return source;
    };

    // Utilities

    // Checks if the object is a function
    // Note: this fails for regexes in V8 (which is good enough)
    function isFunc(obj) {
      return typeof obj === 'function';
    }

    // Returns a function that returns the value of the first arg at the index given
    // by the specified field and field mapping
    function valueFor(mapFunc, field) {
      return function(d) {
        return d[mapFunc(field)];
      };
    }

    // Returns a function that returns the value of the first arg at the given index
    function valueAt(index) {
      return function(d) {
        return d[index];
      };
    }
  }());

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
}());
