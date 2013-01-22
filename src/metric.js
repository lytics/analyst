/*jshint sub:true, boss:true*/
// Metric

// Object encapsualting a single value that is the end result of a set of
// manipulations like reducing, transforming, and shaping
analyst.metric = function(source) {
  var metric = {},
    dimension,
    group,
    aliases = {},
    reducers = {},
    transformStack = [ applyAliases ],
    dateValue = makeIndexer('_date', source.indexFor);

  // Create a new output object that contains only the fields specified
  // by the reduce functions applied
  function applyAliases(output) {
    var fields = keys(aliases);
    return fields.length ? fields.reduce(function(data, field) {
      data[aliases[field]] = output[field];
      return data;
    }, {}) : output;
  }

  // Apply all post-reduce transform functions
  function applyTransforms(initial) {
    var isAnonymous = '_' in reducers,
      outputFields = keys(reducers),
      // If there's only one anonymous reducer, assume transform functions
      // operate on its value, and not the full output object
      output = transformStack.reduce(function(v, transform) {
        return transform(v);
      }, isAnonymous ? initial._ : initial);

    // Default behavior is to return the raw value if a single built-in reduce
    // function was appied, otherwise return the full output object
    return !isAnonymous && outputFields.length === 1 ? output[outputFields[0]] : output;
  }

  // Returns a function that applies all reduce functions of the given
  // type (add, remove, initial)
  function applyReducer(type) {
    return function(result, d) {
      result = result || {};

      // Apply the set of reduce functions by modifying its value in the
      // result object (as specified by its particular field)
      keys(reducers).forEach(function(field) {
        result[field] = reducers[field][type](result[field], d);
      });

      return result;
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
  metric.reduce = function(reduceAdd, reduceRemove, initialValue, outputField) {
    if ('_' in reducers) {
      throw new Error('All reducing functions must be aliased');
    }

    // If the reducer doesn't have an alias, it is 'anonymous' and gets a special key
    outputField = outputField || '_';

    // Don't add reduction if it's duplicating an existing one
    if (!(outputField in reducers)) {
      reducers[outputField] = {
        add: reduceAdd,
        remove: reduceRemove,
        initial: initialValue
      };
    }

    return metric;
  };

  // Returns a function that uses the given function and output field suffix
  // to add reduce functions
  function makeReducer(reduce, suffix) {
    // The second argument is optionally an alias to give the value in the
    // result object, and the rest of the arguments are treated as transforms
    return function(field) {
      var transforms = slice(arguments, 1),
        outputField = fieldName(field, suffix),
        alias = isFunction(transforms[0]) ? outputField : transforms.shift() || outputField;

      // Keep track of the output field for aliasing later
      aliases[outputField] = alias;

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
  metric.count = makeReducer(countReduce);

  function countReduce() {
    return metric.reduce(incrementer, decrementer, literalZero, 'count');
  }

  // Sum the given field
  metric.sum = makeReducer(sumReduce, 'total');

  function sumReduce(field, outputField) {
    var value = makeIndexer(field, source.indexFor);

    return metric.reduce(makeAdder(value), makeAdder(makeInverter(value)), literalZero, outputField);
  }

  // Average the given field
  metric.average = makeReducer(averageReduce, 'average');

  function averageReduce(field, outputField) {
    var totalField = fieldName(field, 'total');

    if (!(outputField in reducers)) {
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
  metric.distinct = makeReducer(distinctReduce, 'distincts');

  function distinctReduce(field, outputField) {
    var value = makeIndexer(field, source.indexFor);

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
      literalObject,
      outputField
    );
  }

  // Find count of distinct values for the field
  metric.distinctCount = makeReducer(distinctCountReduce, 'distinct_total');

  function distinctCountReduce(field, outputField) {
    var value = makeIndexer(field, source.indexFor),
      distinctsField = fieldName(field, 'distincts');

    if (!(outputField in reducers)) {
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
      group = dimension ? dimension.group() : source.crossfilter().groupAll();

      if (keys(reducers).length) {
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
  metric.extract = function(field) {
    transformStack.push(makeIndexer(field));
    return metric;
  };

  // Add a transform function to the stack
  metric.transform = function(transform) {
    var transforms = slice(arguments);
    transformStack = transformStack.concat(transforms);
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
