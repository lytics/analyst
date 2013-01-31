/*jshint sub:true, boss:true*/
// Utilities

// Courtesy of Ben Alman: http://benalman.com/news/2012/09/partial-application-in-javascript/#extra-credit
var slice = Function.prototype.call.bind(Array.prototype.slice);
var reverse = Function.prototype.call.bind(Array.prototype.reverse);

// Returns an array of an object's keys
var keys = Object.keys;

// Returns a boolean indicating whether the value is in the given array
function inArray(arr, value) {
  return arr.indexOf(value) !== -1;
}

// Simple extend implementation
function extend(target, obj) {
  if (!isObject(obj)) {
    return obj;
  }

  keys(obj).forEach(function(attr) {
    target[attr] = obj[attr];
  });
  return target;
}

// Shallow clone using extend
function clone(obj) {
  return extend({}, obj);
}

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

// Checks if the object is a string
var isString = is('string');

// Checks if the object is a function
var isFunction = is('function');

// Checks if the object is a plain object
var isObject = is('object');

// Checks if the object is an array
var isArray = Array.isArray;

// Returns a name combining the field and modifier uniquely
function fieldName(field, modifier) {
  return (field ? field + '.' : '') + modifier;
}

// Returns a function that returns the value of the first arg at the index given
// by the specified field and field mapping
function makeIndexer(field, context) {
  // If no context is specified, return a simple accessor function
  if (!context) {
    return function(d) {
      return d[field] || null;
    };
  }

  // Indexer that looks up the field's index if possible
  var indexer = function(d) {
    return d[this.indexFor ? this.indexFor(field) : field] || null;
  };

  // Always invoke the indexer with the given context
  indexer = indexer.bind(context);

  // Handle jsonpointer strings
  if (isString(field) && field[0] === '/') {
    var match = field.match(/\/(\w+)(.*)/),
      pointer = match[2] || '/';

    field = match[1];

    return function(d) {
      var obj = indexer(d);
      return isObject(obj) ? analyst.jsonpointer.get(obj, pointer) : obj;
    };
  }

  return indexer;
}

// Return a 'value' function that ignores the value and always returns a literal value
function makeLiteral(value) {
  return function() {
    return value;
  };
}

// Creates a value function that returns the negated value of the given value function
function makeInverter(value) {
  return function(d) {
    return -(value ? value(d) : d);
  };
}

// Creates a reduce function that adds a given value to the memo
function makeAdder(value) {
  return function(sum, d) {
    return sum + (+(value ? value(d) : d));
  };
}

// Function that returns a new object
function literalObject() {
  return {};
}

// Function that returns a new array
function literalArray() {
  return [];
}

// Function that just returns zero
function literalZero() {
  return 0;
}

// Reduce funcitons for incrementing and decrementing, regardless of value
var incrementer = makeAdder(makeLiteral(1));
var decrementer = makeAdder(makeLiteral(-1));

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

          // Removing the value is an arbitrary decision
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
  var indexOf = makeIndexOf(makeIndexer('key'));

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

          // Removing the value is an arbitrary decision
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

// Create a function that finds the index of a item in an array given a value function
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

// Create a transform function that sorts the value using the given value function
function makeSorter(value) {
  if (!isFunction(value)) {
    value = makeIndexer(value);
  }

  var sorter = crossfilter.quicksort.by(value)

  return function(arr) {
    if (!isArray(arr)) {
      return arr;
    }

    return sorter(slice(arr), 0, arr.length);
  }
}

// Create a transform function that trucates the array to the given length
function makeTruncator(length) {
  return function (arr) {
    if (!isArray(arr) || arr.length <= length) {
      return arr;
    }

    return slice(arr, 0, length);
  }
}
