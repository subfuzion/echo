require=(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);throw new Error("Cannot find module '"+o+"'")}var f=n[o]={exports:{}};t[o][0].call(f.exports,function(e){var n=t[o][1][e];return s(n?n:e)},f,f.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
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

  function callHandler(event) {
    var handler = self['on' + event];
    if (typeof handler == 'function') {
      handler.apply(handler, [].slice.call(arguments, 1));
    }
  }

  if (this.isOpen()) {
    console.log('error: already open on uri ' + this.uri);
    callHandler('error', 'already open on uri ' + this.uri);
    return;
  }

  if (!this.validatePort) {
    console.log('error: invalid port: ' + this.port);
    callHandler('error', 'invalid port');
    return;
  }

  this.uri = uri;
  this.ws = new WebSocket(uri);

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


},{}],"CNGsbw":[function(require,module,exports){
// models
var App = require('./models/App')
  ;

// views
var ServerControlView = require('./views/ServerControlView')
  , MessagePanelView = require('./views/MessagePanelView')
  ;


var app = new App();

// wire up views

var serverControlView = new ServerControlView({
  model: app,
  el: '#server-control'
});

var messagePanelView = new MessagePanelView({
  model: app,
  el: '#message-panel'
});

module.exports = {
  app: app
};

app.on('message', function(response) {
  console.log('**************** message: ' + response.get('messages')[0]);
});




},{"./models/App":4,"./views/MessagePanelView":6,"./views/ServerControlView":7}],"echo":[function(require,module,exports){
module.exports=require('CNGsbw');
},{}],4:[function(require,module,exports){
var EchoClient = require('./../libs/echoclient')
  , EchoResponse = require('./EchoResponse')
  ;

/**
 * The App model provides a backbone wrapper over EchoClient and server functions
 */
var App = Backbone.Model.extend({
  defaults: {
    host: 'localhost',
    port: 5555,
    serverState: 'stopped'
  },

  initialize: function() {
    this.client = new EchoClient();

    var self = this;

    self.client.onopen = function() {
      console.log('client open');
      self.trigger('open');
    };

    self.client.onclose = function() {
      console.log('client close');
      // release handlers
      self.client.onopen = null;
      self.client.onclose = null;
      self.client.onerror = null;
      self.client.onmessage = null;
      self.client.onhistory = null;

      self.trigger('close');
    };

    self.client.onerror = function(err) {
      console.log('client error', err);
      self.trigger('error', err);
    };

    self.client.onmessage = function(response) {
      console.log(response);
      var er = new EchoResponse(response);
      console.log(er);
      self.trigger('message', new EchoResponse(response));
    };

    self.client.onhistory = function(response) {
      console.log('client history');
      self.trigger('history', new EchoResponse(response));
    };

    // sync up with server status
    this.checkServerStatus();
  },

  validate: function(attrs) {
    if (!this.client.validatePort(attrs.port)) {
      return 'invalid port';
    }
  },

  checkServerStatus: function() {
    var self = this;

    $.getJSON('/api/v1/echoserver/' + this.get('port'), function (result) {
      if (result && result.status == 'error') {
        console.log(result);
        self.trigger('serverError', result.message);
        return;
      }

      if (result && result.status == 'OK' && /started/.test(result.message)) {
        self.set('serverState', 'started');
      } else {
        self.set('serverState', 'stopped');
      }
    });
  },

  startServer: function() {
    if (!this.isValid()) return;
    this.sendServerCommand('start');
  },

  stopServer: function() {
    if (!this.isValid()) return;
    this.sendServerCommand('stop');
  },

  sendServerCommand: function(command) {
    if (!this.isValid()) return;

    this.set('serverError', '');

    var port = this.get('port');
    var self = this;

    $.post('/api/v1/echoserver/' + port + '/' + command, function (result) {
      if (result && result.status == 'error') {
        console.log(result);
        self.trigger('serverError', result.message);
        return;
      }

      console.log('success: ' + result.message);
      self.set('serverState', /started/.test(result.message, "i")
        ? 'started' : 'stopped');
    });
  },

  open: function() {
    var uri = 'ws://' + this.get('host') + ':' + this.get('port');
    console.log('client open: ' + uri);
    this.client.open(uri);
  },

  close: function() {
    console.log('client close');
    this.client.close();
  },

  send: function(message) {
    console.log('client send: ' + message);
    this.client.send(message);
  }
});

module.exports = App;


},{"./../libs/echoclient":1,"./EchoResponse":5}],5:[function(require,module,exports){
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

module.exports = EchoResponse;
},{}],6:[function(require,module,exports){
module.exports = Backbone.View.extend({
  initialize: function() {
    this.render();
    this.listenTo(this.model, 'change:serverState', this.render);
  },

  template: Handlebars.compile($('#message-panel-template').html()),

  render: function() {
    var serverState = this.model.get('serverState');

    var args = {
      hidden: serverState == 'started' ? 'visible' : 'hidden'
    };

    this.$el.html(this.template(args));
    return this;
  }
});

},{}],7:[function(require,module,exports){
module.exports = Backbone.View.extend({
  serverErrorMessage: null,

  initialize: function() {
    var self = this;

    this.render();
    this.listenTo(this.model, 'change:serverState', this.render);
    this.model.on('serverError', function(err) {
      self.serverError = err;
      self.render();
    })
  },

  events: {
    'click #btnserver': 'togglestart'
  },

  template: Handlebars.compile($('#server-control-template').html()),

  render: function() {
    var port = this.model.get('port');
    var serverState = this.model.get('serverState');
    var serverStateText = serverState == 'started'
      ? 'started (port ' + port + ')'
      : serverState;
    var serverError = this.serverError ? ' Error: ' + this.serverError : null;
    var serverErrorClass = serverError ? 'visible' : 'hidden';

    var args = {
      stateClass: serverState,
      serverState: serverStateText,
      serverPort: port,
      inputVisibility: serverState == 'started' ? 'collapse' : 'visible',
      serverCommand: serverState == 'started' ? 'Stop' : 'Start',
      serverErrorClass: serverErrorClass,
      serverError: serverError
    };

    this.$el.html(this.template(args));

    $('#portnumber').focus();

    return this;
  },

  port: function() {
    return $('#portnumber').val();
  },

  togglestart: function() {
    // clear previous error message
    this.serverError = null;
    $('#server-error').html('');

    var port = this.port();
    this.model.set('port', port, { validate: true });
    if (this.model.validationError) {
      $('#portnumber').val('');
      return;
    }

    var command = this.model.get('serverState') == 'started' ? 'stop' : 'start';
    this.model.sendServerCommand(command);
  }
});

},{}]},{},[])
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZ2VuZXJhdGVkLmpzIiwic291cmNlcyI6WyIvVXNlcnMvdG9ueS9wcm9qZWN0cy9HaXRIdWIvZWNoby9lY2hvL25vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCIvVXNlcnMvdG9ueS9wcm9qZWN0cy9HaXRIdWIvZWNoby9lY2hvL2NsaWVudC9zY3JpcHRzL2xpYnMvZWNob2NsaWVudC5qcyIsIi9Vc2Vycy90b255L3Byb2plY3RzL0dpdEh1Yi9lY2hvL2VjaG8vY2xpZW50L3NjcmlwdHMvbWFpbi5qcyIsIi9Vc2Vycy90b255L3Byb2plY3RzL0dpdEh1Yi9lY2hvL2VjaG8vY2xpZW50L3NjcmlwdHMvbW9kZWxzL0FwcC5qcyIsIi9Vc2Vycy90b255L3Byb2plY3RzL0dpdEh1Yi9lY2hvL2VjaG8vY2xpZW50L3NjcmlwdHMvbW9kZWxzL0VjaG9SZXNwb25zZS5qcyIsIi9Vc2Vycy90b255L3Byb2plY3RzL0dpdEh1Yi9lY2hvL2VjaG8vY2xpZW50L3NjcmlwdHMvdmlld3MvTWVzc2FnZVBhbmVsVmlldy5qcyIsIi9Vc2Vycy90b255L3Byb2plY3RzL0dpdEh1Yi9lY2hvL2VjaG8vY2xpZW50L3NjcmlwdHMvdmlld3MvU2VydmVyQ29udHJvbFZpZXcuanMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7QUNBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdElBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7Ozs7QUNsQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ25JQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDakJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbkJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBIiwic291cmNlc0NvbnRlbnQiOlsiKGZ1bmN0aW9uIGUodCxuLHIpe2Z1bmN0aW9uIHMobyx1KXtpZighbltvXSl7aWYoIXRbb10pe3ZhciBhPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7aWYoIXUmJmEpcmV0dXJuIGEobywhMCk7aWYoaSlyZXR1cm4gaShvLCEwKTt0aHJvdyBuZXcgRXJyb3IoXCJDYW5ub3QgZmluZCBtb2R1bGUgJ1wiK28rXCInXCIpfXZhciBmPW5bb109e2V4cG9ydHM6e319O3Rbb11bMF0uY2FsbChmLmV4cG9ydHMsZnVuY3Rpb24oZSl7dmFyIG49dFtvXVsxXVtlXTtyZXR1cm4gcyhuP246ZSl9LGYsZi5leHBvcnRzLGUsdCxuLHIpfXJldHVybiBuW29dLmV4cG9ydHN9dmFyIGk9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtmb3IodmFyIG89MDtvPHIubGVuZ3RoO28rKylzKHJbb10pO3JldHVybiBzfSkiLCIvKipcbiAqIEEgY2xpZW50IGZvciB0aGUgZWNoby5pbyBzZXJ2ZXJcbiAqIEBjb25zdHJ1Y3RvclxuICovXG52YXIgRWNob0NsaWVudCA9IG1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gKCkge1xuICB0aGlzLnVyaSA9IG51bGw7XG4gIHRoaXMud3MgPSBudWxsO1xuICB0aGlzLmxhc3RTZW50VGltZXN0YW1wID0gbnVsbDtcbiAgdGhpcy5sYXN0UmVjZWl2ZWRUaW1lc3RhbXAgPSBudWxsO1xuICB0aGlzLmNhY2hlID0gbnVsbDtcblxuICAvLyBoYW5kbGVyc1xuICB0aGlzLm9ub3BlbiA9IG51bGw7XG4gIHRoaXMub25jbG9zZSA9IG51bGw7XG4gIHRoaXMub25lcnJvciA9IG51bGw7XG4gIHRoaXMub25tZXNzYWdlID0gbnVsbDtcbiAgdGhpcy5vbmhpc3RvcnkgPSBudWxsO1xufTtcblxuXG5FY2hvQ2xpZW50LnByb3RvdHlwZS5vcGVuID0gZnVuY3Rpb24odXJpKSB7XG4gIHZhciBzZWxmID0gdGhpcztcblxuICBmdW5jdGlvbiBjYWxsSGFuZGxlcihldmVudCkge1xuICAgIHZhciBoYW5kbGVyID0gc2VsZlsnb24nICsgZXZlbnRdO1xuICAgIGlmICh0eXBlb2YgaGFuZGxlciA9PSAnZnVuY3Rpb24nKSB7XG4gICAgICBoYW5kbGVyLmFwcGx5KGhhbmRsZXIsIFtdLnNsaWNlLmNhbGwoYXJndW1lbnRzLCAxKSk7XG4gICAgfVxuICB9XG5cbiAgaWYgKHRoaXMuaXNPcGVuKCkpIHtcbiAgICBjb25zb2xlLmxvZygnZXJyb3I6IGFscmVhZHkgb3BlbiBvbiB1cmkgJyArIHRoaXMudXJpKTtcbiAgICBjYWxsSGFuZGxlcignZXJyb3InLCAnYWxyZWFkeSBvcGVuIG9uIHVyaSAnICsgdGhpcy51cmkpO1xuICAgIHJldHVybjtcbiAgfVxuXG4gIGlmICghdGhpcy52YWxpZGF0ZVBvcnQpIHtcbiAgICBjb25zb2xlLmxvZygnZXJyb3I6IGludmFsaWQgcG9ydDogJyArIHRoaXMucG9ydCk7XG4gICAgY2FsbEhhbmRsZXIoJ2Vycm9yJywgJ2ludmFsaWQgcG9ydCcpO1xuICAgIHJldHVybjtcbiAgfVxuXG4gIHRoaXMudXJpID0gdXJpO1xuICB0aGlzLndzID0gbmV3IFdlYlNvY2tldCh1cmkpO1xuXG4gIHRoaXMud3Mub25vcGVuID0gZnVuY3Rpb24gKCkge1xuICAgIGNhbGxIYW5kbGVyKCdvcGVuJyk7XG4gIH07XG5cbiAgdGhpcy53cy5vbmNsb3NlID0gZnVuY3Rpb24oKSB7XG4gICAgY2FsbEhhbmRsZXIoJ2Nsb3NlJyk7XG4gIH07XG5cbiAgdGhpcy53cy5vbm1lc3NhZ2UgPSBmdW5jdGlvbiAobWVzc2FnZUV2ZW50KSB7XG4gICAgc2VsZi5sYXN0UmVjZWl2ZWRUaW1lc3RhbXAgPSBuZXcgRGF0ZSgpLmdldFRpbWUoKTtcblxuICAgIHZhciBtZXNzYWdlID0gSlNPTi5wYXJzZShtZXNzYWdlRXZlbnQuZGF0YSk7XG5cbiAgICBtZXNzYWdlLnJlc3BvbnNlVGltZSA9IHNlbGYubGFzdFJlY2VpdmVkVGltZXN0YW1wIC0gc2VsZi5sYXN0U2VudFRpbWVzdGFtcDtcblxuICAgIGlmIChtZXNzYWdlLm1lc3NhZ2VzLmxlbmd0aCA+IDEpIHtcbiAgICAgIC8vIHRoaXMgaXMgYSBoaXN0b3J5IG1lc3NhZ2VcbiAgICAgIC8vIGNhY2hlIGl0IGluIGNhc2UgdGhlIHVzZXIgd2FudHMgdG8gZmlsdGVyXG4gICAgICAvLyAobm8gbmVlZCBmb3IgYW5vdGhlciByb3VuZCB0cmlwKVxuICAgICAgc2VsZi5jYWNoZSA9IG1lc3NhZ2U7XG4gICAgICBjYWxsSGFuZGxlcignaGlzdG9yeScsIG1lc3NhZ2UpO1xuICAgIH0gZWxzZSB7XG4gICAgICAvLyBjYWNoZSBpcyBub3cgc3RhbGUsIHNvIGp1c3QgY2xlYXIgaXRcbiAgICAgIHNlbGYuY2FjaGUgPSBudWxsO1xuICAgICAgY2FsbEhhbmRsZXIoJ21lc3NhZ2UnLCBtZXNzYWdlKTtcbiAgICB9XG4gIH07XG5cbiAgdGhpcy53cy5vbmVycm9yID0gZnVuY3Rpb24gKGVycikge1xuICAgIGNhbGxIYW5kbGVyKCdlcnJvcicsIGVycik7XG4gIH07XG59O1xuXG5cbkVjaG9DbGllbnQucHJvdG90eXBlLmNsb3NlID0gZnVuY3Rpb24oKSB7XG4gIGlmICh0aGlzLmlzQ2xvc2VkKCkpIHtcbiAgICBjb25zb2xlLmxvZygnYWxyZWFkeSBjbG9zZWQnKTtcbiAgICByZXR1cm47XG4gIH1cblxuICB0aGlzLndzLmNsb3NlKCk7XG4gIHRoaXMud3MgPSBudWxsO1xuICB0aGlzLnVyaSA9IG51bGw7XG59O1xuXG5cbkVjaG9DbGllbnQucHJvdG90eXBlLmlzT3BlbiA9IGZ1bmN0aW9uKCkge1xuICByZXR1cm4gdGhpcy53cyBpbnN0YW5jZW9mIFdlYlNvY2tldDtcbn07XG5cblxuRWNob0NsaWVudC5wcm90b3R5cGUuaXNDbG9zZWQgPSBmdW5jdGlvbigpIHtcbiAgcmV0dXJuICF0aGlzLmlzT3BlbigpO1xufTtcblxuXG5FY2hvQ2xpZW50LnByb3RvdHlwZS5zZW5kID0gZnVuY3Rpb24gKG1lc3NhZ2UpIHtcbiAgaWYgKCFtZXNzYWdlIHx8ICF0aGlzLmlzT3BlbigpKSByZXR1cm47XG4gIHRoaXMubGFzdFNlbnRUaW1lc3RhbXAgPSBuZXcgRGF0ZSgpLmdldFRpbWUoKTtcbiAgdGhpcy53cy5zZW5kKG1lc3NhZ2UpO1xufTtcblxuXG5FY2hvQ2xpZW50LnByb3RvdHlwZS5zZW5kSGlzdG9yeUNvbW1hbmQgPSBmdW5jdGlvbiAoKSB7XG4gIHRoaXMuc2VuZCgnW0hJU1RPUlldJyk7XG59O1xuXG5cbkVjaG9DbGllbnQucHJvdG90eXBlLmhpc3RvcnlGaWx0ZXIgPSBmdW5jdGlvbihwYXR0ZXJuKSB7XG4gIGlmICghdGhpcy5jYWNoZSkgcmV0dXJuIFtdO1xuICBpZiAoIXBhdHRlcm4pIHJldHVybiB0aGlzLmNhY2hlO1xuXG4gIHZhciByZWdleCA9IG5ldyBSZWdFeHAocGF0dGVybiwgXCJpXCIpO1xuICB2YXIgZmlsdGVyZWQgPSBfLmZpbHRlcih0aGlzLmNhY2hlLm1lc3NhZ2VzLCBmdW5jdGlvbihtZXNzYWdlKSB7XG4gICAgcmV0dXJuIHJlZ2V4LnRlc3QobWVzc2FnZSk7XG4gIH0pO1xuXG4gIHJldHVybiB7XG4gICAgc3RhdHVzOiB0aGlzLmNhY2hlLnN0YXR1cyxcbiAgICByZXNwb25zZVRpbWU6IHRoaXMuY2FjaGUucmVzcG9uc2VUaW1lLFxuICAgIG1lc3NhZ2VzOiBmaWx0ZXJlZFxuICB9XG59O1xuXG5cbkVjaG9DbGllbnQucHJvdG90eXBlLnZhbGlkYXRlUG9ydCA9IGZ1bmN0aW9uKHBvcnQpIHtcbiAgcmV0dXJuIHBvcnQgPj0gMTAyNCAmJiBwb3J0IDwgNjU1MzU7XG59O1xuXG4iLCIvLyBtb2RlbHNcbnZhciBBcHAgPSByZXF1aXJlKCcuL21vZGVscy9BcHAnKVxuICA7XG5cbi8vIHZpZXdzXG52YXIgU2VydmVyQ29udHJvbFZpZXcgPSByZXF1aXJlKCcuL3ZpZXdzL1NlcnZlckNvbnRyb2xWaWV3JylcbiAgLCBNZXNzYWdlUGFuZWxWaWV3ID0gcmVxdWlyZSgnLi92aWV3cy9NZXNzYWdlUGFuZWxWaWV3JylcbiAgO1xuXG5cbnZhciBhcHAgPSBuZXcgQXBwKCk7XG5cbi8vIHdpcmUgdXAgdmlld3NcblxudmFyIHNlcnZlckNvbnRyb2xWaWV3ID0gbmV3IFNlcnZlckNvbnRyb2xWaWV3KHtcbiAgbW9kZWw6IGFwcCxcbiAgZWw6ICcjc2VydmVyLWNvbnRyb2wnXG59KTtcblxudmFyIG1lc3NhZ2VQYW5lbFZpZXcgPSBuZXcgTWVzc2FnZVBhbmVsVmlldyh7XG4gIG1vZGVsOiBhcHAsXG4gIGVsOiAnI21lc3NhZ2UtcGFuZWwnXG59KTtcblxubW9kdWxlLmV4cG9ydHMgPSB7XG4gIGFwcDogYXBwXG59O1xuXG5hcHAub24oJ21lc3NhZ2UnLCBmdW5jdGlvbihyZXNwb25zZSkge1xuICBjb25zb2xlLmxvZygnKioqKioqKioqKioqKioqKiBtZXNzYWdlOiAnICsgcmVzcG9uc2UuZ2V0KCdtZXNzYWdlcycpWzBdKTtcbn0pO1xuXG5cblxuIiwidmFyIEVjaG9DbGllbnQgPSByZXF1aXJlKCcuLy4uL2xpYnMvZWNob2NsaWVudCcpXG4gICwgRWNob1Jlc3BvbnNlID0gcmVxdWlyZSgnLi9FY2hvUmVzcG9uc2UnKVxuICA7XG5cbi8qKlxuICogVGhlIEFwcCBtb2RlbCBwcm92aWRlcyBhIGJhY2tib25lIHdyYXBwZXIgb3ZlciBFY2hvQ2xpZW50IGFuZCBzZXJ2ZXIgZnVuY3Rpb25zXG4gKi9cbnZhciBBcHAgPSBCYWNrYm9uZS5Nb2RlbC5leHRlbmQoe1xuICBkZWZhdWx0czoge1xuICAgIGhvc3Q6ICdsb2NhbGhvc3QnLFxuICAgIHBvcnQ6IDU1NTUsXG4gICAgc2VydmVyU3RhdGU6ICdzdG9wcGVkJ1xuICB9LFxuXG4gIGluaXRpYWxpemU6IGZ1bmN0aW9uKCkge1xuICAgIHRoaXMuY2xpZW50ID0gbmV3IEVjaG9DbGllbnQoKTtcblxuICAgIHZhciBzZWxmID0gdGhpcztcblxuICAgIHNlbGYuY2xpZW50Lm9ub3BlbiA9IGZ1bmN0aW9uKCkge1xuICAgICAgY29uc29sZS5sb2coJ2NsaWVudCBvcGVuJyk7XG4gICAgICBzZWxmLnRyaWdnZXIoJ29wZW4nKTtcbiAgICB9O1xuXG4gICAgc2VsZi5jbGllbnQub25jbG9zZSA9IGZ1bmN0aW9uKCkge1xuICAgICAgY29uc29sZS5sb2coJ2NsaWVudCBjbG9zZScpO1xuICAgICAgLy8gcmVsZWFzZSBoYW5kbGVyc1xuICAgICAgc2VsZi5jbGllbnQub25vcGVuID0gbnVsbDtcbiAgICAgIHNlbGYuY2xpZW50Lm9uY2xvc2UgPSBudWxsO1xuICAgICAgc2VsZi5jbGllbnQub25lcnJvciA9IG51bGw7XG4gICAgICBzZWxmLmNsaWVudC5vbm1lc3NhZ2UgPSBudWxsO1xuICAgICAgc2VsZi5jbGllbnQub25oaXN0b3J5ID0gbnVsbDtcblxuICAgICAgc2VsZi50cmlnZ2VyKCdjbG9zZScpO1xuICAgIH07XG5cbiAgICBzZWxmLmNsaWVudC5vbmVycm9yID0gZnVuY3Rpb24oZXJyKSB7XG4gICAgICBjb25zb2xlLmxvZygnY2xpZW50IGVycm9yJywgZXJyKTtcbiAgICAgIHNlbGYudHJpZ2dlcignZXJyb3InLCBlcnIpO1xuICAgIH07XG5cbiAgICBzZWxmLmNsaWVudC5vbm1lc3NhZ2UgPSBmdW5jdGlvbihyZXNwb25zZSkge1xuICAgICAgY29uc29sZS5sb2cocmVzcG9uc2UpO1xuICAgICAgdmFyIGVyID0gbmV3IEVjaG9SZXNwb25zZShyZXNwb25zZSk7XG4gICAgICBjb25zb2xlLmxvZyhlcik7XG4gICAgICBzZWxmLnRyaWdnZXIoJ21lc3NhZ2UnLCBuZXcgRWNob1Jlc3BvbnNlKHJlc3BvbnNlKSk7XG4gICAgfTtcblxuICAgIHNlbGYuY2xpZW50Lm9uaGlzdG9yeSA9IGZ1bmN0aW9uKHJlc3BvbnNlKSB7XG4gICAgICBjb25zb2xlLmxvZygnY2xpZW50IGhpc3RvcnknKTtcbiAgICAgIHNlbGYudHJpZ2dlcignaGlzdG9yeScsIG5ldyBFY2hvUmVzcG9uc2UocmVzcG9uc2UpKTtcbiAgICB9O1xuXG4gICAgLy8gc3luYyB1cCB3aXRoIHNlcnZlciBzdGF0dXNcbiAgICB0aGlzLmNoZWNrU2VydmVyU3RhdHVzKCk7XG4gIH0sXG5cbiAgdmFsaWRhdGU6IGZ1bmN0aW9uKGF0dHJzKSB7XG4gICAgaWYgKCF0aGlzLmNsaWVudC52YWxpZGF0ZVBvcnQoYXR0cnMucG9ydCkpIHtcbiAgICAgIHJldHVybiAnaW52YWxpZCBwb3J0JztcbiAgICB9XG4gIH0sXG5cbiAgY2hlY2tTZXJ2ZXJTdGF0dXM6IGZ1bmN0aW9uKCkge1xuICAgIHZhciBzZWxmID0gdGhpcztcblxuICAgICQuZ2V0SlNPTignL2FwaS92MS9lY2hvc2VydmVyLycgKyB0aGlzLmdldCgncG9ydCcpLCBmdW5jdGlvbiAocmVzdWx0KSB7XG4gICAgICBpZiAocmVzdWx0ICYmIHJlc3VsdC5zdGF0dXMgPT0gJ2Vycm9yJykge1xuICAgICAgICBjb25zb2xlLmxvZyhyZXN1bHQpO1xuICAgICAgICBzZWxmLnRyaWdnZXIoJ3NlcnZlckVycm9yJywgcmVzdWx0Lm1lc3NhZ2UpO1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG5cbiAgICAgIGlmIChyZXN1bHQgJiYgcmVzdWx0LnN0YXR1cyA9PSAnT0snICYmIC9zdGFydGVkLy50ZXN0KHJlc3VsdC5tZXNzYWdlKSkge1xuICAgICAgICBzZWxmLnNldCgnc2VydmVyU3RhdGUnLCAnc3RhcnRlZCcpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgc2VsZi5zZXQoJ3NlcnZlclN0YXRlJywgJ3N0b3BwZWQnKTtcbiAgICAgIH1cbiAgICB9KTtcbiAgfSxcblxuICBzdGFydFNlcnZlcjogZnVuY3Rpb24oKSB7XG4gICAgaWYgKCF0aGlzLmlzVmFsaWQoKSkgcmV0dXJuO1xuICAgIHRoaXMuc2VuZFNlcnZlckNvbW1hbmQoJ3N0YXJ0Jyk7XG4gIH0sXG5cbiAgc3RvcFNlcnZlcjogZnVuY3Rpb24oKSB7XG4gICAgaWYgKCF0aGlzLmlzVmFsaWQoKSkgcmV0dXJuO1xuICAgIHRoaXMuc2VuZFNlcnZlckNvbW1hbmQoJ3N0b3AnKTtcbiAgfSxcblxuICBzZW5kU2VydmVyQ29tbWFuZDogZnVuY3Rpb24oY29tbWFuZCkge1xuICAgIGlmICghdGhpcy5pc1ZhbGlkKCkpIHJldHVybjtcblxuICAgIHRoaXMuc2V0KCdzZXJ2ZXJFcnJvcicsICcnKTtcblxuICAgIHZhciBwb3J0ID0gdGhpcy5nZXQoJ3BvcnQnKTtcbiAgICB2YXIgc2VsZiA9IHRoaXM7XG5cbiAgICAkLnBvc3QoJy9hcGkvdjEvZWNob3NlcnZlci8nICsgcG9ydCArICcvJyArIGNvbW1hbmQsIGZ1bmN0aW9uIChyZXN1bHQpIHtcbiAgICAgIGlmIChyZXN1bHQgJiYgcmVzdWx0LnN0YXR1cyA9PSAnZXJyb3InKSB7XG4gICAgICAgIGNvbnNvbGUubG9nKHJlc3VsdCk7XG4gICAgICAgIHNlbGYudHJpZ2dlcignc2VydmVyRXJyb3InLCByZXN1bHQubWVzc2FnZSk7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cblxuICAgICAgY29uc29sZS5sb2coJ3N1Y2Nlc3M6ICcgKyByZXN1bHQubWVzc2FnZSk7XG4gICAgICBzZWxmLnNldCgnc2VydmVyU3RhdGUnLCAvc3RhcnRlZC8udGVzdChyZXN1bHQubWVzc2FnZSwgXCJpXCIpXG4gICAgICAgID8gJ3N0YXJ0ZWQnIDogJ3N0b3BwZWQnKTtcbiAgICB9KTtcbiAgfSxcblxuICBvcGVuOiBmdW5jdGlvbigpIHtcbiAgICB2YXIgdXJpID0gJ3dzOi8vJyArIHRoaXMuZ2V0KCdob3N0JykgKyAnOicgKyB0aGlzLmdldCgncG9ydCcpO1xuICAgIGNvbnNvbGUubG9nKCdjbGllbnQgb3BlbjogJyArIHVyaSk7XG4gICAgdGhpcy5jbGllbnQub3Blbih1cmkpO1xuICB9LFxuXG4gIGNsb3NlOiBmdW5jdGlvbigpIHtcbiAgICBjb25zb2xlLmxvZygnY2xpZW50IGNsb3NlJyk7XG4gICAgdGhpcy5jbGllbnQuY2xvc2UoKTtcbiAgfSxcblxuICBzZW5kOiBmdW5jdGlvbihtZXNzYWdlKSB7XG4gICAgY29uc29sZS5sb2coJ2NsaWVudCBzZW5kOiAnICsgbWVzc2FnZSk7XG4gICAgdGhpcy5jbGllbnQuc2VuZChtZXNzYWdlKTtcbiAgfVxufSk7XG5cbm1vZHVsZS5leHBvcnRzID0gQXBwO1xuXG4iLCJ2YXIgRWNob1Jlc3BvbnNlID0gQmFja2JvbmUuTW9kZWwuZXh0ZW5kKHtcbiAgZGVmYXVsdHM6IHtcbiAgICBzdGF0dXM6ICd1bmtub3duJyxcbiAgICByZXNwb25zZVRpbWU6IG5ldyBEYXRlKCkuZ2V0VGltZSgpLFxuICAgIHJlc3BvbnNlVHlwZTogJ21lc3NhZ2UnLFxuICAgIG1lc3NhZ2VzOiBbXVxuICB9LFxuXG4gIHRvRGlzcGxheVN0cmluZzogZnVuY3Rpb24oKSB7XG4gICAgLy8gaWYgbm90IGEgbWVzc2FnZSByZXNwb25zZSAoc3VjaCBhcyBhIGhpc3RvcnkgcmVzcG9uc2UpLFxuICAgIC8vIHRoZW4gb25seSBkaXNwbGF5IHRoZSByZXNwb25zZSB0aW1lXG4gICAgcmV0dXJuIHRoaXMucmVzcG9uc2VUeXBlID09ICdtZXNzYWdlJ1xuICAgICAgPyB0aGlzLm1lc3NhZ2VzWzBdICsgJywgJyArIHRoaXMucmVzcG9uc2VUaW1lICsgJ21zJ1xuICAgICAgOiB0aGlzLnJlc3BvbnNlVGltZSArICdtcyc7XG4gIH1cbn0pO1xuXG5tb2R1bGUuZXhwb3J0cyA9IEVjaG9SZXNwb25zZTsiLCJtb2R1bGUuZXhwb3J0cyA9IEJhY2tib25lLlZpZXcuZXh0ZW5kKHtcbiAgaW5pdGlhbGl6ZTogZnVuY3Rpb24oKSB7XG4gICAgdGhpcy5yZW5kZXIoKTtcbiAgICB0aGlzLmxpc3RlblRvKHRoaXMubW9kZWwsICdjaGFuZ2U6c2VydmVyU3RhdGUnLCB0aGlzLnJlbmRlcik7XG4gIH0sXG5cbiAgdGVtcGxhdGU6IEhhbmRsZWJhcnMuY29tcGlsZSgkKCcjbWVzc2FnZS1wYW5lbC10ZW1wbGF0ZScpLmh0bWwoKSksXG5cbiAgcmVuZGVyOiBmdW5jdGlvbigpIHtcbiAgICB2YXIgc2VydmVyU3RhdGUgPSB0aGlzLm1vZGVsLmdldCgnc2VydmVyU3RhdGUnKTtcblxuICAgIHZhciBhcmdzID0ge1xuICAgICAgaGlkZGVuOiBzZXJ2ZXJTdGF0ZSA9PSAnc3RhcnRlZCcgPyAndmlzaWJsZScgOiAnaGlkZGVuJ1xuICAgIH07XG5cbiAgICB0aGlzLiRlbC5odG1sKHRoaXMudGVtcGxhdGUoYXJncykpO1xuICAgIHJldHVybiB0aGlzO1xuICB9XG59KTtcbiIsIm1vZHVsZS5leHBvcnRzID0gQmFja2JvbmUuVmlldy5leHRlbmQoe1xuICBzZXJ2ZXJFcnJvck1lc3NhZ2U6IG51bGwsXG5cbiAgaW5pdGlhbGl6ZTogZnVuY3Rpb24oKSB7XG4gICAgdmFyIHNlbGYgPSB0aGlzO1xuXG4gICAgdGhpcy5yZW5kZXIoKTtcbiAgICB0aGlzLmxpc3RlblRvKHRoaXMubW9kZWwsICdjaGFuZ2U6c2VydmVyU3RhdGUnLCB0aGlzLnJlbmRlcik7XG4gICAgdGhpcy5tb2RlbC5vbignc2VydmVyRXJyb3InLCBmdW5jdGlvbihlcnIpIHtcbiAgICAgIHNlbGYuc2VydmVyRXJyb3IgPSBlcnI7XG4gICAgICBzZWxmLnJlbmRlcigpO1xuICAgIH0pXG4gIH0sXG5cbiAgZXZlbnRzOiB7XG4gICAgJ2NsaWNrICNidG5zZXJ2ZXInOiAndG9nZ2xlc3RhcnQnXG4gIH0sXG5cbiAgdGVtcGxhdGU6IEhhbmRsZWJhcnMuY29tcGlsZSgkKCcjc2VydmVyLWNvbnRyb2wtdGVtcGxhdGUnKS5odG1sKCkpLFxuXG4gIHJlbmRlcjogZnVuY3Rpb24oKSB7XG4gICAgdmFyIHBvcnQgPSB0aGlzLm1vZGVsLmdldCgncG9ydCcpO1xuICAgIHZhciBzZXJ2ZXJTdGF0ZSA9IHRoaXMubW9kZWwuZ2V0KCdzZXJ2ZXJTdGF0ZScpO1xuICAgIHZhciBzZXJ2ZXJTdGF0ZVRleHQgPSBzZXJ2ZXJTdGF0ZSA9PSAnc3RhcnRlZCdcbiAgICAgID8gJ3N0YXJ0ZWQgKHBvcnQgJyArIHBvcnQgKyAnKSdcbiAgICAgIDogc2VydmVyU3RhdGU7XG4gICAgdmFyIHNlcnZlckVycm9yID0gdGhpcy5zZXJ2ZXJFcnJvciA/ICcgRXJyb3I6ICcgKyB0aGlzLnNlcnZlckVycm9yIDogbnVsbDtcbiAgICB2YXIgc2VydmVyRXJyb3JDbGFzcyA9IHNlcnZlckVycm9yID8gJ3Zpc2libGUnIDogJ2hpZGRlbic7XG5cbiAgICB2YXIgYXJncyA9IHtcbiAgICAgIHN0YXRlQ2xhc3M6IHNlcnZlclN0YXRlLFxuICAgICAgc2VydmVyU3RhdGU6IHNlcnZlclN0YXRlVGV4dCxcbiAgICAgIHNlcnZlclBvcnQ6IHBvcnQsXG4gICAgICBpbnB1dFZpc2liaWxpdHk6IHNlcnZlclN0YXRlID09ICdzdGFydGVkJyA/ICdjb2xsYXBzZScgOiAndmlzaWJsZScsXG4gICAgICBzZXJ2ZXJDb21tYW5kOiBzZXJ2ZXJTdGF0ZSA9PSAnc3RhcnRlZCcgPyAnU3RvcCcgOiAnU3RhcnQnLFxuICAgICAgc2VydmVyRXJyb3JDbGFzczogc2VydmVyRXJyb3JDbGFzcyxcbiAgICAgIHNlcnZlckVycm9yOiBzZXJ2ZXJFcnJvclxuICAgIH07XG5cbiAgICB0aGlzLiRlbC5odG1sKHRoaXMudGVtcGxhdGUoYXJncykpO1xuXG4gICAgJCgnI3BvcnRudW1iZXInKS5mb2N1cygpO1xuXG4gICAgcmV0dXJuIHRoaXM7XG4gIH0sXG5cbiAgcG9ydDogZnVuY3Rpb24oKSB7XG4gICAgcmV0dXJuICQoJyNwb3J0bnVtYmVyJykudmFsKCk7XG4gIH0sXG5cbiAgdG9nZ2xlc3RhcnQ6IGZ1bmN0aW9uKCkge1xuICAgIC8vIGNsZWFyIHByZXZpb3VzIGVycm9yIG1lc3NhZ2VcbiAgICB0aGlzLnNlcnZlckVycm9yID0gbnVsbDtcbiAgICAkKCcjc2VydmVyLWVycm9yJykuaHRtbCgnJyk7XG5cbiAgICB2YXIgcG9ydCA9IHRoaXMucG9ydCgpO1xuICAgIHRoaXMubW9kZWwuc2V0KCdwb3J0JywgcG9ydCwgeyB2YWxpZGF0ZTogdHJ1ZSB9KTtcbiAgICBpZiAodGhpcy5tb2RlbC52YWxpZGF0aW9uRXJyb3IpIHtcbiAgICAgICQoJyNwb3J0bnVtYmVyJykudmFsKCcnKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICB2YXIgY29tbWFuZCA9IHRoaXMubW9kZWwuZ2V0KCdzZXJ2ZXJTdGF0ZScpID09ICdzdGFydGVkJyA/ICdzdG9wJyA6ICdzdGFydCc7XG4gICAgdGhpcy5tb2RlbC5zZW5kU2VydmVyQ29tbWFuZChjb21tYW5kKTtcbiAgfVxufSk7XG4iXX0=
