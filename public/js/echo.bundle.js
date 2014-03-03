require=(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);throw new Error("Cannot find module '"+o+"'")}var f=n[o]={exports:{}};t[o][0].call(f.exports,function(e){var n=t[o][1][e];return s(n?n:e)},f,f.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({"vlfWWr":[function(require,module,exports){
module.exports = {
  EchoClient: require('./echoclient')
};


},{"./echoclient":3}],"echo":[function(require,module,exports){
module.exports=require('vlfWWr');
},{}],3:[function(require,module,exports){
/**
 * A client for the echo.io server
 * @constructor
 */
var EchoClient = module.exports = function () {
  this.uri = null;
  this.ws = null;
  this.lastSentTimestamp = null;
  this.lastReceivedTimestamp = null;
  this.cache = null;

  // handlers
  this.onopen = null;
  this.onclose = null;
  this.onerror = null;
  this.onmessage = null;
  this.onhistory = null;
};


EchoClient.prototype.open = function(uri) {
  var self = this;

  if (this.isOpen()) {
    console.log('already open on uri ' + this.uri);
    return;
  }

  this.uri = uri;
  this.ws = new WebSocket(uri);

  function callHandler(event) {
    var handler = self['on' + event];
    if (typeof handler == 'function') {
      handler.apply(handler, [].slice.call(arguments, 1));
    }
  }

  this.ws.onopen = function () {
    callHandler('open');
  };

  this.ws.onclose = function() {
    callHandler('close');
  };

  this.ws.onmessage = function (messageEvent) {
    self.lastReceivedTimestamp = new Date().getTime();

    var message = JSON.parse(messageEvent.data);

    message.responseTime = self.lastReceivedTimestamp - self.lastSentTimestamp;

    if (message.messages.length > 1) {
      // this is a history message
      // cache it in case the user wants to filter
      // (no need for another round trip)
      self.cache = message;
      callHandler('history', message);
    } else {
      // cache is now stale, so just clear it
      self.cache = null;
      callHandler('message', message);
    }
  };

  this.ws.onerror = function (err) {
    callHandler('error', err);
  };
};


EchoClient.prototype.close = function() {
  if (this.isClosed()) {
    console.log('already closed');
    return;
  }

  this.ws.close();
  this.ws = null;
  this.uri = null;
};


EchoClient.prototype.isOpen = function() {
  return this.ws instanceof WebSocket;
};


EchoClient.prototype.isClosed = function() {
  return !this.isOpen();
};


EchoClient.prototype.send = function (message) {
  if (!message || !this.isOpen()) return;
  this.lastSentTimestamp = new Date().getTime();
  this.ws.send(message);
};


EchoClient.prototype.sendHistoryCommand = function () {
  this.send('[HISTORY]');
};


EchoClient.prototype.historyFilter = function(pattern) {
  if (!this.cache) return [];
  if (!pattern) return this.cache;

  var regex = new RegExp(pattern, "i");
  var filtered = _.filter(this.cache.messages, function(message) {
    return regex.test(message);
  });

  return {
    status: this.cache.status,
    responseTime: this.cache.responseTime,
    messages: filtered
  }
};


EchoClient.prototype.validatePort = function(port) {
  return port >= 1024 && port < 65535;
};


},{}]},{},[])
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZ2VuZXJhdGVkLmpzIiwic291cmNlcyI6WyIvVXNlcnMvdG9ueS9wcm9qZWN0cy9HaXRIdWIvZWNoby9lY2hvL25vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCIvVXNlcnMvdG9ueS9wcm9qZWN0cy9HaXRIdWIvZWNoby9lY2hvL2NsaWVudC9zY3JpcHRzL2VjaG8uanMiLCIvVXNlcnMvdG9ueS9wcm9qZWN0cy9HaXRIdWIvZWNoby9lY2hvL2NsaWVudC9zY3JpcHRzL2VjaG9jbGllbnQuanMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7QUNBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7O0FDSkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSIsInNvdXJjZXNDb250ZW50IjpbIihmdW5jdGlvbiBlKHQsbixyKXtmdW5jdGlvbiBzKG8sdSl7aWYoIW5bb10pe2lmKCF0W29dKXt2YXIgYT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2lmKCF1JiZhKXJldHVybiBhKG8sITApO2lmKGkpcmV0dXJuIGkobywhMCk7dGhyb3cgbmV3IEVycm9yKFwiQ2Fubm90IGZpbmQgbW9kdWxlICdcIitvK1wiJ1wiKX12YXIgZj1uW29dPXtleHBvcnRzOnt9fTt0W29dWzBdLmNhbGwoZi5leHBvcnRzLGZ1bmN0aW9uKGUpe3ZhciBuPXRbb11bMV1bZV07cmV0dXJuIHMobj9uOmUpfSxmLGYuZXhwb3J0cyxlLHQsbixyKX1yZXR1cm4gbltvXS5leHBvcnRzfXZhciBpPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7Zm9yKHZhciBvPTA7bzxyLmxlbmd0aDtvKyspcyhyW29dKTtyZXR1cm4gc30pIiwibW9kdWxlLmV4cG9ydHMgPSB7XG4gIEVjaG9DbGllbnQ6IHJlcXVpcmUoJy4vZWNob2NsaWVudCcpXG59O1xuXG4iLCIvKipcbiAqIEEgY2xpZW50IGZvciB0aGUgZWNoby5pbyBzZXJ2ZXJcbiAqIEBjb25zdHJ1Y3RvclxuICovXG52YXIgRWNob0NsaWVudCA9IG1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gKCkge1xuICB0aGlzLnVyaSA9IG51bGw7XG4gIHRoaXMud3MgPSBudWxsO1xuICB0aGlzLmxhc3RTZW50VGltZXN0YW1wID0gbnVsbDtcbiAgdGhpcy5sYXN0UmVjZWl2ZWRUaW1lc3RhbXAgPSBudWxsO1xuICB0aGlzLmNhY2hlID0gbnVsbDtcblxuICAvLyBoYW5kbGVyc1xuICB0aGlzLm9ub3BlbiA9IG51bGw7XG4gIHRoaXMub25jbG9zZSA9IG51bGw7XG4gIHRoaXMub25lcnJvciA9IG51bGw7XG4gIHRoaXMub25tZXNzYWdlID0gbnVsbDtcbiAgdGhpcy5vbmhpc3RvcnkgPSBudWxsO1xufTtcblxuXG5FY2hvQ2xpZW50LnByb3RvdHlwZS5vcGVuID0gZnVuY3Rpb24odXJpKSB7XG4gIHZhciBzZWxmID0gdGhpcztcblxuICBpZiAodGhpcy5pc09wZW4oKSkge1xuICAgIGNvbnNvbGUubG9nKCdhbHJlYWR5IG9wZW4gb24gdXJpICcgKyB0aGlzLnVyaSk7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgdGhpcy51cmkgPSB1cmk7XG4gIHRoaXMud3MgPSBuZXcgV2ViU29ja2V0KHVyaSk7XG5cbiAgZnVuY3Rpb24gY2FsbEhhbmRsZXIoZXZlbnQpIHtcbiAgICB2YXIgaGFuZGxlciA9IHNlbGZbJ29uJyArIGV2ZW50XTtcbiAgICBpZiAodHlwZW9mIGhhbmRsZXIgPT0gJ2Z1bmN0aW9uJykge1xuICAgICAgaGFuZGxlci5hcHBseShoYW5kbGVyLCBbXS5zbGljZS5jYWxsKGFyZ3VtZW50cywgMSkpO1xuICAgIH1cbiAgfVxuXG4gIHRoaXMud3Mub25vcGVuID0gZnVuY3Rpb24gKCkge1xuICAgIGNhbGxIYW5kbGVyKCdvcGVuJyk7XG4gIH07XG5cbiAgdGhpcy53cy5vbmNsb3NlID0gZnVuY3Rpb24oKSB7XG4gICAgY2FsbEhhbmRsZXIoJ2Nsb3NlJyk7XG4gIH07XG5cbiAgdGhpcy53cy5vbm1lc3NhZ2UgPSBmdW5jdGlvbiAobWVzc2FnZUV2ZW50KSB7XG4gICAgc2VsZi5sYXN0UmVjZWl2ZWRUaW1lc3RhbXAgPSBuZXcgRGF0ZSgpLmdldFRpbWUoKTtcblxuICAgIHZhciBtZXNzYWdlID0gSlNPTi5wYXJzZShtZXNzYWdlRXZlbnQuZGF0YSk7XG5cbiAgICBtZXNzYWdlLnJlc3BvbnNlVGltZSA9IHNlbGYubGFzdFJlY2VpdmVkVGltZXN0YW1wIC0gc2VsZi5sYXN0U2VudFRpbWVzdGFtcDtcblxuICAgIGlmIChtZXNzYWdlLm1lc3NhZ2VzLmxlbmd0aCA+IDEpIHtcbiAgICAgIC8vIHRoaXMgaXMgYSBoaXN0b3J5IG1lc3NhZ2VcbiAgICAgIC8vIGNhY2hlIGl0IGluIGNhc2UgdGhlIHVzZXIgd2FudHMgdG8gZmlsdGVyXG4gICAgICAvLyAobm8gbmVlZCBmb3IgYW5vdGhlciByb3VuZCB0cmlwKVxuICAgICAgc2VsZi5jYWNoZSA9IG1lc3NhZ2U7XG4gICAgICBjYWxsSGFuZGxlcignaGlzdG9yeScsIG1lc3NhZ2UpO1xuICAgIH0gZWxzZSB7XG4gICAgICAvLyBjYWNoZSBpcyBub3cgc3RhbGUsIHNvIGp1c3QgY2xlYXIgaXRcbiAgICAgIHNlbGYuY2FjaGUgPSBudWxsO1xuICAgICAgY2FsbEhhbmRsZXIoJ21lc3NhZ2UnLCBtZXNzYWdlKTtcbiAgICB9XG4gIH07XG5cbiAgdGhpcy53cy5vbmVycm9yID0gZnVuY3Rpb24gKGVycikge1xuICAgIGNhbGxIYW5kbGVyKCdlcnJvcicsIGVycik7XG4gIH07XG59O1xuXG5cbkVjaG9DbGllbnQucHJvdG90eXBlLmNsb3NlID0gZnVuY3Rpb24oKSB7XG4gIGlmICh0aGlzLmlzQ2xvc2VkKCkpIHtcbiAgICBjb25zb2xlLmxvZygnYWxyZWFkeSBjbG9zZWQnKTtcbiAgICByZXR1cm47XG4gIH1cblxuICB0aGlzLndzLmNsb3NlKCk7XG4gIHRoaXMud3MgPSBudWxsO1xuICB0aGlzLnVyaSA9IG51bGw7XG59O1xuXG5cbkVjaG9DbGllbnQucHJvdG90eXBlLmlzT3BlbiA9IGZ1bmN0aW9uKCkge1xuICByZXR1cm4gdGhpcy53cyBpbnN0YW5jZW9mIFdlYlNvY2tldDtcbn07XG5cblxuRWNob0NsaWVudC5wcm90b3R5cGUuaXNDbG9zZWQgPSBmdW5jdGlvbigpIHtcbiAgcmV0dXJuICF0aGlzLmlzT3BlbigpO1xufTtcblxuXG5FY2hvQ2xpZW50LnByb3RvdHlwZS5zZW5kID0gZnVuY3Rpb24gKG1lc3NhZ2UpIHtcbiAgaWYgKCFtZXNzYWdlIHx8ICF0aGlzLmlzT3BlbigpKSByZXR1cm47XG4gIHRoaXMubGFzdFNlbnRUaW1lc3RhbXAgPSBuZXcgRGF0ZSgpLmdldFRpbWUoKTtcbiAgdGhpcy53cy5zZW5kKG1lc3NhZ2UpO1xufTtcblxuXG5FY2hvQ2xpZW50LnByb3RvdHlwZS5zZW5kSGlzdG9yeUNvbW1hbmQgPSBmdW5jdGlvbiAoKSB7XG4gIHRoaXMuc2VuZCgnW0hJU1RPUlldJyk7XG59O1xuXG5cbkVjaG9DbGllbnQucHJvdG90eXBlLmhpc3RvcnlGaWx0ZXIgPSBmdW5jdGlvbihwYXR0ZXJuKSB7XG4gIGlmICghdGhpcy5jYWNoZSkgcmV0dXJuIFtdO1xuICBpZiAoIXBhdHRlcm4pIHJldHVybiB0aGlzLmNhY2hlO1xuXG4gIHZhciByZWdleCA9IG5ldyBSZWdFeHAocGF0dGVybiwgXCJpXCIpO1xuICB2YXIgZmlsdGVyZWQgPSBfLmZpbHRlcih0aGlzLmNhY2hlLm1lc3NhZ2VzLCBmdW5jdGlvbihtZXNzYWdlKSB7XG4gICAgcmV0dXJuIHJlZ2V4LnRlc3QobWVzc2FnZSk7XG4gIH0pO1xuXG4gIHJldHVybiB7XG4gICAgc3RhdHVzOiB0aGlzLmNhY2hlLnN0YXR1cyxcbiAgICByZXNwb25zZVRpbWU6IHRoaXMuY2FjaGUucmVzcG9uc2VUaW1lLFxuICAgIG1lc3NhZ2VzOiBmaWx0ZXJlZFxuICB9XG59O1xuXG5cbkVjaG9DbGllbnQucHJvdG90eXBlLnZhbGlkYXRlUG9ydCA9IGZ1bmN0aW9uKHBvcnQpIHtcbiAgcmV0dXJuIHBvcnQgPj0gMTAyNCAmJiBwb3J0IDwgNjU1MzU7XG59O1xuXG4iXX0=
