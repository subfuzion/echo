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

  try {
    this.ws = new WebSocket(uri);
  } catch (err) {
    callHandler('error', err);
    return;
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
module.exports = {
  start: function (host) {
    // models
    var App = require('./models/App')
      ;

    // views
    var ServerControlView = require('./views/ServerControlView')
      , MessagePanelView = require('./views/MessagePanelView')
      ;


    var app = new App({ host: host });

    // wire up views
    // just creating them works since they wire
    // up the page and render when initialized

    new ServerControlView({
      model: app,
      el: '#server-control'
    });

    new MessagePanelView({
      model: app,
      el: '#message-panel'
    });

    // all wired up to the page and ready for user input
  }
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

    if (command == 'start' && this.serverState == 'started') {
      console.log('server already started');
      return;
    }

    if (command == 'stop' && this.serverState == 'stopped') {
      console.log('server already stopped');
      return;
    }

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
      console.log('connection is open');
      self.set('serverState', 'started');
      self.trigger('open');
    };

    self.client.onclose = function() {
      console.log('connection is closed');
      // release handlers
      self.client.onopen = null;
      self.client.onclose = null;
      self.client.onerror = null;
      self.client.onmessage = null;
      self.client.onhistory = null;

      self.trigger('close');
    };

    self.client.onerror = function(err) {
      console.log('-----');
      console.log('client error:');
      console.log(err);
      console.log('-----');
      self.trigger('error', err.message);
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
    console.log('opening connection to ' + uri);
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

  template: require('./templates/message-history.hbs'),

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
},{"./../models/EchoResponse":5,"./templates/message-history.hbs":11}],7:[function(require,module,exports){
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

  template: require('./templates/message-panel.hbs'),

  render: function () {

    var serverState = this.model.get('serverState');

    var args = {
      hidden: serverState == 'started' ? 'visible' : 'collapse'
    };

    this.$el.html(this.template(args));

    this.sendView.setElement(this.$('#message-send')).render();
    this.receiveView.setElement(this.$('#message-receive')).render();
    this.historyView.setElement(this.$('#message-history')).render();

    $('#message').focus();

    return this;
  }

});

},{"./MessageHistoryView":6,"./MessageReceiveView":8,"./MessageSendView":9,"./templates/message-panel.hbs":12}],8:[function(require,module,exports){
var EchoResponse = require('./../models/EchoResponse');

module.exports = Backbone.View.extend({
  initialize: function() {
    var self = this;

    this.model.on('message history', function(response) {
      self.render(response);
    })
  },

  template: require('./templates/message-receive.hbs'),

  render: function() {
    // only render when an EchoResponse is provided
    var response = arguments[0];
    if (!(response instanceof EchoResponse)) return;

    var args = {
      message: response.toDisplayString()
    };

    this.$el.html(this.template(args));

    return this;
  }
});
},{"./../models/EchoResponse":5,"./templates/message-receive.hbs":13}],9:[function(require,module,exports){
module.exports = Backbone.View.extend({
  initialize: function() {
    this.render();
  },

  events: {
    'click #btnsendmessage': 'sendMessage',
    'input #message': 'toggleEnableButton'
  },

  template: require('./templates/message-send.hbs'),

  render: function() {
    var args = {
    };

    this.$el.html(this.template(args));

    $('#message').focus();

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

},{"./templates/message-send.hbs":14}],10:[function(require,module,exports){
module.exports = Backbone.View.extend({
  serverErrorMessage: null,

  initialize: function() {
    var self = this;

    this.render();

    this.listenTo(this.model, 'change:serverState', this.render);

    this.model.on('serverError', function(err) {
      self.error = err;
      self.render();
    });

    this.model.on('error', function(err) {
      self.error = err;
      self.render();
    })
  },

  events: {
    'click #btnserver': 'togglestart'
  },

  //template: Handlebars.compile($('#server-control-template').html()),
  template: require('./templates/server-control.hbs'),

  render: function() {
    var port = this.model.get('port');
    var serverState = this.model.get('serverState');
    var serverStateText = serverState == 'started'
      ? 'started (port ' + port + ')'
      : serverState;
    var error = this.error ? ' Error: ' + this.error : null;
    var serverErrorClass = error ? 'visible' : 'hidden';

    var args = {
      stateClass: serverState,
      serverState: serverStateText,
      serverPort: port,
      inputVisibility: serverState == 'started' ? 'collapse' : 'visible',
      serverCommand: serverState == 'started' ? 'Stop' : 'Start',
      serverErrorClass: serverErrorClass,
      serverError: error
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
    this.error = null;
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

},{"./templates/server-control.hbs":15}],11:[function(require,module,exports){
// hbsfy compiled Handlebars template
var Handlebars = require('hbsfy/runtime');
module.exports = Handlebars.template(function (Handlebars,depth0,helpers,partials,data) {
  this.compilerInfo = [4,'>= 1.0.0'];
helpers = this.merge(helpers, Handlebars.helpers); data = data || {};
  var buffer = "", stack1, functionType="function", escapeExpression=this.escapeExpression, self=this;

function program1(depth0,data) {
  
  var buffer = "";
  buffer += "\n          <li class=\"list-group-item\">\n            "
    + escapeExpression((typeof depth0 === functionType ? depth0.apply(depth0) : depth0))
    + "\n          </li>\n        ";
  return buffer;
  }

  buffer += "<div class=\"row\">\n  <div class=\"col-md-4 col-md-offset-4\">\n    <button type=\"button\" class=\"btn btn-info\" id=\"btngethistory\">Show\n      History\n    </button>\n  </div>\n</div>\n<div class=\"row\">\n  <div class=\"col-md-4 col-md-offset-4\">\n    <h3>Messages</h3>\n\n    <div class=\"input-group\">\n      <input type=\"text\" class=\"form-control search\" id=\"searchfilter\"\n             placeholder=\"type here to search\"/>\n        <span class=\"input-group-addon\"><i\n            class=\"glyphicon glyphicon-search\"></i></span>\n    </div>\n\n    <div id=\"history\">\n      <ul class=\"list list-group\">\n        ";
  stack1 = helpers.each.call(depth0, (depth0 && depth0.messages), {hash:{},inverse:self.noop,fn:self.program(1, program1, data),data:data});
  if(stack1 || stack1 === 0) { buffer += stack1; }
  buffer += "\n      </ul>\n    </div>\n  </div>\n</div>\n";
  return buffer;
  });

},{"hbsfy/runtime":23}],12:[function(require,module,exports){
// hbsfy compiled Handlebars template
var Handlebars = require('hbsfy/runtime');
module.exports = Handlebars.template(function (Handlebars,depth0,helpers,partials,data) {
  this.compilerInfo = [4,'>= 1.0.0'];
helpers = this.merge(helpers, Handlebars.helpers); data = data || {};
  var buffer = "", stack1, helper, functionType="function", escapeExpression=this.escapeExpression;


  buffer += "<div class=\"";
  if (helper = helpers.hidden) { stack1 = helper.call(depth0, {hash:{},data:data}); }
  else { helper = (depth0 && depth0.hidden); stack1 = typeof helper === functionType ? helper.call(depth0, {hash:{},data:data}) : helper; }
  buffer += escapeExpression(stack1)
    + "\">\n\n  <div id=\"message-send\"> </div>\n\n  <div id=\"message-receive\"></div>\n\n  <div id=\"message-history\"></div>\n\n</div>\n";
  return buffer;
  });

},{"hbsfy/runtime":23}],13:[function(require,module,exports){
// hbsfy compiled Handlebars template
var Handlebars = require('hbsfy/runtime');
module.exports = Handlebars.template(function (Handlebars,depth0,helpers,partials,data) {
  this.compilerInfo = [4,'>= 1.0.0'];
helpers = this.merge(helpers, Handlebars.helpers); data = data || {};
  var buffer = "", stack1, helper, functionType="function", escapeExpression=this.escapeExpression;


  buffer += "<div class=\"row\">\n  <div class=\"col-md-4 col-md-offset-4\" id=\"info\">\n    <div class=\"alert alert-info\">\n      <strong>";
  if (helper = helpers.message) { stack1 = helper.call(depth0, {hash:{},data:data}); }
  else { helper = (depth0 && depth0.message); stack1 = typeof helper === functionType ? helper.call(depth0, {hash:{},data:data}) : helper; }
  buffer += escapeExpression(stack1)
    + "</strong>\n    </div>\n  </div>\n</div>\n";
  return buffer;
  });

},{"hbsfy/runtime":23}],14:[function(require,module,exports){
// hbsfy compiled Handlebars template
var Handlebars = require('hbsfy/runtime');
module.exports = Handlebars.template(function (Handlebars,depth0,helpers,partials,data) {
  this.compilerInfo = [4,'>= 1.0.0'];
helpers = this.merge(helpers, Handlebars.helpers); data = data || {};
  


  return "<div class=\"row topmargin\">\n  <div class=\"col-md-4 col-md-offset-4\">\n    <div class=\"well\">\n      <form role=\"form\" id=\"formmessage\">\n        <div class=\"form-group\">\n          <label for=\"message\">Message</label>\n\n          <div class=\"input-group\">\n            <input type=\"text\" class=\"form-control\" id=\"message\"\n                   placeholder=\"Send message...\">\n              <span class=\"input-group-btn\">\n                <button type=\"submit\" class=\"btn btn-default\"\n                        id=\"btnsendmessage\">Send\n                </button>\n              </span>\n          </div>\n        </div>\n      </form>\n    </div>\n  </div>\n</div>\n";
  });

},{"hbsfy/runtime":23}],15:[function(require,module,exports){
// hbsfy compiled Handlebars template
var Handlebars = require('hbsfy/runtime');
module.exports = Handlebars.template(function (Handlebars,depth0,helpers,partials,data) {
  this.compilerInfo = [4,'>= 1.0.0'];
helpers = this.merge(helpers, Handlebars.helpers); data = data || {};
  var buffer = "", stack1, helper, functionType="function", escapeExpression=this.escapeExpression;


  buffer += "<div class=\"row\">\n  <div class=\"col-md-4 col-md-offset-4\">\n    <div class=\"well\">\n      <form role=\"form\" action=\"/#\">\n        <div class=\"form-group\">\n\n          <div class=\"form-inline\">\n            <label for=\"portnumber\">Echo Server</label>\n            <span id=\"server-state\" class=\"";
  if (helper = helpers.stateClass) { stack1 = helper.call(depth0, {hash:{},data:data}); }
  else { helper = (depth0 && depth0.stateClass); stack1 = typeof helper === functionType ? helper.call(depth0, {hash:{},data:data}) : helper; }
  buffer += escapeExpression(stack1)
    + "\">";
  if (helper = helpers.serverState) { stack1 = helper.call(depth0, {hash:{},data:data}); }
  else { helper = (depth0 && depth0.serverState); stack1 = typeof helper === functionType ? helper.call(depth0, {hash:{},data:data}) : helper; }
  buffer += escapeExpression(stack1)
    + "</span>\n          </div>\n\n          <input type=\"text\" class=\"form-control ";
  if (helper = helpers.inputVisibility) { stack1 = helper.call(depth0, {hash:{},data:data}); }
  else { helper = (depth0 && depth0.inputVisibility); stack1 = typeof helper === functionType ? helper.call(depth0, {hash:{},data:data}) : helper; }
  buffer += escapeExpression(stack1)
    + "\" id=\"portnumber\"\n                 placeholder=\"Enter port between 1024-65535\"\n                 value=\"";
  if (helper = helpers.serverPort) { stack1 = helper.call(depth0, {hash:{},data:data}); }
  else { helper = (depth0 && depth0.serverPort); stack1 = typeof helper === functionType ? helper.call(depth0, {hash:{},data:data}) : helper; }
  buffer += escapeExpression(stack1)
    + "\">\n        </div>\n        <div class=\"form-inline\">\n          <button type=\"submit\" class=\"btn btn-default\"\n                  id=\"btnserver\">";
  if (helper = helpers.serverCommand) { stack1 = helper.call(depth0, {hash:{},data:data}); }
  else { helper = (depth0 && depth0.serverCommand); stack1 = typeof helper === functionType ? helper.call(depth0, {hash:{},data:data}) : helper; }
  buffer += escapeExpression(stack1)
    + "\n          </button>\n        </div>\n        <div class=\"form-inline\">\n          <span id=\"server-error\" class=\"";
  if (helper = helpers.serverErrorClass) { stack1 = helper.call(depth0, {hash:{},data:data}); }
  else { helper = (depth0 && depth0.serverErrorClass); stack1 = typeof helper === functionType ? helper.call(depth0, {hash:{},data:data}) : helper; }
  buffer += escapeExpression(stack1)
    + "\">";
  if (helper = helpers.serverError) { stack1 = helper.call(depth0, {hash:{},data:data}); }
  else { helper = (depth0 && depth0.serverError); stack1 = typeof helper === functionType ? helper.call(depth0, {hash:{},data:data}) : helper; }
  buffer += escapeExpression(stack1)
    + "</span>\n        </div>\n      </form>\n    </div>\n  </div>\n</div>\n";
  return buffer;
  });

},{"hbsfy/runtime":23}],16:[function(require,module,exports){
"use strict";
/*globals Handlebars: true */
var base = require("./handlebars/base");

// Each of these augment the Handlebars object. No need to setup here.
// (This is done to easily share code between commonjs and browse envs)
var SafeString = require("./handlebars/safe-string")["default"];
var Exception = require("./handlebars/exception")["default"];
var Utils = require("./handlebars/utils");
var runtime = require("./handlebars/runtime");

// For compatibility and usage outside of module systems, make the Handlebars object a namespace
var create = function() {
  var hb = new base.HandlebarsEnvironment();

  Utils.extend(hb, base);
  hb.SafeString = SafeString;
  hb.Exception = Exception;
  hb.Utils = Utils;

  hb.VM = runtime;
  hb.template = function(spec) {
    return runtime.template(spec, hb);
  };

  return hb;
};

var Handlebars = create();
Handlebars.create = create;

exports["default"] = Handlebars;
},{"./handlebars/base":17,"./handlebars/exception":18,"./handlebars/runtime":19,"./handlebars/safe-string":20,"./handlebars/utils":21}],17:[function(require,module,exports){
"use strict";
var Utils = require("./utils");
var Exception = require("./exception")["default"];

var VERSION = "1.3.0";
exports.VERSION = VERSION;var COMPILER_REVISION = 4;
exports.COMPILER_REVISION = COMPILER_REVISION;
var REVISION_CHANGES = {
  1: '<= 1.0.rc.2', // 1.0.rc.2 is actually rev2 but doesn't report it
  2: '== 1.0.0-rc.3',
  3: '== 1.0.0-rc.4',
  4: '>= 1.0.0'
};
exports.REVISION_CHANGES = REVISION_CHANGES;
var isArray = Utils.isArray,
    isFunction = Utils.isFunction,
    toString = Utils.toString,
    objectType = '[object Object]';

function HandlebarsEnvironment(helpers, partials) {
  this.helpers = helpers || {};
  this.partials = partials || {};

  registerDefaultHelpers(this);
}

exports.HandlebarsEnvironment = HandlebarsEnvironment;HandlebarsEnvironment.prototype = {
  constructor: HandlebarsEnvironment,

  logger: logger,
  log: log,

  registerHelper: function(name, fn, inverse) {
    if (toString.call(name) === objectType) {
      if (inverse || fn) { throw new Exception('Arg not supported with multiple helpers'); }
      Utils.extend(this.helpers, name);
    } else {
      if (inverse) { fn.not = inverse; }
      this.helpers[name] = fn;
    }
  },

  registerPartial: function(name, str) {
    if (toString.call(name) === objectType) {
      Utils.extend(this.partials,  name);
    } else {
      this.partials[name] = str;
    }
  }
};

function registerDefaultHelpers(instance) {
  instance.registerHelper('helperMissing', function(arg) {
    if(arguments.length === 2) {
      return undefined;
    } else {
      throw new Exception("Missing helper: '" + arg + "'");
    }
  });

  instance.registerHelper('blockHelperMissing', function(context, options) {
    var inverse = options.inverse || function() {}, fn = options.fn;

    if (isFunction(context)) { context = context.call(this); }

    if(context === true) {
      return fn(this);
    } else if(context === false || context == null) {
      return inverse(this);
    } else if (isArray(context)) {
      if(context.length > 0) {
        return instance.helpers.each(context, options);
      } else {
        return inverse(this);
      }
    } else {
      return fn(context);
    }
  });

  instance.registerHelper('each', function(context, options) {
    var fn = options.fn, inverse = options.inverse;
    var i = 0, ret = "", data;

    if (isFunction(context)) { context = context.call(this); }

    if (options.data) {
      data = createFrame(options.data);
    }

    if(context && typeof context === 'object') {
      if (isArray(context)) {
        for(var j = context.length; i<j; i++) {
          if (data) {
            data.index = i;
            data.first = (i === 0);
            data.last  = (i === (context.length-1));
          }
          ret = ret + fn(context[i], { data: data });
        }
      } else {
        for(var key in context) {
          if(context.hasOwnProperty(key)) {
            if(data) { 
              data.key = key; 
              data.index = i;
              data.first = (i === 0);
            }
            ret = ret + fn(context[key], {data: data});
            i++;
          }
        }
      }
    }

    if(i === 0){
      ret = inverse(this);
    }

    return ret;
  });

  instance.registerHelper('if', function(conditional, options) {
    if (isFunction(conditional)) { conditional = conditional.call(this); }

    // Default behavior is to render the positive path if the value is truthy and not empty.
    // The `includeZero` option may be set to treat the condtional as purely not empty based on the
    // behavior of isEmpty. Effectively this determines if 0 is handled by the positive path or negative.
    if ((!options.hash.includeZero && !conditional) || Utils.isEmpty(conditional)) {
      return options.inverse(this);
    } else {
      return options.fn(this);
    }
  });

  instance.registerHelper('unless', function(conditional, options) {
    return instance.helpers['if'].call(this, conditional, {fn: options.inverse, inverse: options.fn, hash: options.hash});
  });

  instance.registerHelper('with', function(context, options) {
    if (isFunction(context)) { context = context.call(this); }

    if (!Utils.isEmpty(context)) return options.fn(context);
  });

  instance.registerHelper('log', function(context, options) {
    var level = options.data && options.data.level != null ? parseInt(options.data.level, 10) : 1;
    instance.log(level, context);
  });
}

var logger = {
  methodMap: { 0: 'debug', 1: 'info', 2: 'warn', 3: 'error' },

  // State enum
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
  level: 3,

  // can be overridden in the host environment
  log: function(level, obj) {
    if (logger.level <= level) {
      var method = logger.methodMap[level];
      if (typeof console !== 'undefined' && console[method]) {
        console[method].call(console, obj);
      }
    }
  }
};
exports.logger = logger;
function log(level, obj) { logger.log(level, obj); }

exports.log = log;var createFrame = function(object) {
  var obj = {};
  Utils.extend(obj, object);
  return obj;
};
exports.createFrame = createFrame;
},{"./exception":18,"./utils":21}],18:[function(require,module,exports){
"use strict";

var errorProps = ['description', 'fileName', 'lineNumber', 'message', 'name', 'number', 'stack'];

function Exception(message, node) {
  var line;
  if (node && node.firstLine) {
    line = node.firstLine;

    message += ' - ' + line + ':' + node.firstColumn;
  }

  var tmp = Error.prototype.constructor.call(this, message);

  // Unfortunately errors are not enumerable in Chrome (at least), so `for prop in tmp` doesn't work.
  for (var idx = 0; idx < errorProps.length; idx++) {
    this[errorProps[idx]] = tmp[errorProps[idx]];
  }

  if (line) {
    this.lineNumber = line;
    this.column = node.firstColumn;
  }
}

Exception.prototype = new Error();

exports["default"] = Exception;
},{}],19:[function(require,module,exports){
"use strict";
var Utils = require("./utils");
var Exception = require("./exception")["default"];
var COMPILER_REVISION = require("./base").COMPILER_REVISION;
var REVISION_CHANGES = require("./base").REVISION_CHANGES;

function checkRevision(compilerInfo) {
  var compilerRevision = compilerInfo && compilerInfo[0] || 1,
      currentRevision = COMPILER_REVISION;

  if (compilerRevision !== currentRevision) {
    if (compilerRevision < currentRevision) {
      var runtimeVersions = REVISION_CHANGES[currentRevision],
          compilerVersions = REVISION_CHANGES[compilerRevision];
      throw new Exception("Template was precompiled with an older version of Handlebars than the current runtime. "+
            "Please update your precompiler to a newer version ("+runtimeVersions+") or downgrade your runtime to an older version ("+compilerVersions+").");
    } else {
      // Use the embedded version info since the runtime doesn't know about this revision yet
      throw new Exception("Template was precompiled with a newer version of Handlebars than the current runtime. "+
            "Please update your runtime to a newer version ("+compilerInfo[1]+").");
    }
  }
}

exports.checkRevision = checkRevision;// TODO: Remove this line and break up compilePartial

function template(templateSpec, env) {
  if (!env) {
    throw new Exception("No environment passed to template");
  }

  // Note: Using env.VM references rather than local var references throughout this section to allow
  // for external users to override these as psuedo-supported APIs.
  var invokePartialWrapper = function(partial, name, context, helpers, partials, data) {
    var result = env.VM.invokePartial.apply(this, arguments);
    if (result != null) { return result; }

    if (env.compile) {
      var options = { helpers: helpers, partials: partials, data: data };
      partials[name] = env.compile(partial, { data: data !== undefined }, env);
      return partials[name](context, options);
    } else {
      throw new Exception("The partial " + name + " could not be compiled when running in runtime-only mode");
    }
  };

  // Just add water
  var container = {
    escapeExpression: Utils.escapeExpression,
    invokePartial: invokePartialWrapper,
    programs: [],
    program: function(i, fn, data) {
      var programWrapper = this.programs[i];
      if(data) {
        programWrapper = program(i, fn, data);
      } else if (!programWrapper) {
        programWrapper = this.programs[i] = program(i, fn);
      }
      return programWrapper;
    },
    merge: function(param, common) {
      var ret = param || common;

      if (param && common && (param !== common)) {
        ret = {};
        Utils.extend(ret, common);
        Utils.extend(ret, param);
      }
      return ret;
    },
    programWithDepth: env.VM.programWithDepth,
    noop: env.VM.noop,
    compilerInfo: null
  };

  return function(context, options) {
    options = options || {};
    var namespace = options.partial ? options : env,
        helpers,
        partials;

    if (!options.partial) {
      helpers = options.helpers;
      partials = options.partials;
    }
    var result = templateSpec.call(
          container,
          namespace, context,
          helpers,
          partials,
          options.data);

    if (!options.partial) {
      env.VM.checkRevision(container.compilerInfo);
    }

    return result;
  };
}

exports.template = template;function programWithDepth(i, fn, data /*, $depth */) {
  var args = Array.prototype.slice.call(arguments, 3);

  var prog = function(context, options) {
    options = options || {};

    return fn.apply(this, [context, options.data || data].concat(args));
  };
  prog.program = i;
  prog.depth = args.length;
  return prog;
}

exports.programWithDepth = programWithDepth;function program(i, fn, data) {
  var prog = function(context, options) {
    options = options || {};

    return fn(context, options.data || data);
  };
  prog.program = i;
  prog.depth = 0;
  return prog;
}

exports.program = program;function invokePartial(partial, name, context, helpers, partials, data) {
  var options = { partial: true, helpers: helpers, partials: partials, data: data };

  if(partial === undefined) {
    throw new Exception("The partial " + name + " could not be found");
  } else if(partial instanceof Function) {
    return partial(context, options);
  }
}

exports.invokePartial = invokePartial;function noop() { return ""; }

exports.noop = noop;
},{"./base":17,"./exception":18,"./utils":21}],20:[function(require,module,exports){
"use strict";
// Build out our basic SafeString type
function SafeString(string) {
  this.string = string;
}

SafeString.prototype.toString = function() {
  return "" + this.string;
};

exports["default"] = SafeString;
},{}],21:[function(require,module,exports){
"use strict";
/*jshint -W004 */
var SafeString = require("./safe-string")["default"];

var escape = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#x27;",
  "`": "&#x60;"
};

var badChars = /[&<>"'`]/g;
var possible = /[&<>"'`]/;

function escapeChar(chr) {
  return escape[chr] || "&amp;";
}

function extend(obj, value) {
  for(var key in value) {
    if(Object.prototype.hasOwnProperty.call(value, key)) {
      obj[key] = value[key];
    }
  }
}

exports.extend = extend;var toString = Object.prototype.toString;
exports.toString = toString;
// Sourced from lodash
// https://github.com/bestiejs/lodash/blob/master/LICENSE.txt
var isFunction = function(value) {
  return typeof value === 'function';
};
// fallback for older versions of Chrome and Safari
if (isFunction(/x/)) {
  isFunction = function(value) {
    return typeof value === 'function' && toString.call(value) === '[object Function]';
  };
}
var isFunction;
exports.isFunction = isFunction;
var isArray = Array.isArray || function(value) {
  return (value && typeof value === 'object') ? toString.call(value) === '[object Array]' : false;
};
exports.isArray = isArray;

function escapeExpression(string) {
  // don't escape SafeStrings, since they're already safe
  if (string instanceof SafeString) {
    return string.toString();
  } else if (!string && string !== 0) {
    return "";
  }

  // Force a string conversion as this will be done by the append regardless and
  // the regex test will do this transparently behind the scenes, causing issues if
  // an object's to string has escaped characters in it.
  string = "" + string;

  if(!possible.test(string)) { return string; }
  return string.replace(badChars, escapeChar);
}

exports.escapeExpression = escapeExpression;function isEmpty(value) {
  if (!value && value !== 0) {
    return true;
  } else if (isArray(value) && value.length === 0) {
    return true;
  } else {
    return false;
  }
}

exports.isEmpty = isEmpty;
},{"./safe-string":20}],22:[function(require,module,exports){
// Create a simple path alias to allow browserify to resolve
// the runtime on a supported path.
module.exports = require('./dist/cjs/handlebars.runtime');

},{"./dist/cjs/handlebars.runtime":16}],23:[function(require,module,exports){
module.exports = require("handlebars/runtime")["default"];

},{"handlebars/runtime":22}]},{},[])
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZ2VuZXJhdGVkLmpzIiwic291cmNlcyI6WyIvc3J2L25vZGUvZWNoby9ub2RlX21vZHVsZXMvYnJvd3NlcmlmeS9ub2RlX21vZHVsZXMvYnJvd3Nlci1wYWNrL19wcmVsdWRlLmpzIiwiL3Nydi9ub2RlL2VjaG8vY2xpZW50L3NjcmlwdHMvbGlicy9lY2hvY2xpZW50LmpzIiwiL3Nydi9ub2RlL2VjaG8vY2xpZW50L3NjcmlwdHMvbWFpbi5qcyIsIi9zcnYvbm9kZS9lY2hvL2NsaWVudC9zY3JpcHRzL21vZGVscy9BcHAuanMiLCIvc3J2L25vZGUvZWNoby9jbGllbnQvc2NyaXB0cy9tb2RlbHMvRWNob1Jlc3BvbnNlLmpzIiwiL3Nydi9ub2RlL2VjaG8vY2xpZW50L3NjcmlwdHMvdmlld3MvTWVzc2FnZUhpc3RvcnlWaWV3LmpzIiwiL3Nydi9ub2RlL2VjaG8vY2xpZW50L3NjcmlwdHMvdmlld3MvTWVzc2FnZVBhbmVsVmlldy5qcyIsIi9zcnYvbm9kZS9lY2hvL2NsaWVudC9zY3JpcHRzL3ZpZXdzL01lc3NhZ2VSZWNlaXZlVmlldy5qcyIsIi9zcnYvbm9kZS9lY2hvL2NsaWVudC9zY3JpcHRzL3ZpZXdzL01lc3NhZ2VTZW5kVmlldy5qcyIsIi9zcnYvbm9kZS9lY2hvL2NsaWVudC9zY3JpcHRzL3ZpZXdzL1NlcnZlckNvbnRyb2xWaWV3LmpzIiwiL3Nydi9ub2RlL2VjaG8vY2xpZW50L3NjcmlwdHMvdmlld3MvdGVtcGxhdGVzL21lc3NhZ2UtaGlzdG9yeS5oYnMiLCIvc3J2L25vZGUvZWNoby9jbGllbnQvc2NyaXB0cy92aWV3cy90ZW1wbGF0ZXMvbWVzc2FnZS1wYW5lbC5oYnMiLCIvc3J2L25vZGUvZWNoby9jbGllbnQvc2NyaXB0cy92aWV3cy90ZW1wbGF0ZXMvbWVzc2FnZS1yZWNlaXZlLmhicyIsIi9zcnYvbm9kZS9lY2hvL2NsaWVudC9zY3JpcHRzL3ZpZXdzL3RlbXBsYXRlcy9tZXNzYWdlLXNlbmQuaGJzIiwiL3Nydi9ub2RlL2VjaG8vY2xpZW50L3NjcmlwdHMvdmlld3MvdGVtcGxhdGVzL3NlcnZlci1jb250cm9sLmhicyIsIi9zcnYvbm9kZS9lY2hvL25vZGVfbW9kdWxlcy9oYW5kbGViYXJzL2Rpc3QvY2pzL2hhbmRsZWJhcnMucnVudGltZS5qcyIsIi9zcnYvbm9kZS9lY2hvL25vZGVfbW9kdWxlcy9oYW5kbGViYXJzL2Rpc3QvY2pzL2hhbmRsZWJhcnMvYmFzZS5qcyIsIi9zcnYvbm9kZS9lY2hvL25vZGVfbW9kdWxlcy9oYW5kbGViYXJzL2Rpc3QvY2pzL2hhbmRsZWJhcnMvZXhjZXB0aW9uLmpzIiwiL3Nydi9ub2RlL2VjaG8vbm9kZV9tb2R1bGVzL2hhbmRsZWJhcnMvZGlzdC9janMvaGFuZGxlYmFycy9ydW50aW1lLmpzIiwiL3Nydi9ub2RlL2VjaG8vbm9kZV9tb2R1bGVzL2hhbmRsZWJhcnMvZGlzdC9janMvaGFuZGxlYmFycy9zYWZlLXN0cmluZy5qcyIsIi9zcnYvbm9kZS9lY2hvL25vZGVfbW9kdWxlcy9oYW5kbGViYXJzL2Rpc3QvY2pzL2hhbmRsZWJhcnMvdXRpbHMuanMiLCIvc3J2L25vZGUvZWNoby9ub2RlX21vZHVsZXMvaGFuZGxlYmFycy9ydW50aW1lLmpzIiwiL3Nydi9ub2RlL2VjaG8vbm9kZV9tb2R1bGVzL2hic2Z5L3J1bnRpbWUuanMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7QUNBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM3SUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7Ozs7QUNqQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDL0pBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNqQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzNEQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNoREE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzFCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDL0NBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMxRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN0QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDZkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDZkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNWQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN2Q0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMvQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ25MQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMzQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN4SUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNWQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMzRUE7QUFDQTtBQUNBO0FBQ0E7O0FDSEE7QUFDQSIsInNvdXJjZXNDb250ZW50IjpbIihmdW5jdGlvbiBlKHQsbixyKXtmdW5jdGlvbiBzKG8sdSl7aWYoIW5bb10pe2lmKCF0W29dKXt2YXIgYT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2lmKCF1JiZhKXJldHVybiBhKG8sITApO2lmKGkpcmV0dXJuIGkobywhMCk7dGhyb3cgbmV3IEVycm9yKFwiQ2Fubm90IGZpbmQgbW9kdWxlICdcIitvK1wiJ1wiKX12YXIgZj1uW29dPXtleHBvcnRzOnt9fTt0W29dWzBdLmNhbGwoZi5leHBvcnRzLGZ1bmN0aW9uKGUpe3ZhciBuPXRbb11bMV1bZV07cmV0dXJuIHMobj9uOmUpfSxmLGYuZXhwb3J0cyxlLHQsbixyKX1yZXR1cm4gbltvXS5leHBvcnRzfXZhciBpPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7Zm9yKHZhciBvPTA7bzxyLmxlbmd0aDtvKyspcyhyW29dKTtyZXR1cm4gc30pIiwiLyoqXG4gKiBBIGNsaWVudCBmb3IgdGhlIGVjaG8uaW8gc2VydmVyXG4gKiBAY29uc3RydWN0b3JcbiAqL1xudmFyIEVjaG9DbGllbnQgPSBtb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uICgpIHtcbiAgdGhpcy51cmkgPSBudWxsO1xuICB0aGlzLndzID0gbnVsbDtcbiAgdGhpcy5sYXN0U2VudFRpbWVzdGFtcCA9IG51bGw7XG4gIHRoaXMubGFzdFJlY2VpdmVkVGltZXN0YW1wID0gbnVsbDtcbiAgdGhpcy5jYWNoZSA9IG51bGw7XG5cbiAgLy8gaGFuZGxlcnNcbiAgdGhpcy5vbm9wZW4gPSBudWxsO1xuICB0aGlzLm9uY2xvc2UgPSBudWxsO1xuICB0aGlzLm9uZXJyb3IgPSBudWxsO1xuICB0aGlzLm9ubWVzc2FnZSA9IG51bGw7XG4gIHRoaXMub25oaXN0b3J5ID0gbnVsbDtcbn07XG5cblxuRWNob0NsaWVudC5wcm90b3R5cGUub3BlbiA9IGZ1bmN0aW9uKHVyaSkge1xuICB2YXIgc2VsZiA9IHRoaXM7XG5cbiAgZnVuY3Rpb24gY2FsbEhhbmRsZXIoZXZlbnQpIHtcbiAgICB2YXIgaGFuZGxlciA9IHNlbGZbJ29uJyArIGV2ZW50XTtcbiAgICBpZiAodHlwZW9mIGhhbmRsZXIgPT0gJ2Z1bmN0aW9uJykge1xuICAgICAgaGFuZGxlci5hcHBseShoYW5kbGVyLCBbXS5zbGljZS5jYWxsKGFyZ3VtZW50cywgMSkpO1xuICAgIH1cbiAgfVxuXG4gIGlmICh0aGlzLmlzT3BlbigpKSB7XG4gICAgY29uc29sZS5sb2coJ2Vycm9yOiBhbHJlYWR5IG9wZW4gb24gdXJpICcgKyB0aGlzLnVyaSk7XG4gICAgY2FsbEhhbmRsZXIoJ2Vycm9yJywgJ2FscmVhZHkgb3BlbiBvbiB1cmkgJyArIHRoaXMudXJpKTtcbiAgICByZXR1cm47XG4gIH1cblxuICBpZiAoIXRoaXMudmFsaWRhdGVQb3J0KSB7XG4gICAgY29uc29sZS5sb2coJ2Vycm9yOiBpbnZhbGlkIHBvcnQ6ICcgKyB0aGlzLnBvcnQpO1xuICAgIGNhbGxIYW5kbGVyKCdlcnJvcicsICdpbnZhbGlkIHBvcnQnKTtcbiAgICByZXR1cm47XG4gIH1cblxuICB0aGlzLnVyaSA9IHVyaTtcblxuICB0cnkge1xuICAgIHRoaXMud3MgPSBuZXcgV2ViU29ja2V0KHVyaSk7XG4gIH0gY2F0Y2ggKGVycikge1xuICAgIGNhbGxIYW5kbGVyKCdlcnJvcicsIGVycik7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgdGhpcy53cy5vbm9wZW4gPSBmdW5jdGlvbiAoKSB7XG4gICAgY2FsbEhhbmRsZXIoJ29wZW4nKTtcbiAgfTtcblxuICB0aGlzLndzLm9uY2xvc2UgPSBmdW5jdGlvbigpIHtcbiAgICBjYWxsSGFuZGxlcignY2xvc2UnKTtcbiAgfTtcblxuICB0aGlzLndzLm9ubWVzc2FnZSA9IGZ1bmN0aW9uIChtZXNzYWdlRXZlbnQpIHtcbiAgICBzZWxmLmxhc3RSZWNlaXZlZFRpbWVzdGFtcCA9IG5ldyBEYXRlKCkuZ2V0VGltZSgpO1xuXG4gICAgdmFyIG1lc3NhZ2UgPSBKU09OLnBhcnNlKG1lc3NhZ2VFdmVudC5kYXRhKTtcblxuICAgIG1lc3NhZ2UucmVzcG9uc2VUaW1lID0gc2VsZi5sYXN0UmVjZWl2ZWRUaW1lc3RhbXAgLSBzZWxmLmxhc3RTZW50VGltZXN0YW1wO1xuXG4gICAgLy9pZiAobWVzc2FnZS5tZXNzYWdlcy5sZW5ndGggPiAxKSB7XG4gICAgaWYgKG1lc3NhZ2UudHlwZSA9PSAnaGlzdG9yeScpIHtcbiAgICAgIC8vIHRoaXMgaXMgYSBoaXN0b3J5IG1lc3NhZ2VcbiAgICAgIC8vIGNhY2hlIGl0IGluIGNhc2UgdGhlIHVzZXIgd2FudHMgdG8gZmlsdGVyXG4gICAgICAvLyAobm8gbmVlZCBmb3IgYW5vdGhlciByb3VuZCB0cmlwKVxuICAgICAgc2VsZi5jYWNoZSA9IG1lc3NhZ2U7XG4gICAgICBjYWxsSGFuZGxlcignaGlzdG9yeScsIG1lc3NhZ2UpO1xuICAgIH0gZWxzZSB7XG4gICAgICAvLyBjYWNoZSBpcyBub3cgc3RhbGUsIHNvIGp1c3QgY2xlYXIgaXRcbiAgICAgIHNlbGYuY2FjaGUgPSBudWxsO1xuICAgICAgY2FsbEhhbmRsZXIoJ21lc3NhZ2UnLCBtZXNzYWdlKTtcbiAgICB9XG4gIH07XG5cbiAgdGhpcy53cy5vbmVycm9yID0gZnVuY3Rpb24gKGVycikge1xuICAgIGNhbGxIYW5kbGVyKCdlcnJvcicsIGVycik7XG4gIH07XG59O1xuXG5cbkVjaG9DbGllbnQucHJvdG90eXBlLmNsb3NlID0gZnVuY3Rpb24oKSB7XG4gIGlmICh0aGlzLmlzQ2xvc2VkKCkpIHtcbiAgICBjb25zb2xlLmxvZygnYWxyZWFkeSBjbG9zZWQnKTtcbiAgICByZXR1cm47XG4gIH1cblxuICB0aGlzLndzLmNsb3NlKCk7XG4gIHRoaXMud3MgPSBudWxsO1xuICB0aGlzLnVyaSA9IG51bGw7XG59O1xuXG5cbkVjaG9DbGllbnQucHJvdG90eXBlLmlzT3BlbiA9IGZ1bmN0aW9uKCkge1xuICByZXR1cm4gdGhpcy53cyBpbnN0YW5jZW9mIFdlYlNvY2tldDtcbn07XG5cblxuRWNob0NsaWVudC5wcm90b3R5cGUuaXNDbG9zZWQgPSBmdW5jdGlvbigpIHtcbiAgcmV0dXJuICF0aGlzLmlzT3BlbigpO1xufTtcblxuXG5FY2hvQ2xpZW50LnByb3RvdHlwZS5zZW5kID0gZnVuY3Rpb24gKG1lc3NhZ2UpIHtcbiAgaWYgKCFtZXNzYWdlIHx8ICF0aGlzLmlzT3BlbigpKSByZXR1cm47XG4gIHRoaXMubGFzdFNlbnRUaW1lc3RhbXAgPSBuZXcgRGF0ZSgpLmdldFRpbWUoKTtcbiAgdGhpcy53cy5zZW5kKG1lc3NhZ2UpO1xufTtcblxuXG5FY2hvQ2xpZW50LnByb3RvdHlwZS5zZW5kSGlzdG9yeUNvbW1hbmQgPSBmdW5jdGlvbiAoKSB7XG4gIHRoaXMuc2VuZCgnW0hJU1RPUlldJyk7XG59O1xuXG5cbkVjaG9DbGllbnQucHJvdG90eXBlLmhpc3RvcnlGaWx0ZXIgPSBmdW5jdGlvbihwYXR0ZXJuKSB7XG4gIGlmICghdGhpcy5jYWNoZSB8fCAhdGhpcy5pc09wZW4oKSkgcmV0dXJuIFtdO1xuICBpZiAoIXBhdHRlcm4pIHJldHVybiB0aGlzLmNhY2hlO1xuXG4gIHZhciByZWdleCA9IG5ldyBSZWdFeHAocGF0dGVybiwgXCJpXCIpO1xuICB2YXIgZmlsdGVyZWQgPSBfLmZpbHRlcih0aGlzLmNhY2hlLm1lc3NhZ2VzLCBmdW5jdGlvbihtZXNzYWdlKSB7XG4gICAgcmV0dXJuIHJlZ2V4LnRlc3QobWVzc2FnZSk7XG4gIH0pO1xuXG4gIHJldHVybiB7XG4gICAgc3RhdHVzOiB0aGlzLmNhY2hlLnN0YXR1cyxcbiAgICByZXNwb25zZVRpbWU6IHRoaXMuY2FjaGUucmVzcG9uc2VUaW1lLFxuICAgIG1lc3NhZ2VzOiBmaWx0ZXJlZFxuICB9XG59O1xuXG5cbkVjaG9DbGllbnQucHJvdG90eXBlLnZhbGlkYXRlUG9ydCA9IGZ1bmN0aW9uKHBvcnQpIHtcbiAgcmV0dXJuIHBvcnQgPj0gMTAyNCAmJiBwb3J0IDwgNjU1MzU7XG59O1xuXG4iLCJtb2R1bGUuZXhwb3J0cyA9IHtcbiAgc3RhcnQ6IGZ1bmN0aW9uIChob3N0KSB7XG4gICAgLy8gbW9kZWxzXG4gICAgdmFyIEFwcCA9IHJlcXVpcmUoJy4vbW9kZWxzL0FwcCcpXG4gICAgICA7XG5cbiAgICAvLyB2aWV3c1xuICAgIHZhciBTZXJ2ZXJDb250cm9sVmlldyA9IHJlcXVpcmUoJy4vdmlld3MvU2VydmVyQ29udHJvbFZpZXcnKVxuICAgICAgLCBNZXNzYWdlUGFuZWxWaWV3ID0gcmVxdWlyZSgnLi92aWV3cy9NZXNzYWdlUGFuZWxWaWV3JylcbiAgICAgIDtcblxuXG4gICAgdmFyIGFwcCA9IG5ldyBBcHAoeyBob3N0OiBob3N0IH0pO1xuXG4gICAgLy8gd2lyZSB1cCB2aWV3c1xuICAgIC8vIGp1c3QgY3JlYXRpbmcgdGhlbSB3b3JrcyBzaW5jZSB0aGV5IHdpcmVcbiAgICAvLyB1cCB0aGUgcGFnZSBhbmQgcmVuZGVyIHdoZW4gaW5pdGlhbGl6ZWRcblxuICAgIG5ldyBTZXJ2ZXJDb250cm9sVmlldyh7XG4gICAgICBtb2RlbDogYXBwLFxuICAgICAgZWw6ICcjc2VydmVyLWNvbnRyb2wnXG4gICAgfSk7XG5cbiAgICBuZXcgTWVzc2FnZVBhbmVsVmlldyh7XG4gICAgICBtb2RlbDogYXBwLFxuICAgICAgZWw6ICcjbWVzc2FnZS1wYW5lbCdcbiAgICB9KTtcblxuICAgIC8vIGFsbCB3aXJlZCB1cCB0byB0aGUgcGFnZSBhbmQgcmVhZHkgZm9yIHVzZXIgaW5wdXRcbiAgfVxufTtcblxuXG4iLCJ2YXIgRWNob0NsaWVudCA9IHJlcXVpcmUoJy4vLi4vbGlicy9lY2hvY2xpZW50JylcbiAgLCBFY2hvUmVzcG9uc2UgPSByZXF1aXJlKCcuL0VjaG9SZXNwb25zZScpXG4gIDtcblxuLyoqXG4gKiBUaGUgQXBwIG1vZGVsIHByb3ZpZGVzIGEgYmFja2JvbmUgd3JhcHBlciBvdmVyIEVjaG9DbGllbnQgYW5kIHNlcnZlciBmdW5jdGlvbnNcbiAqL1xudmFyIEFwcCA9IEJhY2tib25lLk1vZGVsLmV4dGVuZCh7XG4gIGRlZmF1bHRzOiB7XG4gICAgaG9zdDogJ2xvY2FsaG9zdCcsXG4gICAgcG9ydDogNTU1NSxcbiAgICBzZXJ2ZXJTdGF0ZTogJ3N0b3BwZWQnXG4gIH0sXG5cbiAgaW5pdGlhbGl6ZTogZnVuY3Rpb24oKSB7XG4gICAgdGhpcy5jbGllbnQgPSBuZXcgRWNob0NsaWVudCgpO1xuICB9LFxuXG4gIHZhbGlkYXRlOiBmdW5jdGlvbihhdHRycykge1xuICAgIGlmICghdGhpcy5jbGllbnQudmFsaWRhdGVQb3J0KGF0dHJzLnBvcnQpKSB7XG4gICAgICByZXR1cm4gJ2ludmFsaWQgcG9ydCc7XG4gICAgfVxuICB9LFxuXG4gIGNoZWNrU2VydmVyU3RhdHVzOiBmdW5jdGlvbigpIHtcbiAgICB2YXIgc2VsZiA9IHRoaXM7XG5cbiAgICAkLmdldEpTT04oJy9hcGkvdjEvZWNob3NlcnZlci8nICsgdGhpcy5nZXQoJ3BvcnQnKSwgZnVuY3Rpb24gKHJlc3VsdCkge1xuICAgICAgaWYgKHJlc3VsdCAmJiByZXN1bHQuc3RhdHVzID09ICdlcnJvcicpIHtcbiAgICAgICAgc2VsZi50cmlnZ2VyKCdzZXJ2ZXJFcnJvcicsIHJlc3VsdC5tZXNzYWdlKTtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuXG4gICAgICBpZiAocmVzdWx0ICYmIHJlc3VsdC5zdGF0dXMgPT0gJ09LJyAmJiAvc3RhcnRlZC8udGVzdChyZXN1bHQubWVzc2FnZSkpIHtcbiAgICAgICAgc2VsZi5zZXQoJ3NlcnZlclN0YXRlJywgJ3N0YXJ0ZWQnKTtcblxuICAgICAgICAvLyBnbyBhaGVhZCBhbmQgb3BlbiBhIGNsaWVudCBpZiB0aGUgc2VydmVyIGlzIGxpc3RlbmluZ1xuICAgICAgICBzZWxmLm9wZW4oKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHNlbGYuc2V0KCdzZXJ2ZXJTdGF0ZScsICdzdG9wcGVkJyk7XG4gICAgICB9XG4gICAgfSk7XG4gIH0sXG5cbiAgc3RhcnRTZXJ2ZXI6IGZ1bmN0aW9uKCkge1xuICAgIGlmICghdGhpcy5pc1ZhbGlkKCkpIHJldHVybjtcbiAgICB0aGlzLnNlbmRTZXJ2ZXJDb21tYW5kKCdzdGFydCcpO1xuICB9LFxuXG4gIHN0b3BTZXJ2ZXI6IGZ1bmN0aW9uKCkge1xuICAgIGlmICghdGhpcy5pc1ZhbGlkKCkpIHJldHVybjtcbiAgICB0aGlzLnNlbmRTZXJ2ZXJDb21tYW5kKCdzdG9wJyk7XG4gIH0sXG5cbiAgc2VuZFNlcnZlckNvbW1hbmQ6IGZ1bmN0aW9uKGNvbW1hbmQpIHtcbiAgICBpZiAoIXRoaXMuaXNWYWxpZCgpKSByZXR1cm47XG5cbiAgICBpZiAoY29tbWFuZCA9PSAnc3RhcnQnICYmIHRoaXMuc2VydmVyU3RhdGUgPT0gJ3N0YXJ0ZWQnKSB7XG4gICAgICBjb25zb2xlLmxvZygnc2VydmVyIGFscmVhZHkgc3RhcnRlZCcpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGlmIChjb21tYW5kID09ICdzdG9wJyAmJiB0aGlzLnNlcnZlclN0YXRlID09ICdzdG9wcGVkJykge1xuICAgICAgY29uc29sZS5sb2coJ3NlcnZlciBhbHJlYWR5IHN0b3BwZWQnKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICB0aGlzLnNldCgnc2VydmVyRXJyb3InLCAnJyk7XG5cbiAgICB2YXIgcG9ydCA9IHRoaXMuZ2V0KCdwb3J0Jyk7XG4gICAgdmFyIHNlbGYgPSB0aGlzO1xuXG4gICAgJC5wb3N0KCcvYXBpL3YxL2VjaG9zZXJ2ZXIvJyArIHBvcnQgKyAnLycgKyBjb21tYW5kLCBmdW5jdGlvbiAocmVzdWx0KSB7XG4gICAgICBpZiAocmVzdWx0ICYmIHJlc3VsdC5zdGF0dXMgPT0gJ2Vycm9yJykge1xuICAgICAgICBzZWxmLnRyaWdnZXIoJ3NlcnZlckVycm9yJywgcmVzdWx0Lm1lc3NhZ2UpO1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG5cbiAgICAgIHZhciBzdGFydGVkID0gL3N0YXJ0ZWQvLnRlc3QocmVzdWx0Lm1lc3NhZ2UsIFwiaVwiKTtcblxuICAgICAgLy8gb25jZSB0aGUgc2VydmVyIGlzIHN0YXJ0ZWQsIG9wZW4gYSBjbGllbnQgY29ubmVjdGlvblxuICAgICAgaWYgKHN0YXJ0ZWQpIHtcbiAgICAgICAgc2VsZi5vcGVuKCk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBzZWxmLnNldCgnc2VydmVyU3RhdGUnLCAnc3RvcHBlZCcpO1xuICAgICAgICBzZWxmLmNsb3NlKCk7XG4gICAgICB9XG4gICAgfSk7XG4gIH0sXG5cbiAgb3BlbjogZnVuY3Rpb24oKSB7XG4gICAgaWYgKHRoaXMuY2xpZW50LmlzT3BlbigpKSByZXR1cm47XG5cbiAgICB2YXIgc2VsZiA9IHRoaXM7XG5cbiAgICBzZWxmLmNsaWVudC5vbm9wZW4gPSBmdW5jdGlvbigpIHtcbiAgICAgIGNvbnNvbGUubG9nKCdjb25uZWN0aW9uIGlzIG9wZW4nKTtcbiAgICAgIHNlbGYuc2V0KCdzZXJ2ZXJTdGF0ZScsICdzdGFydGVkJyk7XG4gICAgICBzZWxmLnRyaWdnZXIoJ29wZW4nKTtcbiAgICB9O1xuXG4gICAgc2VsZi5jbGllbnQub25jbG9zZSA9IGZ1bmN0aW9uKCkge1xuICAgICAgY29uc29sZS5sb2coJ2Nvbm5lY3Rpb24gaXMgY2xvc2VkJyk7XG4gICAgICAvLyByZWxlYXNlIGhhbmRsZXJzXG4gICAgICBzZWxmLmNsaWVudC5vbm9wZW4gPSBudWxsO1xuICAgICAgc2VsZi5jbGllbnQub25jbG9zZSA9IG51bGw7XG4gICAgICBzZWxmLmNsaWVudC5vbmVycm9yID0gbnVsbDtcbiAgICAgIHNlbGYuY2xpZW50Lm9ubWVzc2FnZSA9IG51bGw7XG4gICAgICBzZWxmLmNsaWVudC5vbmhpc3RvcnkgPSBudWxsO1xuXG4gICAgICBzZWxmLnRyaWdnZXIoJ2Nsb3NlJyk7XG4gICAgfTtcblxuICAgIHNlbGYuY2xpZW50Lm9uZXJyb3IgPSBmdW5jdGlvbihlcnIpIHtcbiAgICAgIGNvbnNvbGUubG9nKCctLS0tLScpO1xuICAgICAgY29uc29sZS5sb2coJ2NsaWVudCBlcnJvcjonKTtcbiAgICAgIGNvbnNvbGUubG9nKGVycik7XG4gICAgICBjb25zb2xlLmxvZygnLS0tLS0nKTtcbiAgICAgIHNlbGYudHJpZ2dlcignZXJyb3InLCBlcnIubWVzc2FnZSk7XG4gICAgfTtcblxuICAgIHNlbGYuY2xpZW50Lm9ubWVzc2FnZSA9IGZ1bmN0aW9uKHJlc3BvbnNlKSB7XG4gICAgICB2YXIgZXIgPSBuZXcgRWNob1Jlc3BvbnNlKHJlc3BvbnNlKTtcbiAgICAgIHNlbGYudHJpZ2dlcignbWVzc2FnZScsIGVyKTtcbiAgICB9O1xuXG4gICAgc2VsZi5jbGllbnQub25oaXN0b3J5ID0gZnVuY3Rpb24ocmVzcG9uc2UpIHtcbiAgICAgIHZhciBlciA9IG5ldyBFY2hvUmVzcG9uc2UocmVzcG9uc2UpO1xuICAgICAgc2VsZi50cmlnZ2VyKCdoaXN0b3J5JywgZXIpO1xuICAgIH07XG5cbiAgICB2YXIgdXJpID0gJ3dzOi8vJyArIHRoaXMuZ2V0KCdob3N0JykgKyAnOicgKyB0aGlzLmdldCgncG9ydCcpO1xuICAgIGNvbnNvbGUubG9nKCdvcGVuaW5nIGNvbm5lY3Rpb24gdG8gJyArIHVyaSk7XG4gICAgdGhpcy5jbGllbnQub3Blbih1cmkpO1xuICB9LFxuXG4gIGNsb3NlOiBmdW5jdGlvbigpIHtcbiAgICBpZiAodGhpcy5jbGllbnQuaXNDbG9zZWQoKSkgcmV0dXJuO1xuICAgIHRoaXMuY2xpZW50LmNsb3NlKCk7XG4gIH0sXG5cbiAgc2VuZDogZnVuY3Rpb24obWVzc2FnZSkge1xuICAgIGlmICghdGhpcy5jbGllbnQuaXNPcGVuKCkpIHJldHVybjtcbiAgICB0aGlzLmNsaWVudC5zZW5kKG1lc3NhZ2UpO1xuICB9LFxuXG4gIHNlbmRIaXN0b3J5Q29tbWFuZDogZnVuY3Rpb24oKSB7XG4gICAgLy8ganVzdCBhIHNob3J0Y3V0IGZvciBlbnRlcmluZyAnW0hJU1RPUlldJ1xuICAgIGlmICghdGhpcy5jbGllbnQuaXNPcGVuKCkpIHJldHVybjtcbiAgICB0aGlzLmNsaWVudC5zZW5kSGlzdG9yeUNvbW1hbmQoKTtcbiAgfSxcblxuICBoaXN0b3J5RmlsdGVyOiBmdW5jdGlvbihwYXR0ZXJuKSB7XG4gICAgcmV0dXJuIHRoaXMuY2xpZW50Lmhpc3RvcnlGaWx0ZXIocGF0dGVybik7XG4gIH1cbn0pO1xuXG5tb2R1bGUuZXhwb3J0cyA9IEFwcDtcblxuIiwidmFyIEVjaG9SZXNwb25zZSA9IEJhY2tib25lLk1vZGVsLmV4dGVuZCh7XG4gIGRlZmF1bHRzOiB7XG4gICAgc3RhdHVzOiAnJyxcbiAgICByZXNwb25zZVRpbWU6IG5ldyBEYXRlKCkuZ2V0VGltZSgpLFxuICAgIHR5cGU6ICdtZXNzYWdlJyxcbiAgICBtZXNzYWdlczogWyAnJyBdXG4gIH0sXG5cbiAgdG9EaXNwbGF5U3RyaW5nOiBmdW5jdGlvbigpIHtcbiAgICAvLyBpZiBub3QgYSBtZXNzYWdlIHJlc3BvbnNlIChzdWNoIGFzIGEgaGlzdG9yeSByZXNwb25zZSksXG4gICAgLy8gdGhlbiBvbmx5IGRpc3BsYXkgdGhlIHJlc3BvbnNlIHRpbWVcbiAgICByZXR1cm4gdGhpcy5nZXQoJ3R5cGUnKSAhPSAnbWVzc2FnZSdcbiAgICAgID8gJ1tyZXNwb25zZV0gJyArIHRoaXMuZ2V0KCdyZXNwb25zZVRpbWUnKSArICdtcydcbiAgICAgIDogJ1wiJyArIHRoaXMuZ2V0KCdtZXNzYWdlcycpWzBdICsgJ1wiLCAnICsgdGhpcy5nZXQoJ3Jlc3BvbnNlVGltZScpICsgJ21zJztcbiAgfVxufSk7XG5cbm1vZHVsZS5leHBvcnRzID0gRWNob1Jlc3BvbnNlOyIsInZhciBFY2hvUmVzcG9uc2UgPSByZXF1aXJlKCcuLy4uL21vZGVscy9FY2hvUmVzcG9uc2UnKTtcblxubW9kdWxlLmV4cG9ydHMgPSBCYWNrYm9uZS5WaWV3LmV4dGVuZCh7XG4gIGluaXRpYWxpemU6IGZ1bmN0aW9uKG9wdGlvbnMpIHtcbiAgICB2YXIgc2VsZiA9IHRoaXM7XG5cbiAgICB0aGlzLnJlbmRlcigpO1xuXG4gICAgdGhpcy5tb2RlbC5vbignaGlzdG9yeScsIGZ1bmN0aW9uKHJlc3BvbnNlKSB7XG4gICAgICBzZWxmLnJlbmRlcihyZXNwb25zZSk7XG4gICAgfSk7XG4gIH0sXG5cbiAgZXZlbnRzOiB7XG4gICAgJ2lucHV0ICNzZWFyY2hmaWx0ZXInOiAnZmlsdGVyTWVzc2FnZXMnLFxuICAgICdjbGljayAjYnRuZ2V0aGlzdG9yeSc6ICdnZXRIaXN0b3J5J1xuICB9LFxuXG4gIHRlbXBsYXRlOiByZXF1aXJlKCcuL3RlbXBsYXRlcy9tZXNzYWdlLWhpc3RvcnkuaGJzJyksXG5cbiAgcmVuZGVyOiBmdW5jdGlvbigpIHtcbiAgICB2YXIgcmVzcG9uc2UgPSBhcmd1bWVudHNbMF0gfHwgW107XG5cbiAgICAvLyB0aGUgY2hlY2sgaXMgYmVjYXVzZSBjYWNoZWQgbWVzc2FnZXMgZnJvbSB0aGUgc2VydmVyIGFyZW4ndFxuICAgIC8vIHdyYXBwZWQgaW4gRWNob1Jlc3BvbnNlIGJhY2tib25lIG9iamVjdHMsIGp1c3QgcG9qb3NcbiAgICB2YXIgbWVzc2FnZXMgPSByZXNwb25zZSBpbnN0YW5jZW9mIEVjaG9SZXNwb25zZVxuICAgICAgPyByZXNwb25zZS50b0pTT04oKS5tZXNzYWdlc1xuICAgICAgOiByZXNwb25zZS5tZXNzYWdlcztcblxuICAgIHZhciBhcmdzID0ge1xuICAgICAgbWVzc2FnZXM6IG1lc3NhZ2VzXG4gICAgfTtcblxuICAgIHRoaXMuJGVsLmh0bWwodGhpcy50ZW1wbGF0ZShhcmdzKSk7XG5cbiAgICB0aGlzLmZpbHRlclBhdHRlcm4odGhpcy5wYXR0ZXJuKTtcblxuICAgIHJldHVybiB0aGlzO1xuICB9LFxuXG4gIGdldEhpc3Rvcnk6IGZ1bmN0aW9uKCkge1xuICAgIC8vIGp1c3QgYSBzaG9ydGN1dCBmb3IgZW50ZXJpbmcgJ1tISVNUT1JZXSdcbiAgICB0aGlzLm1vZGVsLnNlbmRIaXN0b3J5Q29tbWFuZCgpO1xuICB9LFxuXG4gIGZpbHRlclBhdHRlcm46IGZ1bmN0aW9uKCkge1xuICAgIGlmIChhcmd1bWVudHMubGVuZ3RoID09IDApIHtcbiAgICAgIHJldHVybiAkKCcjc2VhcmNoZmlsdGVyJykudmFsKCk7XG4gICAgfSBlbHNlIHtcbiAgICAgICQoJyNzZWFyY2hmaWx0ZXInKS52YWwoYXJndW1lbnRzWzBdKTtcbiAgICAgICQoJyNzZWFyY2hmaWx0ZXInKS5mb2N1cygpO1xuICAgIH1cbiAgfSxcblxuICBmaWx0ZXJNZXNzYWdlczogZnVuY3Rpb24oKSB7XG4gICAgdGhpcy5wYXR0ZXJuID0gdGhpcy5maWx0ZXJQYXR0ZXJuKCk7XG4gICAgdmFyIGZpbHRlcmVkID0gdGhpcy5tb2RlbC5oaXN0b3J5RmlsdGVyKHRoaXMucGF0dGVybik7XG4gICAgdGhpcy5yZW5kZXIoZmlsdGVyZWQpO1xuICB9XG59KTsiLCJ2YXIgTWVzc2FnZVNlbmRWaWV3ID0gcmVxdWlyZSgnLi9NZXNzYWdlU2VuZFZpZXcnKVxuICAsIE1lc3NhZ2VSZWNlaXZlVmlldyA9IHJlcXVpcmUoJy4vTWVzc2FnZVJlY2VpdmVWaWV3JylcbiAgLCBNZXNzYWdlSGlzdG9yeVZpZXcgPSByZXF1aXJlKCcuL01lc3NhZ2VIaXN0b3J5VmlldycpXG4gIDtcblxubW9kdWxlLmV4cG9ydHMgPSBCYWNrYm9uZS5WaWV3LmV4dGVuZCh7XG4gIGluaXRpYWxpemU6IGZ1bmN0aW9uICgpIHtcblxuICAgIHRoaXMuc2VuZFZpZXcgPSBuZXcgTWVzc2FnZVNlbmRWaWV3KHtcbiAgICAgIG1vZGVsOiB0aGlzLm1vZGVsXG4gICAgfSk7XG5cbiAgICB0aGlzLnJlY2VpdmVWaWV3ID0gbmV3IE1lc3NhZ2VSZWNlaXZlVmlldyh7XG4gICAgICBtb2RlbDogdGhpcy5tb2RlbFxuICAgIH0pO1xuXG4gICAgdGhpcy5oaXN0b3J5VmlldyA9IG5ldyBNZXNzYWdlSGlzdG9yeVZpZXcoe1xuICAgICAgbW9kZWw6IHRoaXMubW9kZWwsXG4gICAgICBlbDogJyNtZXNzYWdlLWhpc3RvcnknXG4gICAgfSk7XG5cbiAgICB0aGlzLnJlbmRlcigpO1xuXG4gICAgdGhpcy5saXN0ZW5Ubyh0aGlzLm1vZGVsLCAnY2hhbmdlOnNlcnZlclN0YXRlJywgdGhpcy5yZW5kZXIpO1xuICB9LFxuXG4gIHRlbXBsYXRlOiByZXF1aXJlKCcuL3RlbXBsYXRlcy9tZXNzYWdlLXBhbmVsLmhicycpLFxuXG4gIHJlbmRlcjogZnVuY3Rpb24gKCkge1xuXG4gICAgdmFyIHNlcnZlclN0YXRlID0gdGhpcy5tb2RlbC5nZXQoJ3NlcnZlclN0YXRlJyk7XG5cbiAgICB2YXIgYXJncyA9IHtcbiAgICAgIGhpZGRlbjogc2VydmVyU3RhdGUgPT0gJ3N0YXJ0ZWQnID8gJ3Zpc2libGUnIDogJ2NvbGxhcHNlJ1xuICAgIH07XG5cbiAgICB0aGlzLiRlbC5odG1sKHRoaXMudGVtcGxhdGUoYXJncykpO1xuXG4gICAgdGhpcy5zZW5kVmlldy5zZXRFbGVtZW50KHRoaXMuJCgnI21lc3NhZ2Utc2VuZCcpKS5yZW5kZXIoKTtcbiAgICB0aGlzLnJlY2VpdmVWaWV3LnNldEVsZW1lbnQodGhpcy4kKCcjbWVzc2FnZS1yZWNlaXZlJykpLnJlbmRlcigpO1xuICAgIHRoaXMuaGlzdG9yeVZpZXcuc2V0RWxlbWVudCh0aGlzLiQoJyNtZXNzYWdlLWhpc3RvcnknKSkucmVuZGVyKCk7XG5cbiAgICAkKCcjbWVzc2FnZScpLmZvY3VzKCk7XG5cbiAgICByZXR1cm4gdGhpcztcbiAgfVxuXG59KTtcbiIsInZhciBFY2hvUmVzcG9uc2UgPSByZXF1aXJlKCcuLy4uL21vZGVscy9FY2hvUmVzcG9uc2UnKTtcblxubW9kdWxlLmV4cG9ydHMgPSBCYWNrYm9uZS5WaWV3LmV4dGVuZCh7XG4gIGluaXRpYWxpemU6IGZ1bmN0aW9uKCkge1xuICAgIHZhciBzZWxmID0gdGhpcztcblxuICAgIHRoaXMubW9kZWwub24oJ21lc3NhZ2UgaGlzdG9yeScsIGZ1bmN0aW9uKHJlc3BvbnNlKSB7XG4gICAgICBzZWxmLnJlbmRlcihyZXNwb25zZSk7XG4gICAgfSlcbiAgfSxcblxuICB0ZW1wbGF0ZTogcmVxdWlyZSgnLi90ZW1wbGF0ZXMvbWVzc2FnZS1yZWNlaXZlLmhicycpLFxuXG4gIHJlbmRlcjogZnVuY3Rpb24oKSB7XG4gICAgLy8gb25seSByZW5kZXIgd2hlbiBhbiBFY2hvUmVzcG9uc2UgaXMgcHJvdmlkZWRcbiAgICB2YXIgcmVzcG9uc2UgPSBhcmd1bWVudHNbMF07XG4gICAgaWYgKCEocmVzcG9uc2UgaW5zdGFuY2VvZiBFY2hvUmVzcG9uc2UpKSByZXR1cm47XG5cbiAgICB2YXIgYXJncyA9IHtcbiAgICAgIG1lc3NhZ2U6IHJlc3BvbnNlLnRvRGlzcGxheVN0cmluZygpXG4gICAgfTtcblxuICAgIHRoaXMuJGVsLmh0bWwodGhpcy50ZW1wbGF0ZShhcmdzKSk7XG5cbiAgICByZXR1cm4gdGhpcztcbiAgfVxufSk7IiwibW9kdWxlLmV4cG9ydHMgPSBCYWNrYm9uZS5WaWV3LmV4dGVuZCh7XG4gIGluaXRpYWxpemU6IGZ1bmN0aW9uKCkge1xuICAgIHRoaXMucmVuZGVyKCk7XG4gIH0sXG5cbiAgZXZlbnRzOiB7XG4gICAgJ2NsaWNrICNidG5zZW5kbWVzc2FnZSc6ICdzZW5kTWVzc2FnZScsXG4gICAgJ2lucHV0ICNtZXNzYWdlJzogJ3RvZ2dsZUVuYWJsZUJ1dHRvbidcbiAgfSxcblxuICB0ZW1wbGF0ZTogcmVxdWlyZSgnLi90ZW1wbGF0ZXMvbWVzc2FnZS1zZW5kLmhicycpLFxuXG4gIHJlbmRlcjogZnVuY3Rpb24oKSB7XG4gICAgdmFyIGFyZ3MgPSB7XG4gICAgfTtcblxuICAgIHRoaXMuJGVsLmh0bWwodGhpcy50ZW1wbGF0ZShhcmdzKSk7XG5cbiAgICAkKCcjbWVzc2FnZScpLmZvY3VzKCk7XG5cbiAgICByZXR1cm4gdGhpcztcbiAgfSxcblxuICBtZXNzYWdlVGV4dDogZnVuY3Rpb24oKSB7XG4gICAgaWYgKGFyZ3VtZW50cy5sZW5ndGggPT0gMCkge1xuICAgICAgcmV0dXJuICQoJyNtZXNzYWdlJykudmFsKCk7XG4gICAgfSBlbHNlIHtcbiAgICAgICQoJyNtZXNzYWdlJykudmFsKGFyZ3VtZW50c1swXSk7XG4gICAgfVxuICB9LFxuXG4gIHRvZ2dsZUVuYWJsZUJ1dHRvbjogZnVuY3Rpb24oKSB7XG4gICAgaWYgKHRoaXMubWVzc2FnZVRleHQoKSkge1xuICAgICAgY29uc29sZS5sb2coJ3ZhbHVlJyk7XG4gICAgICAkKCcjYnRuc2VuZG1lc3NhZ2UnKS5yZW1vdmVDbGFzcygnZGlzYWJsZWQnKTtcbiAgICB9IGVsc2Uge1xuICAgICAgY29uc29sZS5sb2coJ2VtcHR5Jyk7XG4gICAgICAkKCcjYnRuc2VuZG1lc3NhZ2UnKS5hZGRDbGFzcygnZGlzYWJsZWQnKTtcbiAgICB9XG4gIH0sXG5cbiAgc2VuZE1lc3NhZ2U6IGZ1bmN0aW9uKCkge1xuICAgIHZhciBtZXNzYWdlID0gdGhpcy5tZXNzYWdlVGV4dCgpO1xuICAgIGlmIChtZXNzYWdlKSB0aGlzLm1vZGVsLnNlbmQobWVzc2FnZSk7XG4gICAgdGhpcy5tZXNzYWdlVGV4dCgnJyk7XG4gIH1cbn0pO1xuIiwibW9kdWxlLmV4cG9ydHMgPSBCYWNrYm9uZS5WaWV3LmV4dGVuZCh7XG4gIHNlcnZlckVycm9yTWVzc2FnZTogbnVsbCxcblxuICBpbml0aWFsaXplOiBmdW5jdGlvbigpIHtcbiAgICB2YXIgc2VsZiA9IHRoaXM7XG5cbiAgICB0aGlzLnJlbmRlcigpO1xuXG4gICAgdGhpcy5saXN0ZW5Ubyh0aGlzLm1vZGVsLCAnY2hhbmdlOnNlcnZlclN0YXRlJywgdGhpcy5yZW5kZXIpO1xuXG4gICAgdGhpcy5tb2RlbC5vbignc2VydmVyRXJyb3InLCBmdW5jdGlvbihlcnIpIHtcbiAgICAgIHNlbGYuZXJyb3IgPSBlcnI7XG4gICAgICBzZWxmLnJlbmRlcigpO1xuICAgIH0pO1xuXG4gICAgdGhpcy5tb2RlbC5vbignZXJyb3InLCBmdW5jdGlvbihlcnIpIHtcbiAgICAgIHNlbGYuZXJyb3IgPSBlcnI7XG4gICAgICBzZWxmLnJlbmRlcigpO1xuICAgIH0pXG4gIH0sXG5cbiAgZXZlbnRzOiB7XG4gICAgJ2NsaWNrICNidG5zZXJ2ZXInOiAndG9nZ2xlc3RhcnQnXG4gIH0sXG5cbiAgLy90ZW1wbGF0ZTogSGFuZGxlYmFycy5jb21waWxlKCQoJyNzZXJ2ZXItY29udHJvbC10ZW1wbGF0ZScpLmh0bWwoKSksXG4gIHRlbXBsYXRlOiByZXF1aXJlKCcuL3RlbXBsYXRlcy9zZXJ2ZXItY29udHJvbC5oYnMnKSxcblxuICByZW5kZXI6IGZ1bmN0aW9uKCkge1xuICAgIHZhciBwb3J0ID0gdGhpcy5tb2RlbC5nZXQoJ3BvcnQnKTtcbiAgICB2YXIgc2VydmVyU3RhdGUgPSB0aGlzLm1vZGVsLmdldCgnc2VydmVyU3RhdGUnKTtcbiAgICB2YXIgc2VydmVyU3RhdGVUZXh0ID0gc2VydmVyU3RhdGUgPT0gJ3N0YXJ0ZWQnXG4gICAgICA/ICdzdGFydGVkIChwb3J0ICcgKyBwb3J0ICsgJyknXG4gICAgICA6IHNlcnZlclN0YXRlO1xuICAgIHZhciBlcnJvciA9IHRoaXMuZXJyb3IgPyAnIEVycm9yOiAnICsgdGhpcy5lcnJvciA6IG51bGw7XG4gICAgdmFyIHNlcnZlckVycm9yQ2xhc3MgPSBlcnJvciA/ICd2aXNpYmxlJyA6ICdoaWRkZW4nO1xuXG4gICAgdmFyIGFyZ3MgPSB7XG4gICAgICBzdGF0ZUNsYXNzOiBzZXJ2ZXJTdGF0ZSxcbiAgICAgIHNlcnZlclN0YXRlOiBzZXJ2ZXJTdGF0ZVRleHQsXG4gICAgICBzZXJ2ZXJQb3J0OiBwb3J0LFxuICAgICAgaW5wdXRWaXNpYmlsaXR5OiBzZXJ2ZXJTdGF0ZSA9PSAnc3RhcnRlZCcgPyAnY29sbGFwc2UnIDogJ3Zpc2libGUnLFxuICAgICAgc2VydmVyQ29tbWFuZDogc2VydmVyU3RhdGUgPT0gJ3N0YXJ0ZWQnID8gJ1N0b3AnIDogJ1N0YXJ0JyxcbiAgICAgIHNlcnZlckVycm9yQ2xhc3M6IHNlcnZlckVycm9yQ2xhc3MsXG4gICAgICBzZXJ2ZXJFcnJvcjogZXJyb3JcbiAgICB9O1xuXG4gICAgdGhpcy4kZWwuaHRtbCh0aGlzLnRlbXBsYXRlKGFyZ3MpKTtcblxuICAgICQoJyNwb3J0bnVtYmVyJykuZm9jdXMoKTtcblxuICAgIHJldHVybiB0aGlzO1xuICB9LFxuXG4gIHBvcnQ6IGZ1bmN0aW9uKCkge1xuICAgIHJldHVybiAkKCcjcG9ydG51bWJlcicpLnZhbCgpO1xuICB9LFxuXG4gIHRvZ2dsZXN0YXJ0OiBmdW5jdGlvbigpIHtcbiAgICAvLyBjbGVhciBwcmV2aW91cyBlcnJvciBtZXNzYWdlXG4gICAgdGhpcy5lcnJvciA9IG51bGw7XG4gICAgJCgnI3NlcnZlci1lcnJvcicpLmh0bWwoJycpO1xuXG4gICAgdmFyIHBvcnQgPSB0aGlzLnBvcnQoKTtcbiAgICB0aGlzLm1vZGVsLnNldCgncG9ydCcsIHBvcnQsIHsgdmFsaWRhdGU6IHRydWUgfSk7XG4gICAgaWYgKHRoaXMubW9kZWwudmFsaWRhdGlvbkVycm9yKSB7XG4gICAgICAkKCcjcG9ydG51bWJlcicpLnZhbCgnJyk7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgdmFyIGNvbW1hbmQgPSB0aGlzLm1vZGVsLmdldCgnc2VydmVyU3RhdGUnKSA9PSAnc3RhcnRlZCcgPyAnc3RvcCcgOiAnc3RhcnQnO1xuICAgIHRoaXMubW9kZWwuc2VuZFNlcnZlckNvbW1hbmQoY29tbWFuZCk7XG4gIH1cbn0pO1xuIiwiLy8gaGJzZnkgY29tcGlsZWQgSGFuZGxlYmFycyB0ZW1wbGF0ZVxudmFyIEhhbmRsZWJhcnMgPSByZXF1aXJlKCdoYnNmeS9ydW50aW1lJyk7XG5tb2R1bGUuZXhwb3J0cyA9IEhhbmRsZWJhcnMudGVtcGxhdGUoZnVuY3Rpb24gKEhhbmRsZWJhcnMsZGVwdGgwLGhlbHBlcnMscGFydGlhbHMsZGF0YSkge1xuICB0aGlzLmNvbXBpbGVySW5mbyA9IFs0LCc+PSAxLjAuMCddO1xuaGVscGVycyA9IHRoaXMubWVyZ2UoaGVscGVycywgSGFuZGxlYmFycy5oZWxwZXJzKTsgZGF0YSA9IGRhdGEgfHwge307XG4gIHZhciBidWZmZXIgPSBcIlwiLCBzdGFjazEsIGZ1bmN0aW9uVHlwZT1cImZ1bmN0aW9uXCIsIGVzY2FwZUV4cHJlc3Npb249dGhpcy5lc2NhcGVFeHByZXNzaW9uLCBzZWxmPXRoaXM7XG5cbmZ1bmN0aW9uIHByb2dyYW0xKGRlcHRoMCxkYXRhKSB7XG4gIFxuICB2YXIgYnVmZmVyID0gXCJcIjtcbiAgYnVmZmVyICs9IFwiXFxuICAgICAgICAgIDxsaSBjbGFzcz1cXFwibGlzdC1ncm91cC1pdGVtXFxcIj5cXG4gICAgICAgICAgICBcIlxuICAgICsgZXNjYXBlRXhwcmVzc2lvbigodHlwZW9mIGRlcHRoMCA9PT0gZnVuY3Rpb25UeXBlID8gZGVwdGgwLmFwcGx5KGRlcHRoMCkgOiBkZXB0aDApKVxuICAgICsgXCJcXG4gICAgICAgICAgPC9saT5cXG4gICAgICAgIFwiO1xuICByZXR1cm4gYnVmZmVyO1xuICB9XG5cbiAgYnVmZmVyICs9IFwiPGRpdiBjbGFzcz1cXFwicm93XFxcIj5cXG4gIDxkaXYgY2xhc3M9XFxcImNvbC1tZC00IGNvbC1tZC1vZmZzZXQtNFxcXCI+XFxuICAgIDxidXR0b24gdHlwZT1cXFwiYnV0dG9uXFxcIiBjbGFzcz1cXFwiYnRuIGJ0bi1pbmZvXFxcIiBpZD1cXFwiYnRuZ2V0aGlzdG9yeVxcXCI+U2hvd1xcbiAgICAgIEhpc3RvcnlcXG4gICAgPC9idXR0b24+XFxuICA8L2Rpdj5cXG48L2Rpdj5cXG48ZGl2IGNsYXNzPVxcXCJyb3dcXFwiPlxcbiAgPGRpdiBjbGFzcz1cXFwiY29sLW1kLTQgY29sLW1kLW9mZnNldC00XFxcIj5cXG4gICAgPGgzPk1lc3NhZ2VzPC9oMz5cXG5cXG4gICAgPGRpdiBjbGFzcz1cXFwiaW5wdXQtZ3JvdXBcXFwiPlxcbiAgICAgIDxpbnB1dCB0eXBlPVxcXCJ0ZXh0XFxcIiBjbGFzcz1cXFwiZm9ybS1jb250cm9sIHNlYXJjaFxcXCIgaWQ9XFxcInNlYXJjaGZpbHRlclxcXCJcXG4gICAgICAgICAgICAgcGxhY2Vob2xkZXI9XFxcInR5cGUgaGVyZSB0byBzZWFyY2hcXFwiLz5cXG4gICAgICAgIDxzcGFuIGNsYXNzPVxcXCJpbnB1dC1ncm91cC1hZGRvblxcXCI+PGlcXG4gICAgICAgICAgICBjbGFzcz1cXFwiZ2x5cGhpY29uIGdseXBoaWNvbi1zZWFyY2hcXFwiPjwvaT48L3NwYW4+XFxuICAgIDwvZGl2PlxcblxcbiAgICA8ZGl2IGlkPVxcXCJoaXN0b3J5XFxcIj5cXG4gICAgICA8dWwgY2xhc3M9XFxcImxpc3QgbGlzdC1ncm91cFxcXCI+XFxuICAgICAgICBcIjtcbiAgc3RhY2sxID0gaGVscGVycy5lYWNoLmNhbGwoZGVwdGgwLCAoZGVwdGgwICYmIGRlcHRoMC5tZXNzYWdlcyksIHtoYXNoOnt9LGludmVyc2U6c2VsZi5ub29wLGZuOnNlbGYucHJvZ3JhbSgxLCBwcm9ncmFtMSwgZGF0YSksZGF0YTpkYXRhfSk7XG4gIGlmKHN0YWNrMSB8fCBzdGFjazEgPT09IDApIHsgYnVmZmVyICs9IHN0YWNrMTsgfVxuICBidWZmZXIgKz0gXCJcXG4gICAgICA8L3VsPlxcbiAgICA8L2Rpdj5cXG4gIDwvZGl2PlxcbjwvZGl2PlxcblwiO1xuICByZXR1cm4gYnVmZmVyO1xuICB9KTtcbiIsIi8vIGhic2Z5IGNvbXBpbGVkIEhhbmRsZWJhcnMgdGVtcGxhdGVcbnZhciBIYW5kbGViYXJzID0gcmVxdWlyZSgnaGJzZnkvcnVudGltZScpO1xubW9kdWxlLmV4cG9ydHMgPSBIYW5kbGViYXJzLnRlbXBsYXRlKGZ1bmN0aW9uIChIYW5kbGViYXJzLGRlcHRoMCxoZWxwZXJzLHBhcnRpYWxzLGRhdGEpIHtcbiAgdGhpcy5jb21waWxlckluZm8gPSBbNCwnPj0gMS4wLjAnXTtcbmhlbHBlcnMgPSB0aGlzLm1lcmdlKGhlbHBlcnMsIEhhbmRsZWJhcnMuaGVscGVycyk7IGRhdGEgPSBkYXRhIHx8IHt9O1xuICB2YXIgYnVmZmVyID0gXCJcIiwgc3RhY2sxLCBoZWxwZXIsIGZ1bmN0aW9uVHlwZT1cImZ1bmN0aW9uXCIsIGVzY2FwZUV4cHJlc3Npb249dGhpcy5lc2NhcGVFeHByZXNzaW9uO1xuXG5cbiAgYnVmZmVyICs9IFwiPGRpdiBjbGFzcz1cXFwiXCI7XG4gIGlmIChoZWxwZXIgPSBoZWxwZXJzLmhpZGRlbikgeyBzdGFjazEgPSBoZWxwZXIuY2FsbChkZXB0aDAsIHtoYXNoOnt9LGRhdGE6ZGF0YX0pOyB9XG4gIGVsc2UgeyBoZWxwZXIgPSAoZGVwdGgwICYmIGRlcHRoMC5oaWRkZW4pOyBzdGFjazEgPSB0eXBlb2YgaGVscGVyID09PSBmdW5jdGlvblR5cGUgPyBoZWxwZXIuY2FsbChkZXB0aDAsIHtoYXNoOnt9LGRhdGE6ZGF0YX0pIDogaGVscGVyOyB9XG4gIGJ1ZmZlciArPSBlc2NhcGVFeHByZXNzaW9uKHN0YWNrMSlcbiAgICArIFwiXFxcIj5cXG5cXG4gIDxkaXYgaWQ9XFxcIm1lc3NhZ2Utc2VuZFxcXCI+IDwvZGl2PlxcblxcbiAgPGRpdiBpZD1cXFwibWVzc2FnZS1yZWNlaXZlXFxcIj48L2Rpdj5cXG5cXG4gIDxkaXYgaWQ9XFxcIm1lc3NhZ2UtaGlzdG9yeVxcXCI+PC9kaXY+XFxuXFxuPC9kaXY+XFxuXCI7XG4gIHJldHVybiBidWZmZXI7XG4gIH0pO1xuIiwiLy8gaGJzZnkgY29tcGlsZWQgSGFuZGxlYmFycyB0ZW1wbGF0ZVxudmFyIEhhbmRsZWJhcnMgPSByZXF1aXJlKCdoYnNmeS9ydW50aW1lJyk7XG5tb2R1bGUuZXhwb3J0cyA9IEhhbmRsZWJhcnMudGVtcGxhdGUoZnVuY3Rpb24gKEhhbmRsZWJhcnMsZGVwdGgwLGhlbHBlcnMscGFydGlhbHMsZGF0YSkge1xuICB0aGlzLmNvbXBpbGVySW5mbyA9IFs0LCc+PSAxLjAuMCddO1xuaGVscGVycyA9IHRoaXMubWVyZ2UoaGVscGVycywgSGFuZGxlYmFycy5oZWxwZXJzKTsgZGF0YSA9IGRhdGEgfHwge307XG4gIHZhciBidWZmZXIgPSBcIlwiLCBzdGFjazEsIGhlbHBlciwgZnVuY3Rpb25UeXBlPVwiZnVuY3Rpb25cIiwgZXNjYXBlRXhwcmVzc2lvbj10aGlzLmVzY2FwZUV4cHJlc3Npb247XG5cblxuICBidWZmZXIgKz0gXCI8ZGl2IGNsYXNzPVxcXCJyb3dcXFwiPlxcbiAgPGRpdiBjbGFzcz1cXFwiY29sLW1kLTQgY29sLW1kLW9mZnNldC00XFxcIiBpZD1cXFwiaW5mb1xcXCI+XFxuICAgIDxkaXYgY2xhc3M9XFxcImFsZXJ0IGFsZXJ0LWluZm9cXFwiPlxcbiAgICAgIDxzdHJvbmc+XCI7XG4gIGlmIChoZWxwZXIgPSBoZWxwZXJzLm1lc3NhZ2UpIHsgc3RhY2sxID0gaGVscGVyLmNhbGwoZGVwdGgwLCB7aGFzaDp7fSxkYXRhOmRhdGF9KTsgfVxuICBlbHNlIHsgaGVscGVyID0gKGRlcHRoMCAmJiBkZXB0aDAubWVzc2FnZSk7IHN0YWNrMSA9IHR5cGVvZiBoZWxwZXIgPT09IGZ1bmN0aW9uVHlwZSA/IGhlbHBlci5jYWxsKGRlcHRoMCwge2hhc2g6e30sZGF0YTpkYXRhfSkgOiBoZWxwZXI7IH1cbiAgYnVmZmVyICs9IGVzY2FwZUV4cHJlc3Npb24oc3RhY2sxKVxuICAgICsgXCI8L3N0cm9uZz5cXG4gICAgPC9kaXY+XFxuICA8L2Rpdj5cXG48L2Rpdj5cXG5cIjtcbiAgcmV0dXJuIGJ1ZmZlcjtcbiAgfSk7XG4iLCIvLyBoYnNmeSBjb21waWxlZCBIYW5kbGViYXJzIHRlbXBsYXRlXG52YXIgSGFuZGxlYmFycyA9IHJlcXVpcmUoJ2hic2Z5L3J1bnRpbWUnKTtcbm1vZHVsZS5leHBvcnRzID0gSGFuZGxlYmFycy50ZW1wbGF0ZShmdW5jdGlvbiAoSGFuZGxlYmFycyxkZXB0aDAsaGVscGVycyxwYXJ0aWFscyxkYXRhKSB7XG4gIHRoaXMuY29tcGlsZXJJbmZvID0gWzQsJz49IDEuMC4wJ107XG5oZWxwZXJzID0gdGhpcy5tZXJnZShoZWxwZXJzLCBIYW5kbGViYXJzLmhlbHBlcnMpOyBkYXRhID0gZGF0YSB8fCB7fTtcbiAgXG5cblxuICByZXR1cm4gXCI8ZGl2IGNsYXNzPVxcXCJyb3cgdG9wbWFyZ2luXFxcIj5cXG4gIDxkaXYgY2xhc3M9XFxcImNvbC1tZC00IGNvbC1tZC1vZmZzZXQtNFxcXCI+XFxuICAgIDxkaXYgY2xhc3M9XFxcIndlbGxcXFwiPlxcbiAgICAgIDxmb3JtIHJvbGU9XFxcImZvcm1cXFwiIGlkPVxcXCJmb3JtbWVzc2FnZVxcXCI+XFxuICAgICAgICA8ZGl2IGNsYXNzPVxcXCJmb3JtLWdyb3VwXFxcIj5cXG4gICAgICAgICAgPGxhYmVsIGZvcj1cXFwibWVzc2FnZVxcXCI+TWVzc2FnZTwvbGFiZWw+XFxuXFxuICAgICAgICAgIDxkaXYgY2xhc3M9XFxcImlucHV0LWdyb3VwXFxcIj5cXG4gICAgICAgICAgICA8aW5wdXQgdHlwZT1cXFwidGV4dFxcXCIgY2xhc3M9XFxcImZvcm0tY29udHJvbFxcXCIgaWQ9XFxcIm1lc3NhZ2VcXFwiXFxuICAgICAgICAgICAgICAgICAgIHBsYWNlaG9sZGVyPVxcXCJTZW5kIG1lc3NhZ2UuLi5cXFwiPlxcbiAgICAgICAgICAgICAgPHNwYW4gY2xhc3M9XFxcImlucHV0LWdyb3VwLWJ0blxcXCI+XFxuICAgICAgICAgICAgICAgIDxidXR0b24gdHlwZT1cXFwic3VibWl0XFxcIiBjbGFzcz1cXFwiYnRuIGJ0bi1kZWZhdWx0XFxcIlxcbiAgICAgICAgICAgICAgICAgICAgICAgIGlkPVxcXCJidG5zZW5kbWVzc2FnZVxcXCI+U2VuZFxcbiAgICAgICAgICAgICAgICA8L2J1dHRvbj5cXG4gICAgICAgICAgICAgIDwvc3Bhbj5cXG4gICAgICAgICAgPC9kaXY+XFxuICAgICAgICA8L2Rpdj5cXG4gICAgICA8L2Zvcm0+XFxuICAgIDwvZGl2PlxcbiAgPC9kaXY+XFxuPC9kaXY+XFxuXCI7XG4gIH0pO1xuIiwiLy8gaGJzZnkgY29tcGlsZWQgSGFuZGxlYmFycyB0ZW1wbGF0ZVxudmFyIEhhbmRsZWJhcnMgPSByZXF1aXJlKCdoYnNmeS9ydW50aW1lJyk7XG5tb2R1bGUuZXhwb3J0cyA9IEhhbmRsZWJhcnMudGVtcGxhdGUoZnVuY3Rpb24gKEhhbmRsZWJhcnMsZGVwdGgwLGhlbHBlcnMscGFydGlhbHMsZGF0YSkge1xuICB0aGlzLmNvbXBpbGVySW5mbyA9IFs0LCc+PSAxLjAuMCddO1xuaGVscGVycyA9IHRoaXMubWVyZ2UoaGVscGVycywgSGFuZGxlYmFycy5oZWxwZXJzKTsgZGF0YSA9IGRhdGEgfHwge307XG4gIHZhciBidWZmZXIgPSBcIlwiLCBzdGFjazEsIGhlbHBlciwgZnVuY3Rpb25UeXBlPVwiZnVuY3Rpb25cIiwgZXNjYXBlRXhwcmVzc2lvbj10aGlzLmVzY2FwZUV4cHJlc3Npb247XG5cblxuICBidWZmZXIgKz0gXCI8ZGl2IGNsYXNzPVxcXCJyb3dcXFwiPlxcbiAgPGRpdiBjbGFzcz1cXFwiY29sLW1kLTQgY29sLW1kLW9mZnNldC00XFxcIj5cXG4gICAgPGRpdiBjbGFzcz1cXFwid2VsbFxcXCI+XFxuICAgICAgPGZvcm0gcm9sZT1cXFwiZm9ybVxcXCIgYWN0aW9uPVxcXCIvI1xcXCI+XFxuICAgICAgICA8ZGl2IGNsYXNzPVxcXCJmb3JtLWdyb3VwXFxcIj5cXG5cXG4gICAgICAgICAgPGRpdiBjbGFzcz1cXFwiZm9ybS1pbmxpbmVcXFwiPlxcbiAgICAgICAgICAgIDxsYWJlbCBmb3I9XFxcInBvcnRudW1iZXJcXFwiPkVjaG8gU2VydmVyPC9sYWJlbD5cXG4gICAgICAgICAgICA8c3BhbiBpZD1cXFwic2VydmVyLXN0YXRlXFxcIiBjbGFzcz1cXFwiXCI7XG4gIGlmIChoZWxwZXIgPSBoZWxwZXJzLnN0YXRlQ2xhc3MpIHsgc3RhY2sxID0gaGVscGVyLmNhbGwoZGVwdGgwLCB7aGFzaDp7fSxkYXRhOmRhdGF9KTsgfVxuICBlbHNlIHsgaGVscGVyID0gKGRlcHRoMCAmJiBkZXB0aDAuc3RhdGVDbGFzcyk7IHN0YWNrMSA9IHR5cGVvZiBoZWxwZXIgPT09IGZ1bmN0aW9uVHlwZSA/IGhlbHBlci5jYWxsKGRlcHRoMCwge2hhc2g6e30sZGF0YTpkYXRhfSkgOiBoZWxwZXI7IH1cbiAgYnVmZmVyICs9IGVzY2FwZUV4cHJlc3Npb24oc3RhY2sxKVxuICAgICsgXCJcXFwiPlwiO1xuICBpZiAoaGVscGVyID0gaGVscGVycy5zZXJ2ZXJTdGF0ZSkgeyBzdGFjazEgPSBoZWxwZXIuY2FsbChkZXB0aDAsIHtoYXNoOnt9LGRhdGE6ZGF0YX0pOyB9XG4gIGVsc2UgeyBoZWxwZXIgPSAoZGVwdGgwICYmIGRlcHRoMC5zZXJ2ZXJTdGF0ZSk7IHN0YWNrMSA9IHR5cGVvZiBoZWxwZXIgPT09IGZ1bmN0aW9uVHlwZSA/IGhlbHBlci5jYWxsKGRlcHRoMCwge2hhc2g6e30sZGF0YTpkYXRhfSkgOiBoZWxwZXI7IH1cbiAgYnVmZmVyICs9IGVzY2FwZUV4cHJlc3Npb24oc3RhY2sxKVxuICAgICsgXCI8L3NwYW4+XFxuICAgICAgICAgIDwvZGl2PlxcblxcbiAgICAgICAgICA8aW5wdXQgdHlwZT1cXFwidGV4dFxcXCIgY2xhc3M9XFxcImZvcm0tY29udHJvbCBcIjtcbiAgaWYgKGhlbHBlciA9IGhlbHBlcnMuaW5wdXRWaXNpYmlsaXR5KSB7IHN0YWNrMSA9IGhlbHBlci5jYWxsKGRlcHRoMCwge2hhc2g6e30sZGF0YTpkYXRhfSk7IH1cbiAgZWxzZSB7IGhlbHBlciA9IChkZXB0aDAgJiYgZGVwdGgwLmlucHV0VmlzaWJpbGl0eSk7IHN0YWNrMSA9IHR5cGVvZiBoZWxwZXIgPT09IGZ1bmN0aW9uVHlwZSA/IGhlbHBlci5jYWxsKGRlcHRoMCwge2hhc2g6e30sZGF0YTpkYXRhfSkgOiBoZWxwZXI7IH1cbiAgYnVmZmVyICs9IGVzY2FwZUV4cHJlc3Npb24oc3RhY2sxKVxuICAgICsgXCJcXFwiIGlkPVxcXCJwb3J0bnVtYmVyXFxcIlxcbiAgICAgICAgICAgICAgICAgcGxhY2Vob2xkZXI9XFxcIkVudGVyIHBvcnQgYmV0d2VlbiAxMDI0LTY1NTM1XFxcIlxcbiAgICAgICAgICAgICAgICAgdmFsdWU9XFxcIlwiO1xuICBpZiAoaGVscGVyID0gaGVscGVycy5zZXJ2ZXJQb3J0KSB7IHN0YWNrMSA9IGhlbHBlci5jYWxsKGRlcHRoMCwge2hhc2g6e30sZGF0YTpkYXRhfSk7IH1cbiAgZWxzZSB7IGhlbHBlciA9IChkZXB0aDAgJiYgZGVwdGgwLnNlcnZlclBvcnQpOyBzdGFjazEgPSB0eXBlb2YgaGVscGVyID09PSBmdW5jdGlvblR5cGUgPyBoZWxwZXIuY2FsbChkZXB0aDAsIHtoYXNoOnt9LGRhdGE6ZGF0YX0pIDogaGVscGVyOyB9XG4gIGJ1ZmZlciArPSBlc2NhcGVFeHByZXNzaW9uKHN0YWNrMSlcbiAgICArIFwiXFxcIj5cXG4gICAgICAgIDwvZGl2PlxcbiAgICAgICAgPGRpdiBjbGFzcz1cXFwiZm9ybS1pbmxpbmVcXFwiPlxcbiAgICAgICAgICA8YnV0dG9uIHR5cGU9XFxcInN1Ym1pdFxcXCIgY2xhc3M9XFxcImJ0biBidG4tZGVmYXVsdFxcXCJcXG4gICAgICAgICAgICAgICAgICBpZD1cXFwiYnRuc2VydmVyXFxcIj5cIjtcbiAgaWYgKGhlbHBlciA9IGhlbHBlcnMuc2VydmVyQ29tbWFuZCkgeyBzdGFjazEgPSBoZWxwZXIuY2FsbChkZXB0aDAsIHtoYXNoOnt9LGRhdGE6ZGF0YX0pOyB9XG4gIGVsc2UgeyBoZWxwZXIgPSAoZGVwdGgwICYmIGRlcHRoMC5zZXJ2ZXJDb21tYW5kKTsgc3RhY2sxID0gdHlwZW9mIGhlbHBlciA9PT0gZnVuY3Rpb25UeXBlID8gaGVscGVyLmNhbGwoZGVwdGgwLCB7aGFzaDp7fSxkYXRhOmRhdGF9KSA6IGhlbHBlcjsgfVxuICBidWZmZXIgKz0gZXNjYXBlRXhwcmVzc2lvbihzdGFjazEpXG4gICAgKyBcIlxcbiAgICAgICAgICA8L2J1dHRvbj5cXG4gICAgICAgIDwvZGl2PlxcbiAgICAgICAgPGRpdiBjbGFzcz1cXFwiZm9ybS1pbmxpbmVcXFwiPlxcbiAgICAgICAgICA8c3BhbiBpZD1cXFwic2VydmVyLWVycm9yXFxcIiBjbGFzcz1cXFwiXCI7XG4gIGlmIChoZWxwZXIgPSBoZWxwZXJzLnNlcnZlckVycm9yQ2xhc3MpIHsgc3RhY2sxID0gaGVscGVyLmNhbGwoZGVwdGgwLCB7aGFzaDp7fSxkYXRhOmRhdGF9KTsgfVxuICBlbHNlIHsgaGVscGVyID0gKGRlcHRoMCAmJiBkZXB0aDAuc2VydmVyRXJyb3JDbGFzcyk7IHN0YWNrMSA9IHR5cGVvZiBoZWxwZXIgPT09IGZ1bmN0aW9uVHlwZSA/IGhlbHBlci5jYWxsKGRlcHRoMCwge2hhc2g6e30sZGF0YTpkYXRhfSkgOiBoZWxwZXI7IH1cbiAgYnVmZmVyICs9IGVzY2FwZUV4cHJlc3Npb24oc3RhY2sxKVxuICAgICsgXCJcXFwiPlwiO1xuICBpZiAoaGVscGVyID0gaGVscGVycy5zZXJ2ZXJFcnJvcikgeyBzdGFjazEgPSBoZWxwZXIuY2FsbChkZXB0aDAsIHtoYXNoOnt9LGRhdGE6ZGF0YX0pOyB9XG4gIGVsc2UgeyBoZWxwZXIgPSAoZGVwdGgwICYmIGRlcHRoMC5zZXJ2ZXJFcnJvcik7IHN0YWNrMSA9IHR5cGVvZiBoZWxwZXIgPT09IGZ1bmN0aW9uVHlwZSA/IGhlbHBlci5jYWxsKGRlcHRoMCwge2hhc2g6e30sZGF0YTpkYXRhfSkgOiBoZWxwZXI7IH1cbiAgYnVmZmVyICs9IGVzY2FwZUV4cHJlc3Npb24oc3RhY2sxKVxuICAgICsgXCI8L3NwYW4+XFxuICAgICAgICA8L2Rpdj5cXG4gICAgICA8L2Zvcm0+XFxuICAgIDwvZGl2PlxcbiAgPC9kaXY+XFxuPC9kaXY+XFxuXCI7XG4gIHJldHVybiBidWZmZXI7XG4gIH0pO1xuIiwiXCJ1c2Ugc3RyaWN0XCI7XG4vKmdsb2JhbHMgSGFuZGxlYmFyczogdHJ1ZSAqL1xudmFyIGJhc2UgPSByZXF1aXJlKFwiLi9oYW5kbGViYXJzL2Jhc2VcIik7XG5cbi8vIEVhY2ggb2YgdGhlc2UgYXVnbWVudCB0aGUgSGFuZGxlYmFycyBvYmplY3QuIE5vIG5lZWQgdG8gc2V0dXAgaGVyZS5cbi8vIChUaGlzIGlzIGRvbmUgdG8gZWFzaWx5IHNoYXJlIGNvZGUgYmV0d2VlbiBjb21tb25qcyBhbmQgYnJvd3NlIGVudnMpXG52YXIgU2FmZVN0cmluZyA9IHJlcXVpcmUoXCIuL2hhbmRsZWJhcnMvc2FmZS1zdHJpbmdcIilbXCJkZWZhdWx0XCJdO1xudmFyIEV4Y2VwdGlvbiA9IHJlcXVpcmUoXCIuL2hhbmRsZWJhcnMvZXhjZXB0aW9uXCIpW1wiZGVmYXVsdFwiXTtcbnZhciBVdGlscyA9IHJlcXVpcmUoXCIuL2hhbmRsZWJhcnMvdXRpbHNcIik7XG52YXIgcnVudGltZSA9IHJlcXVpcmUoXCIuL2hhbmRsZWJhcnMvcnVudGltZVwiKTtcblxuLy8gRm9yIGNvbXBhdGliaWxpdHkgYW5kIHVzYWdlIG91dHNpZGUgb2YgbW9kdWxlIHN5c3RlbXMsIG1ha2UgdGhlIEhhbmRsZWJhcnMgb2JqZWN0IGEgbmFtZXNwYWNlXG52YXIgY3JlYXRlID0gZnVuY3Rpb24oKSB7XG4gIHZhciBoYiA9IG5ldyBiYXNlLkhhbmRsZWJhcnNFbnZpcm9ubWVudCgpO1xuXG4gIFV0aWxzLmV4dGVuZChoYiwgYmFzZSk7XG4gIGhiLlNhZmVTdHJpbmcgPSBTYWZlU3RyaW5nO1xuICBoYi5FeGNlcHRpb24gPSBFeGNlcHRpb247XG4gIGhiLlV0aWxzID0gVXRpbHM7XG5cbiAgaGIuVk0gPSBydW50aW1lO1xuICBoYi50ZW1wbGF0ZSA9IGZ1bmN0aW9uKHNwZWMpIHtcbiAgICByZXR1cm4gcnVudGltZS50ZW1wbGF0ZShzcGVjLCBoYik7XG4gIH07XG5cbiAgcmV0dXJuIGhiO1xufTtcblxudmFyIEhhbmRsZWJhcnMgPSBjcmVhdGUoKTtcbkhhbmRsZWJhcnMuY3JlYXRlID0gY3JlYXRlO1xuXG5leHBvcnRzW1wiZGVmYXVsdFwiXSA9IEhhbmRsZWJhcnM7IiwiXCJ1c2Ugc3RyaWN0XCI7XG52YXIgVXRpbHMgPSByZXF1aXJlKFwiLi91dGlsc1wiKTtcbnZhciBFeGNlcHRpb24gPSByZXF1aXJlKFwiLi9leGNlcHRpb25cIilbXCJkZWZhdWx0XCJdO1xuXG52YXIgVkVSU0lPTiA9IFwiMS4zLjBcIjtcbmV4cG9ydHMuVkVSU0lPTiA9IFZFUlNJT047dmFyIENPTVBJTEVSX1JFVklTSU9OID0gNDtcbmV4cG9ydHMuQ09NUElMRVJfUkVWSVNJT04gPSBDT01QSUxFUl9SRVZJU0lPTjtcbnZhciBSRVZJU0lPTl9DSEFOR0VTID0ge1xuICAxOiAnPD0gMS4wLnJjLjInLCAvLyAxLjAucmMuMiBpcyBhY3R1YWxseSByZXYyIGJ1dCBkb2Vzbid0IHJlcG9ydCBpdFxuICAyOiAnPT0gMS4wLjAtcmMuMycsXG4gIDM6ICc9PSAxLjAuMC1yYy40JyxcbiAgNDogJz49IDEuMC4wJ1xufTtcbmV4cG9ydHMuUkVWSVNJT05fQ0hBTkdFUyA9IFJFVklTSU9OX0NIQU5HRVM7XG52YXIgaXNBcnJheSA9IFV0aWxzLmlzQXJyYXksXG4gICAgaXNGdW5jdGlvbiA9IFV0aWxzLmlzRnVuY3Rpb24sXG4gICAgdG9TdHJpbmcgPSBVdGlscy50b1N0cmluZyxcbiAgICBvYmplY3RUeXBlID0gJ1tvYmplY3QgT2JqZWN0XSc7XG5cbmZ1bmN0aW9uIEhhbmRsZWJhcnNFbnZpcm9ubWVudChoZWxwZXJzLCBwYXJ0aWFscykge1xuICB0aGlzLmhlbHBlcnMgPSBoZWxwZXJzIHx8IHt9O1xuICB0aGlzLnBhcnRpYWxzID0gcGFydGlhbHMgfHwge307XG5cbiAgcmVnaXN0ZXJEZWZhdWx0SGVscGVycyh0aGlzKTtcbn1cblxuZXhwb3J0cy5IYW5kbGViYXJzRW52aXJvbm1lbnQgPSBIYW5kbGViYXJzRW52aXJvbm1lbnQ7SGFuZGxlYmFyc0Vudmlyb25tZW50LnByb3RvdHlwZSA9IHtcbiAgY29uc3RydWN0b3I6IEhhbmRsZWJhcnNFbnZpcm9ubWVudCxcblxuICBsb2dnZXI6IGxvZ2dlcixcbiAgbG9nOiBsb2csXG5cbiAgcmVnaXN0ZXJIZWxwZXI6IGZ1bmN0aW9uKG5hbWUsIGZuLCBpbnZlcnNlKSB7XG4gICAgaWYgKHRvU3RyaW5nLmNhbGwobmFtZSkgPT09IG9iamVjdFR5cGUpIHtcbiAgICAgIGlmIChpbnZlcnNlIHx8IGZuKSB7IHRocm93IG5ldyBFeGNlcHRpb24oJ0FyZyBub3Qgc3VwcG9ydGVkIHdpdGggbXVsdGlwbGUgaGVscGVycycpOyB9XG4gICAgICBVdGlscy5leHRlbmQodGhpcy5oZWxwZXJzLCBuYW1lKTtcbiAgICB9IGVsc2Uge1xuICAgICAgaWYgKGludmVyc2UpIHsgZm4ubm90ID0gaW52ZXJzZTsgfVxuICAgICAgdGhpcy5oZWxwZXJzW25hbWVdID0gZm47XG4gICAgfVxuICB9LFxuXG4gIHJlZ2lzdGVyUGFydGlhbDogZnVuY3Rpb24obmFtZSwgc3RyKSB7XG4gICAgaWYgKHRvU3RyaW5nLmNhbGwobmFtZSkgPT09IG9iamVjdFR5cGUpIHtcbiAgICAgIFV0aWxzLmV4dGVuZCh0aGlzLnBhcnRpYWxzLCAgbmFtZSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHRoaXMucGFydGlhbHNbbmFtZV0gPSBzdHI7XG4gICAgfVxuICB9XG59O1xuXG5mdW5jdGlvbiByZWdpc3RlckRlZmF1bHRIZWxwZXJzKGluc3RhbmNlKSB7XG4gIGluc3RhbmNlLnJlZ2lzdGVySGVscGVyKCdoZWxwZXJNaXNzaW5nJywgZnVuY3Rpb24oYXJnKSB7XG4gICAgaWYoYXJndW1lbnRzLmxlbmd0aCA9PT0gMikge1xuICAgICAgcmV0dXJuIHVuZGVmaW5lZDtcbiAgICB9IGVsc2Uge1xuICAgICAgdGhyb3cgbmV3IEV4Y2VwdGlvbihcIk1pc3NpbmcgaGVscGVyOiAnXCIgKyBhcmcgKyBcIidcIik7XG4gICAgfVxuICB9KTtcblxuICBpbnN0YW5jZS5yZWdpc3RlckhlbHBlcignYmxvY2tIZWxwZXJNaXNzaW5nJywgZnVuY3Rpb24oY29udGV4dCwgb3B0aW9ucykge1xuICAgIHZhciBpbnZlcnNlID0gb3B0aW9ucy5pbnZlcnNlIHx8IGZ1bmN0aW9uKCkge30sIGZuID0gb3B0aW9ucy5mbjtcblxuICAgIGlmIChpc0Z1bmN0aW9uKGNvbnRleHQpKSB7IGNvbnRleHQgPSBjb250ZXh0LmNhbGwodGhpcyk7IH1cblxuICAgIGlmKGNvbnRleHQgPT09IHRydWUpIHtcbiAgICAgIHJldHVybiBmbih0aGlzKTtcbiAgICB9IGVsc2UgaWYoY29udGV4dCA9PT0gZmFsc2UgfHwgY29udGV4dCA9PSBudWxsKSB7XG4gICAgICByZXR1cm4gaW52ZXJzZSh0aGlzKTtcbiAgICB9IGVsc2UgaWYgKGlzQXJyYXkoY29udGV4dCkpIHtcbiAgICAgIGlmKGNvbnRleHQubGVuZ3RoID4gMCkge1xuICAgICAgICByZXR1cm4gaW5zdGFuY2UuaGVscGVycy5lYWNoKGNvbnRleHQsIG9wdGlvbnMpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcmV0dXJuIGludmVyc2UodGhpcyk7XG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIHJldHVybiBmbihjb250ZXh0KTtcbiAgICB9XG4gIH0pO1xuXG4gIGluc3RhbmNlLnJlZ2lzdGVySGVscGVyKCdlYWNoJywgZnVuY3Rpb24oY29udGV4dCwgb3B0aW9ucykge1xuICAgIHZhciBmbiA9IG9wdGlvbnMuZm4sIGludmVyc2UgPSBvcHRpb25zLmludmVyc2U7XG4gICAgdmFyIGkgPSAwLCByZXQgPSBcIlwiLCBkYXRhO1xuXG4gICAgaWYgKGlzRnVuY3Rpb24oY29udGV4dCkpIHsgY29udGV4dCA9IGNvbnRleHQuY2FsbCh0aGlzKTsgfVxuXG4gICAgaWYgKG9wdGlvbnMuZGF0YSkge1xuICAgICAgZGF0YSA9IGNyZWF0ZUZyYW1lKG9wdGlvbnMuZGF0YSk7XG4gICAgfVxuXG4gICAgaWYoY29udGV4dCAmJiB0eXBlb2YgY29udGV4dCA9PT0gJ29iamVjdCcpIHtcbiAgICAgIGlmIChpc0FycmF5KGNvbnRleHQpKSB7XG4gICAgICAgIGZvcih2YXIgaiA9IGNvbnRleHQubGVuZ3RoOyBpPGo7IGkrKykge1xuICAgICAgICAgIGlmIChkYXRhKSB7XG4gICAgICAgICAgICBkYXRhLmluZGV4ID0gaTtcbiAgICAgICAgICAgIGRhdGEuZmlyc3QgPSAoaSA9PT0gMCk7XG4gICAgICAgICAgICBkYXRhLmxhc3QgID0gKGkgPT09IChjb250ZXh0Lmxlbmd0aC0xKSk7XG4gICAgICAgICAgfVxuICAgICAgICAgIHJldCA9IHJldCArIGZuKGNvbnRleHRbaV0sIHsgZGF0YTogZGF0YSB9KTtcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgZm9yKHZhciBrZXkgaW4gY29udGV4dCkge1xuICAgICAgICAgIGlmKGNvbnRleHQuaGFzT3duUHJvcGVydHkoa2V5KSkge1xuICAgICAgICAgICAgaWYoZGF0YSkgeyBcbiAgICAgICAgICAgICAgZGF0YS5rZXkgPSBrZXk7IFxuICAgICAgICAgICAgICBkYXRhLmluZGV4ID0gaTtcbiAgICAgICAgICAgICAgZGF0YS5maXJzdCA9IChpID09PSAwKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldCA9IHJldCArIGZuKGNvbnRleHRba2V5XSwge2RhdGE6IGRhdGF9KTtcbiAgICAgICAgICAgIGkrKztcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG5cbiAgICBpZihpID09PSAwKXtcbiAgICAgIHJldCA9IGludmVyc2UodGhpcyk7XG4gICAgfVxuXG4gICAgcmV0dXJuIHJldDtcbiAgfSk7XG5cbiAgaW5zdGFuY2UucmVnaXN0ZXJIZWxwZXIoJ2lmJywgZnVuY3Rpb24oY29uZGl0aW9uYWwsIG9wdGlvbnMpIHtcbiAgICBpZiAoaXNGdW5jdGlvbihjb25kaXRpb25hbCkpIHsgY29uZGl0aW9uYWwgPSBjb25kaXRpb25hbC5jYWxsKHRoaXMpOyB9XG5cbiAgICAvLyBEZWZhdWx0IGJlaGF2aW9yIGlzIHRvIHJlbmRlciB0aGUgcG9zaXRpdmUgcGF0aCBpZiB0aGUgdmFsdWUgaXMgdHJ1dGh5IGFuZCBub3QgZW1wdHkuXG4gICAgLy8gVGhlIGBpbmNsdWRlWmVyb2Agb3B0aW9uIG1heSBiZSBzZXQgdG8gdHJlYXQgdGhlIGNvbmR0aW9uYWwgYXMgcHVyZWx5IG5vdCBlbXB0eSBiYXNlZCBvbiB0aGVcbiAgICAvLyBiZWhhdmlvciBvZiBpc0VtcHR5LiBFZmZlY3RpdmVseSB0aGlzIGRldGVybWluZXMgaWYgMCBpcyBoYW5kbGVkIGJ5IHRoZSBwb3NpdGl2ZSBwYXRoIG9yIG5lZ2F0aXZlLlxuICAgIGlmICgoIW9wdGlvbnMuaGFzaC5pbmNsdWRlWmVybyAmJiAhY29uZGl0aW9uYWwpIHx8IFV0aWxzLmlzRW1wdHkoY29uZGl0aW9uYWwpKSB7XG4gICAgICByZXR1cm4gb3B0aW9ucy5pbnZlcnNlKHRoaXMpO1xuICAgIH0gZWxzZSB7XG4gICAgICByZXR1cm4gb3B0aW9ucy5mbih0aGlzKTtcbiAgICB9XG4gIH0pO1xuXG4gIGluc3RhbmNlLnJlZ2lzdGVySGVscGVyKCd1bmxlc3MnLCBmdW5jdGlvbihjb25kaXRpb25hbCwgb3B0aW9ucykge1xuICAgIHJldHVybiBpbnN0YW5jZS5oZWxwZXJzWydpZiddLmNhbGwodGhpcywgY29uZGl0aW9uYWwsIHtmbjogb3B0aW9ucy5pbnZlcnNlLCBpbnZlcnNlOiBvcHRpb25zLmZuLCBoYXNoOiBvcHRpb25zLmhhc2h9KTtcbiAgfSk7XG5cbiAgaW5zdGFuY2UucmVnaXN0ZXJIZWxwZXIoJ3dpdGgnLCBmdW5jdGlvbihjb250ZXh0LCBvcHRpb25zKSB7XG4gICAgaWYgKGlzRnVuY3Rpb24oY29udGV4dCkpIHsgY29udGV4dCA9IGNvbnRleHQuY2FsbCh0aGlzKTsgfVxuXG4gICAgaWYgKCFVdGlscy5pc0VtcHR5KGNvbnRleHQpKSByZXR1cm4gb3B0aW9ucy5mbihjb250ZXh0KTtcbiAgfSk7XG5cbiAgaW5zdGFuY2UucmVnaXN0ZXJIZWxwZXIoJ2xvZycsIGZ1bmN0aW9uKGNvbnRleHQsIG9wdGlvbnMpIHtcbiAgICB2YXIgbGV2ZWwgPSBvcHRpb25zLmRhdGEgJiYgb3B0aW9ucy5kYXRhLmxldmVsICE9IG51bGwgPyBwYXJzZUludChvcHRpb25zLmRhdGEubGV2ZWwsIDEwKSA6IDE7XG4gICAgaW5zdGFuY2UubG9nKGxldmVsLCBjb250ZXh0KTtcbiAgfSk7XG59XG5cbnZhciBsb2dnZXIgPSB7XG4gIG1ldGhvZE1hcDogeyAwOiAnZGVidWcnLCAxOiAnaW5mbycsIDI6ICd3YXJuJywgMzogJ2Vycm9yJyB9LFxuXG4gIC8vIFN0YXRlIGVudW1cbiAgREVCVUc6IDAsXG4gIElORk86IDEsXG4gIFdBUk46IDIsXG4gIEVSUk9SOiAzLFxuICBsZXZlbDogMyxcblxuICAvLyBjYW4gYmUgb3ZlcnJpZGRlbiBpbiB0aGUgaG9zdCBlbnZpcm9ubWVudFxuICBsb2c6IGZ1bmN0aW9uKGxldmVsLCBvYmopIHtcbiAgICBpZiAobG9nZ2VyLmxldmVsIDw9IGxldmVsKSB7XG4gICAgICB2YXIgbWV0aG9kID0gbG9nZ2VyLm1ldGhvZE1hcFtsZXZlbF07XG4gICAgICBpZiAodHlwZW9mIGNvbnNvbGUgIT09ICd1bmRlZmluZWQnICYmIGNvbnNvbGVbbWV0aG9kXSkge1xuICAgICAgICBjb25zb2xlW21ldGhvZF0uY2FsbChjb25zb2xlLCBvYmopO1xuICAgICAgfVxuICAgIH1cbiAgfVxufTtcbmV4cG9ydHMubG9nZ2VyID0gbG9nZ2VyO1xuZnVuY3Rpb24gbG9nKGxldmVsLCBvYmopIHsgbG9nZ2VyLmxvZyhsZXZlbCwgb2JqKTsgfVxuXG5leHBvcnRzLmxvZyA9IGxvZzt2YXIgY3JlYXRlRnJhbWUgPSBmdW5jdGlvbihvYmplY3QpIHtcbiAgdmFyIG9iaiA9IHt9O1xuICBVdGlscy5leHRlbmQob2JqLCBvYmplY3QpO1xuICByZXR1cm4gb2JqO1xufTtcbmV4cG9ydHMuY3JlYXRlRnJhbWUgPSBjcmVhdGVGcmFtZTsiLCJcInVzZSBzdHJpY3RcIjtcblxudmFyIGVycm9yUHJvcHMgPSBbJ2Rlc2NyaXB0aW9uJywgJ2ZpbGVOYW1lJywgJ2xpbmVOdW1iZXInLCAnbWVzc2FnZScsICduYW1lJywgJ251bWJlcicsICdzdGFjayddO1xuXG5mdW5jdGlvbiBFeGNlcHRpb24obWVzc2FnZSwgbm9kZSkge1xuICB2YXIgbGluZTtcbiAgaWYgKG5vZGUgJiYgbm9kZS5maXJzdExpbmUpIHtcbiAgICBsaW5lID0gbm9kZS5maXJzdExpbmU7XG5cbiAgICBtZXNzYWdlICs9ICcgLSAnICsgbGluZSArICc6JyArIG5vZGUuZmlyc3RDb2x1bW47XG4gIH1cblxuICB2YXIgdG1wID0gRXJyb3IucHJvdG90eXBlLmNvbnN0cnVjdG9yLmNhbGwodGhpcywgbWVzc2FnZSk7XG5cbiAgLy8gVW5mb3J0dW5hdGVseSBlcnJvcnMgYXJlIG5vdCBlbnVtZXJhYmxlIGluIENocm9tZSAoYXQgbGVhc3QpLCBzbyBgZm9yIHByb3AgaW4gdG1wYCBkb2Vzbid0IHdvcmsuXG4gIGZvciAodmFyIGlkeCA9IDA7IGlkeCA8IGVycm9yUHJvcHMubGVuZ3RoOyBpZHgrKykge1xuICAgIHRoaXNbZXJyb3JQcm9wc1tpZHhdXSA9IHRtcFtlcnJvclByb3BzW2lkeF1dO1xuICB9XG5cbiAgaWYgKGxpbmUpIHtcbiAgICB0aGlzLmxpbmVOdW1iZXIgPSBsaW5lO1xuICAgIHRoaXMuY29sdW1uID0gbm9kZS5maXJzdENvbHVtbjtcbiAgfVxufVxuXG5FeGNlcHRpb24ucHJvdG90eXBlID0gbmV3IEVycm9yKCk7XG5cbmV4cG9ydHNbXCJkZWZhdWx0XCJdID0gRXhjZXB0aW9uOyIsIlwidXNlIHN0cmljdFwiO1xudmFyIFV0aWxzID0gcmVxdWlyZShcIi4vdXRpbHNcIik7XG52YXIgRXhjZXB0aW9uID0gcmVxdWlyZShcIi4vZXhjZXB0aW9uXCIpW1wiZGVmYXVsdFwiXTtcbnZhciBDT01QSUxFUl9SRVZJU0lPTiA9IHJlcXVpcmUoXCIuL2Jhc2VcIikuQ09NUElMRVJfUkVWSVNJT047XG52YXIgUkVWSVNJT05fQ0hBTkdFUyA9IHJlcXVpcmUoXCIuL2Jhc2VcIikuUkVWSVNJT05fQ0hBTkdFUztcblxuZnVuY3Rpb24gY2hlY2tSZXZpc2lvbihjb21waWxlckluZm8pIHtcbiAgdmFyIGNvbXBpbGVyUmV2aXNpb24gPSBjb21waWxlckluZm8gJiYgY29tcGlsZXJJbmZvWzBdIHx8IDEsXG4gICAgICBjdXJyZW50UmV2aXNpb24gPSBDT01QSUxFUl9SRVZJU0lPTjtcblxuICBpZiAoY29tcGlsZXJSZXZpc2lvbiAhPT0gY3VycmVudFJldmlzaW9uKSB7XG4gICAgaWYgKGNvbXBpbGVyUmV2aXNpb24gPCBjdXJyZW50UmV2aXNpb24pIHtcbiAgICAgIHZhciBydW50aW1lVmVyc2lvbnMgPSBSRVZJU0lPTl9DSEFOR0VTW2N1cnJlbnRSZXZpc2lvbl0sXG4gICAgICAgICAgY29tcGlsZXJWZXJzaW9ucyA9IFJFVklTSU9OX0NIQU5HRVNbY29tcGlsZXJSZXZpc2lvbl07XG4gICAgICB0aHJvdyBuZXcgRXhjZXB0aW9uKFwiVGVtcGxhdGUgd2FzIHByZWNvbXBpbGVkIHdpdGggYW4gb2xkZXIgdmVyc2lvbiBvZiBIYW5kbGViYXJzIHRoYW4gdGhlIGN1cnJlbnQgcnVudGltZS4gXCIrXG4gICAgICAgICAgICBcIlBsZWFzZSB1cGRhdGUgeW91ciBwcmVjb21waWxlciB0byBhIG5ld2VyIHZlcnNpb24gKFwiK3J1bnRpbWVWZXJzaW9ucytcIikgb3IgZG93bmdyYWRlIHlvdXIgcnVudGltZSB0byBhbiBvbGRlciB2ZXJzaW9uIChcIitjb21waWxlclZlcnNpb25zK1wiKS5cIik7XG4gICAgfSBlbHNlIHtcbiAgICAgIC8vIFVzZSB0aGUgZW1iZWRkZWQgdmVyc2lvbiBpbmZvIHNpbmNlIHRoZSBydW50aW1lIGRvZXNuJ3Qga25vdyBhYm91dCB0aGlzIHJldmlzaW9uIHlldFxuICAgICAgdGhyb3cgbmV3IEV4Y2VwdGlvbihcIlRlbXBsYXRlIHdhcyBwcmVjb21waWxlZCB3aXRoIGEgbmV3ZXIgdmVyc2lvbiBvZiBIYW5kbGViYXJzIHRoYW4gdGhlIGN1cnJlbnQgcnVudGltZS4gXCIrXG4gICAgICAgICAgICBcIlBsZWFzZSB1cGRhdGUgeW91ciBydW50aW1lIHRvIGEgbmV3ZXIgdmVyc2lvbiAoXCIrY29tcGlsZXJJbmZvWzFdK1wiKS5cIik7XG4gICAgfVxuICB9XG59XG5cbmV4cG9ydHMuY2hlY2tSZXZpc2lvbiA9IGNoZWNrUmV2aXNpb247Ly8gVE9ETzogUmVtb3ZlIHRoaXMgbGluZSBhbmQgYnJlYWsgdXAgY29tcGlsZVBhcnRpYWxcblxuZnVuY3Rpb24gdGVtcGxhdGUodGVtcGxhdGVTcGVjLCBlbnYpIHtcbiAgaWYgKCFlbnYpIHtcbiAgICB0aHJvdyBuZXcgRXhjZXB0aW9uKFwiTm8gZW52aXJvbm1lbnQgcGFzc2VkIHRvIHRlbXBsYXRlXCIpO1xuICB9XG5cbiAgLy8gTm90ZTogVXNpbmcgZW52LlZNIHJlZmVyZW5jZXMgcmF0aGVyIHRoYW4gbG9jYWwgdmFyIHJlZmVyZW5jZXMgdGhyb3VnaG91dCB0aGlzIHNlY3Rpb24gdG8gYWxsb3dcbiAgLy8gZm9yIGV4dGVybmFsIHVzZXJzIHRvIG92ZXJyaWRlIHRoZXNlIGFzIHBzdWVkby1zdXBwb3J0ZWQgQVBJcy5cbiAgdmFyIGludm9rZVBhcnRpYWxXcmFwcGVyID0gZnVuY3Rpb24ocGFydGlhbCwgbmFtZSwgY29udGV4dCwgaGVscGVycywgcGFydGlhbHMsIGRhdGEpIHtcbiAgICB2YXIgcmVzdWx0ID0gZW52LlZNLmludm9rZVBhcnRpYWwuYXBwbHkodGhpcywgYXJndW1lbnRzKTtcbiAgICBpZiAocmVzdWx0ICE9IG51bGwpIHsgcmV0dXJuIHJlc3VsdDsgfVxuXG4gICAgaWYgKGVudi5jb21waWxlKSB7XG4gICAgICB2YXIgb3B0aW9ucyA9IHsgaGVscGVyczogaGVscGVycywgcGFydGlhbHM6IHBhcnRpYWxzLCBkYXRhOiBkYXRhIH07XG4gICAgICBwYXJ0aWFsc1tuYW1lXSA9IGVudi5jb21waWxlKHBhcnRpYWwsIHsgZGF0YTogZGF0YSAhPT0gdW5kZWZpbmVkIH0sIGVudik7XG4gICAgICByZXR1cm4gcGFydGlhbHNbbmFtZV0oY29udGV4dCwgb3B0aW9ucyk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHRocm93IG5ldyBFeGNlcHRpb24oXCJUaGUgcGFydGlhbCBcIiArIG5hbWUgKyBcIiBjb3VsZCBub3QgYmUgY29tcGlsZWQgd2hlbiBydW5uaW5nIGluIHJ1bnRpbWUtb25seSBtb2RlXCIpO1xuICAgIH1cbiAgfTtcblxuICAvLyBKdXN0IGFkZCB3YXRlclxuICB2YXIgY29udGFpbmVyID0ge1xuICAgIGVzY2FwZUV4cHJlc3Npb246IFV0aWxzLmVzY2FwZUV4cHJlc3Npb24sXG4gICAgaW52b2tlUGFydGlhbDogaW52b2tlUGFydGlhbFdyYXBwZXIsXG4gICAgcHJvZ3JhbXM6IFtdLFxuICAgIHByb2dyYW06IGZ1bmN0aW9uKGksIGZuLCBkYXRhKSB7XG4gICAgICB2YXIgcHJvZ3JhbVdyYXBwZXIgPSB0aGlzLnByb2dyYW1zW2ldO1xuICAgICAgaWYoZGF0YSkge1xuICAgICAgICBwcm9ncmFtV3JhcHBlciA9IHByb2dyYW0oaSwgZm4sIGRhdGEpO1xuICAgICAgfSBlbHNlIGlmICghcHJvZ3JhbVdyYXBwZXIpIHtcbiAgICAgICAgcHJvZ3JhbVdyYXBwZXIgPSB0aGlzLnByb2dyYW1zW2ldID0gcHJvZ3JhbShpLCBmbik7XG4gICAgICB9XG4gICAgICByZXR1cm4gcHJvZ3JhbVdyYXBwZXI7XG4gICAgfSxcbiAgICBtZXJnZTogZnVuY3Rpb24ocGFyYW0sIGNvbW1vbikge1xuICAgICAgdmFyIHJldCA9IHBhcmFtIHx8IGNvbW1vbjtcblxuICAgICAgaWYgKHBhcmFtICYmIGNvbW1vbiAmJiAocGFyYW0gIT09IGNvbW1vbikpIHtcbiAgICAgICAgcmV0ID0ge307XG4gICAgICAgIFV0aWxzLmV4dGVuZChyZXQsIGNvbW1vbik7XG4gICAgICAgIFV0aWxzLmV4dGVuZChyZXQsIHBhcmFtKTtcbiAgICAgIH1cbiAgICAgIHJldHVybiByZXQ7XG4gICAgfSxcbiAgICBwcm9ncmFtV2l0aERlcHRoOiBlbnYuVk0ucHJvZ3JhbVdpdGhEZXB0aCxcbiAgICBub29wOiBlbnYuVk0ubm9vcCxcbiAgICBjb21waWxlckluZm86IG51bGxcbiAgfTtcblxuICByZXR1cm4gZnVuY3Rpb24oY29udGV4dCwgb3B0aW9ucykge1xuICAgIG9wdGlvbnMgPSBvcHRpb25zIHx8IHt9O1xuICAgIHZhciBuYW1lc3BhY2UgPSBvcHRpb25zLnBhcnRpYWwgPyBvcHRpb25zIDogZW52LFxuICAgICAgICBoZWxwZXJzLFxuICAgICAgICBwYXJ0aWFscztcblxuICAgIGlmICghb3B0aW9ucy5wYXJ0aWFsKSB7XG4gICAgICBoZWxwZXJzID0gb3B0aW9ucy5oZWxwZXJzO1xuICAgICAgcGFydGlhbHMgPSBvcHRpb25zLnBhcnRpYWxzO1xuICAgIH1cbiAgICB2YXIgcmVzdWx0ID0gdGVtcGxhdGVTcGVjLmNhbGwoXG4gICAgICAgICAgY29udGFpbmVyLFxuICAgICAgICAgIG5hbWVzcGFjZSwgY29udGV4dCxcbiAgICAgICAgICBoZWxwZXJzLFxuICAgICAgICAgIHBhcnRpYWxzLFxuICAgICAgICAgIG9wdGlvbnMuZGF0YSk7XG5cbiAgICBpZiAoIW9wdGlvbnMucGFydGlhbCkge1xuICAgICAgZW52LlZNLmNoZWNrUmV2aXNpb24oY29udGFpbmVyLmNvbXBpbGVySW5mbyk7XG4gICAgfVxuXG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfTtcbn1cblxuZXhwb3J0cy50ZW1wbGF0ZSA9IHRlbXBsYXRlO2Z1bmN0aW9uIHByb2dyYW1XaXRoRGVwdGgoaSwgZm4sIGRhdGEgLyosICRkZXB0aCAqLykge1xuICB2YXIgYXJncyA9IEFycmF5LnByb3RvdHlwZS5zbGljZS5jYWxsKGFyZ3VtZW50cywgMyk7XG5cbiAgdmFyIHByb2cgPSBmdW5jdGlvbihjb250ZXh0LCBvcHRpb25zKSB7XG4gICAgb3B0aW9ucyA9IG9wdGlvbnMgfHwge307XG5cbiAgICByZXR1cm4gZm4uYXBwbHkodGhpcywgW2NvbnRleHQsIG9wdGlvbnMuZGF0YSB8fCBkYXRhXS5jb25jYXQoYXJncykpO1xuICB9O1xuICBwcm9nLnByb2dyYW0gPSBpO1xuICBwcm9nLmRlcHRoID0gYXJncy5sZW5ndGg7XG4gIHJldHVybiBwcm9nO1xufVxuXG5leHBvcnRzLnByb2dyYW1XaXRoRGVwdGggPSBwcm9ncmFtV2l0aERlcHRoO2Z1bmN0aW9uIHByb2dyYW0oaSwgZm4sIGRhdGEpIHtcbiAgdmFyIHByb2cgPSBmdW5jdGlvbihjb250ZXh0LCBvcHRpb25zKSB7XG4gICAgb3B0aW9ucyA9IG9wdGlvbnMgfHwge307XG5cbiAgICByZXR1cm4gZm4oY29udGV4dCwgb3B0aW9ucy5kYXRhIHx8IGRhdGEpO1xuICB9O1xuICBwcm9nLnByb2dyYW0gPSBpO1xuICBwcm9nLmRlcHRoID0gMDtcbiAgcmV0dXJuIHByb2c7XG59XG5cbmV4cG9ydHMucHJvZ3JhbSA9IHByb2dyYW07ZnVuY3Rpb24gaW52b2tlUGFydGlhbChwYXJ0aWFsLCBuYW1lLCBjb250ZXh0LCBoZWxwZXJzLCBwYXJ0aWFscywgZGF0YSkge1xuICB2YXIgb3B0aW9ucyA9IHsgcGFydGlhbDogdHJ1ZSwgaGVscGVyczogaGVscGVycywgcGFydGlhbHM6IHBhcnRpYWxzLCBkYXRhOiBkYXRhIH07XG5cbiAgaWYocGFydGlhbCA9PT0gdW5kZWZpbmVkKSB7XG4gICAgdGhyb3cgbmV3IEV4Y2VwdGlvbihcIlRoZSBwYXJ0aWFsIFwiICsgbmFtZSArIFwiIGNvdWxkIG5vdCBiZSBmb3VuZFwiKTtcbiAgfSBlbHNlIGlmKHBhcnRpYWwgaW5zdGFuY2VvZiBGdW5jdGlvbikge1xuICAgIHJldHVybiBwYXJ0aWFsKGNvbnRleHQsIG9wdGlvbnMpO1xuICB9XG59XG5cbmV4cG9ydHMuaW52b2tlUGFydGlhbCA9IGludm9rZVBhcnRpYWw7ZnVuY3Rpb24gbm9vcCgpIHsgcmV0dXJuIFwiXCI7IH1cblxuZXhwb3J0cy5ub29wID0gbm9vcDsiLCJcInVzZSBzdHJpY3RcIjtcbi8vIEJ1aWxkIG91dCBvdXIgYmFzaWMgU2FmZVN0cmluZyB0eXBlXG5mdW5jdGlvbiBTYWZlU3RyaW5nKHN0cmluZykge1xuICB0aGlzLnN0cmluZyA9IHN0cmluZztcbn1cblxuU2FmZVN0cmluZy5wcm90b3R5cGUudG9TdHJpbmcgPSBmdW5jdGlvbigpIHtcbiAgcmV0dXJuIFwiXCIgKyB0aGlzLnN0cmluZztcbn07XG5cbmV4cG9ydHNbXCJkZWZhdWx0XCJdID0gU2FmZVN0cmluZzsiLCJcInVzZSBzdHJpY3RcIjtcbi8qanNoaW50IC1XMDA0ICovXG52YXIgU2FmZVN0cmluZyA9IHJlcXVpcmUoXCIuL3NhZmUtc3RyaW5nXCIpW1wiZGVmYXVsdFwiXTtcblxudmFyIGVzY2FwZSA9IHtcbiAgXCImXCI6IFwiJmFtcDtcIixcbiAgXCI8XCI6IFwiJmx0O1wiLFxuICBcIj5cIjogXCImZ3Q7XCIsXG4gICdcIic6IFwiJnF1b3Q7XCIsXG4gIFwiJ1wiOiBcIiYjeDI3O1wiLFxuICBcImBcIjogXCImI3g2MDtcIlxufTtcblxudmFyIGJhZENoYXJzID0gL1smPD5cIidgXS9nO1xudmFyIHBvc3NpYmxlID0gL1smPD5cIidgXS87XG5cbmZ1bmN0aW9uIGVzY2FwZUNoYXIoY2hyKSB7XG4gIHJldHVybiBlc2NhcGVbY2hyXSB8fCBcIiZhbXA7XCI7XG59XG5cbmZ1bmN0aW9uIGV4dGVuZChvYmosIHZhbHVlKSB7XG4gIGZvcih2YXIga2V5IGluIHZhbHVlKSB7XG4gICAgaWYoT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKHZhbHVlLCBrZXkpKSB7XG4gICAgICBvYmpba2V5XSA9IHZhbHVlW2tleV07XG4gICAgfVxuICB9XG59XG5cbmV4cG9ydHMuZXh0ZW5kID0gZXh0ZW5kO3ZhciB0b1N0cmluZyA9IE9iamVjdC5wcm90b3R5cGUudG9TdHJpbmc7XG5leHBvcnRzLnRvU3RyaW5nID0gdG9TdHJpbmc7XG4vLyBTb3VyY2VkIGZyb20gbG9kYXNoXG4vLyBodHRwczovL2dpdGh1Yi5jb20vYmVzdGllanMvbG9kYXNoL2Jsb2IvbWFzdGVyL0xJQ0VOU0UudHh0XG52YXIgaXNGdW5jdGlvbiA9IGZ1bmN0aW9uKHZhbHVlKSB7XG4gIHJldHVybiB0eXBlb2YgdmFsdWUgPT09ICdmdW5jdGlvbic7XG59O1xuLy8gZmFsbGJhY2sgZm9yIG9sZGVyIHZlcnNpb25zIG9mIENocm9tZSBhbmQgU2FmYXJpXG5pZiAoaXNGdW5jdGlvbigveC8pKSB7XG4gIGlzRnVuY3Rpb24gPSBmdW5jdGlvbih2YWx1ZSkge1xuICAgIHJldHVybiB0eXBlb2YgdmFsdWUgPT09ICdmdW5jdGlvbicgJiYgdG9TdHJpbmcuY2FsbCh2YWx1ZSkgPT09ICdbb2JqZWN0IEZ1bmN0aW9uXSc7XG4gIH07XG59XG52YXIgaXNGdW5jdGlvbjtcbmV4cG9ydHMuaXNGdW5jdGlvbiA9IGlzRnVuY3Rpb247XG52YXIgaXNBcnJheSA9IEFycmF5LmlzQXJyYXkgfHwgZnVuY3Rpb24odmFsdWUpIHtcbiAgcmV0dXJuICh2YWx1ZSAmJiB0eXBlb2YgdmFsdWUgPT09ICdvYmplY3QnKSA/IHRvU3RyaW5nLmNhbGwodmFsdWUpID09PSAnW29iamVjdCBBcnJheV0nIDogZmFsc2U7XG59O1xuZXhwb3J0cy5pc0FycmF5ID0gaXNBcnJheTtcblxuZnVuY3Rpb24gZXNjYXBlRXhwcmVzc2lvbihzdHJpbmcpIHtcbiAgLy8gZG9uJ3QgZXNjYXBlIFNhZmVTdHJpbmdzLCBzaW5jZSB0aGV5J3JlIGFscmVhZHkgc2FmZVxuICBpZiAoc3RyaW5nIGluc3RhbmNlb2YgU2FmZVN0cmluZykge1xuICAgIHJldHVybiBzdHJpbmcudG9TdHJpbmcoKTtcbiAgfSBlbHNlIGlmICghc3RyaW5nICYmIHN0cmluZyAhPT0gMCkge1xuICAgIHJldHVybiBcIlwiO1xuICB9XG5cbiAgLy8gRm9yY2UgYSBzdHJpbmcgY29udmVyc2lvbiBhcyB0aGlzIHdpbGwgYmUgZG9uZSBieSB0aGUgYXBwZW5kIHJlZ2FyZGxlc3MgYW5kXG4gIC8vIHRoZSByZWdleCB0ZXN0IHdpbGwgZG8gdGhpcyB0cmFuc3BhcmVudGx5IGJlaGluZCB0aGUgc2NlbmVzLCBjYXVzaW5nIGlzc3VlcyBpZlxuICAvLyBhbiBvYmplY3QncyB0byBzdHJpbmcgaGFzIGVzY2FwZWQgY2hhcmFjdGVycyBpbiBpdC5cbiAgc3RyaW5nID0gXCJcIiArIHN0cmluZztcblxuICBpZighcG9zc2libGUudGVzdChzdHJpbmcpKSB7IHJldHVybiBzdHJpbmc7IH1cbiAgcmV0dXJuIHN0cmluZy5yZXBsYWNlKGJhZENoYXJzLCBlc2NhcGVDaGFyKTtcbn1cblxuZXhwb3J0cy5lc2NhcGVFeHByZXNzaW9uID0gZXNjYXBlRXhwcmVzc2lvbjtmdW5jdGlvbiBpc0VtcHR5KHZhbHVlKSB7XG4gIGlmICghdmFsdWUgJiYgdmFsdWUgIT09IDApIHtcbiAgICByZXR1cm4gdHJ1ZTtcbiAgfSBlbHNlIGlmIChpc0FycmF5KHZhbHVlKSAmJiB2YWx1ZS5sZW5ndGggPT09IDApIHtcbiAgICByZXR1cm4gdHJ1ZTtcbiAgfSBlbHNlIHtcbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cbn1cblxuZXhwb3J0cy5pc0VtcHR5ID0gaXNFbXB0eTsiLCIvLyBDcmVhdGUgYSBzaW1wbGUgcGF0aCBhbGlhcyB0byBhbGxvdyBicm93c2VyaWZ5IHRvIHJlc29sdmVcbi8vIHRoZSBydW50aW1lIG9uIGEgc3VwcG9ydGVkIHBhdGguXG5tb2R1bGUuZXhwb3J0cyA9IHJlcXVpcmUoJy4vZGlzdC9janMvaGFuZGxlYmFycy5ydW50aW1lJyk7XG4iLCJtb2R1bGUuZXhwb3J0cyA9IHJlcXVpcmUoXCJoYW5kbGViYXJzL3J1bnRpbWVcIilbXCJkZWZhdWx0XCJdO1xuIl19
