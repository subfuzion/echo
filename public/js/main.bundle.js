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
  if (!this.cache || !this.isOpen()) return [];
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
        self.trigger('serverError', result.message);
        return;
      }

      if (result && result.status == 'OK' && /started/.test(result.message)) {
        self.set('serverState', 'started');

        // go ahead and open a client if the server is listening
        self.open();
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
        self.trigger('serverError', result.message);
        return;
      }

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

    var self = this;

    self.client.onopen = function() {
      self.trigger('open');
    };

    self.client.onclose = function() {
      // release handlers
      self.client.onopen = null;
      self.client.onclose = null;
      self.client.onerror = null;
      self.client.onmessage = null;
      self.client.onhistory = null;

      self.trigger('close');
    };

    self.client.onerror = function(err) {
      self.trigger('error', err);
    };

    self.client.onmessage = function(response) {
      var er = new EchoResponse(response);
      self.trigger('message', er);
    };

    self.client.onhistory = function(response) {
      var er = new EchoResponse(response);
      self.trigger('history', er);
    };

    var uri = 'ws://' + this.get('host') + ':' + this.get('port');
    this.client.open(uri);
  },

  close: function() {
    if (this.client.isClosed()) return;
    this.client.close();
  },

  send: function(message) {
    if (!this.client.isOpen()) return;
    this.client.send(message);
  },

  sendHistoryCommand: function() {
    // just a shortcut for entering '[HISTORY]'
    if (!this.client.isOpen()) return;
    this.client.sendHistoryCommand();
  },

  historyFilter: function(pattern) {
    return this.client.historyFilter(pattern);
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
var EchoResponse = require('./../models/EchoResponse');

module.exports = Backbone.View.extend({
  initialize: function(options) {
    var self = this;

    this.render();

    this.model.on('history', function(response) {
      self.render(response);
    });
  },

  events: {
    'input #searchfilter': 'filterMessages',
    'click #btngethistory': 'getHistory'
  },

  template: Handlebars.compile($('#message-history-template').html()),

  render: function() {
    var response = arguments[0] || [];

    // the check is because cached messages from the server aren't
    // wrapped in EchoResponse backbone objects, just pojos
    var messages = response instanceof EchoResponse
      ? response.toJSON().messages
      : response.messages;

    var args = {
      messages: messages
    };

    this.$el.html(this.template(args));

    this.filterPattern(this.pattern);

    return this;
  },

  getHistory: function() {
    // just a shortcut for entering '[HISTORY]'
    this.model.sendHistoryCommand();
  },

  filterPattern: function() {
    if (arguments.length == 0) {
      return $('#searchfilter').val();
    } else {
      $('#searchfilter').val(arguments[0]);
      $('#searchfilter').focus();
    }
  },

  filterMessages: function() {
    this.pattern = this.filterPattern();
    var filtered = this.model.historyFilter(this.pattern);
    this.render(filtered);
  }
});
},{"./../models/EchoResponse":5}],7:[function(require,module,exports){
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
      model: this.model,
      el: '#message-history'
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
  }

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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZ2VuZXJhdGVkLmpzIiwic291cmNlcyI6WyIvVXNlcnMvdG9ueS9wcm9qZWN0cy9HaXRIdWIvZWNoby9lY2hvL25vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCIvVXNlcnMvdG9ueS9wcm9qZWN0cy9HaXRIdWIvZWNoby9lY2hvL2NsaWVudC9zY3JpcHRzL2xpYnMvZWNob2NsaWVudC5qcyIsIi9Vc2Vycy90b255L3Byb2plY3RzL0dpdEh1Yi9lY2hvL2VjaG8vY2xpZW50L3NjcmlwdHMvbWFpbi5qcyIsIi9Vc2Vycy90b255L3Byb2plY3RzL0dpdEh1Yi9lY2hvL2VjaG8vY2xpZW50L3NjcmlwdHMvbW9kZWxzL0FwcC5qcyIsIi9Vc2Vycy90b255L3Byb2plY3RzL0dpdEh1Yi9lY2hvL2VjaG8vY2xpZW50L3NjcmlwdHMvbW9kZWxzL0VjaG9SZXNwb25zZS5qcyIsIi9Vc2Vycy90b255L3Byb2plY3RzL0dpdEh1Yi9lY2hvL2VjaG8vY2xpZW50L3NjcmlwdHMvdmlld3MvTWVzc2FnZUhpc3RvcnlWaWV3LmpzIiwiL1VzZXJzL3RvbnkvcHJvamVjdHMvR2l0SHViL2VjaG8vZWNoby9jbGllbnQvc2NyaXB0cy92aWV3cy9NZXNzYWdlUGFuZWxWaWV3LmpzIiwiL1VzZXJzL3RvbnkvcHJvamVjdHMvR2l0SHViL2VjaG8vZWNoby9jbGllbnQvc2NyaXB0cy92aWV3cy9NZXNzYWdlUmVjZWl2ZVZpZXcuanMiLCIvVXNlcnMvdG9ueS9wcm9qZWN0cy9HaXRIdWIvZWNoby9lY2hvL2NsaWVudC9zY3JpcHRzL3ZpZXdzL01lc3NhZ2VTZW5kVmlldy5qcyIsIi9Vc2Vycy90b255L3Byb2plY3RzL0dpdEh1Yi9lY2hvL2VjaG8vY2xpZW50L3NjcmlwdHMvdmlld3MvU2VydmVyQ29udHJvbFZpZXcuanMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7QUNBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN2SUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7OztBQzVCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2pKQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDakJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMzREE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDN0NBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzNCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM3Q0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBIiwic291cmNlc0NvbnRlbnQiOlsiKGZ1bmN0aW9uIGUodCxuLHIpe2Z1bmN0aW9uIHMobyx1KXtpZighbltvXSl7aWYoIXRbb10pe3ZhciBhPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7aWYoIXUmJmEpcmV0dXJuIGEobywhMCk7aWYoaSlyZXR1cm4gaShvLCEwKTt0aHJvdyBuZXcgRXJyb3IoXCJDYW5ub3QgZmluZCBtb2R1bGUgJ1wiK28rXCInXCIpfXZhciBmPW5bb109e2V4cG9ydHM6e319O3Rbb11bMF0uY2FsbChmLmV4cG9ydHMsZnVuY3Rpb24oZSl7dmFyIG49dFtvXVsxXVtlXTtyZXR1cm4gcyhuP246ZSl9LGYsZi5leHBvcnRzLGUsdCxuLHIpfXJldHVybiBuW29dLmV4cG9ydHN9dmFyIGk9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtmb3IodmFyIG89MDtvPHIubGVuZ3RoO28rKylzKHJbb10pO3JldHVybiBzfSkiLCIvKipcbiAqIEEgY2xpZW50IGZvciB0aGUgZWNoby5pbyBzZXJ2ZXJcbiAqIEBjb25zdHJ1Y3RvclxuICovXG52YXIgRWNob0NsaWVudCA9IG1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gKCkge1xuICB0aGlzLnVyaSA9IG51bGw7XG4gIHRoaXMud3MgPSBudWxsO1xuICB0aGlzLmxhc3RTZW50VGltZXN0YW1wID0gbnVsbDtcbiAgdGhpcy5sYXN0UmVjZWl2ZWRUaW1lc3RhbXAgPSBudWxsO1xuICB0aGlzLmNhY2hlID0gbnVsbDtcblxuICAvLyBoYW5kbGVyc1xuICB0aGlzLm9ub3BlbiA9IG51bGw7XG4gIHRoaXMub25jbG9zZSA9IG51bGw7XG4gIHRoaXMub25lcnJvciA9IG51bGw7XG4gIHRoaXMub25tZXNzYWdlID0gbnVsbDtcbiAgdGhpcy5vbmhpc3RvcnkgPSBudWxsO1xufTtcblxuXG5FY2hvQ2xpZW50LnByb3RvdHlwZS5vcGVuID0gZnVuY3Rpb24odXJpKSB7XG4gIHZhciBzZWxmID0gdGhpcztcblxuICBmdW5jdGlvbiBjYWxsSGFuZGxlcihldmVudCkge1xuICAgIHZhciBoYW5kbGVyID0gc2VsZlsnb24nICsgZXZlbnRdO1xuICAgIGlmICh0eXBlb2YgaGFuZGxlciA9PSAnZnVuY3Rpb24nKSB7XG4gICAgICBoYW5kbGVyLmFwcGx5KGhhbmRsZXIsIFtdLnNsaWNlLmNhbGwoYXJndW1lbnRzLCAxKSk7XG4gICAgfVxuICB9XG5cbiAgaWYgKHRoaXMuaXNPcGVuKCkpIHtcbiAgICBjb25zb2xlLmxvZygnZXJyb3I6IGFscmVhZHkgb3BlbiBvbiB1cmkgJyArIHRoaXMudXJpKTtcbiAgICBjYWxsSGFuZGxlcignZXJyb3InLCAnYWxyZWFkeSBvcGVuIG9uIHVyaSAnICsgdGhpcy51cmkpO1xuICAgIHJldHVybjtcbiAgfVxuXG4gIGlmICghdGhpcy52YWxpZGF0ZVBvcnQpIHtcbiAgICBjb25zb2xlLmxvZygnZXJyb3I6IGludmFsaWQgcG9ydDogJyArIHRoaXMucG9ydCk7XG4gICAgY2FsbEhhbmRsZXIoJ2Vycm9yJywgJ2ludmFsaWQgcG9ydCcpO1xuICAgIHJldHVybjtcbiAgfVxuXG4gIHRoaXMudXJpID0gdXJpO1xuICB0aGlzLndzID0gbmV3IFdlYlNvY2tldCh1cmkpO1xuXG4gIHRoaXMud3Mub25vcGVuID0gZnVuY3Rpb24gKCkge1xuICAgIGNhbGxIYW5kbGVyKCdvcGVuJyk7XG4gIH07XG5cbiAgdGhpcy53cy5vbmNsb3NlID0gZnVuY3Rpb24oKSB7XG4gICAgY2FsbEhhbmRsZXIoJ2Nsb3NlJyk7XG4gIH07XG5cbiAgdGhpcy53cy5vbm1lc3NhZ2UgPSBmdW5jdGlvbiAobWVzc2FnZUV2ZW50KSB7XG4gICAgc2VsZi5sYXN0UmVjZWl2ZWRUaW1lc3RhbXAgPSBuZXcgRGF0ZSgpLmdldFRpbWUoKTtcblxuICAgIHZhciBtZXNzYWdlID0gSlNPTi5wYXJzZShtZXNzYWdlRXZlbnQuZGF0YSk7XG5cbiAgICBtZXNzYWdlLnJlc3BvbnNlVGltZSA9IHNlbGYubGFzdFJlY2VpdmVkVGltZXN0YW1wIC0gc2VsZi5sYXN0U2VudFRpbWVzdGFtcDtcblxuICAgIC8vaWYgKG1lc3NhZ2UubWVzc2FnZXMubGVuZ3RoID4gMSkge1xuICAgIGlmIChtZXNzYWdlLnR5cGUgPT0gJ2hpc3RvcnknKSB7XG4gICAgICAvLyB0aGlzIGlzIGEgaGlzdG9yeSBtZXNzYWdlXG4gICAgICAvLyBjYWNoZSBpdCBpbiBjYXNlIHRoZSB1c2VyIHdhbnRzIHRvIGZpbHRlclxuICAgICAgLy8gKG5vIG5lZWQgZm9yIGFub3RoZXIgcm91bmQgdHJpcClcbiAgICAgIHNlbGYuY2FjaGUgPSBtZXNzYWdlO1xuICAgICAgY2FsbEhhbmRsZXIoJ2hpc3RvcnknLCBtZXNzYWdlKTtcbiAgICB9IGVsc2Uge1xuICAgICAgLy8gY2FjaGUgaXMgbm93IHN0YWxlLCBzbyBqdXN0IGNsZWFyIGl0XG4gICAgICBzZWxmLmNhY2hlID0gbnVsbDtcbiAgICAgIGNhbGxIYW5kbGVyKCdtZXNzYWdlJywgbWVzc2FnZSk7XG4gICAgfVxuICB9O1xuXG4gIHRoaXMud3Mub25lcnJvciA9IGZ1bmN0aW9uIChlcnIpIHtcbiAgICBjYWxsSGFuZGxlcignZXJyb3InLCBlcnIpO1xuICB9O1xufTtcblxuXG5FY2hvQ2xpZW50LnByb3RvdHlwZS5jbG9zZSA9IGZ1bmN0aW9uKCkge1xuICBpZiAodGhpcy5pc0Nsb3NlZCgpKSB7XG4gICAgY29uc29sZS5sb2coJ2FscmVhZHkgY2xvc2VkJyk7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgdGhpcy53cy5jbG9zZSgpO1xuICB0aGlzLndzID0gbnVsbDtcbiAgdGhpcy51cmkgPSBudWxsO1xufTtcblxuXG5FY2hvQ2xpZW50LnByb3RvdHlwZS5pc09wZW4gPSBmdW5jdGlvbigpIHtcbiAgcmV0dXJuIHRoaXMud3MgaW5zdGFuY2VvZiBXZWJTb2NrZXQ7XG59O1xuXG5cbkVjaG9DbGllbnQucHJvdG90eXBlLmlzQ2xvc2VkID0gZnVuY3Rpb24oKSB7XG4gIHJldHVybiAhdGhpcy5pc09wZW4oKTtcbn07XG5cblxuRWNob0NsaWVudC5wcm90b3R5cGUuc2VuZCA9IGZ1bmN0aW9uIChtZXNzYWdlKSB7XG4gIGlmICghbWVzc2FnZSB8fCAhdGhpcy5pc09wZW4oKSkgcmV0dXJuO1xuICB0aGlzLmxhc3RTZW50VGltZXN0YW1wID0gbmV3IERhdGUoKS5nZXRUaW1lKCk7XG4gIHRoaXMud3Muc2VuZChtZXNzYWdlKTtcbn07XG5cblxuRWNob0NsaWVudC5wcm90b3R5cGUuc2VuZEhpc3RvcnlDb21tYW5kID0gZnVuY3Rpb24gKCkge1xuICB0aGlzLnNlbmQoJ1tISVNUT1JZXScpO1xufTtcblxuXG5FY2hvQ2xpZW50LnByb3RvdHlwZS5oaXN0b3J5RmlsdGVyID0gZnVuY3Rpb24ocGF0dGVybikge1xuICBpZiAoIXRoaXMuY2FjaGUgfHwgIXRoaXMuaXNPcGVuKCkpIHJldHVybiBbXTtcbiAgaWYgKCFwYXR0ZXJuKSByZXR1cm4gdGhpcy5jYWNoZTtcblxuICB2YXIgcmVnZXggPSBuZXcgUmVnRXhwKHBhdHRlcm4sIFwiaVwiKTtcbiAgdmFyIGZpbHRlcmVkID0gXy5maWx0ZXIodGhpcy5jYWNoZS5tZXNzYWdlcywgZnVuY3Rpb24obWVzc2FnZSkge1xuICAgIHJldHVybiByZWdleC50ZXN0KG1lc3NhZ2UpO1xuICB9KTtcblxuICByZXR1cm4ge1xuICAgIHN0YXR1czogdGhpcy5jYWNoZS5zdGF0dXMsXG4gICAgcmVzcG9uc2VUaW1lOiB0aGlzLmNhY2hlLnJlc3BvbnNlVGltZSxcbiAgICBtZXNzYWdlczogZmlsdGVyZWRcbiAgfVxufTtcblxuXG5FY2hvQ2xpZW50LnByb3RvdHlwZS52YWxpZGF0ZVBvcnQgPSBmdW5jdGlvbihwb3J0KSB7XG4gIHJldHVybiBwb3J0ID49IDEwMjQgJiYgcG9ydCA8IDY1NTM1O1xufTtcblxuIiwiLy8gbW9kZWxzXG52YXIgQXBwID0gcmVxdWlyZSgnLi9tb2RlbHMvQXBwJylcbiAgO1xuXG4vLyB2aWV3c1xudmFyIFNlcnZlckNvbnRyb2xWaWV3ID0gcmVxdWlyZSgnLi92aWV3cy9TZXJ2ZXJDb250cm9sVmlldycpXG4gICwgTWVzc2FnZVBhbmVsVmlldyA9IHJlcXVpcmUoJy4vdmlld3MvTWVzc2FnZVBhbmVsVmlldycpXG4gIDtcblxuXG52YXIgYXBwID0gbmV3IEFwcCgpO1xuXG4vLyB3aXJlIHVwIHZpZXdzXG5cbnZhciBzZXJ2ZXJDb250cm9sVmlldyA9IG5ldyBTZXJ2ZXJDb250cm9sVmlldyh7XG4gIG1vZGVsOiBhcHAsXG4gIGVsOiAnI3NlcnZlci1jb250cm9sJ1xufSk7XG5cbnZhciBtZXNzYWdlUGFuZWxWaWV3ID0gbmV3IE1lc3NhZ2VQYW5lbFZpZXcoe1xuICBtb2RlbDogYXBwLFxuICBlbDogJyNtZXNzYWdlLXBhbmVsJ1xufSk7XG5cbm1vZHVsZS5leHBvcnRzID0ge1xuICBhcHA6IGFwcFxufTtcblxuIiwidmFyIEVjaG9DbGllbnQgPSByZXF1aXJlKCcuLy4uL2xpYnMvZWNob2NsaWVudCcpXG4gICwgRWNob1Jlc3BvbnNlID0gcmVxdWlyZSgnLi9FY2hvUmVzcG9uc2UnKVxuICA7XG5cbi8qKlxuICogVGhlIEFwcCBtb2RlbCBwcm92aWRlcyBhIGJhY2tib25lIHdyYXBwZXIgb3ZlciBFY2hvQ2xpZW50IGFuZCBzZXJ2ZXIgZnVuY3Rpb25zXG4gKi9cbnZhciBBcHAgPSBCYWNrYm9uZS5Nb2RlbC5leHRlbmQoe1xuICBkZWZhdWx0czoge1xuICAgIGhvc3Q6ICdsb2NhbGhvc3QnLFxuICAgIHBvcnQ6IDU1NTUsXG4gICAgc2VydmVyU3RhdGU6ICdzdG9wcGVkJ1xuICB9LFxuXG4gIGluaXRpYWxpemU6IGZ1bmN0aW9uKCkge1xuICAgIHRoaXMuY2xpZW50ID0gbmV3IEVjaG9DbGllbnQoKTtcblxuICAgIC8vIHN5bmMgdXAgd2l0aCBzZXJ2ZXIgc3RhdHVzXG4gICAgdGhpcy5jaGVja1NlcnZlclN0YXR1cygpO1xuICB9LFxuXG4gIHZhbGlkYXRlOiBmdW5jdGlvbihhdHRycykge1xuICAgIGlmICghdGhpcy5jbGllbnQudmFsaWRhdGVQb3J0KGF0dHJzLnBvcnQpKSB7XG4gICAgICByZXR1cm4gJ2ludmFsaWQgcG9ydCc7XG4gICAgfVxuICB9LFxuXG4gIGNoZWNrU2VydmVyU3RhdHVzOiBmdW5jdGlvbigpIHtcbiAgICB2YXIgc2VsZiA9IHRoaXM7XG5cbiAgICAkLmdldEpTT04oJy9hcGkvdjEvZWNob3NlcnZlci8nICsgdGhpcy5nZXQoJ3BvcnQnKSwgZnVuY3Rpb24gKHJlc3VsdCkge1xuICAgICAgaWYgKHJlc3VsdCAmJiByZXN1bHQuc3RhdHVzID09ICdlcnJvcicpIHtcbiAgICAgICAgc2VsZi50cmlnZ2VyKCdzZXJ2ZXJFcnJvcicsIHJlc3VsdC5tZXNzYWdlKTtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuXG4gICAgICBpZiAocmVzdWx0ICYmIHJlc3VsdC5zdGF0dXMgPT0gJ09LJyAmJiAvc3RhcnRlZC8udGVzdChyZXN1bHQubWVzc2FnZSkpIHtcbiAgICAgICAgc2VsZi5zZXQoJ3NlcnZlclN0YXRlJywgJ3N0YXJ0ZWQnKTtcblxuICAgICAgICAvLyBnbyBhaGVhZCBhbmQgb3BlbiBhIGNsaWVudCBpZiB0aGUgc2VydmVyIGlzIGxpc3RlbmluZ1xuICAgICAgICBzZWxmLm9wZW4oKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHNlbGYuc2V0KCdzZXJ2ZXJTdGF0ZScsICdzdG9wcGVkJyk7XG4gICAgICB9XG4gICAgfSk7XG4gIH0sXG5cbiAgc3RhcnRTZXJ2ZXI6IGZ1bmN0aW9uKCkge1xuICAgIGlmICghdGhpcy5pc1ZhbGlkKCkpIHJldHVybjtcbiAgICB0aGlzLnNlbmRTZXJ2ZXJDb21tYW5kKCdzdGFydCcpO1xuICB9LFxuXG4gIHN0b3BTZXJ2ZXI6IGZ1bmN0aW9uKCkge1xuICAgIGlmICghdGhpcy5pc1ZhbGlkKCkpIHJldHVybjtcbiAgICB0aGlzLnNlbmRTZXJ2ZXJDb21tYW5kKCdzdG9wJyk7XG4gIH0sXG5cbiAgc2VuZFNlcnZlckNvbW1hbmQ6IGZ1bmN0aW9uKGNvbW1hbmQpIHtcbiAgICBpZiAoIXRoaXMuaXNWYWxpZCgpKSByZXR1cm47XG5cbiAgICB0aGlzLnNldCgnc2VydmVyRXJyb3InLCAnJyk7XG5cbiAgICB2YXIgcG9ydCA9IHRoaXMuZ2V0KCdwb3J0Jyk7XG4gICAgdmFyIHNlbGYgPSB0aGlzO1xuXG4gICAgJC5wb3N0KCcvYXBpL3YxL2VjaG9zZXJ2ZXIvJyArIHBvcnQgKyAnLycgKyBjb21tYW5kLCBmdW5jdGlvbiAocmVzdWx0KSB7XG4gICAgICBpZiAocmVzdWx0ICYmIHJlc3VsdC5zdGF0dXMgPT0gJ2Vycm9yJykge1xuICAgICAgICBzZWxmLnRyaWdnZXIoJ3NlcnZlckVycm9yJywgcmVzdWx0Lm1lc3NhZ2UpO1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG5cbiAgICAgIHZhciBzdGFydGVkID0gL3N0YXJ0ZWQvLnRlc3QocmVzdWx0Lm1lc3NhZ2UsIFwiaVwiKTtcblxuICAgICAgLy8gb25jZSB0aGUgc2VydmVyIGlzIHN0YXJ0ZWQsIG9wZW4gYSBjbGllbnQgY29ubmVjdGlvblxuICAgICAgaWYgKHN0YXJ0ZWQpIHtcbiAgICAgICAgc2VsZi5zZXQoJ3NlcnZlclN0YXRlJywgJ3N0YXJ0ZWQnKTtcbiAgICAgICAgc2VsZi5vcGVuKCk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBzZWxmLnNldCgnc2VydmVyU3RhdGUnLCAnc3RvcHBlZCcpO1xuICAgICAgICBzZWxmLmNsb3NlKCk7XG4gICAgICB9XG4gICAgfSk7XG4gIH0sXG5cbiAgb3BlbjogZnVuY3Rpb24oKSB7XG4gICAgaWYgKHRoaXMuY2xpZW50LmlzT3BlbigpKSByZXR1cm47XG5cbiAgICB2YXIgc2VsZiA9IHRoaXM7XG5cbiAgICBzZWxmLmNsaWVudC5vbm9wZW4gPSBmdW5jdGlvbigpIHtcbiAgICAgIHNlbGYudHJpZ2dlcignb3BlbicpO1xuICAgIH07XG5cbiAgICBzZWxmLmNsaWVudC5vbmNsb3NlID0gZnVuY3Rpb24oKSB7XG4gICAgICAvLyByZWxlYXNlIGhhbmRsZXJzXG4gICAgICBzZWxmLmNsaWVudC5vbm9wZW4gPSBudWxsO1xuICAgICAgc2VsZi5jbGllbnQub25jbG9zZSA9IG51bGw7XG4gICAgICBzZWxmLmNsaWVudC5vbmVycm9yID0gbnVsbDtcbiAgICAgIHNlbGYuY2xpZW50Lm9ubWVzc2FnZSA9IG51bGw7XG4gICAgICBzZWxmLmNsaWVudC5vbmhpc3RvcnkgPSBudWxsO1xuXG4gICAgICBzZWxmLnRyaWdnZXIoJ2Nsb3NlJyk7XG4gICAgfTtcblxuICAgIHNlbGYuY2xpZW50Lm9uZXJyb3IgPSBmdW5jdGlvbihlcnIpIHtcbiAgICAgIHNlbGYudHJpZ2dlcignZXJyb3InLCBlcnIpO1xuICAgIH07XG5cbiAgICBzZWxmLmNsaWVudC5vbm1lc3NhZ2UgPSBmdW5jdGlvbihyZXNwb25zZSkge1xuICAgICAgdmFyIGVyID0gbmV3IEVjaG9SZXNwb25zZShyZXNwb25zZSk7XG4gICAgICBzZWxmLnRyaWdnZXIoJ21lc3NhZ2UnLCBlcik7XG4gICAgfTtcblxuICAgIHNlbGYuY2xpZW50Lm9uaGlzdG9yeSA9IGZ1bmN0aW9uKHJlc3BvbnNlKSB7XG4gICAgICB2YXIgZXIgPSBuZXcgRWNob1Jlc3BvbnNlKHJlc3BvbnNlKTtcbiAgICAgIHNlbGYudHJpZ2dlcignaGlzdG9yeScsIGVyKTtcbiAgICB9O1xuXG4gICAgdmFyIHVyaSA9ICd3czovLycgKyB0aGlzLmdldCgnaG9zdCcpICsgJzonICsgdGhpcy5nZXQoJ3BvcnQnKTtcbiAgICB0aGlzLmNsaWVudC5vcGVuKHVyaSk7XG4gIH0sXG5cbiAgY2xvc2U6IGZ1bmN0aW9uKCkge1xuICAgIGlmICh0aGlzLmNsaWVudC5pc0Nsb3NlZCgpKSByZXR1cm47XG4gICAgdGhpcy5jbGllbnQuY2xvc2UoKTtcbiAgfSxcblxuICBzZW5kOiBmdW5jdGlvbihtZXNzYWdlKSB7XG4gICAgaWYgKCF0aGlzLmNsaWVudC5pc09wZW4oKSkgcmV0dXJuO1xuICAgIHRoaXMuY2xpZW50LnNlbmQobWVzc2FnZSk7XG4gIH0sXG5cbiAgc2VuZEhpc3RvcnlDb21tYW5kOiBmdW5jdGlvbigpIHtcbiAgICAvLyBqdXN0IGEgc2hvcnRjdXQgZm9yIGVudGVyaW5nICdbSElTVE9SWV0nXG4gICAgaWYgKCF0aGlzLmNsaWVudC5pc09wZW4oKSkgcmV0dXJuO1xuICAgIHRoaXMuY2xpZW50LnNlbmRIaXN0b3J5Q29tbWFuZCgpO1xuICB9LFxuXG4gIGhpc3RvcnlGaWx0ZXI6IGZ1bmN0aW9uKHBhdHRlcm4pIHtcbiAgICByZXR1cm4gdGhpcy5jbGllbnQuaGlzdG9yeUZpbHRlcihwYXR0ZXJuKTtcbiAgfVxufSk7XG5cbm1vZHVsZS5leHBvcnRzID0gQXBwO1xuXG4iLCJ2YXIgRWNob1Jlc3BvbnNlID0gQmFja2JvbmUuTW9kZWwuZXh0ZW5kKHtcbiAgZGVmYXVsdHM6IHtcbiAgICBzdGF0dXM6ICcnLFxuICAgIHJlc3BvbnNlVGltZTogbmV3IERhdGUoKS5nZXRUaW1lKCksXG4gICAgdHlwZTogJ21lc3NhZ2UnLFxuICAgIG1lc3NhZ2VzOiBbICcnIF1cbiAgfSxcblxuICB0b0Rpc3BsYXlTdHJpbmc6IGZ1bmN0aW9uKCkge1xuICAgIC8vIGlmIG5vdCBhIG1lc3NhZ2UgcmVzcG9uc2UgKHN1Y2ggYXMgYSBoaXN0b3J5IHJlc3BvbnNlKSxcbiAgICAvLyB0aGVuIG9ubHkgZGlzcGxheSB0aGUgcmVzcG9uc2UgdGltZVxuICAgIHJldHVybiB0aGlzLmdldCgndHlwZScpICE9ICdtZXNzYWdlJ1xuICAgICAgPyAnW3Jlc3BvbnNlXSAnICsgdGhpcy5nZXQoJ3Jlc3BvbnNlVGltZScpICsgJ21zJ1xuICAgICAgOiAnXCInICsgdGhpcy5nZXQoJ21lc3NhZ2VzJylbMF0gKyAnXCIsICcgKyB0aGlzLmdldCgncmVzcG9uc2VUaW1lJykgKyAnbXMnO1xuICB9XG59KTtcblxubW9kdWxlLmV4cG9ydHMgPSBFY2hvUmVzcG9uc2U7IiwidmFyIEVjaG9SZXNwb25zZSA9IHJlcXVpcmUoJy4vLi4vbW9kZWxzL0VjaG9SZXNwb25zZScpO1xuXG5tb2R1bGUuZXhwb3J0cyA9IEJhY2tib25lLlZpZXcuZXh0ZW5kKHtcbiAgaW5pdGlhbGl6ZTogZnVuY3Rpb24ob3B0aW9ucykge1xuICAgIHZhciBzZWxmID0gdGhpcztcblxuICAgIHRoaXMucmVuZGVyKCk7XG5cbiAgICB0aGlzLm1vZGVsLm9uKCdoaXN0b3J5JywgZnVuY3Rpb24ocmVzcG9uc2UpIHtcbiAgICAgIHNlbGYucmVuZGVyKHJlc3BvbnNlKTtcbiAgICB9KTtcbiAgfSxcblxuICBldmVudHM6IHtcbiAgICAnaW5wdXQgI3NlYXJjaGZpbHRlcic6ICdmaWx0ZXJNZXNzYWdlcycsXG4gICAgJ2NsaWNrICNidG5nZXRoaXN0b3J5JzogJ2dldEhpc3RvcnknXG4gIH0sXG5cbiAgdGVtcGxhdGU6IEhhbmRsZWJhcnMuY29tcGlsZSgkKCcjbWVzc2FnZS1oaXN0b3J5LXRlbXBsYXRlJykuaHRtbCgpKSxcblxuICByZW5kZXI6IGZ1bmN0aW9uKCkge1xuICAgIHZhciByZXNwb25zZSA9IGFyZ3VtZW50c1swXSB8fCBbXTtcblxuICAgIC8vIHRoZSBjaGVjayBpcyBiZWNhdXNlIGNhY2hlZCBtZXNzYWdlcyBmcm9tIHRoZSBzZXJ2ZXIgYXJlbid0XG4gICAgLy8gd3JhcHBlZCBpbiBFY2hvUmVzcG9uc2UgYmFja2JvbmUgb2JqZWN0cywganVzdCBwb2pvc1xuICAgIHZhciBtZXNzYWdlcyA9IHJlc3BvbnNlIGluc3RhbmNlb2YgRWNob1Jlc3BvbnNlXG4gICAgICA/IHJlc3BvbnNlLnRvSlNPTigpLm1lc3NhZ2VzXG4gICAgICA6IHJlc3BvbnNlLm1lc3NhZ2VzO1xuXG4gICAgdmFyIGFyZ3MgPSB7XG4gICAgICBtZXNzYWdlczogbWVzc2FnZXNcbiAgICB9O1xuXG4gICAgdGhpcy4kZWwuaHRtbCh0aGlzLnRlbXBsYXRlKGFyZ3MpKTtcblxuICAgIHRoaXMuZmlsdGVyUGF0dGVybih0aGlzLnBhdHRlcm4pO1xuXG4gICAgcmV0dXJuIHRoaXM7XG4gIH0sXG5cbiAgZ2V0SGlzdG9yeTogZnVuY3Rpb24oKSB7XG4gICAgLy8ganVzdCBhIHNob3J0Y3V0IGZvciBlbnRlcmluZyAnW0hJU1RPUlldJ1xuICAgIHRoaXMubW9kZWwuc2VuZEhpc3RvcnlDb21tYW5kKCk7XG4gIH0sXG5cbiAgZmlsdGVyUGF0dGVybjogZnVuY3Rpb24oKSB7XG4gICAgaWYgKGFyZ3VtZW50cy5sZW5ndGggPT0gMCkge1xuICAgICAgcmV0dXJuICQoJyNzZWFyY2hmaWx0ZXInKS52YWwoKTtcbiAgICB9IGVsc2Uge1xuICAgICAgJCgnI3NlYXJjaGZpbHRlcicpLnZhbChhcmd1bWVudHNbMF0pO1xuICAgICAgJCgnI3NlYXJjaGZpbHRlcicpLmZvY3VzKCk7XG4gICAgfVxuICB9LFxuXG4gIGZpbHRlck1lc3NhZ2VzOiBmdW5jdGlvbigpIHtcbiAgICB0aGlzLnBhdHRlcm4gPSB0aGlzLmZpbHRlclBhdHRlcm4oKTtcbiAgICB2YXIgZmlsdGVyZWQgPSB0aGlzLm1vZGVsLmhpc3RvcnlGaWx0ZXIodGhpcy5wYXR0ZXJuKTtcbiAgICB0aGlzLnJlbmRlcihmaWx0ZXJlZCk7XG4gIH1cbn0pOyIsInZhciBNZXNzYWdlU2VuZFZpZXcgPSByZXF1aXJlKCcuL01lc3NhZ2VTZW5kVmlldycpXG4gICwgTWVzc2FnZVJlY2VpdmVWaWV3ID0gcmVxdWlyZSgnLi9NZXNzYWdlUmVjZWl2ZVZpZXcnKVxuICAsIE1lc3NhZ2VIaXN0b3J5VmlldyA9IHJlcXVpcmUoJy4vTWVzc2FnZUhpc3RvcnlWaWV3JylcbiAgO1xuXG5tb2R1bGUuZXhwb3J0cyA9IEJhY2tib25lLlZpZXcuZXh0ZW5kKHtcbiAgaW5pdGlhbGl6ZTogZnVuY3Rpb24gKCkge1xuXG4gICAgdGhpcy5zZW5kVmlldyA9IG5ldyBNZXNzYWdlU2VuZFZpZXcoe1xuICAgICAgbW9kZWw6IHRoaXMubW9kZWxcbiAgICB9KTtcblxuICAgIHRoaXMucmVjZWl2ZVZpZXcgPSBuZXcgTWVzc2FnZVJlY2VpdmVWaWV3KHtcbiAgICAgIG1vZGVsOiB0aGlzLm1vZGVsXG4gICAgfSk7XG5cbiAgICB0aGlzLmhpc3RvcnlWaWV3ID0gbmV3IE1lc3NhZ2VIaXN0b3J5Vmlldyh7XG4gICAgICBtb2RlbDogdGhpcy5tb2RlbCxcbiAgICAgIGVsOiAnI21lc3NhZ2UtaGlzdG9yeSdcbiAgICB9KTtcblxuICAgIHRoaXMucmVuZGVyKCk7XG5cbiAgICB0aGlzLmxpc3RlblRvKHRoaXMubW9kZWwsICdjaGFuZ2U6c2VydmVyU3RhdGUnLCB0aGlzLnJlbmRlcik7XG4gIH0sXG5cbiAgdGVtcGxhdGU6IEhhbmRsZWJhcnMuY29tcGlsZSgkKCcjbWVzc2FnZS1wYW5lbC10ZW1wbGF0ZScpLmh0bWwoKSksXG5cbiAgcmVuZGVyOiBmdW5jdGlvbiAoKSB7XG4gICAgdmFyIHNlcnZlclN0YXRlID0gdGhpcy5tb2RlbC5nZXQoJ3NlcnZlclN0YXRlJyk7XG5cbiAgICB2YXIgYXJncyA9IHtcbiAgICAgIGhpZGRlbjogc2VydmVyU3RhdGUgPT0gJ3N0YXJ0ZWQnID8gJ3Zpc2libGUnIDogJ2NvbGxhcHNlJ1xuICAgIH07XG5cbiAgICB0aGlzLiRlbC5odG1sKHRoaXMudGVtcGxhdGUoYXJncykpO1xuXG4gICAgdGhpcy5zZW5kVmlldy5zZXRFbGVtZW50KHRoaXMuJCgnI21lc3NhZ2Utc2VuZCcpKS5yZW5kZXIoKTtcbiAgICB0aGlzLnJlY2VpdmVWaWV3LnNldEVsZW1lbnQodGhpcy4kKCcjbWVzc2FnZS1yZWNlaXZlJykpLnJlbmRlcigpO1xuICAgIHRoaXMuaGlzdG9yeVZpZXcuc2V0RWxlbWVudCh0aGlzLiQoJyNtZXNzYWdlLWhpc3RvcnknKSkucmVuZGVyKCk7XG5cbiAgICByZXR1cm4gdGhpcztcbiAgfVxuXG59KTtcbiIsInZhciBFY2hvUmVzcG9uc2UgPSByZXF1aXJlKCcuLy4uL21vZGVscy9FY2hvUmVzcG9uc2UnKTtcblxubW9kdWxlLmV4cG9ydHMgPSBCYWNrYm9uZS5WaWV3LmV4dGVuZCh7XG4gIGluaXRpYWxpemU6IGZ1bmN0aW9uKCkge1xuICAgIHZhciBzZWxmID0gdGhpcztcblxuICAgIHRoaXMucmVuZGVyKCk7XG5cbiAgICB0aGlzLm1vZGVsLm9uKCdtZXNzYWdlIGhpc3RvcnknLCBmdW5jdGlvbihyZXNwb25zZSkge1xuICAgICAgc2VsZi5yZW5kZXIocmVzcG9uc2UpO1xuICAgIH0pXG4gIH0sXG5cbiAgdGVtcGxhdGU6IEhhbmRsZWJhcnMuY29tcGlsZSgkKCcjbWVzc2FnZS1yZWNlaXZlLXRlbXBsYXRlJykuaHRtbCgpKSxcblxuICByZW5kZXI6IGZ1bmN0aW9uKCkge1xuICAgIHZhciByZXNwb25zZSA9IGFyZ3VtZW50c1swXTtcbiAgICBpZiAoIShyZXNwb25zZSBpbnN0YW5jZW9mIEVjaG9SZXNwb25zZSkpIHJldHVybjtcblxuICAgIHZhciBhcmdzID0ge1xuICAgICAgbWVzc2FnZTogcmVzcG9uc2UudG9EaXNwbGF5U3RyaW5nKClcbiAgICB9O1xuXG4gICAgdGhpcy4kZWwuaHRtbCh0aGlzLnRlbXBsYXRlKGFyZ3MpKTtcblxuICAgIHJldHVybiB0aGlzO1xuICB9XG59KTsiLCJtb2R1bGUuZXhwb3J0cyA9IEJhY2tib25lLlZpZXcuZXh0ZW5kKHtcbiAgaW5pdGlhbGl6ZTogZnVuY3Rpb24oKSB7XG4gICAgdGhpcy5yZW5kZXIoKTtcbiAgfSxcblxuICBldmVudHM6IHtcbiAgICAnY2xpY2sgI2J0bnNlbmRtZXNzYWdlJzogJ3NlbmRNZXNzYWdlJyxcbiAgICAnaW5wdXQgI21lc3NhZ2UnOiAndG9nZ2xlRW5hYmxlQnV0dG9uJ1xuICB9LFxuXG4gIHRlbXBsYXRlOiBIYW5kbGViYXJzLmNvbXBpbGUoJCgnI21lc3NhZ2Utc2VuZC10ZW1wbGF0ZScpLmh0bWwoKSksXG5cbiAgcmVuZGVyOiBmdW5jdGlvbigpIHtcbiAgICB2YXIgYXJncyA9IHtcbiAgICB9O1xuXG4gICAgdGhpcy4kZWwuaHRtbCh0aGlzLnRlbXBsYXRlKGFyZ3MpKTtcblxuICAgIHJldHVybiB0aGlzO1xuICB9LFxuXG4gIG1lc3NhZ2VUZXh0OiBmdW5jdGlvbigpIHtcbiAgICBpZiAoYXJndW1lbnRzLmxlbmd0aCA9PSAwKSB7XG4gICAgICByZXR1cm4gJCgnI21lc3NhZ2UnKS52YWwoKTtcbiAgICB9IGVsc2Uge1xuICAgICAgJCgnI21lc3NhZ2UnKS52YWwoYXJndW1lbnRzWzBdKTtcbiAgICB9XG4gIH0sXG5cbiAgdG9nZ2xlRW5hYmxlQnV0dG9uOiBmdW5jdGlvbigpIHtcbiAgICBpZiAodGhpcy5tZXNzYWdlVGV4dCgpKSB7XG4gICAgICBjb25zb2xlLmxvZygndmFsdWUnKTtcbiAgICAgICQoJyNidG5zZW5kbWVzc2FnZScpLnJlbW92ZUNsYXNzKCdkaXNhYmxlZCcpO1xuICAgIH0gZWxzZSB7XG4gICAgICBjb25zb2xlLmxvZygnZW1wdHknKTtcbiAgICAgICQoJyNidG5zZW5kbWVzc2FnZScpLmFkZENsYXNzKCdkaXNhYmxlZCcpO1xuICAgIH1cbiAgfSxcblxuICBzZW5kTWVzc2FnZTogZnVuY3Rpb24oKSB7XG4gICAgdmFyIG1lc3NhZ2UgPSB0aGlzLm1lc3NhZ2VUZXh0KCk7XG4gICAgaWYgKG1lc3NhZ2UpIHRoaXMubW9kZWwuc2VuZChtZXNzYWdlKTtcbiAgICB0aGlzLm1lc3NhZ2VUZXh0KCcnKTtcbiAgfVxufSk7XG4iLCJtb2R1bGUuZXhwb3J0cyA9IEJhY2tib25lLlZpZXcuZXh0ZW5kKHtcbiAgc2VydmVyRXJyb3JNZXNzYWdlOiBudWxsLFxuXG4gIGluaXRpYWxpemU6IGZ1bmN0aW9uKCkge1xuICAgIHZhciBzZWxmID0gdGhpcztcblxuICAgIHRoaXMucmVuZGVyKCk7XG5cbiAgICB0aGlzLmxpc3RlblRvKHRoaXMubW9kZWwsICdjaGFuZ2U6c2VydmVyU3RhdGUnLCB0aGlzLnJlbmRlcik7XG5cbiAgICB0aGlzLm1vZGVsLm9uKCdzZXJ2ZXJFcnJvcicsIGZ1bmN0aW9uKGVycikge1xuICAgICAgc2VsZi5zZXJ2ZXJFcnJvciA9IGVycjtcbiAgICAgIHNlbGYucmVuZGVyKCk7XG4gICAgfSlcbiAgfSxcblxuICBldmVudHM6IHtcbiAgICAnY2xpY2sgI2J0bnNlcnZlcic6ICd0b2dnbGVzdGFydCdcbiAgfSxcblxuICB0ZW1wbGF0ZTogSGFuZGxlYmFycy5jb21waWxlKCQoJyNzZXJ2ZXItY29udHJvbC10ZW1wbGF0ZScpLmh0bWwoKSksXG5cbiAgcmVuZGVyOiBmdW5jdGlvbigpIHtcbiAgICB2YXIgcG9ydCA9IHRoaXMubW9kZWwuZ2V0KCdwb3J0Jyk7XG4gICAgdmFyIHNlcnZlclN0YXRlID0gdGhpcy5tb2RlbC5nZXQoJ3NlcnZlclN0YXRlJyk7XG4gICAgdmFyIHNlcnZlclN0YXRlVGV4dCA9IHNlcnZlclN0YXRlID09ICdzdGFydGVkJ1xuICAgICAgPyAnc3RhcnRlZCAocG9ydCAnICsgcG9ydCArICcpJ1xuICAgICAgOiBzZXJ2ZXJTdGF0ZTtcbiAgICB2YXIgc2VydmVyRXJyb3IgPSB0aGlzLnNlcnZlckVycm9yID8gJyBFcnJvcjogJyArIHRoaXMuc2VydmVyRXJyb3IgOiBudWxsO1xuICAgIHZhciBzZXJ2ZXJFcnJvckNsYXNzID0gc2VydmVyRXJyb3IgPyAndmlzaWJsZScgOiAnaGlkZGVuJztcblxuICAgIHZhciBhcmdzID0ge1xuICAgICAgc3RhdGVDbGFzczogc2VydmVyU3RhdGUsXG4gICAgICBzZXJ2ZXJTdGF0ZTogc2VydmVyU3RhdGVUZXh0LFxuICAgICAgc2VydmVyUG9ydDogcG9ydCxcbiAgICAgIGlucHV0VmlzaWJpbGl0eTogc2VydmVyU3RhdGUgPT0gJ3N0YXJ0ZWQnID8gJ2NvbGxhcHNlJyA6ICd2aXNpYmxlJyxcbiAgICAgIHNlcnZlckNvbW1hbmQ6IHNlcnZlclN0YXRlID09ICdzdGFydGVkJyA/ICdTdG9wJyA6ICdTdGFydCcsXG4gICAgICBzZXJ2ZXJFcnJvckNsYXNzOiBzZXJ2ZXJFcnJvckNsYXNzLFxuICAgICAgc2VydmVyRXJyb3I6IHNlcnZlckVycm9yXG4gICAgfTtcblxuICAgIHRoaXMuJGVsLmh0bWwodGhpcy50ZW1wbGF0ZShhcmdzKSk7XG5cbiAgICAkKCcjcG9ydG51bWJlcicpLmZvY3VzKCk7XG5cbiAgICByZXR1cm4gdGhpcztcbiAgfSxcblxuICBwb3J0OiBmdW5jdGlvbigpIHtcbiAgICByZXR1cm4gJCgnI3BvcnRudW1iZXInKS52YWwoKTtcbiAgfSxcblxuICB0b2dnbGVzdGFydDogZnVuY3Rpb24oKSB7XG4gICAgLy8gY2xlYXIgcHJldmlvdXMgZXJyb3IgbWVzc2FnZVxuICAgIHRoaXMuc2VydmVyRXJyb3IgPSBudWxsO1xuICAgICQoJyNzZXJ2ZXItZXJyb3InKS5odG1sKCcnKTtcblxuICAgIHZhciBwb3J0ID0gdGhpcy5wb3J0KCk7XG4gICAgdGhpcy5tb2RlbC5zZXQoJ3BvcnQnLCBwb3J0LCB7IHZhbGlkYXRlOiB0cnVlIH0pO1xuICAgIGlmICh0aGlzLm1vZGVsLnZhbGlkYXRpb25FcnJvcikge1xuICAgICAgJCgnI3BvcnRudW1iZXInKS52YWwoJycpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIHZhciBjb21tYW5kID0gdGhpcy5tb2RlbC5nZXQoJ3NlcnZlclN0YXRlJykgPT0gJ3N0YXJ0ZWQnID8gJ3N0b3AnIDogJ3N0YXJ0JztcbiAgICB0aGlzLm1vZGVsLnNlbmRTZXJ2ZXJDb21tYW5kKGNvbW1hbmQpO1xuICB9XG59KTtcbiJdfQ==
