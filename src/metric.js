/*jshint sub:true, boss:true*/
// Metric

// Object encapsualting a single value that is the end result of a set of
// manipulations like reducing, transforming, and shaping
analyst.metric = function(source) {
  var metric = {},
    dimension,
    group,
    aliases = [],
    reducers = {},
    transformStack = [ clone ],
    dateValue = makeIndexer('_date', source);

  // Apply all post-reduce transform functions
  function applyTransforms(initial) {
    var transforms = slice(transformStack);

    // Default behavior is to return the raw value if a single built-in reduce
    // function was appied, otherwise return the full output object
    if (inArray(aliases, '_')) {
      transforms.push(makeIndexer('_'));
    } else {
      // Create a new output object with no intermediate fields
      transforms.push(function(output) {
        return aliases.reduce(function(result, alias) {
          result[alias] = output[alias];
          return result;
        }, {});
      });
    }

    // If there's only one anonymous reducer, assume transform functions
    // operate on its value, and not the full output object
    return transforms.reduce(function(result, transform) {
      return transform(result);
    }, initial);
  }

  // Returns a function that applies all reduce functions of the given
  // type (add, remove, initial)
  function applyReducer(type) {
    return function(result, d) {
      result = result || {};

      // Apply the set of reduce functions by modifying its value in the
      // result object (as specified by its particular field)
      keys(reducers).forEach(function(field) {
        result[field] = reducers[field][type].call(source, result[field], d);
      });

      return result;
    };
  }

  // Give intermediate values their aliased name
  function applyAlias(intermediate, alias) {
    return function(output) {
      output[alias] = output[intermediate];
      return output;
    };
  }

  // Make a reducer function that handles field aliasing and transforms with the
  // given function for adding reducer logic
  function makeReducer(addReducer) {
    return function() {
      var args = arguments,
        // This is the number of beginning arguments the particular reducer needs
        numArgs = addReducer.length,
        // Transforms are specified last
        transforms = slice(args, numArgs),
        // If the reducer doesn't have an alias, it is 'anonymous' and gets a special key
        alias = isString(transforms[0]) ? transforms.shift() : '_',
        intermediate;

      if (inArray(aliases, '_')) {
        throw new Error('All reducing functions must be aliased');
      }

      if (inArray(aliases, alias)) {
        throw new Error("Reduce function alias already exists: '" + alias + "'");
      }

      // Keep track of all of the valid aliases
      aliases.push(alias);

      // Call the function that adds the reducer logic with the first N args
      intermediate = addReducer.apply(metric, slice(args, 0, numArgs));

      // Add transform for aliasing the output value
      transformStack.push(applyAlias(intermediate, alias));

      // Add transforms
      if (transforms.length) {
        metric.transform(alias, transforms);
      }

      return metric;
    };
  }

  // Add `on`, `off`, and `trigger` methods for handling events
  addEventHandling(metric);

  // Specify how to segment data, results in creating a crossfilter dimension
  metric.by = function(field) {
    if (dimension) {
      throw new Error('A metric can only be dimensioned once');
    }

    dimension = source.dimension(field);
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
  metric.reduce = makeReducer(addReducer);

  function addReducer(reduceAdd, reduceRemove, initialValue) {
    var intermediate = aliases.length;

    reducers[intermediate] = {
      add: reduceAdd,
      remove: reduceRemove,
      initial: initialValue
    };

    return intermediate;
  }

  // Count all rows
  metric.count = makeReducer(addCountReducer);

  function addCountReducer() {
    var intermediate = 'count';

    reducers[intermediate] = {
      add: incrementer,
      remove: decrementer,
      initial: literalZero
    };

    return intermediate;
  }

  // Sum the given field
  metric.sum = makeReducer(addSumReducer);

  function addSumReducer(field) {
    var intermediate = fieldName(field, 'total'),
      value = makeIndexer(field, source);

    reducers[intermediate] = {
      add: makeAdder(value),
      remove: makeAdder(makeInverter(value)),
      initial: literalZero
    };

    return intermediate;
  }

  // Average the given field
  metric.average = makeReducer(addAverageReducer);

  function addAverageReducer(field) {
    var intermediate = fieldName(field, 'average'),
      countField = addCountReducer(),
      totalField = addSumReducer(field);

    // Perform the average at the end, since it can be computed from
    // intermediate calculations (but before aliases are applied)
    transformStack.push(function(output) {
      output[intermediate] = output[countField] ? output[totalField] / output[countField] : 0;
      return output;
    });

    return intermediate;
  }

  // Find distinct values for the field
  metric.distinct = makeReducer(addDistinctReducer);

  function addDistinctReducer(field) {
    var intermediate = fieldName(field, 'distincts'),
      value = makeIndexer(field, source);

    reducers[intermediate] = {
      add: function(distinct, d) {
        var v = value(d);
        if (v in distinct) {
          distinct[v]++;
        } else {
          distinct[v] = 1;
        }
        return distinct;
      },
      remove: function(distinct, d) {
        var v = value(d);
        if (v in distinct) {
          distinct[v]--;
          if (!distinct[v]) {
            delete distinct[v];
          }
        }
        return distinct;
      },
      initial: literalObject
    };

    return intermediate;
  }

  // Find count of distinct values for the field
  metric.distinctCount = makeReducer(addDistinctCountReducer);

  function addDistinctCountReducer(field) {
    var intermediate = fieldName(field, 'distinct_count'),
      distinctsField = addDistinctReducer(field);

    // The count of distincts relies on actually calculating the distincts,
    // which can be done afterwards (but before aliases are applied)
    transformStack.push(function(output) {
      output[intermediate] = keys(output[distinctsField]).length;
      return output;
    });

    return intermediate;
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
      group = dimension ? dimension.group() : source.crossfilter().groupAll();

      if (aliases.length) {
        group.reduce(applyReducer('add'), applyReducer('remove'), applyReducer('initial'));
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

    return metric.group().all().map(makeIndexer('key'));
  };

  // Extract a single value from the result, or each result
  metric.extract = function(alias, field) {
    var value = makeIndexer(field || alias);

    return field ? metric.transform(alias, value) : metric.transform(value);
  };

  // Add a transform function to the stack that operates on the given output field
  metric.transform = function(alias) {
    var transforms = slice(arguments);

    if (isString(alias)) {
      if (!inArray(aliases, alias)) {
        throw new Error('The specified reduce funciton alias has not been defined');
      }
      // Remove the field name from the transforms array
      transforms.shift();
    } else {
      if (!inArray(aliases, '_')) {
        throw new Error('An alias must be supplied for the transform to be applied to');
      }
      // If no alias was specified, use the anonymous alias
      alias = '_';
    }

    // Allow transforms to be specified as a single array argument
    transforms = isArray(transforms[0]) ? transforms[0] : transforms;

    // Wrap transform functions such that they apply to the given field
    transforms.forEach(function(transform) {
      transformStack.push(function(output) {
        output[alias] = transform(output[alias]);
        return output;
      });
    });

    return metric;
  };

  // Propagate source events down to its metrics
  [ 'ready', 'change', 'filter' ].forEach(function(event) {
    source.on(event, function() {
      var args = [ event ].concat(slice(arguments));
      metric.trigger.apply(metric, args);
    });
  });

  // Trigger an update if necessary when a filter is applied
  source.on('filter', function(filteredDimension, filterValue) {
    // If this metric's dimension was filtered, then the metric won't change
    if (!dimension || filteredDimension !== dimension) {
      metric.trigger('change');
    }
  });

  return metric;
};
