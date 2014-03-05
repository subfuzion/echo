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
  //template: require('./templates/server-control.hbs'),

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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZ2VuZXJhdGVkLmpzIiwic291cmNlcyI6WyIvVXNlcnMvdG9ueS9wcm9qZWN0cy9HaXRIdWIvZWNoby9lY2hvL25vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCIvVXNlcnMvdG9ueS9wcm9qZWN0cy9HaXRIdWIvZWNoby9lY2hvL2NsaWVudC9zY3JpcHRzL2xpYnMvZWNob2NsaWVudC5qcyIsIi9Vc2Vycy90b255L3Byb2plY3RzL0dpdEh1Yi9lY2hvL2VjaG8vY2xpZW50L3NjcmlwdHMvbWFpbi5qcyIsIi9Vc2Vycy90b255L3Byb2plY3RzL0dpdEh1Yi9lY2hvL2VjaG8vY2xpZW50L3NjcmlwdHMvbW9kZWxzL0FwcC5qcyIsIi9Vc2Vycy90b255L3Byb2plY3RzL0dpdEh1Yi9lY2hvL2VjaG8vY2xpZW50L3NjcmlwdHMvbW9kZWxzL0VjaG9SZXNwb25zZS5qcyIsIi9Vc2Vycy90b255L3Byb2plY3RzL0dpdEh1Yi9lY2hvL2VjaG8vY2xpZW50L3NjcmlwdHMvdmlld3MvTWVzc2FnZUhpc3RvcnlWaWV3LmpzIiwiL1VzZXJzL3RvbnkvcHJvamVjdHMvR2l0SHViL2VjaG8vZWNoby9jbGllbnQvc2NyaXB0cy92aWV3cy9NZXNzYWdlUGFuZWxWaWV3LmpzIiwiL1VzZXJzL3RvbnkvcHJvamVjdHMvR2l0SHViL2VjaG8vZWNoby9jbGllbnQvc2NyaXB0cy92aWV3cy9NZXNzYWdlUmVjZWl2ZVZpZXcuanMiLCIvVXNlcnMvdG9ueS9wcm9qZWN0cy9HaXRIdWIvZWNoby9lY2hvL2NsaWVudC9zY3JpcHRzL3ZpZXdzL01lc3NhZ2VTZW5kVmlldy5qcyIsIi9Vc2Vycy90b255L3Byb2plY3RzL0dpdEh1Yi9lY2hvL2VjaG8vY2xpZW50L3NjcmlwdHMvdmlld3MvU2VydmVyQ29udHJvbFZpZXcuanMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7QUNBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN2SUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7OztBQzVCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2pKQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDakJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMzREE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDN0NBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzNCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM3Q0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EiLCJzb3VyY2VzQ29udGVudCI6WyIoZnVuY3Rpb24gZSh0LG4scil7ZnVuY3Rpb24gcyhvLHUpe2lmKCFuW29dKXtpZighdFtvXSl7dmFyIGE9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtpZighdSYmYSlyZXR1cm4gYShvLCEwKTtpZihpKXJldHVybiBpKG8sITApO3Rocm93IG5ldyBFcnJvcihcIkNhbm5vdCBmaW5kIG1vZHVsZSAnXCIrbytcIidcIil9dmFyIGY9bltvXT17ZXhwb3J0czp7fX07dFtvXVswXS5jYWxsKGYuZXhwb3J0cyxmdW5jdGlvbihlKXt2YXIgbj10W29dWzFdW2VdO3JldHVybiBzKG4/bjplKX0sZixmLmV4cG9ydHMsZSx0LG4scil9cmV0dXJuIG5bb10uZXhwb3J0c312YXIgaT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2Zvcih2YXIgbz0wO288ci5sZW5ndGg7bysrKXMocltvXSk7cmV0dXJuIHN9KSIsIi8qKlxuICogQSBjbGllbnQgZm9yIHRoZSBlY2hvLmlvIHNlcnZlclxuICogQGNvbnN0cnVjdG9yXG4gKi9cbnZhciBFY2hvQ2xpZW50ID0gbW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiAoKSB7XG4gIHRoaXMudXJpID0gbnVsbDtcbiAgdGhpcy53cyA9IG51bGw7XG4gIHRoaXMubGFzdFNlbnRUaW1lc3RhbXAgPSBudWxsO1xuICB0aGlzLmxhc3RSZWNlaXZlZFRpbWVzdGFtcCA9IG51bGw7XG4gIHRoaXMuY2FjaGUgPSBudWxsO1xuXG4gIC8vIGhhbmRsZXJzXG4gIHRoaXMub25vcGVuID0gbnVsbDtcbiAgdGhpcy5vbmNsb3NlID0gbnVsbDtcbiAgdGhpcy5vbmVycm9yID0gbnVsbDtcbiAgdGhpcy5vbm1lc3NhZ2UgPSBudWxsO1xuICB0aGlzLm9uaGlzdG9yeSA9IG51bGw7XG59O1xuXG5cbkVjaG9DbGllbnQucHJvdG90eXBlLm9wZW4gPSBmdW5jdGlvbih1cmkpIHtcbiAgdmFyIHNlbGYgPSB0aGlzO1xuXG4gIGZ1bmN0aW9uIGNhbGxIYW5kbGVyKGV2ZW50KSB7XG4gICAgdmFyIGhhbmRsZXIgPSBzZWxmWydvbicgKyBldmVudF07XG4gICAgaWYgKHR5cGVvZiBoYW5kbGVyID09ICdmdW5jdGlvbicpIHtcbiAgICAgIGhhbmRsZXIuYXBwbHkoaGFuZGxlciwgW10uc2xpY2UuY2FsbChhcmd1bWVudHMsIDEpKTtcbiAgICB9XG4gIH1cblxuICBpZiAodGhpcy5pc09wZW4oKSkge1xuICAgIGNvbnNvbGUubG9nKCdlcnJvcjogYWxyZWFkeSBvcGVuIG9uIHVyaSAnICsgdGhpcy51cmkpO1xuICAgIGNhbGxIYW5kbGVyKCdlcnJvcicsICdhbHJlYWR5IG9wZW4gb24gdXJpICcgKyB0aGlzLnVyaSk7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgaWYgKCF0aGlzLnZhbGlkYXRlUG9ydCkge1xuICAgIGNvbnNvbGUubG9nKCdlcnJvcjogaW52YWxpZCBwb3J0OiAnICsgdGhpcy5wb3J0KTtcbiAgICBjYWxsSGFuZGxlcignZXJyb3InLCAnaW52YWxpZCBwb3J0Jyk7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgdGhpcy51cmkgPSB1cmk7XG4gIHRoaXMud3MgPSBuZXcgV2ViU29ja2V0KHVyaSk7XG5cbiAgdGhpcy53cy5vbm9wZW4gPSBmdW5jdGlvbiAoKSB7XG4gICAgY2FsbEhhbmRsZXIoJ29wZW4nKTtcbiAgfTtcblxuICB0aGlzLndzLm9uY2xvc2UgPSBmdW5jdGlvbigpIHtcbiAgICBjYWxsSGFuZGxlcignY2xvc2UnKTtcbiAgfTtcblxuICB0aGlzLndzLm9ubWVzc2FnZSA9IGZ1bmN0aW9uIChtZXNzYWdlRXZlbnQpIHtcbiAgICBzZWxmLmxhc3RSZWNlaXZlZFRpbWVzdGFtcCA9IG5ldyBEYXRlKCkuZ2V0VGltZSgpO1xuXG4gICAgdmFyIG1lc3NhZ2UgPSBKU09OLnBhcnNlKG1lc3NhZ2VFdmVudC5kYXRhKTtcblxuICAgIG1lc3NhZ2UucmVzcG9uc2VUaW1lID0gc2VsZi5sYXN0UmVjZWl2ZWRUaW1lc3RhbXAgLSBzZWxmLmxhc3RTZW50VGltZXN0YW1wO1xuXG4gICAgLy9pZiAobWVzc2FnZS5tZXNzYWdlcy5sZW5ndGggPiAxKSB7XG4gICAgaWYgKG1lc3NhZ2UudHlwZSA9PSAnaGlzdG9yeScpIHtcbiAgICAgIC8vIHRoaXMgaXMgYSBoaXN0b3J5IG1lc3NhZ2VcbiAgICAgIC8vIGNhY2hlIGl0IGluIGNhc2UgdGhlIHVzZXIgd2FudHMgdG8gZmlsdGVyXG4gICAgICAvLyAobm8gbmVlZCBmb3IgYW5vdGhlciByb3VuZCB0cmlwKVxuICAgICAgc2VsZi5jYWNoZSA9IG1lc3NhZ2U7XG4gICAgICBjYWxsSGFuZGxlcignaGlzdG9yeScsIG1lc3NhZ2UpO1xuICAgIH0gZWxzZSB7XG4gICAgICAvLyBjYWNoZSBpcyBub3cgc3RhbGUsIHNvIGp1c3QgY2xlYXIgaXRcbiAgICAgIHNlbGYuY2FjaGUgPSBudWxsO1xuICAgICAgY2FsbEhhbmRsZXIoJ21lc3NhZ2UnLCBtZXNzYWdlKTtcbiAgICB9XG4gIH07XG5cbiAgdGhpcy53cy5vbmVycm9yID0gZnVuY3Rpb24gKGVycikge1xuICAgIGNhbGxIYW5kbGVyKCdlcnJvcicsIGVycik7XG4gIH07XG59O1xuXG5cbkVjaG9DbGllbnQucHJvdG90eXBlLmNsb3NlID0gZnVuY3Rpb24oKSB7XG4gIGlmICh0aGlzLmlzQ2xvc2VkKCkpIHtcbiAgICBjb25zb2xlLmxvZygnYWxyZWFkeSBjbG9zZWQnKTtcbiAgICByZXR1cm47XG4gIH1cblxuICB0aGlzLndzLmNsb3NlKCk7XG4gIHRoaXMud3MgPSBudWxsO1xuICB0aGlzLnVyaSA9IG51bGw7XG59O1xuXG5cbkVjaG9DbGllbnQucHJvdG90eXBlLmlzT3BlbiA9IGZ1bmN0aW9uKCkge1xuICByZXR1cm4gdGhpcy53cyBpbnN0YW5jZW9mIFdlYlNvY2tldDtcbn07XG5cblxuRWNob0NsaWVudC5wcm90b3R5cGUuaXNDbG9zZWQgPSBmdW5jdGlvbigpIHtcbiAgcmV0dXJuICF0aGlzLmlzT3BlbigpO1xufTtcblxuXG5FY2hvQ2xpZW50LnByb3RvdHlwZS5zZW5kID0gZnVuY3Rpb24gKG1lc3NhZ2UpIHtcbiAgaWYgKCFtZXNzYWdlIHx8ICF0aGlzLmlzT3BlbigpKSByZXR1cm47XG4gIHRoaXMubGFzdFNlbnRUaW1lc3RhbXAgPSBuZXcgRGF0ZSgpLmdldFRpbWUoKTtcbiAgdGhpcy53cy5zZW5kKG1lc3NhZ2UpO1xufTtcblxuXG5FY2hvQ2xpZW50LnByb3RvdHlwZS5zZW5kSGlzdG9yeUNvbW1hbmQgPSBmdW5jdGlvbiAoKSB7XG4gIHRoaXMuc2VuZCgnW0hJU1RPUlldJyk7XG59O1xuXG5cbkVjaG9DbGllbnQucHJvdG90eXBlLmhpc3RvcnlGaWx0ZXIgPSBmdW5jdGlvbihwYXR0ZXJuKSB7XG4gIGlmICghdGhpcy5jYWNoZSB8fCAhdGhpcy5pc09wZW4oKSkgcmV0dXJuIFtdO1xuICBpZiAoIXBhdHRlcm4pIHJldHVybiB0aGlzLmNhY2hlO1xuXG4gIHZhciByZWdleCA9IG5ldyBSZWdFeHAocGF0dGVybiwgXCJpXCIpO1xuICB2YXIgZmlsdGVyZWQgPSBfLmZpbHRlcih0aGlzLmNhY2hlLm1lc3NhZ2VzLCBmdW5jdGlvbihtZXNzYWdlKSB7XG4gICAgcmV0dXJuIHJlZ2V4LnRlc3QobWVzc2FnZSk7XG4gIH0pO1xuXG4gIHJldHVybiB7XG4gICAgc3RhdHVzOiB0aGlzLmNhY2hlLnN0YXR1cyxcbiAgICByZXNwb25zZVRpbWU6IHRoaXMuY2FjaGUucmVzcG9uc2VUaW1lLFxuICAgIG1lc3NhZ2VzOiBmaWx0ZXJlZFxuICB9XG59O1xuXG5cbkVjaG9DbGllbnQucHJvdG90eXBlLnZhbGlkYXRlUG9ydCA9IGZ1bmN0aW9uKHBvcnQpIHtcbiAgcmV0dXJuIHBvcnQgPj0gMTAyNCAmJiBwb3J0IDwgNjU1MzU7XG59O1xuXG4iLCIvLyBtb2RlbHNcbnZhciBBcHAgPSByZXF1aXJlKCcuL21vZGVscy9BcHAnKVxuICA7XG5cbi8vIHZpZXdzXG52YXIgU2VydmVyQ29udHJvbFZpZXcgPSByZXF1aXJlKCcuL3ZpZXdzL1NlcnZlckNvbnRyb2xWaWV3JylcbiAgLCBNZXNzYWdlUGFuZWxWaWV3ID0gcmVxdWlyZSgnLi92aWV3cy9NZXNzYWdlUGFuZWxWaWV3JylcbiAgO1xuXG5cbnZhciBhcHAgPSBuZXcgQXBwKCk7XG5cbi8vIHdpcmUgdXAgdmlld3NcblxudmFyIHNlcnZlckNvbnRyb2xWaWV3ID0gbmV3IFNlcnZlckNvbnRyb2xWaWV3KHtcbiAgbW9kZWw6IGFwcCxcbiAgZWw6ICcjc2VydmVyLWNvbnRyb2wnXG59KTtcblxudmFyIG1lc3NhZ2VQYW5lbFZpZXcgPSBuZXcgTWVzc2FnZVBhbmVsVmlldyh7XG4gIG1vZGVsOiBhcHAsXG4gIGVsOiAnI21lc3NhZ2UtcGFuZWwnXG59KTtcblxubW9kdWxlLmV4cG9ydHMgPSB7XG4gIGFwcDogYXBwXG59O1xuXG4iLCJ2YXIgRWNob0NsaWVudCA9IHJlcXVpcmUoJy4vLi4vbGlicy9lY2hvY2xpZW50JylcbiAgLCBFY2hvUmVzcG9uc2UgPSByZXF1aXJlKCcuL0VjaG9SZXNwb25zZScpXG4gIDtcblxuLyoqXG4gKiBUaGUgQXBwIG1vZGVsIHByb3ZpZGVzIGEgYmFja2JvbmUgd3JhcHBlciBvdmVyIEVjaG9DbGllbnQgYW5kIHNlcnZlciBmdW5jdGlvbnNcbiAqL1xudmFyIEFwcCA9IEJhY2tib25lLk1vZGVsLmV4dGVuZCh7XG4gIGRlZmF1bHRzOiB7XG4gICAgaG9zdDogJ2xvY2FsaG9zdCcsXG4gICAgcG9ydDogNTU1NSxcbiAgICBzZXJ2ZXJTdGF0ZTogJ3N0b3BwZWQnXG4gIH0sXG5cbiAgaW5pdGlhbGl6ZTogZnVuY3Rpb24oKSB7XG4gICAgdGhpcy5jbGllbnQgPSBuZXcgRWNob0NsaWVudCgpO1xuXG4gICAgLy8gc3luYyB1cCB3aXRoIHNlcnZlciBzdGF0dXNcbiAgICB0aGlzLmNoZWNrU2VydmVyU3RhdHVzKCk7XG4gIH0sXG5cbiAgdmFsaWRhdGU6IGZ1bmN0aW9uKGF0dHJzKSB7XG4gICAgaWYgKCF0aGlzLmNsaWVudC52YWxpZGF0ZVBvcnQoYXR0cnMucG9ydCkpIHtcbiAgICAgIHJldHVybiAnaW52YWxpZCBwb3J0JztcbiAgICB9XG4gIH0sXG5cbiAgY2hlY2tTZXJ2ZXJTdGF0dXM6IGZ1bmN0aW9uKCkge1xuICAgIHZhciBzZWxmID0gdGhpcztcblxuICAgICQuZ2V0SlNPTignL2FwaS92MS9lY2hvc2VydmVyLycgKyB0aGlzLmdldCgncG9ydCcpLCBmdW5jdGlvbiAocmVzdWx0KSB7XG4gICAgICBpZiAocmVzdWx0ICYmIHJlc3VsdC5zdGF0dXMgPT0gJ2Vycm9yJykge1xuICAgICAgICBzZWxmLnRyaWdnZXIoJ3NlcnZlckVycm9yJywgcmVzdWx0Lm1lc3NhZ2UpO1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG5cbiAgICAgIGlmIChyZXN1bHQgJiYgcmVzdWx0LnN0YXR1cyA9PSAnT0snICYmIC9zdGFydGVkLy50ZXN0KHJlc3VsdC5tZXNzYWdlKSkge1xuICAgICAgICBzZWxmLnNldCgnc2VydmVyU3RhdGUnLCAnc3RhcnRlZCcpO1xuXG4gICAgICAgIC8vIGdvIGFoZWFkIGFuZCBvcGVuIGEgY2xpZW50IGlmIHRoZSBzZXJ2ZXIgaXMgbGlzdGVuaW5nXG4gICAgICAgIHNlbGYub3BlbigpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgc2VsZi5zZXQoJ3NlcnZlclN0YXRlJywgJ3N0b3BwZWQnKTtcbiAgICAgIH1cbiAgICB9KTtcbiAgfSxcblxuICBzdGFydFNlcnZlcjogZnVuY3Rpb24oKSB7XG4gICAgaWYgKCF0aGlzLmlzVmFsaWQoKSkgcmV0dXJuO1xuICAgIHRoaXMuc2VuZFNlcnZlckNvbW1hbmQoJ3N0YXJ0Jyk7XG4gIH0sXG5cbiAgc3RvcFNlcnZlcjogZnVuY3Rpb24oKSB7XG4gICAgaWYgKCF0aGlzLmlzVmFsaWQoKSkgcmV0dXJuO1xuICAgIHRoaXMuc2VuZFNlcnZlckNvbW1hbmQoJ3N0b3AnKTtcbiAgfSxcblxuICBzZW5kU2VydmVyQ29tbWFuZDogZnVuY3Rpb24oY29tbWFuZCkge1xuICAgIGlmICghdGhpcy5pc1ZhbGlkKCkpIHJldHVybjtcblxuICAgIHRoaXMuc2V0KCdzZXJ2ZXJFcnJvcicsICcnKTtcblxuICAgIHZhciBwb3J0ID0gdGhpcy5nZXQoJ3BvcnQnKTtcbiAgICB2YXIgc2VsZiA9IHRoaXM7XG5cbiAgICAkLnBvc3QoJy9hcGkvdjEvZWNob3NlcnZlci8nICsgcG9ydCArICcvJyArIGNvbW1hbmQsIGZ1bmN0aW9uIChyZXN1bHQpIHtcbiAgICAgIGlmIChyZXN1bHQgJiYgcmVzdWx0LnN0YXR1cyA9PSAnZXJyb3InKSB7XG4gICAgICAgIHNlbGYudHJpZ2dlcignc2VydmVyRXJyb3InLCByZXN1bHQubWVzc2FnZSk7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cblxuICAgICAgdmFyIHN0YXJ0ZWQgPSAvc3RhcnRlZC8udGVzdChyZXN1bHQubWVzc2FnZSwgXCJpXCIpO1xuXG4gICAgICAvLyBvbmNlIHRoZSBzZXJ2ZXIgaXMgc3RhcnRlZCwgb3BlbiBhIGNsaWVudCBjb25uZWN0aW9uXG4gICAgICBpZiAoc3RhcnRlZCkge1xuICAgICAgICBzZWxmLnNldCgnc2VydmVyU3RhdGUnLCAnc3RhcnRlZCcpO1xuICAgICAgICBzZWxmLm9wZW4oKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHNlbGYuc2V0KCdzZXJ2ZXJTdGF0ZScsICdzdG9wcGVkJyk7XG4gICAgICAgIHNlbGYuY2xvc2UoKTtcbiAgICAgIH1cbiAgICB9KTtcbiAgfSxcblxuICBvcGVuOiBmdW5jdGlvbigpIHtcbiAgICBpZiAodGhpcy5jbGllbnQuaXNPcGVuKCkpIHJldHVybjtcblxuICAgIHZhciBzZWxmID0gdGhpcztcblxuICAgIHNlbGYuY2xpZW50Lm9ub3BlbiA9IGZ1bmN0aW9uKCkge1xuICAgICAgc2VsZi50cmlnZ2VyKCdvcGVuJyk7XG4gICAgfTtcblxuICAgIHNlbGYuY2xpZW50Lm9uY2xvc2UgPSBmdW5jdGlvbigpIHtcbiAgICAgIC8vIHJlbGVhc2UgaGFuZGxlcnNcbiAgICAgIHNlbGYuY2xpZW50Lm9ub3BlbiA9IG51bGw7XG4gICAgICBzZWxmLmNsaWVudC5vbmNsb3NlID0gbnVsbDtcbiAgICAgIHNlbGYuY2xpZW50Lm9uZXJyb3IgPSBudWxsO1xuICAgICAgc2VsZi5jbGllbnQub25tZXNzYWdlID0gbnVsbDtcbiAgICAgIHNlbGYuY2xpZW50Lm9uaGlzdG9yeSA9IG51bGw7XG5cbiAgICAgIHNlbGYudHJpZ2dlcignY2xvc2UnKTtcbiAgICB9O1xuXG4gICAgc2VsZi5jbGllbnQub25lcnJvciA9IGZ1bmN0aW9uKGVycikge1xuICAgICAgc2VsZi50cmlnZ2VyKCdlcnJvcicsIGVycik7XG4gICAgfTtcblxuICAgIHNlbGYuY2xpZW50Lm9ubWVzc2FnZSA9IGZ1bmN0aW9uKHJlc3BvbnNlKSB7XG4gICAgICB2YXIgZXIgPSBuZXcgRWNob1Jlc3BvbnNlKHJlc3BvbnNlKTtcbiAgICAgIHNlbGYudHJpZ2dlcignbWVzc2FnZScsIGVyKTtcbiAgICB9O1xuXG4gICAgc2VsZi5jbGllbnQub25oaXN0b3J5ID0gZnVuY3Rpb24ocmVzcG9uc2UpIHtcbiAgICAgIHZhciBlciA9IG5ldyBFY2hvUmVzcG9uc2UocmVzcG9uc2UpO1xuICAgICAgc2VsZi50cmlnZ2VyKCdoaXN0b3J5JywgZXIpO1xuICAgIH07XG5cbiAgICB2YXIgdXJpID0gJ3dzOi8vJyArIHRoaXMuZ2V0KCdob3N0JykgKyAnOicgKyB0aGlzLmdldCgncG9ydCcpO1xuICAgIHRoaXMuY2xpZW50Lm9wZW4odXJpKTtcbiAgfSxcblxuICBjbG9zZTogZnVuY3Rpb24oKSB7XG4gICAgaWYgKHRoaXMuY2xpZW50LmlzQ2xvc2VkKCkpIHJldHVybjtcbiAgICB0aGlzLmNsaWVudC5jbG9zZSgpO1xuICB9LFxuXG4gIHNlbmQ6IGZ1bmN0aW9uKG1lc3NhZ2UpIHtcbiAgICBpZiAoIXRoaXMuY2xpZW50LmlzT3BlbigpKSByZXR1cm47XG4gICAgdGhpcy5jbGllbnQuc2VuZChtZXNzYWdlKTtcbiAgfSxcblxuICBzZW5kSGlzdG9yeUNvbW1hbmQ6IGZ1bmN0aW9uKCkge1xuICAgIC8vIGp1c3QgYSBzaG9ydGN1dCBmb3IgZW50ZXJpbmcgJ1tISVNUT1JZXSdcbiAgICBpZiAoIXRoaXMuY2xpZW50LmlzT3BlbigpKSByZXR1cm47XG4gICAgdGhpcy5jbGllbnQuc2VuZEhpc3RvcnlDb21tYW5kKCk7XG4gIH0sXG5cbiAgaGlzdG9yeUZpbHRlcjogZnVuY3Rpb24ocGF0dGVybikge1xuICAgIHJldHVybiB0aGlzLmNsaWVudC5oaXN0b3J5RmlsdGVyKHBhdHRlcm4pO1xuICB9XG59KTtcblxubW9kdWxlLmV4cG9ydHMgPSBBcHA7XG5cbiIsInZhciBFY2hvUmVzcG9uc2UgPSBCYWNrYm9uZS5Nb2RlbC5leHRlbmQoe1xuICBkZWZhdWx0czoge1xuICAgIHN0YXR1czogJycsXG4gICAgcmVzcG9uc2VUaW1lOiBuZXcgRGF0ZSgpLmdldFRpbWUoKSxcbiAgICB0eXBlOiAnbWVzc2FnZScsXG4gICAgbWVzc2FnZXM6IFsgJycgXVxuICB9LFxuXG4gIHRvRGlzcGxheVN0cmluZzogZnVuY3Rpb24oKSB7XG4gICAgLy8gaWYgbm90IGEgbWVzc2FnZSByZXNwb25zZSAoc3VjaCBhcyBhIGhpc3RvcnkgcmVzcG9uc2UpLFxuICAgIC8vIHRoZW4gb25seSBkaXNwbGF5IHRoZSByZXNwb25zZSB0aW1lXG4gICAgcmV0dXJuIHRoaXMuZ2V0KCd0eXBlJykgIT0gJ21lc3NhZ2UnXG4gICAgICA/ICdbcmVzcG9uc2VdICcgKyB0aGlzLmdldCgncmVzcG9uc2VUaW1lJykgKyAnbXMnXG4gICAgICA6ICdcIicgKyB0aGlzLmdldCgnbWVzc2FnZXMnKVswXSArICdcIiwgJyArIHRoaXMuZ2V0KCdyZXNwb25zZVRpbWUnKSArICdtcyc7XG4gIH1cbn0pO1xuXG5tb2R1bGUuZXhwb3J0cyA9IEVjaG9SZXNwb25zZTsiLCJ2YXIgRWNob1Jlc3BvbnNlID0gcmVxdWlyZSgnLi8uLi9tb2RlbHMvRWNob1Jlc3BvbnNlJyk7XG5cbm1vZHVsZS5leHBvcnRzID0gQmFja2JvbmUuVmlldy5leHRlbmQoe1xuICBpbml0aWFsaXplOiBmdW5jdGlvbihvcHRpb25zKSB7XG4gICAgdmFyIHNlbGYgPSB0aGlzO1xuXG4gICAgdGhpcy5yZW5kZXIoKTtcblxuICAgIHRoaXMubW9kZWwub24oJ2hpc3RvcnknLCBmdW5jdGlvbihyZXNwb25zZSkge1xuICAgICAgc2VsZi5yZW5kZXIocmVzcG9uc2UpO1xuICAgIH0pO1xuICB9LFxuXG4gIGV2ZW50czoge1xuICAgICdpbnB1dCAjc2VhcmNoZmlsdGVyJzogJ2ZpbHRlck1lc3NhZ2VzJyxcbiAgICAnY2xpY2sgI2J0bmdldGhpc3RvcnknOiAnZ2V0SGlzdG9yeSdcbiAgfSxcblxuICB0ZW1wbGF0ZTogSGFuZGxlYmFycy5jb21waWxlKCQoJyNtZXNzYWdlLWhpc3RvcnktdGVtcGxhdGUnKS5odG1sKCkpLFxuXG4gIHJlbmRlcjogZnVuY3Rpb24oKSB7XG4gICAgdmFyIHJlc3BvbnNlID0gYXJndW1lbnRzWzBdIHx8IFtdO1xuXG4gICAgLy8gdGhlIGNoZWNrIGlzIGJlY2F1c2UgY2FjaGVkIG1lc3NhZ2VzIGZyb20gdGhlIHNlcnZlciBhcmVuJ3RcbiAgICAvLyB3cmFwcGVkIGluIEVjaG9SZXNwb25zZSBiYWNrYm9uZSBvYmplY3RzLCBqdXN0IHBvam9zXG4gICAgdmFyIG1lc3NhZ2VzID0gcmVzcG9uc2UgaW5zdGFuY2VvZiBFY2hvUmVzcG9uc2VcbiAgICAgID8gcmVzcG9uc2UudG9KU09OKCkubWVzc2FnZXNcbiAgICAgIDogcmVzcG9uc2UubWVzc2FnZXM7XG5cbiAgICB2YXIgYXJncyA9IHtcbiAgICAgIG1lc3NhZ2VzOiBtZXNzYWdlc1xuICAgIH07XG5cbiAgICB0aGlzLiRlbC5odG1sKHRoaXMudGVtcGxhdGUoYXJncykpO1xuXG4gICAgdGhpcy5maWx0ZXJQYXR0ZXJuKHRoaXMucGF0dGVybik7XG5cbiAgICByZXR1cm4gdGhpcztcbiAgfSxcblxuICBnZXRIaXN0b3J5OiBmdW5jdGlvbigpIHtcbiAgICAvLyBqdXN0IGEgc2hvcnRjdXQgZm9yIGVudGVyaW5nICdbSElTVE9SWV0nXG4gICAgdGhpcy5tb2RlbC5zZW5kSGlzdG9yeUNvbW1hbmQoKTtcbiAgfSxcblxuICBmaWx0ZXJQYXR0ZXJuOiBmdW5jdGlvbigpIHtcbiAgICBpZiAoYXJndW1lbnRzLmxlbmd0aCA9PSAwKSB7XG4gICAgICByZXR1cm4gJCgnI3NlYXJjaGZpbHRlcicpLnZhbCgpO1xuICAgIH0gZWxzZSB7XG4gICAgICAkKCcjc2VhcmNoZmlsdGVyJykudmFsKGFyZ3VtZW50c1swXSk7XG4gICAgICAkKCcjc2VhcmNoZmlsdGVyJykuZm9jdXMoKTtcbiAgICB9XG4gIH0sXG5cbiAgZmlsdGVyTWVzc2FnZXM6IGZ1bmN0aW9uKCkge1xuICAgIHRoaXMucGF0dGVybiA9IHRoaXMuZmlsdGVyUGF0dGVybigpO1xuICAgIHZhciBmaWx0ZXJlZCA9IHRoaXMubW9kZWwuaGlzdG9yeUZpbHRlcih0aGlzLnBhdHRlcm4pO1xuICAgIHRoaXMucmVuZGVyKGZpbHRlcmVkKTtcbiAgfVxufSk7IiwidmFyIE1lc3NhZ2VTZW5kVmlldyA9IHJlcXVpcmUoJy4vTWVzc2FnZVNlbmRWaWV3JylcbiAgLCBNZXNzYWdlUmVjZWl2ZVZpZXcgPSByZXF1aXJlKCcuL01lc3NhZ2VSZWNlaXZlVmlldycpXG4gICwgTWVzc2FnZUhpc3RvcnlWaWV3ID0gcmVxdWlyZSgnLi9NZXNzYWdlSGlzdG9yeVZpZXcnKVxuICA7XG5cbm1vZHVsZS5leHBvcnRzID0gQmFja2JvbmUuVmlldy5leHRlbmQoe1xuICBpbml0aWFsaXplOiBmdW5jdGlvbiAoKSB7XG5cbiAgICB0aGlzLnNlbmRWaWV3ID0gbmV3IE1lc3NhZ2VTZW5kVmlldyh7XG4gICAgICBtb2RlbDogdGhpcy5tb2RlbFxuICAgIH0pO1xuXG4gICAgdGhpcy5yZWNlaXZlVmlldyA9IG5ldyBNZXNzYWdlUmVjZWl2ZVZpZXcoe1xuICAgICAgbW9kZWw6IHRoaXMubW9kZWxcbiAgICB9KTtcblxuICAgIHRoaXMuaGlzdG9yeVZpZXcgPSBuZXcgTWVzc2FnZUhpc3RvcnlWaWV3KHtcbiAgICAgIG1vZGVsOiB0aGlzLm1vZGVsLFxuICAgICAgZWw6ICcjbWVzc2FnZS1oaXN0b3J5J1xuICAgIH0pO1xuXG4gICAgdGhpcy5yZW5kZXIoKTtcblxuICAgIHRoaXMubGlzdGVuVG8odGhpcy5tb2RlbCwgJ2NoYW5nZTpzZXJ2ZXJTdGF0ZScsIHRoaXMucmVuZGVyKTtcbiAgfSxcblxuICB0ZW1wbGF0ZTogSGFuZGxlYmFycy5jb21waWxlKCQoJyNtZXNzYWdlLXBhbmVsLXRlbXBsYXRlJykuaHRtbCgpKSxcblxuICByZW5kZXI6IGZ1bmN0aW9uICgpIHtcbiAgICB2YXIgc2VydmVyU3RhdGUgPSB0aGlzLm1vZGVsLmdldCgnc2VydmVyU3RhdGUnKTtcblxuICAgIHZhciBhcmdzID0ge1xuICAgICAgaGlkZGVuOiBzZXJ2ZXJTdGF0ZSA9PSAnc3RhcnRlZCcgPyAndmlzaWJsZScgOiAnY29sbGFwc2UnXG4gICAgfTtcblxuICAgIHRoaXMuJGVsLmh0bWwodGhpcy50ZW1wbGF0ZShhcmdzKSk7XG5cbiAgICB0aGlzLnNlbmRWaWV3LnNldEVsZW1lbnQodGhpcy4kKCcjbWVzc2FnZS1zZW5kJykpLnJlbmRlcigpO1xuICAgIHRoaXMucmVjZWl2ZVZpZXcuc2V0RWxlbWVudCh0aGlzLiQoJyNtZXNzYWdlLXJlY2VpdmUnKSkucmVuZGVyKCk7XG4gICAgdGhpcy5oaXN0b3J5Vmlldy5zZXRFbGVtZW50KHRoaXMuJCgnI21lc3NhZ2UtaGlzdG9yeScpKS5yZW5kZXIoKTtcblxuICAgIHJldHVybiB0aGlzO1xuICB9XG5cbn0pO1xuIiwidmFyIEVjaG9SZXNwb25zZSA9IHJlcXVpcmUoJy4vLi4vbW9kZWxzL0VjaG9SZXNwb25zZScpO1xuXG5tb2R1bGUuZXhwb3J0cyA9IEJhY2tib25lLlZpZXcuZXh0ZW5kKHtcbiAgaW5pdGlhbGl6ZTogZnVuY3Rpb24oKSB7XG4gICAgdmFyIHNlbGYgPSB0aGlzO1xuXG4gICAgdGhpcy5yZW5kZXIoKTtcblxuICAgIHRoaXMubW9kZWwub24oJ21lc3NhZ2UgaGlzdG9yeScsIGZ1bmN0aW9uKHJlc3BvbnNlKSB7XG4gICAgICBzZWxmLnJlbmRlcihyZXNwb25zZSk7XG4gICAgfSlcbiAgfSxcblxuICB0ZW1wbGF0ZTogSGFuZGxlYmFycy5jb21waWxlKCQoJyNtZXNzYWdlLXJlY2VpdmUtdGVtcGxhdGUnKS5odG1sKCkpLFxuXG4gIHJlbmRlcjogZnVuY3Rpb24oKSB7XG4gICAgdmFyIHJlc3BvbnNlID0gYXJndW1lbnRzWzBdO1xuICAgIGlmICghKHJlc3BvbnNlIGluc3RhbmNlb2YgRWNob1Jlc3BvbnNlKSkgcmV0dXJuO1xuXG4gICAgdmFyIGFyZ3MgPSB7XG4gICAgICBtZXNzYWdlOiByZXNwb25zZS50b0Rpc3BsYXlTdHJpbmcoKVxuICAgIH07XG5cbiAgICB0aGlzLiRlbC5odG1sKHRoaXMudGVtcGxhdGUoYXJncykpO1xuXG4gICAgcmV0dXJuIHRoaXM7XG4gIH1cbn0pOyIsIm1vZHVsZS5leHBvcnRzID0gQmFja2JvbmUuVmlldy5leHRlbmQoe1xuICBpbml0aWFsaXplOiBmdW5jdGlvbigpIHtcbiAgICB0aGlzLnJlbmRlcigpO1xuICB9LFxuXG4gIGV2ZW50czoge1xuICAgICdjbGljayAjYnRuc2VuZG1lc3NhZ2UnOiAnc2VuZE1lc3NhZ2UnLFxuICAgICdpbnB1dCAjbWVzc2FnZSc6ICd0b2dnbGVFbmFibGVCdXR0b24nXG4gIH0sXG5cbiAgdGVtcGxhdGU6IEhhbmRsZWJhcnMuY29tcGlsZSgkKCcjbWVzc2FnZS1zZW5kLXRlbXBsYXRlJykuaHRtbCgpKSxcblxuICByZW5kZXI6IGZ1bmN0aW9uKCkge1xuICAgIHZhciBhcmdzID0ge1xuICAgIH07XG5cbiAgICB0aGlzLiRlbC5odG1sKHRoaXMudGVtcGxhdGUoYXJncykpO1xuXG4gICAgcmV0dXJuIHRoaXM7XG4gIH0sXG5cbiAgbWVzc2FnZVRleHQ6IGZ1bmN0aW9uKCkge1xuICAgIGlmIChhcmd1bWVudHMubGVuZ3RoID09IDApIHtcbiAgICAgIHJldHVybiAkKCcjbWVzc2FnZScpLnZhbCgpO1xuICAgIH0gZWxzZSB7XG4gICAgICAkKCcjbWVzc2FnZScpLnZhbChhcmd1bWVudHNbMF0pO1xuICAgIH1cbiAgfSxcblxuICB0b2dnbGVFbmFibGVCdXR0b246IGZ1bmN0aW9uKCkge1xuICAgIGlmICh0aGlzLm1lc3NhZ2VUZXh0KCkpIHtcbiAgICAgIGNvbnNvbGUubG9nKCd2YWx1ZScpO1xuICAgICAgJCgnI2J0bnNlbmRtZXNzYWdlJykucmVtb3ZlQ2xhc3MoJ2Rpc2FibGVkJyk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGNvbnNvbGUubG9nKCdlbXB0eScpO1xuICAgICAgJCgnI2J0bnNlbmRtZXNzYWdlJykuYWRkQ2xhc3MoJ2Rpc2FibGVkJyk7XG4gICAgfVxuICB9LFxuXG4gIHNlbmRNZXNzYWdlOiBmdW5jdGlvbigpIHtcbiAgICB2YXIgbWVzc2FnZSA9IHRoaXMubWVzc2FnZVRleHQoKTtcbiAgICBpZiAobWVzc2FnZSkgdGhpcy5tb2RlbC5zZW5kKG1lc3NhZ2UpO1xuICAgIHRoaXMubWVzc2FnZVRleHQoJycpO1xuICB9XG59KTtcbiIsIm1vZHVsZS5leHBvcnRzID0gQmFja2JvbmUuVmlldy5leHRlbmQoe1xuICBzZXJ2ZXJFcnJvck1lc3NhZ2U6IG51bGwsXG5cbiAgaW5pdGlhbGl6ZTogZnVuY3Rpb24oKSB7XG4gICAgdmFyIHNlbGYgPSB0aGlzO1xuXG4gICAgdGhpcy5yZW5kZXIoKTtcblxuICAgIHRoaXMubGlzdGVuVG8odGhpcy5tb2RlbCwgJ2NoYW5nZTpzZXJ2ZXJTdGF0ZScsIHRoaXMucmVuZGVyKTtcblxuICAgIHRoaXMubW9kZWwub24oJ3NlcnZlckVycm9yJywgZnVuY3Rpb24oZXJyKSB7XG4gICAgICBzZWxmLnNlcnZlckVycm9yID0gZXJyO1xuICAgICAgc2VsZi5yZW5kZXIoKTtcbiAgICB9KVxuICB9LFxuXG4gIGV2ZW50czoge1xuICAgICdjbGljayAjYnRuc2VydmVyJzogJ3RvZ2dsZXN0YXJ0J1xuICB9LFxuXG4gIHRlbXBsYXRlOiBIYW5kbGViYXJzLmNvbXBpbGUoJCgnI3NlcnZlci1jb250cm9sLXRlbXBsYXRlJykuaHRtbCgpKSxcbiAgLy90ZW1wbGF0ZTogcmVxdWlyZSgnLi90ZW1wbGF0ZXMvc2VydmVyLWNvbnRyb2wuaGJzJyksXG5cbiAgcmVuZGVyOiBmdW5jdGlvbigpIHtcbiAgICB2YXIgcG9ydCA9IHRoaXMubW9kZWwuZ2V0KCdwb3J0Jyk7XG4gICAgdmFyIHNlcnZlclN0YXRlID0gdGhpcy5tb2RlbC5nZXQoJ3NlcnZlclN0YXRlJyk7XG4gICAgdmFyIHNlcnZlclN0YXRlVGV4dCA9IHNlcnZlclN0YXRlID09ICdzdGFydGVkJ1xuICAgICAgPyAnc3RhcnRlZCAocG9ydCAnICsgcG9ydCArICcpJ1xuICAgICAgOiBzZXJ2ZXJTdGF0ZTtcbiAgICB2YXIgc2VydmVyRXJyb3IgPSB0aGlzLnNlcnZlckVycm9yID8gJyBFcnJvcjogJyArIHRoaXMuc2VydmVyRXJyb3IgOiBudWxsO1xuICAgIHZhciBzZXJ2ZXJFcnJvckNsYXNzID0gc2VydmVyRXJyb3IgPyAndmlzaWJsZScgOiAnaGlkZGVuJztcblxuICAgIHZhciBhcmdzID0ge1xuICAgICAgc3RhdGVDbGFzczogc2VydmVyU3RhdGUsXG4gICAgICBzZXJ2ZXJTdGF0ZTogc2VydmVyU3RhdGVUZXh0LFxuICAgICAgc2VydmVyUG9ydDogcG9ydCxcbiAgICAgIGlucHV0VmlzaWJpbGl0eTogc2VydmVyU3RhdGUgPT0gJ3N0YXJ0ZWQnID8gJ2NvbGxhcHNlJyA6ICd2aXNpYmxlJyxcbiAgICAgIHNlcnZlckNvbW1hbmQ6IHNlcnZlclN0YXRlID09ICdzdGFydGVkJyA/ICdTdG9wJyA6ICdTdGFydCcsXG4gICAgICBzZXJ2ZXJFcnJvckNsYXNzOiBzZXJ2ZXJFcnJvckNsYXNzLFxuICAgICAgc2VydmVyRXJyb3I6IHNlcnZlckVycm9yXG4gICAgfTtcblxuICAgIHRoaXMuJGVsLmh0bWwodGhpcy50ZW1wbGF0ZShhcmdzKSk7XG5cbiAgICAkKCcjcG9ydG51bWJlcicpLmZvY3VzKCk7XG5cbiAgICByZXR1cm4gdGhpcztcbiAgfSxcblxuICBwb3J0OiBmdW5jdGlvbigpIHtcbiAgICByZXR1cm4gJCgnI3BvcnRudW1iZXInKS52YWwoKTtcbiAgfSxcblxuICB0b2dnbGVzdGFydDogZnVuY3Rpb24oKSB7XG4gICAgLy8gY2xlYXIgcHJldmlvdXMgZXJyb3IgbWVzc2FnZVxuICAgIHRoaXMuc2VydmVyRXJyb3IgPSBudWxsO1xuICAgICQoJyNzZXJ2ZXItZXJyb3InKS5odG1sKCcnKTtcblxuICAgIHZhciBwb3J0ID0gdGhpcy5wb3J0KCk7XG4gICAgdGhpcy5tb2RlbC5zZXQoJ3BvcnQnLCBwb3J0LCB7IHZhbGlkYXRlOiB0cnVlIH0pO1xuICAgIGlmICh0aGlzLm1vZGVsLnZhbGlkYXRpb25FcnJvcikge1xuICAgICAgJCgnI3BvcnRudW1iZXInKS52YWwoJycpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIHZhciBjb21tYW5kID0gdGhpcy5tb2RlbC5nZXQoJ3NlcnZlclN0YXRlJykgPT0gJ3N0YXJ0ZWQnID8gJ3N0b3AnIDogJ3N0YXJ0JztcbiAgICB0aGlzLm1vZGVsLnNlbmRTZXJ2ZXJDb21tYW5kKGNvbW1hbmQpO1xuICB9XG59KTtcbiJdfQ==
