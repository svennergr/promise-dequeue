/* global define, Promise */
(function(root, factory) {
    "use strict";
    if (
        typeof module === "object" &&
        module.exports &&
        typeof require === "function"
    ) {
        // CommonJS
        module.exports = factory();
    } else if (typeof define === "function" && typeof define.amd === "object") {
        // AMD. Register as an anonymous module.
        define(factory);
    } else {
        // Browser globals
        root.Queue = factory();
    }
})(this, function() {
    "use strict";
    const Dequeue = require("dequeue");
    const TimeoutError = require("common-errors").TimeoutError;
    /**
     * @return {Object}
     */
    var LocalPromise =
        typeof Promise !== "undefined"
            ? Promise
            : function() {
                  return {
                      then: function() {
                          throw new Error("Queue.configure() before use Queue");
                      }
                  };
              };

    var noop = function() {};

    /**
     * @param {*} value
     * @returns {LocalPromise}
     */
    var resolveWith = function(value) {
        if (value && typeof value.then === "function") {
            return value;
        }

        return new LocalPromise(function(resolve) {
            resolve(value);
        });
    };

    /**
     * It limits concurrently executed promises
     *
     * @param {Number} [maxPendingPromises=Infinity] max number of concurrently executed promises
     * @param {Number} [maxQueuedPromises=Infinity]  max number of queued promises
     * @constructor
     *
     * @example
     *
     * var queue = new Queue(1);
     *
     * queue.add(function () {
     *     // resolve of this promise will resume next request
     *     return downloadTarballFromGithub(url, file);
     * })
     * .then(function (file) {
     *     doStuffWith(file);
     * });
     *
     * queue.add(function () {
     *     return downloadTarballFromGithub(url, file);
     * })
     * // This request will be paused
     * .then(function (file) {
     *     doStuffWith(file);
     * });
     */
    function Queue(maxPendingPromises, maxQueuedPromises, options) {
        this.options = options = options || {};
        this.pendingPromises = 0;
        this.maxPendingPromises =
            typeof maxPendingPromises !== "undefined"
                ? maxPendingPromises
                : Infinity;
        this.maxQueuedPromises =
            typeof maxQueuedPromises !== "undefined"
                ? maxQueuedPromises
                : Infinity;
        this.queue = new Dequeue();
    }

    /**
     * Defines promise promiseFactory
     * @param {Function} GlobalPromise
     */
    Queue.configure = function(GlobalPromise) {
        LocalPromise = GlobalPromise;
    };

    /**
     * @param {Function} promiseGenerator
     * @return {LocalPromise}
     */
    Queue.prototype.add = function(promiseGenerator) {
        var self = this;
        return new LocalPromise(function(resolve, reject, notify) {
            // Do not queue too much promises
            if (self.queue.length >= self.maxQueuedPromises) {
                reject(new Error("Queue limit reached"));
                return;
            }

            let timeoutHandle, node;
            if (self.options.itemTimeout) {
                timeoutHandle = setTimeout(() => {
                    if (node.working === false) {
                        node.remove();
                        // jump this node
                        node.next = node.next.next;
                        self.queue.length -= 1;
                    }

                    reject(new TimeoutError(`${self.options.itemTimeout}ms`));
                }, self.options.itemTimeout);
            }
            // Add to queue
            node = self.queue.push({
                promiseGenerator: promiseGenerator,
                resolve: resolve,
                reject: reject,
                notify: notify || noop,
                timeoutHandle: timeoutHandle,
                working: false
            }).head.next;

            self.dequeue();
        });
    };

    /**
     * Number of simultaneously running promises (which are resolving)
     *
     * @return {number}
     */
    Queue.prototype.getPendingLength = function() {
        return this.pendingPromises;
    };

    /**
     * Number of queued promises (which are waiting)
     *
     * @return {number}
     */
    Queue.prototype.getQueueLength = function() {
        return this.queue.length;
    };

    /**
     * @param {boolean} force if the next job should run even if there are more pending promises than there should be
     *
     * @returns {boolean} true if first item removed from queue
     */
    Queue.prototype.dequeue = function(force = false) {
        var self = this;
        if (force == false && this.pendingPromises >= this.maxPendingPromises) {
            return false;
        }

        // Remove from queue
        var item = this.queue.shift();
        if (!item) {
            if (this.options.onEmpty) {
                this.options.onEmpty();
            }
            return false;
        }

        try {
            this.pendingPromises++;

            item.working = true;
            // no need to focus on timeout anymore
            clearTimeout(item.timeoutHandle);

            resolveWith(item.promiseGenerator())
                // Forward all stuff
                .then(
                    function(value) {
                        // It is not pending now
                        self.pendingPromises--;
                        // It should pass values
                        item.resolve(value);
                        self.dequeue();
                    },
                    function(err) {
                        // It is not pending now
                        self.pendingPromises--;
                        // It should not mask errors
                        item.reject(err);
                        self.dequeue();
                    },
                    function(message) {
                        // It should pass notifications
                        item.notify(message);
                    }
                );
        } catch (err) {
            self.pendingPromises--;
            item.reject(err);
            self.dequeue();
        }

        return true;
    };

    return Queue;
});
