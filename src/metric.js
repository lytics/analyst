/*jshint sub:true, boss:true*/
// Metric

// Object encapsualting a single value that is the end result of a set of
// manipulations like reducing, transforming, and shaping
analyst.metric = function(source) {
  var metric = {},
    dimension,
    group,
    outputFields = {},
    reduceStack = [],
    transformStack = [ applyAliases ],
    dateValue = valueFor(source.indexer(), '_date'),
    applyAdd = applyReduce('add'),
    applyRemove = applyReduce('remove'),
    applyInitial = applyReduce('initial');

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
    var value = valueFor(source.indexer(), field);

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
    var value = valueFor(source.indexer(), field);

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
    var value = valueFor(source.indexer(), field),
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
      group = dimension ? dimension.group() : source.crossfilter().groupAll();

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
