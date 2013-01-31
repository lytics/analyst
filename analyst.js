(function() {
  function inArray(arr, value) {
    return arr.indexOf(value) !== -1;
  }
  function extend(target, obj) {
    if (!isObject(obj)) {
      return obj;
    }
    keys(obj).forEach(function(attr) {
      target[attr] = obj[attr];
    });
    return target;
  }
  function clone(obj) {
    return extend({}, obj);
  }
  function capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }
  function is(type) {
    var constructor = capitalize(type);
    return function(obj) {
      return Object.prototype.toString.call(obj) === "[object " + constructor + "]";
    };
  }
  function fieldName(field, modifier) {
    return (field ? field + "." : "") + modifier;
  }
  function makeIndexer(field, context) {
    if (!context) {
      return function(d) {
        return d[field] || null;
      };
    }
    var indexer = function(d) {
      return d[this.indexFor ? this.indexFor(field) : field] || null;
    };
    indexer = indexer.bind(context);
    if (isString(field) && field[0] === "/") {
      var match = field.match(/\/(\w+)(.*)/), pointer = match[2] || "/";
      field = match[1];
      return function(d) {
        var obj = indexer(d);
        return isObject(obj) ? analyst.jsonpointer.get(obj, pointer) : obj;
      };
    }
    return indexer;
  }
  function makeLiteral(value) {
    return function() {
      return value;
    };
  }
  function makeInverter(value) {
    return function(d) {
      return -(value ? value(d) : d);
    };
  }
  function makeAdder(value) {
    return function(sum, d) {
      return sum + +(value ? value(d) : d);
    };
  }
  function literalObject() {
    return {};
  }
  function literalArray() {
    return [];
  }
  function literalZero() {
    return 0;
  }
  function makeCountReducer() {
    return {
      add: incrementer,
      remove: decrementer,
      initial: literalZero
    };
  }
  function makeSumReducer(value) {
    return {
      add: makeAdder(value),
      remove: makeAdder(makeInverter(value)),
      initial: literalZero
    };
  }
  function makeObjectReducer(value, reducer) {
    return {
      add: function(obj, d) {
        var v = value(d);
        keys(v).forEach(function(key) {
          if (!(key in obj)) {
            obj[key] = reducer.initial();
          }
          obj[key] = reducer.add.call(this, obj[key], v[key]);
        });
        return obj;
      },
      remove: function(obj, d) {
        var v = value(d);
        keys(v).forEach(function(key) {
          if (key in obj) {
            obj[key] = reducer.remove.call(this, obj[key], v[key]);
            if (!obj[key]) {
              delete obj[key];
            }
          }
        });
        return obj;
      },
      initial: literalObject
    };
  }
  function makeArrayReducer(value, reducer) {
    var indexOf = makeIndexOf(makeIndexer("key"));
    return {
      add: function(arr, d) {
        var v = value(d);
        v.forEach(function(obj) {
          var index = indexOf(arr, obj.key);
          if (index === -1) {
            index = arr.length;
            arr.push({
              key: obj.key,
              value: reducer.initial()
            });
          }
          arr[index].value = reducer.add.call(this, arr[index].value, obj.value);
        });
        return arr;
      },
      remove: function(arr, d) {
        var v = value(d);
        v.forEach(function(obj) {
          var index = indexOf(arr, obj.key);
          if (index !== -1) {
            arr[index].value = reducer.remove.call(this, arr[index].value, obj.value);
            if (!arr[index].value) {
              arr.splice(index, 1);
            }
          }
        });
        return arr;
      },
      initial: literalArray
    };
  }
  function makeDistinctReducer(value) {
    return {
      add: function(distinct, d) {
        var v = value(d);
        if (!(v in distinct)) {
          distinct[v] = 0;
        }
        distinct[v]++;
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
  }
  function makeIndexOf(value) {
    if (!isFunction(value)) {
      return Function.prototype.call.bind(Array.prototype.indexOf);
    }
    return function findIndex(arr, search) {
      var index = -1;
      arr.every(function(item, i) {
        if (search === value(item)) {
          index = i;
          return false;
        }
        return true;
      });
      return index;
    };
  }
  function makeSorter(value) {
    if (!isFunction(value)) {
      value = makeIndexer(value);
    }
    var sorter = crossfilter.quicksort.by(value);
    return function(arr) {
      if (!isArray(arr)) {
        return arr;
      }
      return sorter(slice(arr), 0, arr.length);
    };
  }
  function makeTruncator(length) {
    return function(arr) {
      if (!isArray(arr) || arr.length <= length) {
        return arr;
      }
      return slice(arr, 0, length);
    };
  }
  function addEventHandling(target) {
    var callbacks = {};
    target.on = function(events, callback, context) {
      var event, node, tail, list;
      if (!callback) return target;
      events = events.split(eventSplitter);
      while (event = events.shift()) {
        list = callbacks[event];
        node = list ? list.tail : {};
        node.next = tail = {};
        node.context = context;
        node.callback = callback;
        callbacks[event] = {
          tail: tail,
          next: list ? list.next : node
        };
      }
      return target;
    };
    target.off = function(events, callback, context) {
      var event, node, tail, cb, ctx;
      if (!(events || callback || context)) {
        callbacks = {};
        return target;
      }
      events = events ? events.split(eventSplitter) : _.keys(callbacks);
      while (event = events.shift()) {
        node = callbacks[event];
        delete callbacks[event];
        if (!node || !(callback || context)) continue;
        tail = node.tail;
        while ((node = node.next) !== tail) {
          cb = node.callback;
          ctx = node.context;
          if (callback && cb !== callback || context && ctx !== context) {
            target.on(event, cb, ctx);
          }
        }
      }
      return target;
    };
    target.trigger = function(events) {
      var event, node, tail, args, all, rest;
      all = callbacks.all;
      events = events.split(eventSplitter);
      rest = [].slice.call(arguments, 1);
      while (event = events.shift()) {
        if (node = callbacks[event]) {
          tail = node.tail;
          while ((node = node.next) !== tail) {
            node.callback.apply(node.context || target, rest);
          }
        }
        if (node = all) {
          tail = node.tail;
          args = [ event ].concat(rest);
          while ((node = node.next) !== tail) {
            node.callback.apply(node.context || target, args);
          }
        }
      }
      return target;
    };
  }
  var root = this, d3 = root.d3, crossfilter = root.crossfilter;
  var analyst = {
    version: "0.1.1"
  };
  var drivers = {};
  analyst.addDriver = function(name, driver) {
    if (analyst[name]) {
      throw new Error("Attempting to add a driver that already exists or is protected: '" + name + "'");
    }
    drivers[name] = driver;
    analyst[name] = function() {
      var args = [ name ].concat(slice(arguments));
      return analyst.source.apply(analyst, args);
    };
    return analyst;
  };
  var slice = Function.prototype.call.bind(Array.prototype.slice);
  var reverse = Function.prototype.call.bind(Array.prototype.reverse);
  var keys = Object.keys;
  var isString = is("string");
  var isFunction = is("function");
  var isObject = is("object");
  var isArray = Array.isArray;
  var incrementer = makeAdder(makeLiteral(1));
  var decrementer = makeAdder(makeLiteral(-1));
  var eventSplitter = /\s+/;
  analyst.jsonpointer = function() {
    var untilde = function(str) {
      return str.replace(/~./g, function(m) {
        switch (m) {
         case "~0":
          return "~";
         case "~1":
          return "/";
        }
        throw "Invalid tilde escape: " + m;
      });
    };
    var traverse = function(obj, pointer, value) {
      var part = untilde(pointer.shift());
      if (!obj.hasOwnProperty(part)) {
        return null;
      }
      if (pointer.length !== 0) {
        return traverse(obj[part], pointer, value);
      }
      if (typeof value === "undefined") {
        return obj[part];
      }
      var old_value = obj[part];
      if (value === null) {
        delete obj[part];
      } else {
        obj[part] = value;
      }
      return old_value;
    };
    var validate_input = function(obj, pointer) {
      if (typeof obj !== "object") {
        throw "Invalid input object.";
      }
      if (pointer === "") {
        return [];
      }
      if (!pointer) {
        throw "Invalid JSON pointer.";
      }
      pointer = pointer.split("/");
      var first = pointer.shift();
      if (first !== "") {
        throw "Invalid JSON pointer.";
      }
      return pointer;
    };
    var get = function(obj, pointer) {
      pointer = validate_input(obj, pointer);
      if (pointer.length === 0) {
        return obj;
      }
      return traverse(obj, pointer);
    };
    return {
      get: get
    };
  }();
  analyst.source = function(type) {
    if (!drivers[type]) {
      throw new Error("Source type '" + type + "' unknown");
    }
    var source = {}, filterStack = [], sanitizer, fieldMap = {}, cf = crossfilter(), dimensions = {}, fetch, timeout;
    addEventHandling(source);
    source.add = function(data) {
      if (!isArray(data)) {
        throw new Error("Input data must be an array");
      }
      var ready = !cf.size(), clean;
      if (sanitizer) {
        data = data.reduce(function(cleansed, d) {
          if (clean = sanitizer.call(source, d)) {
            cleansed.push(clean);
          }
          return cleansed;
        }, []);
      }
      cf.add(data);
      if (ready) {
        source.trigger("ready");
      }
      source.trigger("change");
      return source;
    };
    source.sanitizer = function(func) {
      if (!arguments.length) {
        return sanitizer;
      }
      if (!isFunction(func)) {
        throw new Error("Sanitizer must be a function");
      }
      sanitizer = func;
      return source;
    };
    source.fieldMap = function(map) {
      if (!arguments.length) {
        return fieldMap;
      }
      if (!isObject(map)) {
        throw new Error("Field map must be a plain object");
      }
      fieldMap = map;
      return source;
    };
    source.indexFor = function(field) {
      return field in fieldMap ? fieldMap[field] : null;
    };
    source.fetch = function() {
      if (isFunction(fetch)) {
        fetch();
      }
      return source;
    };
    source.start = function(interval) {
      source.stop();
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
    source.metric = function() {
      return analyst.metric(source);
    };
    source.crossfilter = function() {
      return cf;
    };
    source.dimension = function(value) {
      if (!dimensions[value]) {
        var valueFunc = isFunction(value) ? value.bind(source) : makeIndexer(value, source), dimension = cf.dimension(valueFunc), filter = dimension.filter;
        dimension.filter = function(value) {
          filter.call(dimension, value);
          dimension._value = value;
          source.trigger("filter", dimension, value);
          return dimension;
        };
        dimension._value = null;
        dimensions[value] = dimension;
      }
      return dimensions[value];
    };
    fetch = drivers[type].apply(source, slice(arguments, 1));
    return source;
  };
  analyst.metric = function(source) {
    function applyTransforms(initial) {
      var transforms = slice(transformStack);
      if (inArray(aliases, "_")) {
        transforms.push(makeIndexer("_"));
      } else {
        transforms.push(function(output) {
          return aliases.reduce(function(result, alias) {
            result[alias] = output[alias];
            return result;
          }, {});
        });
      }
      return transforms.reduce(function(result, transform) {
        return transform(result);
      }, initial);
    }
    function applyReducer(type) {
      return function(result, d) {
        result = result || {};
        keys(reducers).forEach(function(field) {
          result[field] = reducers[field][type].call(source, result[field], d);
        });
        return result;
      };
    }
    function applyAlias(intermediate, alias) {
      return function(output) {
        output[alias] = output[intermediate];
        return output;
      };
    }
    function makeReducer(addReducer) {
      return function() {
        var args = arguments, numArgs = addReducer.length, transforms = slice(args, numArgs), alias = isString(transforms[0]) ? transforms.shift() : "_", intermediate;
        if (inArray(aliases, "_")) {
          throw new Error("All reducing functions must be aliased");
        }
        if (inArray(aliases, alias)) {
          throw new Error("Reduce function alias already exists: '" + alias + "'");
        }
        aliases.push(alias);
        intermediate = addReducer.apply(metric, slice(args, 0, numArgs));
        transformStack.push(applyAlias(intermediate, alias));
        if (transforms.length) {
          metric.transform(alias, transforms);
        }
        return metric;
      };
    }
    function addReducer(reduceAdd, reduceRemove, initialValue) {
      var intermediate = aliases.length;
      reducers[intermediate] = {
        add: reduceAdd,
        remove: reduceRemove,
        initial: initialValue
      };
      return intermediate;
    }
    function addCountReducer() {
      var intermediate = "count";
      reducers[intermediate] = makeCountReducer();
      return intermediate;
    }
    function addSumReducer(field) {
      var intermediate = fieldName(field, "total"), value = makeIndexer(field, source);
      reducers[intermediate] = makeSumReducer(value);
      return intermediate;
    }
    function addAverageReducer(field) {
      var intermediate = fieldName(field, "average"), countField = addCountReducer(), totalField = addSumReducer(field);
      transformStack.push(function(output) {
        output[intermediate] = output[countField] ? output[totalField] / output[countField] : 0;
        return output;
      });
      return intermediate;
    }
    function addDistinctReducer(field) {
      var intermediate = fieldName(field, "distincts"), value = makeIndexer(field, source);
      reducers[intermediate] = makeDistinctReducer(value);
      return intermediate;
    }
    function addDistinctCountReducer(field) {
      var intermediate = fieldName(field, "distinct_count"), distinctsField = addDistinctReducer(field);
      transformStack.push(function(output) {
        output[intermediate] = keys(output[distinctsField]).length;
        return output;
      });
      return intermediate;
    }
    function addSumObjectReducer(field) {
      var intermediate = fieldName(field, "sum_object"), value = makeIndexer(field, source);
      reducers[intermediate] = makeObjectReducer(value, makeSumReducer());
      return intermediate;
    }
    function addSumArrayReducer(field) {
      var intermediate = fieldName(field, "sum_array"), value = makeIndexer(field, source);
      reducers[intermediate] = makeArrayReducer(value, makeSumReducer());
      return intermediate;
    }
    function makeTransformer(addTransform) {
      return function(alias) {
        var args = slice(arguments);
        if (args.length <= addTransform.length) {
          alias = "_";
        } else {
          args.shift();
        }
        transform = addTransform.apply(metric, args);
        return metric.transform(alias, transform);
      };
    }
    var metric = {}, dimension, group, aliases = [], reducers = {}, transformStack = [ clone ], dateValue = makeIndexer("_date", source);
    addEventHandling(metric);
    metric.by = function(field) {
      if (dimension) {
        throw new Error("A metric can only be dimensioned once");
      }
      dimension = source.dimension(field);
      return metric;
    };
    [ "hour", "day", "week", "month" ].forEach(function(interval) {
      var methodName = "by" + capitalize(interval);
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
      return string ? metric.byDateFormat(abbr ? "%a" : "%A") : function(d) {
        return dateValue(d).getDay();
      };
    };
    metric.byHourOfDay = function() {
      return metric.by(function(d) {
        return dateValue(d).getHours();
      });
    };
    metric.reduce = makeReducer(addReducer);
    metric.count = makeReducer(addCountReducer);
    metric.sum = makeReducer(addSumReducer);
    metric.average = makeReducer(addAverageReducer);
    metric.distinct = makeReducer(addDistinctReducer);
    metric.distinctCount = makeReducer(addDistinctCountReducer);
    metric.sumObject = makeReducer(addSumObjectReducer);
    metric.sumArray = makeReducer(addSumArrayReducer);
    metric.dimension = function() {
      return dimension;
    };
    metric.filter = function(value) {
      if (!dimension) {
        return value === undefined ? metric : null;
      }
      return value === undefined ? dimension._value : dimension.filter.call(dimension, value);
    };
    metric.group = function() {
      if (!group) {
        group = dimension ? dimension.group() : source.crossfilter().groupAll();
        if (aliases.length) {
          group.reduce(applyReducer("add"), applyReducer("remove"), applyReducer("initial"));
        }
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
    metric.value = function() {
      var group = metric.group();
      return group[group.value ? "value" : "all"]();
    };
    metric.domain = function() {
      if (!dimension) {
        return null;
      }
      return metric.group().all().map(makeIndexer("key"));
    };
    metric.transform = function(alias) {
      var transforms = slice(arguments);
      if (isString(alias)) {
        if (!inArray(aliases, alias)) {
          throw new Error("The specified reduce funciton alias has not been defined");
        }
        transforms.shift();
      } else {
        if (!inArray(aliases, "_")) {
          throw new Error("An alias must be supplied for the transform to be applied to");
        }
        alias = "_";
      }
      transforms = isArray(transforms[0]) ? transforms[0] : transforms;
      transforms.forEach(function(transform) {
        transformStack.push(function(output) {
          output[alias] = transform(output[alias]);
          return output;
        });
      });
      return metric;
    };
    metric.extract = makeTransformer(function(field) {
      return makeIndexer(field);
    });
    metric.limit = makeTransformer(makeTruncator);
    metric.order = metric.orderAsc = makeTransformer(makeSorter);
    metric.orderDesc = makeTransformer(function(value) {
      var sorter = makeSorter(value);
      return function(arr) {
        return reverse(sorter(arr));
      };
    });
    metric.reverse = makeTransformer(function() {
      return function(arr) {
        return reverse(slice(arr));
      };
    });
    [ "ready", "change", "filter" ].forEach(function(event) {
      source.on(event, function() {
        var args = [ event ].concat(slice(arguments));
        metric.trigger.apply(metric, args);
      });
    });
    source.on("filter", function(filteredDimension, filterValue) {
      if (!dimension || filteredDimension !== dimension) {
        metric.trigger("change");
      }
    });
    return metric;
  };
  analyst.addDriver("preload", function(data, fieldMap) {
    if (isObject(fieldMap)) {
      this.fieldMap(fieldMap);
    }
    this.add(isArray(data) ? data : []);
  });
  analyst.addDriver("lytics", function(options) {
    function getUrl(options, limit) {
      var baseUrl = options.url || "//api.lytics.io", url = baseUrl + "/api/" + (options.clientId ? options.clientId + "/" : "") + options.query, data = options.data || {}, params = [];
      Object.keys(data).forEach(function(key) {
        params.push(key + "=" + data[key]);
      });
      if (params.length) {
        url += "?" + params.join("&");
      }
      return url;
    }
    function handleResponse(response) {
      if (response.meta && response.data) {
        parseData(response.data, parseMeta(response.meta));
      } else {}
    }
    function parseMeta(meta) {
      var dimensions = meta.dimensions, measures = meta.measures, transforms = {}, fields = {}, offset = 1;
      if (dimensions && dimensions.length > 0) {
        dimensions.forEach(function(field, index) {
          fields[field] = index;
        });
        offset = dimensions.length;
      } else {
        fields._ = 0;
      }
      measures.forEach(function(measure, index) {
        fields[measure.As] = index + offset;
        if (measure.Op === "top") {
          transforms[index + offset] = convertTop;
        }
      });
      fields._ts = offset + measures.length;
      fields._date = fields._ts + 1;
      source.fieldMap(fields);
      return transforms;
    }
    function parseData(rawData, transforms) {
      var data = [];
      rawData.forEach(function(segment) {
        var ts = segment._ts, date = new Date(ts.ts * 1e3);
        segment.rows.forEach(function(row, index) {
          Object.keys(transforms).forEach(function(index) {
            row[index] = transforms[index](row[index]);
          });
          row.push(ts.ts);
          row.push(date);
          data.push(row);
        });
      });
      source.add(data);
    }
    function convertTop(arr) {
      if (!Array.isArray(arr)) {
        return arr;
      }
      return arr.map(function(obj) {
        key = Object.keys(obj)[0];
        return {
          key: key,
          value: obj[key]
        };
      });
    }
    var source = this;
    options = options || {};
    return function(limit) {
      var script = document.createElement("script"), cbName = "analyst_lytics_" + (new Date).getTime();
      options.data = options.data || {};
      options.data.callback = cbName;
      root[cbName] = function(response) {
        handleResponse(response);
        delete root[cbName];
        script.remove();
      };
      script.src = getUrl(options, limit);
      document.body.appendChild(script);
    };
  });
  if (typeof exports !== "undefined") {
    exports.analyst = analyst;
  } else if (typeof define === "function" && define.amd) {
    define("analyst", function() {
      return analyst;
    });
  } else {
    root["analyst"] = analyst;
  }
})();