/*jshint sub:true, boss:true*/
//     Backbone.js 0.9.2

//     (c) 2010-2012 Jeremy Ashkenas, DocumentCloud Inc.
//     Backbone may be freely distributed under the MIT license.
//     For all details and documentation:
//     http://backbonejs.org

// Backbone.Events (slightly modified)
// -----------------

// Regular expression used to split event strings
var eventSplitter = /\s+/;

// Adds methods to any object that provide it with custom event handling
// You may bind with `on` or remove with `off` callback functions
// to an event; trigger`-ing an event fires all callbacks in succession.
//
//     var object = {};
//     addEventHandling(object);
//     object.on('expand', function(){ alert('expanded'); });
//     object.trigger('expand');
//
function addEventHandling(target) {
  var callbacks = {};

  // Bind one or more space separated events, `events`, to a `callback`
  // function. Passing `"all"` will bind the callback to all events fired.
  target.on = function(events, callback, context) {

    var event, node, tail, list;
    if (!callback) return target;
    events = events.split(eventSplitter);

    // Create an immutable callback list, allowing traversal during
    // modification.  The tail is an empty object that will always be used
    // as the next node.
    while (event = events.shift()) {
      list = callbacks[event];
      node = list ? list.tail : {};
      node.next = tail = {};
      node.context = context;
      node.callback = callback;
      callbacks[event] = {tail: tail, next: list ? list.next : node};
    }

    return target;
  };

  // Remove one or many callbacks. If `context` is null, removes all callbacks
  // with that function. If `callback` is null, removes all callbacks for the
  // event. If `events` is null, removes all bound callbacks for all events.
  target.off = function(events, callback, context) {
    var event, node, tail, cb, ctx;

    // No events, or removing *all* events.
    if (!(events || callback || context)) {
      callbacks = {};
      return target;
    }

    // Loop through the listed events and contexts, splicing them out of the
    // linked list of callbacks if appropriate.
    events = events ? events.split(eventSplitter) : _.keys(callbacks);
    while (event = events.shift()) {
      node = callbacks[event];
      delete callbacks[event];
      if (!node || !(callback || context)) continue;
      // Create a new list, omitting the indicated callbacks.
      tail = node.tail;
      while ((node = node.next) !== tail) {
        cb = node.callback;
        ctx = node.context;
        if ((callback && cb !== callback) || (context && ctx !== context)) {
          target.on(event, cb, ctx);
        }
      }
    }

    return target;
  };

  // Trigger one or many events, firing all bound callbacks. Callbacks are
  // passed the same arguments as `trigger` is, apart from the event name
  // (unless you're listening on `"all"`, which will cause your callback to
  // receive the true name of the event as the first argument).
  target.trigger = function(events) {
    var event, node, tail, args, all, rest;
    all = callbacks.all;
    events = events.split(eventSplitter);
    rest = [].slice.call(arguments, 1);

    // For each event, walk through the linked list of callbacks twice,
    // first to trigger the event, then to trigger any `"all"` callbacks.
    while (event = events.shift()) {
      if (node = callbacks[event]) {
        tail = node.tail;
        while ((node = node.next) !== tail) {
          node.callback.apply(node.context || target, rest);
        }
      }
      if (node = all) {
        tail = node.tail;
        args = [event].concat(rest);
        while ((node = node.next) !== tail) {
          node.callback.apply(node.context || target, args);
        }
      }
    }

    return target;
  };
}
