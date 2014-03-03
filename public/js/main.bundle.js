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

    //if (message.messages.length > 1) {
    if (message.type == 'history') {
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


},{"./models/App":4,"./views/MessagePanelView":7,"./views/ServerControlView":10}],"echo":[function(require,module,exports){
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

      var started = /started/.test(result.message, "i");

      // once the server is started, open a client connection
      if (started) {
        self.set('serverState', 'started');
        self.open();
      } else {
        self.set('serverState', 'stopped');
        self.close();
      }
    });
  },

  open: function() {
    if (this.client.isOpen()) return;
    console.log('client close');

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
      self.trigger('message', er);
    };

    self.client.onhistory = function(response) {
      console.log(response);
      var er = new EchoResponse(response);
      self.trigger('history', er);
    };

    var uri = 'ws://' + this.get('host') + ':' + this.get('port');
    console.log('client open: ' + uri);
    this.client.open(uri);
  },

  close: function() {
    if (this.client.isClosed()) return;
    console.log('client close');
    this.client.close();
  },

  send: function(message) {
    if (!this.client.isOpen()) return;

    console.log('client send: ' + message);
    this.client.send(message);
  }
});

module.exports = App;


},{"./../libs/echoclient":1,"./EchoResponse":5}],5:[function(require,module,exports){
var EchoResponse = Backbone.Model.extend({
  defaults: {
    status: '',
    responseTime: new Date().getTime(),
    type: 'message',
    messages: [ '' ]
  },

  toDisplayString: function() {
    // if not a message response (such as a history response),
    // then only display the response time
    return this.get('type') != 'message'
      ? '[response] ' + this.get('responseTime') + 'ms'
      : '"' + this.get('messages')[0] + '", ' + this.get('responseTime') + 'ms';
  }
});

module.exports = EchoResponse;
},{}],6:[function(require,module,exports){
module.exports = Backbone.View.extend({
  initialize: function() {
    this.render();
  },

  template: Handlebars.compile($('#message-history-template').html()),

  render: function() {
    var args = {
    };

    this.$el.html(this.template(args));

    return this;
  }
});
},{}],7:[function(require,module,exports){
var MessageSendView = require('./MessageSendView')
  , MessageReceiveView = require('./MessageReceiveView')
  , MessageHistoryView = require('./MessageHistoryView')
  ;

module.exports = Backbone.View.extend({
  initialize: function () {

    this.sendView = new MessageSendView({
      model: this.model
    });

    this.receiveView = new MessageReceiveView({
      model: this.model
    });

    this.historyView = new MessageHistoryView({
      model: this.model
    });

    this.render();

    this.listenTo(this.model, 'change:serverState', this.render);
  },

  template: Handlebars.compile($('#message-panel-template').html()),

  render: function () {
    var serverState = this.model.get('serverState');

    var args = {
      hidden: serverState == 'started' ? 'visible' : 'collapse'
    };

    this.$el.html(this.template(args));

    this.sendView.setElement(this.$('#message-send')).render();
    this.receiveView.setElement(this.$('#message-receive')).render();
    this.historyView.setElement(this.$('#message-history')).render();

    return this;
  },

});

},{"./MessageHistoryView":6,"./MessageReceiveView":8,"./MessageSendView":9}],8:[function(require,module,exports){
var EchoResponse = require('./../models/EchoResponse');

module.exports = Backbone.View.extend({
  initialize: function() {
    var self = this;

    this.render();

    this.model.on('message history', function(response) {
      self.render(response);
    })
  },

  template: Handlebars.compile($('#message-receive-template').html()),

  render: function() {
    var response = arguments[0];
    if (!(response instanceof EchoResponse)) return;

    var args = {
      message: response.toDisplayString()
    };

    this.$el.html(this.template(args));

    return this;
  }
});
},{"./../models/EchoResponse":5}],9:[function(require,module,exports){
module.exports = Backbone.View.extend({
  initialize: function() {
    this.render();
  },

  events: {
    'click #btnsendmessage': 'sendMessage',
    'input #message': 'toggleEnableButton'
  },

  template: Handlebars.compile($('#message-send-template').html()),

  render: function() {
    var args = {
    };

    this.$el.html(this.template(args));

    return this;
  },

  messageText: function() {
    if (arguments.length == 0) {
      return $('#message').val();
    } else {
      $('#message').val(arguments[0]);
    }
  },

  toggleEnableButton: function() {
    if (this.messageText()) {
      console.log('value');
      $('#btnsendmessage').removeClass('disabled');
    } else {
      console.log('empty');
      $('#btnsendmessage').addClass('disabled');
    }
  },

  sendMessage: function() {
    var message = this.messageText();
    if (message) this.model.send(message);
    this.messageText('');
  }
});

},{}],10:[function(require,module,exports){
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZ2VuZXJhdGVkLmpzIiwic291cmNlcyI6WyIvVXNlcnMvdG9ueS9wcm9qZWN0cy9HaXRIdWIvZWNoby9lY2hvL25vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCIvVXNlcnMvdG9ueS9wcm9qZWN0cy9HaXRIdWIvZWNoby9lY2hvL2NsaWVudC9zY3JpcHRzL2xpYnMvZWNob2NsaWVudC5qcyIsIi9Vc2Vycy90b255L3Byb2plY3RzL0dpdEh1Yi9lY2hvL2VjaG8vY2xpZW50L3NjcmlwdHMvbWFpbi5qcyIsIi9Vc2Vycy90b255L3Byb2plY3RzL0dpdEh1Yi9lY2hvL2VjaG8vY2xpZW50L3NjcmlwdHMvbW9kZWxzL0FwcC5qcyIsIi9Vc2Vycy90b255L3Byb2plY3RzL0dpdEh1Yi9lY2hvL2VjaG8vY2xpZW50L3NjcmlwdHMvbW9kZWxzL0VjaG9SZXNwb25zZS5qcyIsIi9Vc2Vycy90b255L3Byb2plY3RzL0dpdEh1Yi9lY2hvL2VjaG8vY2xpZW50L3NjcmlwdHMvdmlld3MvTWVzc2FnZUhpc3RvcnlWaWV3LmpzIiwiL1VzZXJzL3RvbnkvcHJvamVjdHMvR2l0SHViL2VjaG8vZWNoby9jbGllbnQvc2NyaXB0cy92aWV3cy9NZXNzYWdlUGFuZWxWaWV3LmpzIiwiL1VzZXJzL3RvbnkvcHJvamVjdHMvR2l0SHViL2VjaG8vZWNoby9jbGllbnQvc2NyaXB0cy92aWV3cy9NZXNzYWdlUmVjZWl2ZVZpZXcuanMiLCIvVXNlcnMvdG9ueS9wcm9qZWN0cy9HaXRIdWIvZWNoby9lY2hvL2NsaWVudC9zY3JpcHRzL3ZpZXdzL01lc3NhZ2VTZW5kVmlldy5qcyIsIi9Vc2Vycy90b255L3Byb2plY3RzL0dpdEh1Yi9lY2hvL2VjaG8vY2xpZW50L3NjcmlwdHMvdmlld3MvU2VydmVyQ29udHJvbFZpZXcuanMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7QUNBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN2SUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7OztBQzVCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbEpBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNqQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDZkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzVDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMzQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDN0NBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSIsInNvdXJjZXNDb250ZW50IjpbIihmdW5jdGlvbiBlKHQsbixyKXtmdW5jdGlvbiBzKG8sdSl7aWYoIW5bb10pe2lmKCF0W29dKXt2YXIgYT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2lmKCF1JiZhKXJldHVybiBhKG8sITApO2lmKGkpcmV0dXJuIGkobywhMCk7dGhyb3cgbmV3IEVycm9yKFwiQ2Fubm90IGZpbmQgbW9kdWxlICdcIitvK1wiJ1wiKX12YXIgZj1uW29dPXtleHBvcnRzOnt9fTt0W29dWzBdLmNhbGwoZi5leHBvcnRzLGZ1bmN0aW9uKGUpe3ZhciBuPXRbb11bMV1bZV07cmV0dXJuIHMobj9uOmUpfSxmLGYuZXhwb3J0cyxlLHQsbixyKX1yZXR1cm4gbltvXS5leHBvcnRzfXZhciBpPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7Zm9yKHZhciBvPTA7bzxyLmxlbmd0aDtvKyspcyhyW29dKTtyZXR1cm4gc30pIiwiLyoqXG4gKiBBIGNsaWVudCBmb3IgdGhlIGVjaG8uaW8gc2VydmVyXG4gKiBAY29uc3RydWN0b3JcbiAqL1xudmFyIEVjaG9DbGllbnQgPSBtb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uICgpIHtcbiAgdGhpcy51cmkgPSBudWxsO1xuICB0aGlzLndzID0gbnVsbDtcbiAgdGhpcy5sYXN0U2VudFRpbWVzdGFtcCA9IG51bGw7XG4gIHRoaXMubGFzdFJlY2VpdmVkVGltZXN0YW1wID0gbnVsbDtcbiAgdGhpcy5jYWNoZSA9IG51bGw7XG5cbiAgLy8gaGFuZGxlcnNcbiAgdGhpcy5vbm9wZW4gPSBudWxsO1xuICB0aGlzLm9uY2xvc2UgPSBudWxsO1xuICB0aGlzLm9uZXJyb3IgPSBudWxsO1xuICB0aGlzLm9ubWVzc2FnZSA9IG51bGw7XG4gIHRoaXMub25oaXN0b3J5ID0gbnVsbDtcbn07XG5cblxuRWNob0NsaWVudC5wcm90b3R5cGUub3BlbiA9IGZ1bmN0aW9uKHVyaSkge1xuICB2YXIgc2VsZiA9IHRoaXM7XG5cbiAgZnVuY3Rpb24gY2FsbEhhbmRsZXIoZXZlbnQpIHtcbiAgICB2YXIgaGFuZGxlciA9IHNlbGZbJ29uJyArIGV2ZW50XTtcbiAgICBpZiAodHlwZW9mIGhhbmRsZXIgPT0gJ2Z1bmN0aW9uJykge1xuICAgICAgaGFuZGxlci5hcHBseShoYW5kbGVyLCBbXS5zbGljZS5jYWxsKGFyZ3VtZW50cywgMSkpO1xuICAgIH1cbiAgfVxuXG4gIGlmICh0aGlzLmlzT3BlbigpKSB7XG4gICAgY29uc29sZS5sb2coJ2Vycm9yOiBhbHJlYWR5IG9wZW4gb24gdXJpICcgKyB0aGlzLnVyaSk7XG4gICAgY2FsbEhhbmRsZXIoJ2Vycm9yJywgJ2FscmVhZHkgb3BlbiBvbiB1cmkgJyArIHRoaXMudXJpKTtcbiAgICByZXR1cm47XG4gIH1cblxuICBpZiAoIXRoaXMudmFsaWRhdGVQb3J0KSB7XG4gICAgY29uc29sZS5sb2coJ2Vycm9yOiBpbnZhbGlkIHBvcnQ6ICcgKyB0aGlzLnBvcnQpO1xuICAgIGNhbGxIYW5kbGVyKCdlcnJvcicsICdpbnZhbGlkIHBvcnQnKTtcbiAgICByZXR1cm47XG4gIH1cblxuICB0aGlzLnVyaSA9IHVyaTtcbiAgdGhpcy53cyA9IG5ldyBXZWJTb2NrZXQodXJpKTtcblxuICB0aGlzLndzLm9ub3BlbiA9IGZ1bmN0aW9uICgpIHtcbiAgICBjYWxsSGFuZGxlcignb3BlbicpO1xuICB9O1xuXG4gIHRoaXMud3Mub25jbG9zZSA9IGZ1bmN0aW9uKCkge1xuICAgIGNhbGxIYW5kbGVyKCdjbG9zZScpO1xuICB9O1xuXG4gIHRoaXMud3Mub25tZXNzYWdlID0gZnVuY3Rpb24gKG1lc3NhZ2VFdmVudCkge1xuICAgIHNlbGYubGFzdFJlY2VpdmVkVGltZXN0YW1wID0gbmV3IERhdGUoKS5nZXRUaW1lKCk7XG5cbiAgICB2YXIgbWVzc2FnZSA9IEpTT04ucGFyc2UobWVzc2FnZUV2ZW50LmRhdGEpO1xuXG4gICAgbWVzc2FnZS5yZXNwb25zZVRpbWUgPSBzZWxmLmxhc3RSZWNlaXZlZFRpbWVzdGFtcCAtIHNlbGYubGFzdFNlbnRUaW1lc3RhbXA7XG5cbiAgICAvL2lmIChtZXNzYWdlLm1lc3NhZ2VzLmxlbmd0aCA+IDEpIHtcbiAgICBpZiAobWVzc2FnZS50eXBlID09ICdoaXN0b3J5Jykge1xuICAgICAgLy8gdGhpcyBpcyBhIGhpc3RvcnkgbWVzc2FnZVxuICAgICAgLy8gY2FjaGUgaXQgaW4gY2FzZSB0aGUgdXNlciB3YW50cyB0byBmaWx0ZXJcbiAgICAgIC8vIChubyBuZWVkIGZvciBhbm90aGVyIHJvdW5kIHRyaXApXG4gICAgICBzZWxmLmNhY2hlID0gbWVzc2FnZTtcbiAgICAgIGNhbGxIYW5kbGVyKCdoaXN0b3J5JywgbWVzc2FnZSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIC8vIGNhY2hlIGlzIG5vdyBzdGFsZSwgc28ganVzdCBjbGVhciBpdFxuICAgICAgc2VsZi5jYWNoZSA9IG51bGw7XG4gICAgICBjYWxsSGFuZGxlcignbWVzc2FnZScsIG1lc3NhZ2UpO1xuICAgIH1cbiAgfTtcblxuICB0aGlzLndzLm9uZXJyb3IgPSBmdW5jdGlvbiAoZXJyKSB7XG4gICAgY2FsbEhhbmRsZXIoJ2Vycm9yJywgZXJyKTtcbiAgfTtcbn07XG5cblxuRWNob0NsaWVudC5wcm90b3R5cGUuY2xvc2UgPSBmdW5jdGlvbigpIHtcbiAgaWYgKHRoaXMuaXNDbG9zZWQoKSkge1xuICAgIGNvbnNvbGUubG9nKCdhbHJlYWR5IGNsb3NlZCcpO1xuICAgIHJldHVybjtcbiAgfVxuXG4gIHRoaXMud3MuY2xvc2UoKTtcbiAgdGhpcy53cyA9IG51bGw7XG4gIHRoaXMudXJpID0gbnVsbDtcbn07XG5cblxuRWNob0NsaWVudC5wcm90b3R5cGUuaXNPcGVuID0gZnVuY3Rpb24oKSB7XG4gIHJldHVybiB0aGlzLndzIGluc3RhbmNlb2YgV2ViU29ja2V0O1xufTtcblxuXG5FY2hvQ2xpZW50LnByb3RvdHlwZS5pc0Nsb3NlZCA9IGZ1bmN0aW9uKCkge1xuICByZXR1cm4gIXRoaXMuaXNPcGVuKCk7XG59O1xuXG5cbkVjaG9DbGllbnQucHJvdG90eXBlLnNlbmQgPSBmdW5jdGlvbiAobWVzc2FnZSkge1xuICBpZiAoIW1lc3NhZ2UgfHwgIXRoaXMuaXNPcGVuKCkpIHJldHVybjtcbiAgdGhpcy5sYXN0U2VudFRpbWVzdGFtcCA9IG5ldyBEYXRlKCkuZ2V0VGltZSgpO1xuICB0aGlzLndzLnNlbmQobWVzc2FnZSk7XG59O1xuXG5cbkVjaG9DbGllbnQucHJvdG90eXBlLnNlbmRIaXN0b3J5Q29tbWFuZCA9IGZ1bmN0aW9uICgpIHtcbiAgdGhpcy5zZW5kKCdbSElTVE9SWV0nKTtcbn07XG5cblxuRWNob0NsaWVudC5wcm90b3R5cGUuaGlzdG9yeUZpbHRlciA9IGZ1bmN0aW9uKHBhdHRlcm4pIHtcbiAgaWYgKCF0aGlzLmNhY2hlKSByZXR1cm4gW107XG4gIGlmICghcGF0dGVybikgcmV0dXJuIHRoaXMuY2FjaGU7XG5cbiAgdmFyIHJlZ2V4ID0gbmV3IFJlZ0V4cChwYXR0ZXJuLCBcImlcIik7XG4gIHZhciBmaWx0ZXJlZCA9IF8uZmlsdGVyKHRoaXMuY2FjaGUubWVzc2FnZXMsIGZ1bmN0aW9uKG1lc3NhZ2UpIHtcbiAgICByZXR1cm4gcmVnZXgudGVzdChtZXNzYWdlKTtcbiAgfSk7XG5cbiAgcmV0dXJuIHtcbiAgICBzdGF0dXM6IHRoaXMuY2FjaGUuc3RhdHVzLFxuICAgIHJlc3BvbnNlVGltZTogdGhpcy5jYWNoZS5yZXNwb25zZVRpbWUsXG4gICAgbWVzc2FnZXM6IGZpbHRlcmVkXG4gIH1cbn07XG5cblxuRWNob0NsaWVudC5wcm90b3R5cGUudmFsaWRhdGVQb3J0ID0gZnVuY3Rpb24ocG9ydCkge1xuICByZXR1cm4gcG9ydCA+PSAxMDI0ICYmIHBvcnQgPCA2NTUzNTtcbn07XG5cbiIsIi8vIG1vZGVsc1xudmFyIEFwcCA9IHJlcXVpcmUoJy4vbW9kZWxzL0FwcCcpXG4gIDtcblxuLy8gdmlld3NcbnZhciBTZXJ2ZXJDb250cm9sVmlldyA9IHJlcXVpcmUoJy4vdmlld3MvU2VydmVyQ29udHJvbFZpZXcnKVxuICAsIE1lc3NhZ2VQYW5lbFZpZXcgPSByZXF1aXJlKCcuL3ZpZXdzL01lc3NhZ2VQYW5lbFZpZXcnKVxuICA7XG5cblxudmFyIGFwcCA9IG5ldyBBcHAoKTtcblxuLy8gd2lyZSB1cCB2aWV3c1xuXG52YXIgc2VydmVyQ29udHJvbFZpZXcgPSBuZXcgU2VydmVyQ29udHJvbFZpZXcoe1xuICBtb2RlbDogYXBwLFxuICBlbDogJyNzZXJ2ZXItY29udHJvbCdcbn0pO1xuXG52YXIgbWVzc2FnZVBhbmVsVmlldyA9IG5ldyBNZXNzYWdlUGFuZWxWaWV3KHtcbiAgbW9kZWw6IGFwcCxcbiAgZWw6ICcjbWVzc2FnZS1wYW5lbCdcbn0pO1xuXG5tb2R1bGUuZXhwb3J0cyA9IHtcbiAgYXBwOiBhcHBcbn07XG5cbiIsInZhciBFY2hvQ2xpZW50ID0gcmVxdWlyZSgnLi8uLi9saWJzL2VjaG9jbGllbnQnKVxuICAsIEVjaG9SZXNwb25zZSA9IHJlcXVpcmUoJy4vRWNob1Jlc3BvbnNlJylcbiAgO1xuXG4vKipcbiAqIFRoZSBBcHAgbW9kZWwgcHJvdmlkZXMgYSBiYWNrYm9uZSB3cmFwcGVyIG92ZXIgRWNob0NsaWVudCBhbmQgc2VydmVyIGZ1bmN0aW9uc1xuICovXG52YXIgQXBwID0gQmFja2JvbmUuTW9kZWwuZXh0ZW5kKHtcbiAgZGVmYXVsdHM6IHtcbiAgICBob3N0OiAnbG9jYWxob3N0JyxcbiAgICBwb3J0OiA1NTU1LFxuICAgIHNlcnZlclN0YXRlOiAnc3RvcHBlZCdcbiAgfSxcblxuICBpbml0aWFsaXplOiBmdW5jdGlvbigpIHtcbiAgICB0aGlzLmNsaWVudCA9IG5ldyBFY2hvQ2xpZW50KCk7XG5cbiAgICAvLyBzeW5jIHVwIHdpdGggc2VydmVyIHN0YXR1c1xuICAgIHRoaXMuY2hlY2tTZXJ2ZXJTdGF0dXMoKTtcbiAgfSxcblxuICB2YWxpZGF0ZTogZnVuY3Rpb24oYXR0cnMpIHtcbiAgICBpZiAoIXRoaXMuY2xpZW50LnZhbGlkYXRlUG9ydChhdHRycy5wb3J0KSkge1xuICAgICAgcmV0dXJuICdpbnZhbGlkIHBvcnQnO1xuICAgIH1cbiAgfSxcblxuICBjaGVja1NlcnZlclN0YXR1czogZnVuY3Rpb24oKSB7XG4gICAgdmFyIHNlbGYgPSB0aGlzO1xuXG4gICAgJC5nZXRKU09OKCcvYXBpL3YxL2VjaG9zZXJ2ZXIvJyArIHRoaXMuZ2V0KCdwb3J0JyksIGZ1bmN0aW9uIChyZXN1bHQpIHtcbiAgICAgIGlmIChyZXN1bHQgJiYgcmVzdWx0LnN0YXR1cyA9PSAnZXJyb3InKSB7XG4gICAgICAgIGNvbnNvbGUubG9nKHJlc3VsdCk7XG4gICAgICAgIHNlbGYudHJpZ2dlcignc2VydmVyRXJyb3InLCByZXN1bHQubWVzc2FnZSk7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cblxuICAgICAgaWYgKHJlc3VsdCAmJiByZXN1bHQuc3RhdHVzID09ICdPSycgJiYgL3N0YXJ0ZWQvLnRlc3QocmVzdWx0Lm1lc3NhZ2UpKSB7XG4gICAgICAgIHNlbGYuc2V0KCdzZXJ2ZXJTdGF0ZScsICdzdGFydGVkJyk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBzZWxmLnNldCgnc2VydmVyU3RhdGUnLCAnc3RvcHBlZCcpO1xuICAgICAgfVxuICAgIH0pO1xuICB9LFxuXG4gIHN0YXJ0U2VydmVyOiBmdW5jdGlvbigpIHtcbiAgICBpZiAoIXRoaXMuaXNWYWxpZCgpKSByZXR1cm47XG4gICAgdGhpcy5zZW5kU2VydmVyQ29tbWFuZCgnc3RhcnQnKTtcbiAgfSxcblxuICBzdG9wU2VydmVyOiBmdW5jdGlvbigpIHtcbiAgICBpZiAoIXRoaXMuaXNWYWxpZCgpKSByZXR1cm47XG4gICAgdGhpcy5zZW5kU2VydmVyQ29tbWFuZCgnc3RvcCcpO1xuICB9LFxuXG4gIHNlbmRTZXJ2ZXJDb21tYW5kOiBmdW5jdGlvbihjb21tYW5kKSB7XG4gICAgaWYgKCF0aGlzLmlzVmFsaWQoKSkgcmV0dXJuO1xuXG4gICAgdGhpcy5zZXQoJ3NlcnZlckVycm9yJywgJycpO1xuXG4gICAgdmFyIHBvcnQgPSB0aGlzLmdldCgncG9ydCcpO1xuICAgIHZhciBzZWxmID0gdGhpcztcblxuICAgICQucG9zdCgnL2FwaS92MS9lY2hvc2VydmVyLycgKyBwb3J0ICsgJy8nICsgY29tbWFuZCwgZnVuY3Rpb24gKHJlc3VsdCkge1xuICAgICAgaWYgKHJlc3VsdCAmJiByZXN1bHQuc3RhdHVzID09ICdlcnJvcicpIHtcbiAgICAgICAgY29uc29sZS5sb2cocmVzdWx0KTtcbiAgICAgICAgc2VsZi50cmlnZ2VyKCdzZXJ2ZXJFcnJvcicsIHJlc3VsdC5tZXNzYWdlKTtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuXG4gICAgICBjb25zb2xlLmxvZygnc3VjY2VzczogJyArIHJlc3VsdC5tZXNzYWdlKTtcblxuICAgICAgdmFyIHN0YXJ0ZWQgPSAvc3RhcnRlZC8udGVzdChyZXN1bHQubWVzc2FnZSwgXCJpXCIpO1xuXG4gICAgICAvLyBvbmNlIHRoZSBzZXJ2ZXIgaXMgc3RhcnRlZCwgb3BlbiBhIGNsaWVudCBjb25uZWN0aW9uXG4gICAgICBpZiAoc3RhcnRlZCkge1xuICAgICAgICBzZWxmLnNldCgnc2VydmVyU3RhdGUnLCAnc3RhcnRlZCcpO1xuICAgICAgICBzZWxmLm9wZW4oKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHNlbGYuc2V0KCdzZXJ2ZXJTdGF0ZScsICdzdG9wcGVkJyk7XG4gICAgICAgIHNlbGYuY2xvc2UoKTtcbiAgICAgIH1cbiAgICB9KTtcbiAgfSxcblxuICBvcGVuOiBmdW5jdGlvbigpIHtcbiAgICBpZiAodGhpcy5jbGllbnQuaXNPcGVuKCkpIHJldHVybjtcbiAgICBjb25zb2xlLmxvZygnY2xpZW50IGNsb3NlJyk7XG5cbiAgICB2YXIgc2VsZiA9IHRoaXM7XG5cbiAgICBzZWxmLmNsaWVudC5vbm9wZW4gPSBmdW5jdGlvbigpIHtcbiAgICAgIGNvbnNvbGUubG9nKCdjbGllbnQgb3BlbicpO1xuICAgICAgc2VsZi50cmlnZ2VyKCdvcGVuJyk7XG4gICAgfTtcblxuICAgIHNlbGYuY2xpZW50Lm9uY2xvc2UgPSBmdW5jdGlvbigpIHtcbiAgICAgIGNvbnNvbGUubG9nKCdjbGllbnQgY2xvc2UnKTtcbiAgICAgIC8vIHJlbGVhc2UgaGFuZGxlcnNcbiAgICAgIHNlbGYuY2xpZW50Lm9ub3BlbiA9IG51bGw7XG4gICAgICBzZWxmLmNsaWVudC5vbmNsb3NlID0gbnVsbDtcbiAgICAgIHNlbGYuY2xpZW50Lm9uZXJyb3IgPSBudWxsO1xuICAgICAgc2VsZi5jbGllbnQub25tZXNzYWdlID0gbnVsbDtcbiAgICAgIHNlbGYuY2xpZW50Lm9uaGlzdG9yeSA9IG51bGw7XG5cbiAgICAgIHNlbGYudHJpZ2dlcignY2xvc2UnKTtcbiAgICB9O1xuXG4gICAgc2VsZi5jbGllbnQub25lcnJvciA9IGZ1bmN0aW9uKGVycikge1xuICAgICAgY29uc29sZS5sb2coJ2NsaWVudCBlcnJvcicsIGVycik7XG4gICAgICBzZWxmLnRyaWdnZXIoJ2Vycm9yJywgZXJyKTtcbiAgICB9O1xuXG4gICAgc2VsZi5jbGllbnQub25tZXNzYWdlID0gZnVuY3Rpb24ocmVzcG9uc2UpIHtcbiAgICAgIGNvbnNvbGUubG9nKHJlc3BvbnNlKTtcbiAgICAgIHZhciBlciA9IG5ldyBFY2hvUmVzcG9uc2UocmVzcG9uc2UpO1xuICAgICAgc2VsZi50cmlnZ2VyKCdtZXNzYWdlJywgZXIpO1xuICAgIH07XG5cbiAgICBzZWxmLmNsaWVudC5vbmhpc3RvcnkgPSBmdW5jdGlvbihyZXNwb25zZSkge1xuICAgICAgY29uc29sZS5sb2cocmVzcG9uc2UpO1xuICAgICAgdmFyIGVyID0gbmV3IEVjaG9SZXNwb25zZShyZXNwb25zZSk7XG4gICAgICBzZWxmLnRyaWdnZXIoJ2hpc3RvcnknLCBlcik7XG4gICAgfTtcblxuICAgIHZhciB1cmkgPSAnd3M6Ly8nICsgdGhpcy5nZXQoJ2hvc3QnKSArICc6JyArIHRoaXMuZ2V0KCdwb3J0Jyk7XG4gICAgY29uc29sZS5sb2coJ2NsaWVudCBvcGVuOiAnICsgdXJpKTtcbiAgICB0aGlzLmNsaWVudC5vcGVuKHVyaSk7XG4gIH0sXG5cbiAgY2xvc2U6IGZ1bmN0aW9uKCkge1xuICAgIGlmICh0aGlzLmNsaWVudC5pc0Nsb3NlZCgpKSByZXR1cm47XG4gICAgY29uc29sZS5sb2coJ2NsaWVudCBjbG9zZScpO1xuICAgIHRoaXMuY2xpZW50LmNsb3NlKCk7XG4gIH0sXG5cbiAgc2VuZDogZnVuY3Rpb24obWVzc2FnZSkge1xuICAgIGlmICghdGhpcy5jbGllbnQuaXNPcGVuKCkpIHJldHVybjtcblxuICAgIGNvbnNvbGUubG9nKCdjbGllbnQgc2VuZDogJyArIG1lc3NhZ2UpO1xuICAgIHRoaXMuY2xpZW50LnNlbmQobWVzc2FnZSk7XG4gIH1cbn0pO1xuXG5tb2R1bGUuZXhwb3J0cyA9IEFwcDtcblxuIiwidmFyIEVjaG9SZXNwb25zZSA9IEJhY2tib25lLk1vZGVsLmV4dGVuZCh7XG4gIGRlZmF1bHRzOiB7XG4gICAgc3RhdHVzOiAnJyxcbiAgICByZXNwb25zZVRpbWU6IG5ldyBEYXRlKCkuZ2V0VGltZSgpLFxuICAgIHR5cGU6ICdtZXNzYWdlJyxcbiAgICBtZXNzYWdlczogWyAnJyBdXG4gIH0sXG5cbiAgdG9EaXNwbGF5U3RyaW5nOiBmdW5jdGlvbigpIHtcbiAgICAvLyBpZiBub3QgYSBtZXNzYWdlIHJlc3BvbnNlIChzdWNoIGFzIGEgaGlzdG9yeSByZXNwb25zZSksXG4gICAgLy8gdGhlbiBvbmx5IGRpc3BsYXkgdGhlIHJlc3BvbnNlIHRpbWVcbiAgICByZXR1cm4gdGhpcy5nZXQoJ3R5cGUnKSAhPSAnbWVzc2FnZSdcbiAgICAgID8gJ1tyZXNwb25zZV0gJyArIHRoaXMuZ2V0KCdyZXNwb25zZVRpbWUnKSArICdtcydcbiAgICAgIDogJ1wiJyArIHRoaXMuZ2V0KCdtZXNzYWdlcycpWzBdICsgJ1wiLCAnICsgdGhpcy5nZXQoJ3Jlc3BvbnNlVGltZScpICsgJ21zJztcbiAgfVxufSk7XG5cbm1vZHVsZS5leHBvcnRzID0gRWNob1Jlc3BvbnNlOyIsIm1vZHVsZS5leHBvcnRzID0gQmFja2JvbmUuVmlldy5leHRlbmQoe1xuICBpbml0aWFsaXplOiBmdW5jdGlvbigpIHtcbiAgICB0aGlzLnJlbmRlcigpO1xuICB9LFxuXG4gIHRlbXBsYXRlOiBIYW5kbGViYXJzLmNvbXBpbGUoJCgnI21lc3NhZ2UtaGlzdG9yeS10ZW1wbGF0ZScpLmh0bWwoKSksXG5cbiAgcmVuZGVyOiBmdW5jdGlvbigpIHtcbiAgICB2YXIgYXJncyA9IHtcbiAgICB9O1xuXG4gICAgdGhpcy4kZWwuaHRtbCh0aGlzLnRlbXBsYXRlKGFyZ3MpKTtcblxuICAgIHJldHVybiB0aGlzO1xuICB9XG59KTsiLCJ2YXIgTWVzc2FnZVNlbmRWaWV3ID0gcmVxdWlyZSgnLi9NZXNzYWdlU2VuZFZpZXcnKVxuICAsIE1lc3NhZ2VSZWNlaXZlVmlldyA9IHJlcXVpcmUoJy4vTWVzc2FnZVJlY2VpdmVWaWV3JylcbiAgLCBNZXNzYWdlSGlzdG9yeVZpZXcgPSByZXF1aXJlKCcuL01lc3NhZ2VIaXN0b3J5VmlldycpXG4gIDtcblxubW9kdWxlLmV4cG9ydHMgPSBCYWNrYm9uZS5WaWV3LmV4dGVuZCh7XG4gIGluaXRpYWxpemU6IGZ1bmN0aW9uICgpIHtcblxuICAgIHRoaXMuc2VuZFZpZXcgPSBuZXcgTWVzc2FnZVNlbmRWaWV3KHtcbiAgICAgIG1vZGVsOiB0aGlzLm1vZGVsXG4gICAgfSk7XG5cbiAgICB0aGlzLnJlY2VpdmVWaWV3ID0gbmV3IE1lc3NhZ2VSZWNlaXZlVmlldyh7XG4gICAgICBtb2RlbDogdGhpcy5tb2RlbFxuICAgIH0pO1xuXG4gICAgdGhpcy5oaXN0b3J5VmlldyA9IG5ldyBNZXNzYWdlSGlzdG9yeVZpZXcoe1xuICAgICAgbW9kZWw6IHRoaXMubW9kZWxcbiAgICB9KTtcblxuICAgIHRoaXMucmVuZGVyKCk7XG5cbiAgICB0aGlzLmxpc3RlblRvKHRoaXMubW9kZWwsICdjaGFuZ2U6c2VydmVyU3RhdGUnLCB0aGlzLnJlbmRlcik7XG4gIH0sXG5cbiAgdGVtcGxhdGU6IEhhbmRsZWJhcnMuY29tcGlsZSgkKCcjbWVzc2FnZS1wYW5lbC10ZW1wbGF0ZScpLmh0bWwoKSksXG5cbiAgcmVuZGVyOiBmdW5jdGlvbiAoKSB7XG4gICAgdmFyIHNlcnZlclN0YXRlID0gdGhpcy5tb2RlbC5nZXQoJ3NlcnZlclN0YXRlJyk7XG5cbiAgICB2YXIgYXJncyA9IHtcbiAgICAgIGhpZGRlbjogc2VydmVyU3RhdGUgPT0gJ3N0YXJ0ZWQnID8gJ3Zpc2libGUnIDogJ2NvbGxhcHNlJ1xuICAgIH07XG5cbiAgICB0aGlzLiRlbC5odG1sKHRoaXMudGVtcGxhdGUoYXJncykpO1xuXG4gICAgdGhpcy5zZW5kVmlldy5zZXRFbGVtZW50KHRoaXMuJCgnI21lc3NhZ2Utc2VuZCcpKS5yZW5kZXIoKTtcbiAgICB0aGlzLnJlY2VpdmVWaWV3LnNldEVsZW1lbnQodGhpcy4kKCcjbWVzc2FnZS1yZWNlaXZlJykpLnJlbmRlcigpO1xuICAgIHRoaXMuaGlzdG9yeVZpZXcuc2V0RWxlbWVudCh0aGlzLiQoJyNtZXNzYWdlLWhpc3RvcnknKSkucmVuZGVyKCk7XG5cbiAgICByZXR1cm4gdGhpcztcbiAgfSxcblxufSk7XG4iLCJ2YXIgRWNob1Jlc3BvbnNlID0gcmVxdWlyZSgnLi8uLi9tb2RlbHMvRWNob1Jlc3BvbnNlJyk7XG5cbm1vZHVsZS5leHBvcnRzID0gQmFja2JvbmUuVmlldy5leHRlbmQoe1xuICBpbml0aWFsaXplOiBmdW5jdGlvbigpIHtcbiAgICB2YXIgc2VsZiA9IHRoaXM7XG5cbiAgICB0aGlzLnJlbmRlcigpO1xuXG4gICAgdGhpcy5tb2RlbC5vbignbWVzc2FnZSBoaXN0b3J5JywgZnVuY3Rpb24ocmVzcG9uc2UpIHtcbiAgICAgIHNlbGYucmVuZGVyKHJlc3BvbnNlKTtcbiAgICB9KVxuICB9LFxuXG4gIHRlbXBsYXRlOiBIYW5kbGViYXJzLmNvbXBpbGUoJCgnI21lc3NhZ2UtcmVjZWl2ZS10ZW1wbGF0ZScpLmh0bWwoKSksXG5cbiAgcmVuZGVyOiBmdW5jdGlvbigpIHtcbiAgICB2YXIgcmVzcG9uc2UgPSBhcmd1bWVudHNbMF07XG4gICAgaWYgKCEocmVzcG9uc2UgaW5zdGFuY2VvZiBFY2hvUmVzcG9uc2UpKSByZXR1cm47XG5cbiAgICB2YXIgYXJncyA9IHtcbiAgICAgIG1lc3NhZ2U6IHJlc3BvbnNlLnRvRGlzcGxheVN0cmluZygpXG4gICAgfTtcblxuICAgIHRoaXMuJGVsLmh0bWwodGhpcy50ZW1wbGF0ZShhcmdzKSk7XG5cbiAgICByZXR1cm4gdGhpcztcbiAgfVxufSk7IiwibW9kdWxlLmV4cG9ydHMgPSBCYWNrYm9uZS5WaWV3LmV4dGVuZCh7XG4gIGluaXRpYWxpemU6IGZ1bmN0aW9uKCkge1xuICAgIHRoaXMucmVuZGVyKCk7XG4gIH0sXG5cbiAgZXZlbnRzOiB7XG4gICAgJ2NsaWNrICNidG5zZW5kbWVzc2FnZSc6ICdzZW5kTWVzc2FnZScsXG4gICAgJ2lucHV0ICNtZXNzYWdlJzogJ3RvZ2dsZUVuYWJsZUJ1dHRvbidcbiAgfSxcblxuICB0ZW1wbGF0ZTogSGFuZGxlYmFycy5jb21waWxlKCQoJyNtZXNzYWdlLXNlbmQtdGVtcGxhdGUnKS5odG1sKCkpLFxuXG4gIHJlbmRlcjogZnVuY3Rpb24oKSB7XG4gICAgdmFyIGFyZ3MgPSB7XG4gICAgfTtcblxuICAgIHRoaXMuJGVsLmh0bWwodGhpcy50ZW1wbGF0ZShhcmdzKSk7XG5cbiAgICByZXR1cm4gdGhpcztcbiAgfSxcblxuICBtZXNzYWdlVGV4dDogZnVuY3Rpb24oKSB7XG4gICAgaWYgKGFyZ3VtZW50cy5sZW5ndGggPT0gMCkge1xuICAgICAgcmV0dXJuICQoJyNtZXNzYWdlJykudmFsKCk7XG4gICAgfSBlbHNlIHtcbiAgICAgICQoJyNtZXNzYWdlJykudmFsKGFyZ3VtZW50c1swXSk7XG4gICAgfVxuICB9LFxuXG4gIHRvZ2dsZUVuYWJsZUJ1dHRvbjogZnVuY3Rpb24oKSB7XG4gICAgaWYgKHRoaXMubWVzc2FnZVRleHQoKSkge1xuICAgICAgY29uc29sZS5sb2coJ3ZhbHVlJyk7XG4gICAgICAkKCcjYnRuc2VuZG1lc3NhZ2UnKS5yZW1vdmVDbGFzcygnZGlzYWJsZWQnKTtcbiAgICB9IGVsc2Uge1xuICAgICAgY29uc29sZS5sb2coJ2VtcHR5Jyk7XG4gICAgICAkKCcjYnRuc2VuZG1lc3NhZ2UnKS5hZGRDbGFzcygnZGlzYWJsZWQnKTtcbiAgICB9XG4gIH0sXG5cbiAgc2VuZE1lc3NhZ2U6IGZ1bmN0aW9uKCkge1xuICAgIHZhciBtZXNzYWdlID0gdGhpcy5tZXNzYWdlVGV4dCgpO1xuICAgIGlmIChtZXNzYWdlKSB0aGlzLm1vZGVsLnNlbmQobWVzc2FnZSk7XG4gICAgdGhpcy5tZXNzYWdlVGV4dCgnJyk7XG4gIH1cbn0pO1xuIiwibW9kdWxlLmV4cG9ydHMgPSBCYWNrYm9uZS5WaWV3LmV4dGVuZCh7XG4gIHNlcnZlckVycm9yTWVzc2FnZTogbnVsbCxcblxuICBpbml0aWFsaXplOiBmdW5jdGlvbigpIHtcbiAgICB2YXIgc2VsZiA9IHRoaXM7XG5cbiAgICB0aGlzLnJlbmRlcigpO1xuXG4gICAgdGhpcy5saXN0ZW5Ubyh0aGlzLm1vZGVsLCAnY2hhbmdlOnNlcnZlclN0YXRlJywgdGhpcy5yZW5kZXIpO1xuXG4gICAgdGhpcy5tb2RlbC5vbignc2VydmVyRXJyb3InLCBmdW5jdGlvbihlcnIpIHtcbiAgICAgIHNlbGYuc2VydmVyRXJyb3IgPSBlcnI7XG4gICAgICBzZWxmLnJlbmRlcigpO1xuICAgIH0pXG4gIH0sXG5cbiAgZXZlbnRzOiB7XG4gICAgJ2NsaWNrICNidG5zZXJ2ZXInOiAndG9nZ2xlc3RhcnQnXG4gIH0sXG5cbiAgdGVtcGxhdGU6IEhhbmRsZWJhcnMuY29tcGlsZSgkKCcjc2VydmVyLWNvbnRyb2wtdGVtcGxhdGUnKS5odG1sKCkpLFxuXG4gIHJlbmRlcjogZnVuY3Rpb24oKSB7XG4gICAgdmFyIHBvcnQgPSB0aGlzLm1vZGVsLmdldCgncG9ydCcpO1xuICAgIHZhciBzZXJ2ZXJTdGF0ZSA9IHRoaXMubW9kZWwuZ2V0KCdzZXJ2ZXJTdGF0ZScpO1xuICAgIHZhciBzZXJ2ZXJTdGF0ZVRleHQgPSBzZXJ2ZXJTdGF0ZSA9PSAnc3RhcnRlZCdcbiAgICAgID8gJ3N0YXJ0ZWQgKHBvcnQgJyArIHBvcnQgKyAnKSdcbiAgICAgIDogc2VydmVyU3RhdGU7XG4gICAgdmFyIHNlcnZlckVycm9yID0gdGhpcy5zZXJ2ZXJFcnJvciA/ICcgRXJyb3I6ICcgKyB0aGlzLnNlcnZlckVycm9yIDogbnVsbDtcbiAgICB2YXIgc2VydmVyRXJyb3JDbGFzcyA9IHNlcnZlckVycm9yID8gJ3Zpc2libGUnIDogJ2hpZGRlbic7XG5cbiAgICB2YXIgYXJncyA9IHtcbiAgICAgIHN0YXRlQ2xhc3M6IHNlcnZlclN0YXRlLFxuICAgICAgc2VydmVyU3RhdGU6IHNlcnZlclN0YXRlVGV4dCxcbiAgICAgIHNlcnZlclBvcnQ6IHBvcnQsXG4gICAgICBpbnB1dFZpc2liaWxpdHk6IHNlcnZlclN0YXRlID09ICdzdGFydGVkJyA/ICdjb2xsYXBzZScgOiAndmlzaWJsZScsXG4gICAgICBzZXJ2ZXJDb21tYW5kOiBzZXJ2ZXJTdGF0ZSA9PSAnc3RhcnRlZCcgPyAnU3RvcCcgOiAnU3RhcnQnLFxuICAgICAgc2VydmVyRXJyb3JDbGFzczogc2VydmVyRXJyb3JDbGFzcyxcbiAgICAgIHNlcnZlckVycm9yOiBzZXJ2ZXJFcnJvclxuICAgIH07XG5cbiAgICB0aGlzLiRlbC5odG1sKHRoaXMudGVtcGxhdGUoYXJncykpO1xuXG4gICAgJCgnI3BvcnRudW1iZXInKS5mb2N1cygpO1xuXG4gICAgcmV0dXJuIHRoaXM7XG4gIH0sXG5cbiAgcG9ydDogZnVuY3Rpb24oKSB7XG4gICAgcmV0dXJuICQoJyNwb3J0bnVtYmVyJykudmFsKCk7XG4gIH0sXG5cbiAgdG9nZ2xlc3RhcnQ6IGZ1bmN0aW9uKCkge1xuICAgIC8vIGNsZWFyIHByZXZpb3VzIGVycm9yIG1lc3NhZ2VcbiAgICB0aGlzLnNlcnZlckVycm9yID0gbnVsbDtcbiAgICAkKCcjc2VydmVyLWVycm9yJykuaHRtbCgnJyk7XG5cbiAgICB2YXIgcG9ydCA9IHRoaXMucG9ydCgpO1xuICAgIHRoaXMubW9kZWwuc2V0KCdwb3J0JywgcG9ydCwgeyB2YWxpZGF0ZTogdHJ1ZSB9KTtcbiAgICBpZiAodGhpcy5tb2RlbC52YWxpZGF0aW9uRXJyb3IpIHtcbiAgICAgICQoJyNwb3J0bnVtYmVyJykudmFsKCcnKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICB2YXIgY29tbWFuZCA9IHRoaXMubW9kZWwuZ2V0KCdzZXJ2ZXJTdGF0ZScpID09ICdzdGFydGVkJyA/ICdzdG9wJyA6ICdzdGFydCc7XG4gICAgdGhpcy5tb2RlbC5zZW5kU2VydmVyQ29tbWFuZChjb21tYW5kKTtcbiAgfVxufSk7XG4iXX0=
