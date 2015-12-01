(function(f){if(typeof exports==="object"&&typeof module!=="undefined"){module.exports=f()}else if(typeof define==="function"&&define.amd){define([],f)}else{var g;if(typeof window!=="undefined"){g=window}else if(typeof global!=="undefined"){g=global}else if(typeof self!=="undefined"){g=self}else{g=this}g.icebreaker = f()}})(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
var pull = require('pull-stream')
var inherits = require('inherits')
var isArray = require('isarray')

function init() {
  if (arguments.length > 0) {
    for (var key in arguments) {
      if (arguments.hasOwnProperty(key)) {
        var arg = arguments[key]
        if (isArray(arg) || typeof arg === 'string' ||
          typeof arg === 'number') {
          if (this._chain === false) this._commands.push(this.params(arg))
          else this.params(arg)
        } else this._commands.push(arg)
      }
    }

    if (this._chain === false) {
      return this.pull()
    }
  }
}

function icebreaker() {
  if (!(this instanceof icebreaker)) {
    var i = Object.create(icebreaker.prototype);
    var p = icebreaker.apply(i, [].slice.call(arguments))
    if (p) return p
    return i
  }

  this._commands = []

  /* jshint eqnull:true */
  if (this._chain == null) this._chain = false

  var p = init.apply(this, [].slice.call(arguments))
  if (p) return p
}

icebreaker.prototype.add = function () {
  this._commands = this._commands.concat([].slice.call(arguments))
  return this
}

var mixin = icebreaker.mixin = function (obj, dest) {
  if (!dest) dest = icebreaker

  for (var key in obj) {
    if (obj.hasOwnProperty(key)) {
      var value = obj[key]

      if (typeof value === 'function' && typeof key === 'string') {
        (function (key, value) {
          dest[key] = function () {
            return value.apply(this, [].slice.call(arguments))
          }
          dest.prototype[key] = function () {
            var r = dest[key].apply(this, [].slice.call(arguments))
            return this._chain === true ? this.add(r) : r
          }
          if(value.type){
            dest[key].type=value.type
            dest.prototype[key].type = value.type
          }
        })(key, value)
      } else if (typeof value === 'object' && key !== 'prototype') {
        (function (key, value) {
          dest[key] = value
          var w = function () {
            if (!(this instanceof w)) return new w()
            icebreaker.call(this)
          }

          inherits(w, icebreaker)
          if (Object.keys(value).length > 0)
            icebreaker.mixin(value, w)
          else {
            dest[key] = w
          }

          dest.prototype[key] = function () {
            var s = new w()
            s._commands = this._commands
            s._chain = this._chain
            return s
          }
        })(key, value)
      }
    }
  }
}

icebreaker.prototype.pull = function () {
  if (isArray(this._commands))
    for (var key in this._commands) {
      if (this._commands[key] instanceof icebreaker) {
        var r = this._commands[key].pull()
        if (r) this._commands[key] = r
      }
    }

  var p = pull.apply(pull, this._commands)

  this._commands = []

  return p
}

mixin(pull)

mixin({
  fork: require('pull-fork'),
  pair: require('pull-pair'),
  chain: function () {
    if (!(this instanceof icebreaker)) {
      var i = Object.create(icebreaker.prototype);
      i._chain = true
      icebreaker.apply(i, [].slice.call(arguments));
      return i
    }

    this._chain = true
    init.apply(this, [].slice.call(arguments))
    return this
  },
  params: function () {
    return icebreaker
      .chain()
      .values([].slice.call(arguments))
      .map(function (arg) {
        if (!isArray(arg)) return [arg]
        return arg
      })
      .flatten()
      .pull()
  },
  cleanup: function (func) {
    return function (read) {
      var ended
      return function (abort, callback) {
        read(abort, function next(end, data) {
          if (ended) return
          if (end) {
            func(end)
            return callback(ended = end)
          }
          callback(end, data)
        })
      }
    }
  }
})

module.exports = icebreaker

},{"inherits":2,"isarray":3,"pull-fork":4,"pull-pair":5,"pull-stream":6}],2:[function(require,module,exports){
if (typeof Object.create === 'function') {
  // implementation from standard node.js 'util' module
  module.exports = function inherits(ctor, superCtor) {
    ctor.super_ = superCtor
    ctor.prototype = Object.create(superCtor.prototype, {
      constructor: {
        value: ctor,
        enumerable: false,
        writable: true,
        configurable: true
      }
    });
  };
} else {
  // old school shim for old browsers
  module.exports = function inherits(ctor, superCtor) {
    ctor.super_ = superCtor
    var TempCtor = function () {}
    TempCtor.prototype = superCtor.prototype
    ctor.prototype = new TempCtor()
    ctor.prototype.constructor = ctor
  }
}

},{}],3:[function(require,module,exports){
module.exports = Array.isArray || function (arr) {
  return Object.prototype.toString.call(arr) == '[object Array]';
};

},{}],4:[function(require,module,exports){
 'use strict';

//split one stream into two.
//if the stream ends, end both streams.
//if a reader stream aborts,
//continue to write to the other stream.

module.exports = function (sinks, select, create) {
  if('function' === typeof sinks) {
    create = select
    select = sinks
    sinks = []
  }

  var running = 0
  var cbs     = new Array(sinks.length)
  var aborted = new Array(sinks.length)
  var open = false, ended, j, data, read, reading

  function init (key, reader) {
    running ++
    reader(function (abort, cb) {
      if(abort) {
        aborted[key] = abort;
        --running
        //cbs[key] = cb
        //if all sinks have aborted, abort the sink.
        if(j === key) j = null

        pull(running ? null : abort)
        if(cb) cb(abort)
        //continue, incase we have already read something
        //for this stream. might need to drop that.
        return
      }

      if(j === key) {
        var _j = j; j = null
        if(aborted[key]) return
        cb(null, data)
      }
      else if(ended) {
        return cb(ended)
      }
      else {
        cbs[key] = cb
      }
      pull()
    })
  }

  for(var k in sinks)
    init(k, sinks[k])

  function endAll () {
    for(var k in cbs) {
      if(cbs[k]) {
        var cb = cbs[k]
        cbs[k] = null
        cb (ended)
      }
    }
  }

  function pull (abort) {
    if(reading || !read || j != null) return
    reading = true
    read(abort, function (end, _data) {
      reading = false
      var _j
      if(end) {
        ended = end
        return endAll()
      }
      else
        _j = select(_data, sinks)

      if(aborted[_j])
        return pull()

      if(!sinks[_j]) {
        //edgecase: if select returns a new stream
        //          but user did not provide create?
        sinks[_j] = create(_j, sinks)
        //init will pass the sink read,
        //which will then grab data.
        //so we don't need to be in this callback anymore.
        j = _j
        data = _data
        return init(_j, sinks[_j])
      }

      if(cbs[_j]) {
        var cb = cbs[_j]
        cbs[_j] = null
        cb(null, _data)
      } else {
        j = _j; data = _data
      }
    })
  }

  function reader (_read) {
    read = _read; pull()
  }

  reader.add = function (key, sink) {
    sinks[key] = sink
    init(key, sink)
  }

  return reader
}

},{}],5:[function(require,module,exports){
//a pair of pull streams where one drains from the other
module.exports = function () {
  var _read, waiting
  function sink (read) {
    if('function' !== typeof read)
      throw new Error('read must be function')
    _read = read
    if(waiting) {
      var _waiting = waiting
      waiting = null
      _read.apply(null, _waiting)
    }
  }
  function source (abort, cb) {
    if(_read)
      _read(abort, cb)
    else
      waiting = [abort, cb]
  }

  return {
    source: source, sink: sink
  }
}


},{}],6:[function(require,module,exports){
var sources  = require('./sources')
var sinks    = require('./sinks')
var throughs = require('./throughs')

exports = module.exports = require('./pull')

for(var k in sources)
  exports[k] = sources[k]

for(var k in throughs)
  exports[k] = throughs[k]

for(var k in sinks)
  exports[k] = sinks[k]


},{"./pull":7,"./sinks":8,"./sources":9,"./throughs":10}],7:[function(require,module,exports){
function isFunction (fun) {
  return 'function' === typeof fun
}

//check if this stream is either a sink or a through.
function isReader (fun) {
  return isFunction(fun) && (fun.length === 1)
}

module.exports = function pull () {
  var args = [].slice.call(arguments)

  if(isReader(args[0]))
    return function (read) {
      args.unshift(read)
      return pull.apply(null, args)
    }

  var read = args.shift()

  //if the first function is a duplex stream,
  //pipe from the source.
  if(read && isFunction(read.source))
    read = read.source

  function next () {
    var s = args.shift()

    if(null == s)
      return next()

    if(isFunction(s)) return s

    return function (read) {
      s.sink(read)
      //this supports pipeing through a duplex stream
      //pull(a, b, a) "telephone style".
      //if this stream is in the a (first & last position)
      //s.source will have already been used, but this should never be called
      //so that is okay.
      return s.source
    }
  }

  while(args.length)
    read = next() (read)

  return read
}


},{}],8:[function(require,module,exports){
'use strict'

function id (item) { return item }

function prop (key) {
  return (
    'string' == typeof key
    ? function (data) { return data[key] }
    : key && 'object' === typeof key && 'function' === typeof key.exec //regexp
    ? function (data) { var v = map.exec(data); return v && v[0] }
    : key || id
  )
}


var drain = exports.drain = function (op, done) {

  return function (read) {

    //this function is much simpler to write if you
    //just use recursion, but by using a while loop
    //we do not blow the stack if the stream happens to be sync.
    ;(function next() {
      var loop = true, cbed = false
      while(loop) {
        cbed = false
        read(null, function (end, data) {
          cbed = true
          if(end) {
            loop = false
            if(done) done(end === true ? null : end)
            else if(end && end !== true)
              throw end
          }
          else if(op && false === op(data)) {
            loop = false
            read(true, done || function () {})
          }
          else if(!loop){
            next()
          }
        })
        if(!cbed) {
          loop = false
          return
        }
      }
    })()

  }
}

var onEnd = exports.onEnd = function (done) {
  return drain(null, done)
}

var log = exports.log = function (done) {
  return drain(function (data) {
    console.log(data)
  }, done)
}

var find =
exports.find = function (test, cb) {
  var ended = false
  if(!cb)
    cb = test, test = id
  else
    test = prop(test) || id

  return drain(function (data) {
    if(test(data)) {
      ended = true
      cb(null, data)
    return false
    }
  }, function (err) {
    if(ended) return //already called back
    cb(err === true ? null : err, null)
  })
}

var reduce = exports.reduce = function (reduce, acc, cb) {

  return drain(function (data) {
    acc = reduce(acc, data)
  }, function (err) {
    cb(err, acc)
  })

}

var collect = exports.collect =
function (cb) {
  return reduce(function (arr, item) {
    arr.push(item)
    return arr
  }, [], cb)
}

var concat = exports.concat =
function (cb) {
  return reduce(function (a, b) {
    return a + b
  }, '', cb)
}


},{}],9:[function(require,module,exports){

var keys = exports.keys =
function (object) {
  return values(Object.keys(object))
}

function abortCb(cb, abort, onAbort) {
  cb(abort)
  onAbort && onAbort(abort === true ? null: abort)
  return
}

var once = exports.once =
function (value, onAbort) {
  return function (abort, cb) {
    if(abort)
      return abortCb(cb, abort, onAbort)
    if(value != null) {
      var _value = value; value = null
      cb(null, _value)
    } else
      cb(true)
  }
}

var values = exports.values = exports.readArray =
function (array, onAbort) {
  if(!array)
    return function (abort, cb) {
      if(abort) return abortCb(cb, abort, onAbort)
      return cb(true)
    }
  if(!Array.isArray(array))
    array = Object.keys(array).map(function (k) {
      return array[k]
    })
  var i = 0
  return function (abort, cb) {
    if(abort)
      return abortCb(cb, abort, onAbort)
    cb(i >= array.length || null, array[i++])
  }
}


var count = exports.count =
function (max) {
  var i = 0; max = max || Infinity
  return function (end, cb) {
    if(end) return cb && cb(end)
    if(i > max)
      return cb(true)
    cb(null, i++)
  }
}

var infinite = exports.infinite =
function (generate) {
  generate = generate || Math.random
  return function (end, cb) {
    if(end) return cb && cb(end)
    return cb(null, generate())
  }
}

//a stream that ends immediately.
var empty = exports.empty = function () {
  return function (abort, cb) {
    cb(true)
  }
}

//a stream that errors immediately.
var error = exports.error = function (err) {
  return function (abort, cb) {
    cb(err)
  }
}


},{}],10:[function(require,module,exports){
'use strict';

function id (item) { return item }

function prop (key) {
  return (
    'string' == typeof key
    ? function (data) { return data[key] }
    : 'object' === typeof key && 'function' === typeof key.exec //regexp
    ? function (data) { var v = map.exec(data); return v && v[0] }
    : key
  )
}

function tester (test) {
  return (
    'object' === typeof test && 'function' === typeof test.test //regexp
    ? function (data) { return test.test(data) }
    : prop (test) || id
  )
}

var sources = require('./sources')
var sinks = require('./sinks')

var map = exports.map =
function (map) {
  if(!map) return id
  map = prop(map)
  return function (read) {
    return function (abort, cb) {
      read(abort, function (end, data) {
        try {
        data = !end ? map(data) : null
        } catch (err) {
          return read(err, function () {
            return cb(err)
          })
        }
        cb(end, data)
      })
    }
  }
}

var asyncMap = exports.asyncMap =
function (map) {
  if(!map) return id //when read is passed, pass it on.
  return function (read) {
    return function (end, cb) {
      if(end) return read(end, cb) //abort
      read(null, function (end, data) {
        if(end) return cb(end, data)
        map(data, cb)
      })
    }
  }
}

var filter = exports.filter =
function (test) {
  //regexp
  test = tester(test)
  return function (read) {
    return function next (end, cb) {
      var sync, loop = true
      while(loop) {
        loop = false
        sync = true
        read(end, function (end, data) {
          if(!end && !test(data))
            return sync ? loop = true : next(end, cb)
          cb(end, data)
        })
        sync = false
      }
    }
  }
}

var filterNot = exports.filterNot =
function (test) {
  test = tester(test)
  return filter(function (data) { return !test(data) })
}

//a pass through stream that doesn't change the value.
var through = exports.through =
function (op, onEnd) {
  var a = false

  function once (abort) {
    if(a || !onEnd) return
    a = true
    onEnd(abort === true ? null : abort)
  }

  return function (read) {
    return function (end, cb) {
      if(end) once(end)
      return read(end, function (end, data) {
        if(!end) op && op(data)
        else once(end)
        cb(end, data)
      })
    }
  }
}

//read a number of items and then stop.
var take = exports.take =
function (test, opts) {
  opts = opts || {}
  var last = opts.last || false // whether the first item for which !test(item) should still pass
  var ended = false
  if('number' === typeof test) {
    last = true
    var n = test; test = function () {
      return --n
    }
  }

  return function (read) {

    function terminate (cb) {
      read(true, function (err) {
        last = false; cb(err || true)
      })
    }

    return function (end, cb) {
      if(ended)            last ? terminate(cb) : cb(ended)
      else if(ended = end) read(ended, cb)
      else
        read(null, function (end, data) {
          if(ended = ended || end) {
            //last ? terminate(cb) :
            cb(ended)
          }
          else if(!test(data)) {
            ended = true
            last ? cb(null, data) : terminate(cb)
          }
          else
            cb(null, data)
        })
    }
  }
}

//drop items you have already seen.
var unique = exports.unique = function (field, invert) {
  field = prop(field) || id
  var seen = {}
  return filter(function (data) {
    var key = field(data)
    if(seen[key]) return !!invert //false, by default
    else seen[key] = true
    return !invert //true by default
  })
}

//passes an item through when you see it for the second time.
var nonUnique = exports.nonUnique = function (field) {
  return unique(field, true)
}

//convert a stream of arrays or streams into just a stream.
var flatten = exports.flatten = function () {
  return function (read) {
    var _read
    return function (abort, cb) {
      if (abort) { //abort the current stream, and then stream of streams.
        _read ? _read(abort, function(err) {
          read(err || abort, cb)
        }) : read(abort, cb)
      }
      else if(_read) nextChunk()
      else nextStream()

      function nextChunk () {
        _read(null, function (err, data) {
          if (err === true) nextStream()
          else if (err) {
            read(true, function(abortErr) {
              // TODO: what do we do with the abortErr?
              cb(err)
            })
          }
          else cb(null, data)
        })
      }
      function nextStream () {
        _read = null
        read(null, function (end, stream) {
          if(end)
            return cb(end)
          if(Array.isArray(stream) || stream && 'object' === typeof stream)
            stream = sources.values(stream)
          else if('function' != typeof stream)
            throw new Error('expected stream of streams')
          _read = stream
          nextChunk()
        })
      }
    }
  }
}


},{"./sinks":8,"./sources":9}]},{},[1])(1)
});
