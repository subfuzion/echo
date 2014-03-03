require=(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);throw new Error("Cannot find module '"+o+"'")}var f=n[o]={exports:{}};t[o][0].call(f.exports,function(e){var n=t[o][1][e];return s(n?n:e)},f,f.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
var EchoResponse = require('./models/EchoResponse');


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


},{"./models/EchoResponse":4}],"CNGsbw":[function(require,module,exports){
module.exports = {
  EchoClient: require('./echoclient')
};

},{"./echoclient":1}],"echo":[function(require,module,exports){
module.exports=require('CNGsbw');
},{}],4:[function(require,module,exports){
var EchoResponse = Backbone.Model.extend({
  defaults: {
    status: 'unknown',
    responseTime: new Date().getTime(),
    responseType: 'message',
    messages: []
  },

  toDisplayString: function() {
    // if not a message response (such as a history response),
    // then only display the response time
    return this.responseType == 'message'
      ? this.messages[0] + ', ' + this.responseTime + 'ms'
      : this.responseTime + 'ms';
  }
});
},{}]},{},[])
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZ2VuZXJhdGVkLmpzIiwic291cmNlcyI6WyIvVXNlcnMvdG9ueS9wcm9qZWN0cy9HaXRIdWIvZWNoby9lY2hvL25vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCIvVXNlcnMvdG9ueS9wcm9qZWN0cy9HaXRIdWIvZWNoby9lY2hvL2NsaWVudC9zY3JpcHRzL2VjaG9jbGllbnQuanMiLCIvVXNlcnMvdG9ueS9wcm9qZWN0cy9HaXRIdWIvZWNoby9lY2hvL2NsaWVudC9zY3JpcHRzL21haW4uanMiLCIvVXNlcnMvdG9ueS9wcm9qZWN0cy9HaXRIdWIvZWNoby9lY2hvL2NsaWVudC9zY3JpcHRzL21vZGVscy9FY2hvUmVzcG9uc2UuanMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7QUNBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2xJQTtBQUNBO0FBQ0E7QUFDQTs7OztBQ0hBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBIiwic291cmNlc0NvbnRlbnQiOlsiKGZ1bmN0aW9uIGUodCxuLHIpe2Z1bmN0aW9uIHMobyx1KXtpZighbltvXSl7aWYoIXRbb10pe3ZhciBhPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7aWYoIXUmJmEpcmV0dXJuIGEobywhMCk7aWYoaSlyZXR1cm4gaShvLCEwKTt0aHJvdyBuZXcgRXJyb3IoXCJDYW5ub3QgZmluZCBtb2R1bGUgJ1wiK28rXCInXCIpfXZhciBmPW5bb109e2V4cG9ydHM6e319O3Rbb11bMF0uY2FsbChmLmV4cG9ydHMsZnVuY3Rpb24oZSl7dmFyIG49dFtvXVsxXVtlXTtyZXR1cm4gcyhuP246ZSl9LGYsZi5leHBvcnRzLGUsdCxuLHIpfXJldHVybiBuW29dLmV4cG9ydHN9dmFyIGk9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtmb3IodmFyIG89MDtvPHIubGVuZ3RoO28rKylzKHJbb10pO3JldHVybiBzfSkiLCJ2YXIgRWNob1Jlc3BvbnNlID0gcmVxdWlyZSgnLi9tb2RlbHMvRWNob1Jlc3BvbnNlJyk7XG5cblxuLyoqXG4gKiBBIGNsaWVudCBmb3IgdGhlIGVjaG8uaW8gc2VydmVyXG4gKiBAY29uc3RydWN0b3JcbiAqL1xudmFyIEVjaG9DbGllbnQgPSBtb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uICgpIHtcbiAgdGhpcy51cmkgPSBudWxsO1xuICB0aGlzLndzID0gbnVsbDtcbiAgdGhpcy5sYXN0U2VudFRpbWVzdGFtcCA9IG51bGw7XG4gIHRoaXMubGFzdFJlY2VpdmVkVGltZXN0YW1wID0gbnVsbDtcbiAgdGhpcy5jYWNoZSA9IG51bGw7XG5cbiAgLy8gaGFuZGxlcnNcbiAgdGhpcy5vbm9wZW4gPSBudWxsO1xuICB0aGlzLm9uY2xvc2UgPSBudWxsO1xuICB0aGlzLm9uZXJyb3IgPSBudWxsO1xuICB0aGlzLm9ubWVzc2FnZSA9IG51bGw7XG4gIHRoaXMub25oaXN0b3J5ID0gbnVsbDtcbn07XG5cblxuRWNob0NsaWVudC5wcm90b3R5cGUub3BlbiA9IGZ1bmN0aW9uKHVyaSkge1xuICB2YXIgc2VsZiA9IHRoaXM7XG5cbiAgaWYgKHRoaXMuaXNPcGVuKCkpIHtcbiAgICBjb25zb2xlLmxvZygnYWxyZWFkeSBvcGVuIG9uIHVyaSAnICsgdGhpcy51cmkpO1xuICAgIHJldHVybjtcbiAgfVxuXG4gIHRoaXMudXJpID0gdXJpO1xuICB0aGlzLndzID0gbmV3IFdlYlNvY2tldCh1cmkpO1xuXG4gIGZ1bmN0aW9uIGNhbGxIYW5kbGVyKGV2ZW50KSB7XG4gICAgdmFyIGhhbmRsZXIgPSBzZWxmWydvbicgKyBldmVudF07XG4gICAgaWYgKHR5cGVvZiBoYW5kbGVyID09ICdmdW5jdGlvbicpIHtcbiAgICAgIGhhbmRsZXIuYXBwbHkoaGFuZGxlciwgW10uc2xpY2UuY2FsbChhcmd1bWVudHMsIDEpKTtcbiAgICB9XG4gIH1cblxuICB0aGlzLndzLm9ub3BlbiA9IGZ1bmN0aW9uICgpIHtcbiAgICBjYWxsSGFuZGxlcignb3BlbicpO1xuICB9O1xuXG4gIHRoaXMud3Mub25jbG9zZSA9IGZ1bmN0aW9uKCkge1xuICAgIGNhbGxIYW5kbGVyKCdjbG9zZScpO1xuICB9O1xuXG4gIHRoaXMud3Mub25tZXNzYWdlID0gZnVuY3Rpb24gKG1lc3NhZ2VFdmVudCkge1xuICAgIHNlbGYubGFzdFJlY2VpdmVkVGltZXN0YW1wID0gbmV3IERhdGUoKS5nZXRUaW1lKCk7XG5cbiAgICB2YXIgbWVzc2FnZSA9IEpTT04ucGFyc2UobWVzc2FnZUV2ZW50LmRhdGEpO1xuXG4gICAgbWVzc2FnZS5yZXNwb25zZVRpbWUgPSBzZWxmLmxhc3RSZWNlaXZlZFRpbWVzdGFtcCAtIHNlbGYubGFzdFNlbnRUaW1lc3RhbXA7XG5cbiAgICBpZiAobWVzc2FnZS5tZXNzYWdlcy5sZW5ndGggPiAxKSB7XG4gICAgICAvLyB0aGlzIGlzIGEgaGlzdG9yeSBtZXNzYWdlXG4gICAgICAvLyBjYWNoZSBpdCBpbiBjYXNlIHRoZSB1c2VyIHdhbnRzIHRvIGZpbHRlclxuICAgICAgLy8gKG5vIG5lZWQgZm9yIGFub3RoZXIgcm91bmQgdHJpcClcbiAgICAgIHNlbGYuY2FjaGUgPSBtZXNzYWdlO1xuICAgICAgY2FsbEhhbmRsZXIoJ2hpc3RvcnknLCBtZXNzYWdlKTtcbiAgICB9IGVsc2Uge1xuICAgICAgLy8gY2FjaGUgaXMgbm93IHN0YWxlLCBzbyBqdXN0IGNsZWFyIGl0XG4gICAgICBzZWxmLmNhY2hlID0gbnVsbDtcbiAgICAgIGNhbGxIYW5kbGVyKCdtZXNzYWdlJywgbWVzc2FnZSk7XG4gICAgfVxuICB9O1xuXG4gIHRoaXMud3Mub25lcnJvciA9IGZ1bmN0aW9uIChlcnIpIHtcbiAgICBjYWxsSGFuZGxlcignZXJyb3InLCBlcnIpO1xuICB9O1xufTtcblxuXG5FY2hvQ2xpZW50LnByb3RvdHlwZS5jbG9zZSA9IGZ1bmN0aW9uKCkge1xuICBpZiAodGhpcy5pc0Nsb3NlZCgpKSB7XG4gICAgY29uc29sZS5sb2coJ2FscmVhZHkgY2xvc2VkJyk7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgdGhpcy53cy5jbG9zZSgpO1xuICB0aGlzLndzID0gbnVsbDtcbiAgdGhpcy51cmkgPSBudWxsO1xufTtcblxuXG5FY2hvQ2xpZW50LnByb3RvdHlwZS5pc09wZW4gPSBmdW5jdGlvbigpIHtcbiAgcmV0dXJuIHRoaXMud3MgaW5zdGFuY2VvZiBXZWJTb2NrZXQ7XG59O1xuXG5cbkVjaG9DbGllbnQucHJvdG90eXBlLmlzQ2xvc2VkID0gZnVuY3Rpb24oKSB7XG4gIHJldHVybiAhdGhpcy5pc09wZW4oKTtcbn07XG5cblxuRWNob0NsaWVudC5wcm90b3R5cGUuc2VuZCA9IGZ1bmN0aW9uIChtZXNzYWdlKSB7XG4gIGlmICghbWVzc2FnZSB8fCAhdGhpcy5pc09wZW4oKSkgcmV0dXJuO1xuICB0aGlzLmxhc3RTZW50VGltZXN0YW1wID0gbmV3IERhdGUoKS5nZXRUaW1lKCk7XG4gIHRoaXMud3Muc2VuZChtZXNzYWdlKTtcbn07XG5cblxuRWNob0NsaWVudC5wcm90b3R5cGUuc2VuZEhpc3RvcnlDb21tYW5kID0gZnVuY3Rpb24gKCkge1xuICB0aGlzLnNlbmQoJ1tISVNUT1JZXScpO1xufTtcblxuXG5FY2hvQ2xpZW50LnByb3RvdHlwZS5oaXN0b3J5RmlsdGVyID0gZnVuY3Rpb24ocGF0dGVybikge1xuICBpZiAoIXRoaXMuY2FjaGUpIHJldHVybiBbXTtcbiAgaWYgKCFwYXR0ZXJuKSByZXR1cm4gdGhpcy5jYWNoZTtcblxuICB2YXIgcmVnZXggPSBuZXcgUmVnRXhwKHBhdHRlcm4sIFwiaVwiKTtcbiAgdmFyIGZpbHRlcmVkID0gXy5maWx0ZXIodGhpcy5jYWNoZS5tZXNzYWdlcywgZnVuY3Rpb24obWVzc2FnZSkge1xuICAgIHJldHVybiByZWdleC50ZXN0KG1lc3NhZ2UpO1xuICB9KTtcblxuICByZXR1cm4ge1xuICAgIHN0YXR1czogdGhpcy5jYWNoZS5zdGF0dXMsXG4gICAgcmVzcG9uc2VUaW1lOiB0aGlzLmNhY2hlLnJlc3BvbnNlVGltZSxcbiAgICBtZXNzYWdlczogZmlsdGVyZWRcbiAgfVxufTtcblxuXG5FY2hvQ2xpZW50LnByb3RvdHlwZS52YWxpZGF0ZVBvcnQgPSBmdW5jdGlvbihwb3J0KSB7XG4gIHJldHVybiBwb3J0ID49IDEwMjQgJiYgcG9ydCA8IDY1NTM1O1xufTtcblxuIiwibW9kdWxlLmV4cG9ydHMgPSB7XG4gIEVjaG9DbGllbnQ6IHJlcXVpcmUoJy4vZWNob2NsaWVudCcpXG59O1xuIiwidmFyIEVjaG9SZXNwb25zZSA9IEJhY2tib25lLk1vZGVsLmV4dGVuZCh7XG4gIGRlZmF1bHRzOiB7XG4gICAgc3RhdHVzOiAndW5rbm93bicsXG4gICAgcmVzcG9uc2VUaW1lOiBuZXcgRGF0ZSgpLmdldFRpbWUoKSxcbiAgICByZXNwb25zZVR5cGU6ICdtZXNzYWdlJyxcbiAgICBtZXNzYWdlczogW11cbiAgfSxcblxuICB0b0Rpc3BsYXlTdHJpbmc6IGZ1bmN0aW9uKCkge1xuICAgIC8vIGlmIG5vdCBhIG1lc3NhZ2UgcmVzcG9uc2UgKHN1Y2ggYXMgYSBoaXN0b3J5IHJlc3BvbnNlKSxcbiAgICAvLyB0aGVuIG9ubHkgZGlzcGxheSB0aGUgcmVzcG9uc2UgdGltZVxuICAgIHJldHVybiB0aGlzLnJlc3BvbnNlVHlwZSA9PSAnbWVzc2FnZSdcbiAgICAgID8gdGhpcy5tZXNzYWdlc1swXSArICcsICcgKyB0aGlzLnJlc3BvbnNlVGltZSArICdtcydcbiAgICAgIDogdGhpcy5yZXNwb25zZVRpbWUgKyAnbXMnO1xuICB9XG59KTsiXX0=
