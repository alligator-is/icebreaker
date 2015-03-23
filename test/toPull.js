var _ = require('../')
var fs = require('fs')
var test = require('tape')
var stream = require('stream')
var createReadStream = fs.createReadStream.bind(null, __dirname + '/../package.json')
var createWriteStream = fs.createWriteStream.bind(null, __dirname + '/.test')

function count(n) {
  return _(
    _.count(n),
    _.map(function (n) {
      return ''+n + '\n'
    })
  )
}

test('fs.createReadStream to source', function (t) {
  var f = createReadStream()
  _(
    _.source(f),
    _.drain(function (item) {
        t.equal(typeof item, 'object');
    },
    function (err) {
      t.notOk(err)
      t.end()
    })
  )
})

test('fs.createReadStream to source with an error', function (t) {
  var f = createReadStream()
  _(
    _.source(f), _.asyncMap(function (i, cb) {
      t.equal(typeof i, 'object')
      cb('test')
    }),
    _.drain(function (item) {}, function (err) {
      console.log('error:', err)
      t.equal(err, 'test')
      t.end()
    })
  )
})

test('fs.createWriteStream to sink', function (t) {
  t.plan(1)
  var f = createWriteStream()
  _(
    count(10),
    _.sink(f, function (end) {
      t.notOk(end)
    })
  )
})

test('fs.createWriteStream to sink with an error', function (t) {
  var f = createWriteStream()
  t.plan(1)
  _(
    count(10),
    _.asyncMap(function (i, cb) {
      cb('error')
    }),
    _.sink(f, function (end) {
      t.equal(end, 'error', 'error')
    })
  )
})

if(stream.PassThrough){
  test('stream.PassThrough to pair', function (t) {
    t.plan(12)
    _(
      count(10),
      _.pair(stream.PassThrough({
        objectMode: true
      })),
      _.drain(function (data) {
        t.equal(typeof data ,'string')
      },
      function (err) {
        t.notOk(err)
      })
    )
  })

  test('stream.PassThrough to through', function (t) {
    t.plan(12)
    _(
      count(10),
      _.through(stream.PassThrough({
        objectMode: true
      })),
      _.drain(function (data) {
        t.equal(typeof data ,'string')
      },
      function (end) {
        t.notOk(end)
      })
    )
  })
}
