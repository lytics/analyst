/*jshint sub:true, boss:true*/
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

// Checks if the object is a string
var isString = is('string');

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
