# promise-dequeue [![NPM Version](https://badge.fury.io/js/promise-dequeue.png)](https://www.npmjs.com/package/promise-dequeue)

This is fork of [promise-queue](https://github.com/promise-queue/promise-queue), promise-based queue. Main difference from original project is that Javascript array replaced by double-ended queue. It increases perfomance on highload queues, this [test](https://repl.it/@Infl1ght/promise-queque-test) shows difference with big amount of queued promises. Look at using this package instead of the original, if performance is critical for you.

## Installation

`promise-dequeue` can be installed using `npm`:

```
npm install promise-dequeue
```

## Interface

 - `new Queue(Number maxConcurrent, Number maxQueued): Queue`
 - `Queue#add(Function generator): Promise` - adds function argument that generates a promise to the queue
 - `Queue#getQueueLength(): Number` - returns current length of buffer(added but not started promise generators) `it <= maxQueued`
 - `Queue#getPendingLength(): Number` - returns number of pending(concurrently running) promises `it <= maxConcurrent`

## Example

### Configure queue

By default `Queue` tries to use global Promises, but you can specify your own promises.

```js
Queue.configure(require('vow').Promise);
```

Or use old-style promises approach:

```js
Queue.configure(function (handler) {
    var dfd = $.Deferred();
    try {
        handler(dfd.resolve, dfd.reject, dfd.notify);
    } catch (e) {
        dfd.reject(e);
    }
    return dfd.promise();
});
```

### Queue one by one example

```js
var maxConcurrent = 1;
var maxQueue = Infinity;
var queue = new Queue(maxConcurrent, maxQueue);

app.get('/version/:user/:repo', function (req, res, next) {
    queue.add(function () {
        // Assume that this action is a way too expensive
        // Call of this function will be delayed on second request
        return downloadTarballFromGithub(req.params);
    })
    .then(parseJson('package.json'))
    .then(function (package) {
        res.send(package.version);
    })
    .catch(next);
});
```

### Getting number of pending promises and queue(buffered promises) length

```js
var maxConcurrent = 1;
var maxQueue = 1;
var queue = new Queue(maxConcurrent, maxQueue);

queue.add(function () {
    queue.getQueueLength() === 0;
    queue.getPendingLength() === 1;
    return somePromise();
});

queue.add(function () {
    queue.getQueueLength() === 0;
    queue.getPendingLength() === 0;
    return somePromise();
});

queue.getQueueLength() === 1;
queue.getPendingLength() === 1;
```

[Live example](http://jsfiddle.net/RVuEU/1/)
