/*jshint sub:true */
(function(d3) {
  // 'Root' object, `window` in browsers, `global` in Node
  var root = this;

  // Namespace object
  var analyst = function() {};

  (function() {
    'use strict';

    // Internal list of available drivers
    var drivers = {};

    // Object that represents a source of data that 'metrics' can be drawn from
    var Source = analyst.source = function(type, options) {
      // Enable shorthand `new` omission
      if (!(this instanceof Source)) {
        return new Source(type, options);
      }

      if (!drivers[type]) {
        throw new Error("Source type '" + type + "' unknown");
      }

      this._data = [];
      this._driver = new drivers[type](options);
      this._dispatch = d3.dispatch('change');
      this._counter = 1;

      this.fetch();
    };

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

    Source.prototype = {
      on: function(event, listener) {
        // Add a unique 'name' to the counter so as not to clobber other listeners
        this._dispatch.on(event + '.' + this._counter++, listener);

        return this;
      },

      fetch: function() {
        var self = this;
        this._driver.fetch(function(response) {
          self._data = self._driver.parse(response);
          self._dispatch.change.call(self);
        });
      },

      start: function() {
      },

      stop: function() {
      },

      interval: function() {
      },

      metric: function(field) {
        return new Metric(this, field);
      },

      indexFor: function(field) {
        return this._driver.indexFor(field);
      },

      data: function() {
        return this._data;
      }
    };

    // Object encapsualting a single value that is the end result of a set of
    // manipulations like reducing or shaping
    var Metric = analyst.metric = function(source, field) {
      // Enable shorthand `new` omission
      if (!(this instanceof Metric)) {
        return new Metric(source, field);
      }

      var self = this;

      this._stack = [];
      this._source = source;
      this._dispatch = d3.dispatch('change');

      // Propagate source changes down to its metrics
      source.on('change', function() {
        // Clear value cache
        delete this._value;

        // Trigger change on listeners
        self._dispatch.change.call(self);
      });

      // Add the projection operation if provided
      if (field) {
        this.projection(field);
      }
    };

    // Combine multiple metrics into a new metric
    Metric.compose = function() {
      // TODO: what's the source of a composed metric?
      // return new Metric();
    };

    Metric.prototype = {
      on: function(event, listener) {
        this._dispatch.on(event, listener);

        return this;
      },

      // Get the calculated result of the metric
      value: function() {
        // The value may be cached, in which case don't bother calculating
        if (!this._value) {
          // Send the initial value through the operation pipeline
          this._value = this._stack.reduce(function(value, func) {
            return func(value);
          }, this._source.data());
        }

        return this._value;
      },

      // Shorthand method for calling Metric.compose() with self as an argument
      compose: function() {
        var args = [].slice.call(arguments);

        args.unshift(this);
        return Metric.compose.apply(null, args);
      },

      // Not strictly a projection, since it's not a set (the output can contain
      // duplicate values)
      projection: function() {
        var args = [].slice.call(arguments),
          fields = Array.isArray(args[0]) ? args[0] : args,
          single = fields.length === 1,
          source = this._source;


        this._stack.push(function(rows) {
          // translate field names fields
          var indices = fields.map(function(field) {
            return source.indexFor(field);
          });

          // TODO: make this safe for non-array values
          return rows.reduce(function(projection, row, index) {
            if (single) {
              // If only a single field was specified, don't wrap it in an array
              projection.push(row[indices[0]]);
            } else {
              // Create a new row that contains only the given columns
              projection.push(row.reduce(function(subset, value, index) {
                if (indices.indexOf(index) !== -1) {
                  subset.push(value);
                }

                return subset;
              }, []));
            }

            return projection;
          }, []);
        });

        return this;
      },

      reduceSum: function() {
        this._stack.push(function(values) {
          return values.reduce(function(sum, value) {
            return sum + value;
          }, 0);
        });

        return this;
      },

      reduceCount: function() {
        this._stack.push(function(values) {
          return values.reduce(function(count) {
            return count++;
          }, 0);
        });

        return this;
      },

      reduceDistinct: function() {
        this._stack.push(function(values) {
          var distincts = [];

          return values.reduce(function(count, value) {
            if (distincts.indexOf(value) === -1) {
              distincts.push(value);
              count++;
            }

            return count;
          }, 0);
        });

        return this;
      },

      reduceAverage: function() {
        this._stack.push(function(values) {
          var count = values.length,
            total = values.reduce(function(sum, value) {
              return sum + value;
            }, 0);

          return total / count;
        });

        return this;
      },

      reduceSumDistinct: function() {
        return this;
      }
    };

    // Aliases
    Metric.prototype.project = Metric.prototype.projection;

    // Fix the `constructor` property
    var classes = [ Source, Metric ];
    for (var i in classes) {
      classes[i].prototype.constructor = classes[i];
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
}(d3));
