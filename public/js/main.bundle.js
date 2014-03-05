require=(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);throw new Error("Cannot find module '"+o+"'")}var f=n[o]={exports:{}};t[o][0].call(f.exports,function(e){var n=t[o][1][e];return s(n?n:e)},f,f.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
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
},{"./handlebars/base":2,"./handlebars/exception":3,"./handlebars/runtime":4,"./handlebars/safe-string":5,"./handlebars/utils":6}],2:[function(require,module,exports){
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
},{"./exception":3,"./utils":6}],3:[function(require,module,exports){
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
},{}],4:[function(require,module,exports){
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
},{"./base":2,"./exception":3,"./utils":6}],5:[function(require,module,exports){
"use strict";
// Build out our basic SafeString type
function SafeString(string) {
  this.string = string;
}

SafeString.prototype.toString = function() {
  return "" + this.string;
};

exports["default"] = SafeString;
},{}],6:[function(require,module,exports){
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
},{"./safe-string":5}],7:[function(require,module,exports){
// Create a simple path alias to allow browserify to resolve
// the runtime on a supported path.
module.exports = require('./dist/cjs/handlebars.runtime');

},{"./dist/cjs/handlebars.runtime":1}],8:[function(require,module,exports){
module.exports = require("handlebars/runtime")["default"];

},{"handlebars/runtime":7}],9:[function(require,module,exports){
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


},{}],"echo":[function(require,module,exports){
module.exports=require('CNGsbw');
},{}],"CNGsbw":[function(require,module,exports){
module.exports = {
  start: function () {
    // models
    var App = require('./models/App')
      ;

    // views
    var ServerControlView = require('./views/ServerControlView')
      , MessagePanelView = require('./views/MessagePanelView')
      ;


    var app = new App();

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



},{"./models/App":12,"./views/MessagePanelView":15,"./views/ServerControlView":18}],12:[function(require,module,exports){
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


},{"./../libs/echoclient":9,"./EchoResponse":13}],13:[function(require,module,exports){
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
},{}],14:[function(require,module,exports){
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
},{"./../models/EchoResponse":13,"./templates/message-history.hbs":19}],15:[function(require,module,exports){
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

    return this;
  }

});

},{"./MessageHistoryView":14,"./MessageReceiveView":16,"./MessageSendView":17,"./templates/message-panel.hbs":20}],16:[function(require,module,exports){
var EchoResponse = require('./../models/EchoResponse');

module.exports = Backbone.View.extend({
  initialize: function() {
    var self = this;

    this.render();

    this.model.on('message history', function(response) {
      self.render(response);
    })
  },

  template: require('./templates/message-receive.hbs'),

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
},{"./../models/EchoResponse":13,"./templates/message-receive.hbs":21}],17:[function(require,module,exports){
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

},{"./templates/message-send.hbs":22}],18:[function(require,module,exports){
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

  //template: Handlebars.compile($('#server-control-template').html()),
  template: require('./templates/server-control.hbs'),

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

},{"./templates/server-control.hbs":23}],19:[function(require,module,exports){
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

},{"hbsfy/runtime":8}],20:[function(require,module,exports){
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

},{"hbsfy/runtime":8}],21:[function(require,module,exports){
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

},{"hbsfy/runtime":8}],22:[function(require,module,exports){
// hbsfy compiled Handlebars template
var Handlebars = require('hbsfy/runtime');
module.exports = Handlebars.template(function (Handlebars,depth0,helpers,partials,data) {
  this.compilerInfo = [4,'>= 1.0.0'];
helpers = this.merge(helpers, Handlebars.helpers); data = data || {};
  


  return "<div class=\"row topmargin\">\n  <div class=\"col-md-4 col-md-offset-4\">\n    <div class=\"well\">\n      <form role=\"form\" id=\"formmessage\">\n        <div class=\"form-group\">\n          <label for=\"message\">Message</label>\n\n          <div class=\"input-group\">\n            <input type=\"text\" class=\"form-control\" id=\"message\"\n                   placeholder=\"Send message...\">\n              <span class=\"input-group-btn\">\n                <button type=\"submit\" class=\"btn btn-default\"\n                        id=\"btnsendmessage\">Send\n                </button>\n              </span>\n          </div>\n        </div>\n      </form>\n    </div>\n  </div>\n</div>\n";
  });

},{"hbsfy/runtime":8}],23:[function(require,module,exports){
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
    + "\n          </button>\n          <span id=\"server-error\" class=\"";
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

},{"hbsfy/runtime":8}]},{},[])
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZ2VuZXJhdGVkLmpzIiwic291cmNlcyI6WyIvVXNlcnMvdG9ueS9wcm9qZWN0cy9HaXRIdWIvZWNoby9lY2hvL25vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCIvVXNlcnMvdG9ueS9ub2RlX21vZHVsZXMvaGFuZGxlYmFycy9kaXN0L2Nqcy9oYW5kbGViYXJzLnJ1bnRpbWUuanMiLCIvVXNlcnMvdG9ueS9ub2RlX21vZHVsZXMvaGFuZGxlYmFycy9kaXN0L2Nqcy9oYW5kbGViYXJzL2Jhc2UuanMiLCIvVXNlcnMvdG9ueS9ub2RlX21vZHVsZXMvaGFuZGxlYmFycy9kaXN0L2Nqcy9oYW5kbGViYXJzL2V4Y2VwdGlvbi5qcyIsIi9Vc2Vycy90b255L25vZGVfbW9kdWxlcy9oYW5kbGViYXJzL2Rpc3QvY2pzL2hhbmRsZWJhcnMvcnVudGltZS5qcyIsIi9Vc2Vycy90b255L25vZGVfbW9kdWxlcy9oYW5kbGViYXJzL2Rpc3QvY2pzL2hhbmRsZWJhcnMvc2FmZS1zdHJpbmcuanMiLCIvVXNlcnMvdG9ueS9ub2RlX21vZHVsZXMvaGFuZGxlYmFycy9kaXN0L2Nqcy9oYW5kbGViYXJzL3V0aWxzLmpzIiwiL1VzZXJzL3Rvbnkvbm9kZV9tb2R1bGVzL2hhbmRsZWJhcnMvcnVudGltZS5qcyIsIi9Vc2Vycy90b255L25vZGVfbW9kdWxlcy9oYnNmeS9ydW50aW1lLmpzIiwiL1VzZXJzL3RvbnkvcHJvamVjdHMvR2l0SHViL2VjaG8vZWNoby9jbGllbnQvc2NyaXB0cy9saWJzL2VjaG9jbGllbnQuanMiLCIvVXNlcnMvdG9ueS9wcm9qZWN0cy9HaXRIdWIvZWNoby9lY2hvL2NsaWVudC9zY3JpcHRzL21haW4uanMiLCIvVXNlcnMvdG9ueS9wcm9qZWN0cy9HaXRIdWIvZWNoby9lY2hvL2NsaWVudC9zY3JpcHRzL21vZGVscy9BcHAuanMiLCIvVXNlcnMvdG9ueS9wcm9qZWN0cy9HaXRIdWIvZWNoby9lY2hvL2NsaWVudC9zY3JpcHRzL21vZGVscy9FY2hvUmVzcG9uc2UuanMiLCIvVXNlcnMvdG9ueS9wcm9qZWN0cy9HaXRIdWIvZWNoby9lY2hvL2NsaWVudC9zY3JpcHRzL3ZpZXdzL01lc3NhZ2VIaXN0b3J5Vmlldy5qcyIsIi9Vc2Vycy90b255L3Byb2plY3RzL0dpdEh1Yi9lY2hvL2VjaG8vY2xpZW50L3NjcmlwdHMvdmlld3MvTWVzc2FnZVBhbmVsVmlldy5qcyIsIi9Vc2Vycy90b255L3Byb2plY3RzL0dpdEh1Yi9lY2hvL2VjaG8vY2xpZW50L3NjcmlwdHMvdmlld3MvTWVzc2FnZVJlY2VpdmVWaWV3LmpzIiwiL1VzZXJzL3RvbnkvcHJvamVjdHMvR2l0SHViL2VjaG8vZWNoby9jbGllbnQvc2NyaXB0cy92aWV3cy9NZXNzYWdlU2VuZFZpZXcuanMiLCIvVXNlcnMvdG9ueS9wcm9qZWN0cy9HaXRIdWIvZWNoby9lY2hvL2NsaWVudC9zY3JpcHRzL3ZpZXdzL1NlcnZlckNvbnRyb2xWaWV3LmpzIiwiL1VzZXJzL3RvbnkvcHJvamVjdHMvR2l0SHViL2VjaG8vZWNoby9jbGllbnQvc2NyaXB0cy92aWV3cy90ZW1wbGF0ZXMvbWVzc2FnZS1oaXN0b3J5LmhicyIsIi9Vc2Vycy90b255L3Byb2plY3RzL0dpdEh1Yi9lY2hvL2VjaG8vY2xpZW50L3NjcmlwdHMvdmlld3MvdGVtcGxhdGVzL21lc3NhZ2UtcGFuZWwuaGJzIiwiL1VzZXJzL3RvbnkvcHJvamVjdHMvR2l0SHViL2VjaG8vZWNoby9jbGllbnQvc2NyaXB0cy92aWV3cy90ZW1wbGF0ZXMvbWVzc2FnZS1yZWNlaXZlLmhicyIsIi9Vc2Vycy90b255L3Byb2plY3RzL0dpdEh1Yi9lY2hvL2VjaG8vY2xpZW50L3NjcmlwdHMvdmlld3MvdGVtcGxhdGVzL21lc3NhZ2Utc2VuZC5oYnMiLCIvVXNlcnMvdG9ueS9wcm9qZWN0cy9HaXRIdWIvZWNoby9lY2hvL2NsaWVudC9zY3JpcHRzL3ZpZXdzL3RlbXBsYXRlcy9zZXJ2ZXItY29udHJvbC5oYnMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7QUNBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQy9CQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbkxBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzNCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3hJQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ1ZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzNFQTtBQUNBO0FBQ0E7QUFDQTs7QUNIQTtBQUNBOztBQ0RBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7O0FDdklBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2pDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2pKQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDakJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMzREE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDN0NBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzNCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM3Q0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDckVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdEJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2ZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2ZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDVkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EiLCJzb3VyY2VzQ29udGVudCI6WyIoZnVuY3Rpb24gZSh0LG4scil7ZnVuY3Rpb24gcyhvLHUpe2lmKCFuW29dKXtpZighdFtvXSl7dmFyIGE9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtpZighdSYmYSlyZXR1cm4gYShvLCEwKTtpZihpKXJldHVybiBpKG8sITApO3Rocm93IG5ldyBFcnJvcihcIkNhbm5vdCBmaW5kIG1vZHVsZSAnXCIrbytcIidcIil9dmFyIGY9bltvXT17ZXhwb3J0czp7fX07dFtvXVswXS5jYWxsKGYuZXhwb3J0cyxmdW5jdGlvbihlKXt2YXIgbj10W29dWzFdW2VdO3JldHVybiBzKG4/bjplKX0sZixmLmV4cG9ydHMsZSx0LG4scil9cmV0dXJuIG5bb10uZXhwb3J0c312YXIgaT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2Zvcih2YXIgbz0wO288ci5sZW5ndGg7bysrKXMocltvXSk7cmV0dXJuIHN9KSIsIlwidXNlIHN0cmljdFwiO1xuLypnbG9iYWxzIEhhbmRsZWJhcnM6IHRydWUgKi9cbnZhciBiYXNlID0gcmVxdWlyZShcIi4vaGFuZGxlYmFycy9iYXNlXCIpO1xuXG4vLyBFYWNoIG9mIHRoZXNlIGF1Z21lbnQgdGhlIEhhbmRsZWJhcnMgb2JqZWN0LiBObyBuZWVkIHRvIHNldHVwIGhlcmUuXG4vLyAoVGhpcyBpcyBkb25lIHRvIGVhc2lseSBzaGFyZSBjb2RlIGJldHdlZW4gY29tbW9uanMgYW5kIGJyb3dzZSBlbnZzKVxudmFyIFNhZmVTdHJpbmcgPSByZXF1aXJlKFwiLi9oYW5kbGViYXJzL3NhZmUtc3RyaW5nXCIpW1wiZGVmYXVsdFwiXTtcbnZhciBFeGNlcHRpb24gPSByZXF1aXJlKFwiLi9oYW5kbGViYXJzL2V4Y2VwdGlvblwiKVtcImRlZmF1bHRcIl07XG52YXIgVXRpbHMgPSByZXF1aXJlKFwiLi9oYW5kbGViYXJzL3V0aWxzXCIpO1xudmFyIHJ1bnRpbWUgPSByZXF1aXJlKFwiLi9oYW5kbGViYXJzL3J1bnRpbWVcIik7XG5cbi8vIEZvciBjb21wYXRpYmlsaXR5IGFuZCB1c2FnZSBvdXRzaWRlIG9mIG1vZHVsZSBzeXN0ZW1zLCBtYWtlIHRoZSBIYW5kbGViYXJzIG9iamVjdCBhIG5hbWVzcGFjZVxudmFyIGNyZWF0ZSA9IGZ1bmN0aW9uKCkge1xuICB2YXIgaGIgPSBuZXcgYmFzZS5IYW5kbGViYXJzRW52aXJvbm1lbnQoKTtcblxuICBVdGlscy5leHRlbmQoaGIsIGJhc2UpO1xuICBoYi5TYWZlU3RyaW5nID0gU2FmZVN0cmluZztcbiAgaGIuRXhjZXB0aW9uID0gRXhjZXB0aW9uO1xuICBoYi5VdGlscyA9IFV0aWxzO1xuXG4gIGhiLlZNID0gcnVudGltZTtcbiAgaGIudGVtcGxhdGUgPSBmdW5jdGlvbihzcGVjKSB7XG4gICAgcmV0dXJuIHJ1bnRpbWUudGVtcGxhdGUoc3BlYywgaGIpO1xuICB9O1xuXG4gIHJldHVybiBoYjtcbn07XG5cbnZhciBIYW5kbGViYXJzID0gY3JlYXRlKCk7XG5IYW5kbGViYXJzLmNyZWF0ZSA9IGNyZWF0ZTtcblxuZXhwb3J0c1tcImRlZmF1bHRcIl0gPSBIYW5kbGViYXJzOyIsIlwidXNlIHN0cmljdFwiO1xudmFyIFV0aWxzID0gcmVxdWlyZShcIi4vdXRpbHNcIik7XG52YXIgRXhjZXB0aW9uID0gcmVxdWlyZShcIi4vZXhjZXB0aW9uXCIpW1wiZGVmYXVsdFwiXTtcblxudmFyIFZFUlNJT04gPSBcIjEuMy4wXCI7XG5leHBvcnRzLlZFUlNJT04gPSBWRVJTSU9OO3ZhciBDT01QSUxFUl9SRVZJU0lPTiA9IDQ7XG5leHBvcnRzLkNPTVBJTEVSX1JFVklTSU9OID0gQ09NUElMRVJfUkVWSVNJT047XG52YXIgUkVWSVNJT05fQ0hBTkdFUyA9IHtcbiAgMTogJzw9IDEuMC5yYy4yJywgLy8gMS4wLnJjLjIgaXMgYWN0dWFsbHkgcmV2MiBidXQgZG9lc24ndCByZXBvcnQgaXRcbiAgMjogJz09IDEuMC4wLXJjLjMnLFxuICAzOiAnPT0gMS4wLjAtcmMuNCcsXG4gIDQ6ICc+PSAxLjAuMCdcbn07XG5leHBvcnRzLlJFVklTSU9OX0NIQU5HRVMgPSBSRVZJU0lPTl9DSEFOR0VTO1xudmFyIGlzQXJyYXkgPSBVdGlscy5pc0FycmF5LFxuICAgIGlzRnVuY3Rpb24gPSBVdGlscy5pc0Z1bmN0aW9uLFxuICAgIHRvU3RyaW5nID0gVXRpbHMudG9TdHJpbmcsXG4gICAgb2JqZWN0VHlwZSA9ICdbb2JqZWN0IE9iamVjdF0nO1xuXG5mdW5jdGlvbiBIYW5kbGViYXJzRW52aXJvbm1lbnQoaGVscGVycywgcGFydGlhbHMpIHtcbiAgdGhpcy5oZWxwZXJzID0gaGVscGVycyB8fCB7fTtcbiAgdGhpcy5wYXJ0aWFscyA9IHBhcnRpYWxzIHx8IHt9O1xuXG4gIHJlZ2lzdGVyRGVmYXVsdEhlbHBlcnModGhpcyk7XG59XG5cbmV4cG9ydHMuSGFuZGxlYmFyc0Vudmlyb25tZW50ID0gSGFuZGxlYmFyc0Vudmlyb25tZW50O0hhbmRsZWJhcnNFbnZpcm9ubWVudC5wcm90b3R5cGUgPSB7XG4gIGNvbnN0cnVjdG9yOiBIYW5kbGViYXJzRW52aXJvbm1lbnQsXG5cbiAgbG9nZ2VyOiBsb2dnZXIsXG4gIGxvZzogbG9nLFxuXG4gIHJlZ2lzdGVySGVscGVyOiBmdW5jdGlvbihuYW1lLCBmbiwgaW52ZXJzZSkge1xuICAgIGlmICh0b1N0cmluZy5jYWxsKG5hbWUpID09PSBvYmplY3RUeXBlKSB7XG4gICAgICBpZiAoaW52ZXJzZSB8fCBmbikgeyB0aHJvdyBuZXcgRXhjZXB0aW9uKCdBcmcgbm90IHN1cHBvcnRlZCB3aXRoIG11bHRpcGxlIGhlbHBlcnMnKTsgfVxuICAgICAgVXRpbHMuZXh0ZW5kKHRoaXMuaGVscGVycywgbmFtZSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGlmIChpbnZlcnNlKSB7IGZuLm5vdCA9IGludmVyc2U7IH1cbiAgICAgIHRoaXMuaGVscGVyc1tuYW1lXSA9IGZuO1xuICAgIH1cbiAgfSxcblxuICByZWdpc3RlclBhcnRpYWw6IGZ1bmN0aW9uKG5hbWUsIHN0cikge1xuICAgIGlmICh0b1N0cmluZy5jYWxsKG5hbWUpID09PSBvYmplY3RUeXBlKSB7XG4gICAgICBVdGlscy5leHRlbmQodGhpcy5wYXJ0aWFscywgIG5hbWUpO1xuICAgIH0gZWxzZSB7XG4gICAgICB0aGlzLnBhcnRpYWxzW25hbWVdID0gc3RyO1xuICAgIH1cbiAgfVxufTtcblxuZnVuY3Rpb24gcmVnaXN0ZXJEZWZhdWx0SGVscGVycyhpbnN0YW5jZSkge1xuICBpbnN0YW5jZS5yZWdpc3RlckhlbHBlcignaGVscGVyTWlzc2luZycsIGZ1bmN0aW9uKGFyZykge1xuICAgIGlmKGFyZ3VtZW50cy5sZW5ndGggPT09IDIpIHtcbiAgICAgIHJldHVybiB1bmRlZmluZWQ7XG4gICAgfSBlbHNlIHtcbiAgICAgIHRocm93IG5ldyBFeGNlcHRpb24oXCJNaXNzaW5nIGhlbHBlcjogJ1wiICsgYXJnICsgXCInXCIpO1xuICAgIH1cbiAgfSk7XG5cbiAgaW5zdGFuY2UucmVnaXN0ZXJIZWxwZXIoJ2Jsb2NrSGVscGVyTWlzc2luZycsIGZ1bmN0aW9uKGNvbnRleHQsIG9wdGlvbnMpIHtcbiAgICB2YXIgaW52ZXJzZSA9IG9wdGlvbnMuaW52ZXJzZSB8fCBmdW5jdGlvbigpIHt9LCBmbiA9IG9wdGlvbnMuZm47XG5cbiAgICBpZiAoaXNGdW5jdGlvbihjb250ZXh0KSkgeyBjb250ZXh0ID0gY29udGV4dC5jYWxsKHRoaXMpOyB9XG5cbiAgICBpZihjb250ZXh0ID09PSB0cnVlKSB7XG4gICAgICByZXR1cm4gZm4odGhpcyk7XG4gICAgfSBlbHNlIGlmKGNvbnRleHQgPT09IGZhbHNlIHx8IGNvbnRleHQgPT0gbnVsbCkge1xuICAgICAgcmV0dXJuIGludmVyc2UodGhpcyk7XG4gICAgfSBlbHNlIGlmIChpc0FycmF5KGNvbnRleHQpKSB7XG4gICAgICBpZihjb250ZXh0Lmxlbmd0aCA+IDApIHtcbiAgICAgICAgcmV0dXJuIGluc3RhbmNlLmhlbHBlcnMuZWFjaChjb250ZXh0LCBvcHRpb25zKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHJldHVybiBpbnZlcnNlKHRoaXMpO1xuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICByZXR1cm4gZm4oY29udGV4dCk7XG4gICAgfVxuICB9KTtcblxuICBpbnN0YW5jZS5yZWdpc3RlckhlbHBlcignZWFjaCcsIGZ1bmN0aW9uKGNvbnRleHQsIG9wdGlvbnMpIHtcbiAgICB2YXIgZm4gPSBvcHRpb25zLmZuLCBpbnZlcnNlID0gb3B0aW9ucy5pbnZlcnNlO1xuICAgIHZhciBpID0gMCwgcmV0ID0gXCJcIiwgZGF0YTtcblxuICAgIGlmIChpc0Z1bmN0aW9uKGNvbnRleHQpKSB7IGNvbnRleHQgPSBjb250ZXh0LmNhbGwodGhpcyk7IH1cblxuICAgIGlmIChvcHRpb25zLmRhdGEpIHtcbiAgICAgIGRhdGEgPSBjcmVhdGVGcmFtZShvcHRpb25zLmRhdGEpO1xuICAgIH1cblxuICAgIGlmKGNvbnRleHQgJiYgdHlwZW9mIGNvbnRleHQgPT09ICdvYmplY3QnKSB7XG4gICAgICBpZiAoaXNBcnJheShjb250ZXh0KSkge1xuICAgICAgICBmb3IodmFyIGogPSBjb250ZXh0Lmxlbmd0aDsgaTxqOyBpKyspIHtcbiAgICAgICAgICBpZiAoZGF0YSkge1xuICAgICAgICAgICAgZGF0YS5pbmRleCA9IGk7XG4gICAgICAgICAgICBkYXRhLmZpcnN0ID0gKGkgPT09IDApO1xuICAgICAgICAgICAgZGF0YS5sYXN0ICA9IChpID09PSAoY29udGV4dC5sZW5ndGgtMSkpO1xuICAgICAgICAgIH1cbiAgICAgICAgICByZXQgPSByZXQgKyBmbihjb250ZXh0W2ldLCB7IGRhdGE6IGRhdGEgfSk7XG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGZvcih2YXIga2V5IGluIGNvbnRleHQpIHtcbiAgICAgICAgICBpZihjb250ZXh0Lmhhc093blByb3BlcnR5KGtleSkpIHtcbiAgICAgICAgICAgIGlmKGRhdGEpIHsgXG4gICAgICAgICAgICAgIGRhdGEua2V5ID0ga2V5OyBcbiAgICAgICAgICAgICAgZGF0YS5pbmRleCA9IGk7XG4gICAgICAgICAgICAgIGRhdGEuZmlyc3QgPSAoaSA9PT0gMCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXQgPSByZXQgKyBmbihjb250ZXh0W2tleV0sIHtkYXRhOiBkYXRhfSk7XG4gICAgICAgICAgICBpKys7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuXG4gICAgaWYoaSA9PT0gMCl7XG4gICAgICByZXQgPSBpbnZlcnNlKHRoaXMpO1xuICAgIH1cblxuICAgIHJldHVybiByZXQ7XG4gIH0pO1xuXG4gIGluc3RhbmNlLnJlZ2lzdGVySGVscGVyKCdpZicsIGZ1bmN0aW9uKGNvbmRpdGlvbmFsLCBvcHRpb25zKSB7XG4gICAgaWYgKGlzRnVuY3Rpb24oY29uZGl0aW9uYWwpKSB7IGNvbmRpdGlvbmFsID0gY29uZGl0aW9uYWwuY2FsbCh0aGlzKTsgfVxuXG4gICAgLy8gRGVmYXVsdCBiZWhhdmlvciBpcyB0byByZW5kZXIgdGhlIHBvc2l0aXZlIHBhdGggaWYgdGhlIHZhbHVlIGlzIHRydXRoeSBhbmQgbm90IGVtcHR5LlxuICAgIC8vIFRoZSBgaW5jbHVkZVplcm9gIG9wdGlvbiBtYXkgYmUgc2V0IHRvIHRyZWF0IHRoZSBjb25kdGlvbmFsIGFzIHB1cmVseSBub3QgZW1wdHkgYmFzZWQgb24gdGhlXG4gICAgLy8gYmVoYXZpb3Igb2YgaXNFbXB0eS4gRWZmZWN0aXZlbHkgdGhpcyBkZXRlcm1pbmVzIGlmIDAgaXMgaGFuZGxlZCBieSB0aGUgcG9zaXRpdmUgcGF0aCBvciBuZWdhdGl2ZS5cbiAgICBpZiAoKCFvcHRpb25zLmhhc2guaW5jbHVkZVplcm8gJiYgIWNvbmRpdGlvbmFsKSB8fCBVdGlscy5pc0VtcHR5KGNvbmRpdGlvbmFsKSkge1xuICAgICAgcmV0dXJuIG9wdGlvbnMuaW52ZXJzZSh0aGlzKTtcbiAgICB9IGVsc2Uge1xuICAgICAgcmV0dXJuIG9wdGlvbnMuZm4odGhpcyk7XG4gICAgfVxuICB9KTtcblxuICBpbnN0YW5jZS5yZWdpc3RlckhlbHBlcigndW5sZXNzJywgZnVuY3Rpb24oY29uZGl0aW9uYWwsIG9wdGlvbnMpIHtcbiAgICByZXR1cm4gaW5zdGFuY2UuaGVscGVyc1snaWYnXS5jYWxsKHRoaXMsIGNvbmRpdGlvbmFsLCB7Zm46IG9wdGlvbnMuaW52ZXJzZSwgaW52ZXJzZTogb3B0aW9ucy5mbiwgaGFzaDogb3B0aW9ucy5oYXNofSk7XG4gIH0pO1xuXG4gIGluc3RhbmNlLnJlZ2lzdGVySGVscGVyKCd3aXRoJywgZnVuY3Rpb24oY29udGV4dCwgb3B0aW9ucykge1xuICAgIGlmIChpc0Z1bmN0aW9uKGNvbnRleHQpKSB7IGNvbnRleHQgPSBjb250ZXh0LmNhbGwodGhpcyk7IH1cblxuICAgIGlmICghVXRpbHMuaXNFbXB0eShjb250ZXh0KSkgcmV0dXJuIG9wdGlvbnMuZm4oY29udGV4dCk7XG4gIH0pO1xuXG4gIGluc3RhbmNlLnJlZ2lzdGVySGVscGVyKCdsb2cnLCBmdW5jdGlvbihjb250ZXh0LCBvcHRpb25zKSB7XG4gICAgdmFyIGxldmVsID0gb3B0aW9ucy5kYXRhICYmIG9wdGlvbnMuZGF0YS5sZXZlbCAhPSBudWxsID8gcGFyc2VJbnQob3B0aW9ucy5kYXRhLmxldmVsLCAxMCkgOiAxO1xuICAgIGluc3RhbmNlLmxvZyhsZXZlbCwgY29udGV4dCk7XG4gIH0pO1xufVxuXG52YXIgbG9nZ2VyID0ge1xuICBtZXRob2RNYXA6IHsgMDogJ2RlYnVnJywgMTogJ2luZm8nLCAyOiAnd2FybicsIDM6ICdlcnJvcicgfSxcblxuICAvLyBTdGF0ZSBlbnVtXG4gIERFQlVHOiAwLFxuICBJTkZPOiAxLFxuICBXQVJOOiAyLFxuICBFUlJPUjogMyxcbiAgbGV2ZWw6IDMsXG5cbiAgLy8gY2FuIGJlIG92ZXJyaWRkZW4gaW4gdGhlIGhvc3QgZW52aXJvbm1lbnRcbiAgbG9nOiBmdW5jdGlvbihsZXZlbCwgb2JqKSB7XG4gICAgaWYgKGxvZ2dlci5sZXZlbCA8PSBsZXZlbCkge1xuICAgICAgdmFyIG1ldGhvZCA9IGxvZ2dlci5tZXRob2RNYXBbbGV2ZWxdO1xuICAgICAgaWYgKHR5cGVvZiBjb25zb2xlICE9PSAndW5kZWZpbmVkJyAmJiBjb25zb2xlW21ldGhvZF0pIHtcbiAgICAgICAgY29uc29sZVttZXRob2RdLmNhbGwoY29uc29sZSwgb2JqKTtcbiAgICAgIH1cbiAgICB9XG4gIH1cbn07XG5leHBvcnRzLmxvZ2dlciA9IGxvZ2dlcjtcbmZ1bmN0aW9uIGxvZyhsZXZlbCwgb2JqKSB7IGxvZ2dlci5sb2cobGV2ZWwsIG9iaik7IH1cblxuZXhwb3J0cy5sb2cgPSBsb2c7dmFyIGNyZWF0ZUZyYW1lID0gZnVuY3Rpb24ob2JqZWN0KSB7XG4gIHZhciBvYmogPSB7fTtcbiAgVXRpbHMuZXh0ZW5kKG9iaiwgb2JqZWN0KTtcbiAgcmV0dXJuIG9iajtcbn07XG5leHBvcnRzLmNyZWF0ZUZyYW1lID0gY3JlYXRlRnJhbWU7IiwiXCJ1c2Ugc3RyaWN0XCI7XG5cbnZhciBlcnJvclByb3BzID0gWydkZXNjcmlwdGlvbicsICdmaWxlTmFtZScsICdsaW5lTnVtYmVyJywgJ21lc3NhZ2UnLCAnbmFtZScsICdudW1iZXInLCAnc3RhY2snXTtcblxuZnVuY3Rpb24gRXhjZXB0aW9uKG1lc3NhZ2UsIG5vZGUpIHtcbiAgdmFyIGxpbmU7XG4gIGlmIChub2RlICYmIG5vZGUuZmlyc3RMaW5lKSB7XG4gICAgbGluZSA9IG5vZGUuZmlyc3RMaW5lO1xuXG4gICAgbWVzc2FnZSArPSAnIC0gJyArIGxpbmUgKyAnOicgKyBub2RlLmZpcnN0Q29sdW1uO1xuICB9XG5cbiAgdmFyIHRtcCA9IEVycm9yLnByb3RvdHlwZS5jb25zdHJ1Y3Rvci5jYWxsKHRoaXMsIG1lc3NhZ2UpO1xuXG4gIC8vIFVuZm9ydHVuYXRlbHkgZXJyb3JzIGFyZSBub3QgZW51bWVyYWJsZSBpbiBDaHJvbWUgKGF0IGxlYXN0KSwgc28gYGZvciBwcm9wIGluIHRtcGAgZG9lc24ndCB3b3JrLlxuICBmb3IgKHZhciBpZHggPSAwOyBpZHggPCBlcnJvclByb3BzLmxlbmd0aDsgaWR4KyspIHtcbiAgICB0aGlzW2Vycm9yUHJvcHNbaWR4XV0gPSB0bXBbZXJyb3JQcm9wc1tpZHhdXTtcbiAgfVxuXG4gIGlmIChsaW5lKSB7XG4gICAgdGhpcy5saW5lTnVtYmVyID0gbGluZTtcbiAgICB0aGlzLmNvbHVtbiA9IG5vZGUuZmlyc3RDb2x1bW47XG4gIH1cbn1cblxuRXhjZXB0aW9uLnByb3RvdHlwZSA9IG5ldyBFcnJvcigpO1xuXG5leHBvcnRzW1wiZGVmYXVsdFwiXSA9IEV4Y2VwdGlvbjsiLCJcInVzZSBzdHJpY3RcIjtcbnZhciBVdGlscyA9IHJlcXVpcmUoXCIuL3V0aWxzXCIpO1xudmFyIEV4Y2VwdGlvbiA9IHJlcXVpcmUoXCIuL2V4Y2VwdGlvblwiKVtcImRlZmF1bHRcIl07XG52YXIgQ09NUElMRVJfUkVWSVNJT04gPSByZXF1aXJlKFwiLi9iYXNlXCIpLkNPTVBJTEVSX1JFVklTSU9OO1xudmFyIFJFVklTSU9OX0NIQU5HRVMgPSByZXF1aXJlKFwiLi9iYXNlXCIpLlJFVklTSU9OX0NIQU5HRVM7XG5cbmZ1bmN0aW9uIGNoZWNrUmV2aXNpb24oY29tcGlsZXJJbmZvKSB7XG4gIHZhciBjb21waWxlclJldmlzaW9uID0gY29tcGlsZXJJbmZvICYmIGNvbXBpbGVySW5mb1swXSB8fCAxLFxuICAgICAgY3VycmVudFJldmlzaW9uID0gQ09NUElMRVJfUkVWSVNJT047XG5cbiAgaWYgKGNvbXBpbGVyUmV2aXNpb24gIT09IGN1cnJlbnRSZXZpc2lvbikge1xuICAgIGlmIChjb21waWxlclJldmlzaW9uIDwgY3VycmVudFJldmlzaW9uKSB7XG4gICAgICB2YXIgcnVudGltZVZlcnNpb25zID0gUkVWSVNJT05fQ0hBTkdFU1tjdXJyZW50UmV2aXNpb25dLFxuICAgICAgICAgIGNvbXBpbGVyVmVyc2lvbnMgPSBSRVZJU0lPTl9DSEFOR0VTW2NvbXBpbGVyUmV2aXNpb25dO1xuICAgICAgdGhyb3cgbmV3IEV4Y2VwdGlvbihcIlRlbXBsYXRlIHdhcyBwcmVjb21waWxlZCB3aXRoIGFuIG9sZGVyIHZlcnNpb24gb2YgSGFuZGxlYmFycyB0aGFuIHRoZSBjdXJyZW50IHJ1bnRpbWUuIFwiK1xuICAgICAgICAgICAgXCJQbGVhc2UgdXBkYXRlIHlvdXIgcHJlY29tcGlsZXIgdG8gYSBuZXdlciB2ZXJzaW9uIChcIitydW50aW1lVmVyc2lvbnMrXCIpIG9yIGRvd25ncmFkZSB5b3VyIHJ1bnRpbWUgdG8gYW4gb2xkZXIgdmVyc2lvbiAoXCIrY29tcGlsZXJWZXJzaW9ucytcIikuXCIpO1xuICAgIH0gZWxzZSB7XG4gICAgICAvLyBVc2UgdGhlIGVtYmVkZGVkIHZlcnNpb24gaW5mbyBzaW5jZSB0aGUgcnVudGltZSBkb2Vzbid0IGtub3cgYWJvdXQgdGhpcyByZXZpc2lvbiB5ZXRcbiAgICAgIHRocm93IG5ldyBFeGNlcHRpb24oXCJUZW1wbGF0ZSB3YXMgcHJlY29tcGlsZWQgd2l0aCBhIG5ld2VyIHZlcnNpb24gb2YgSGFuZGxlYmFycyB0aGFuIHRoZSBjdXJyZW50IHJ1bnRpbWUuIFwiK1xuICAgICAgICAgICAgXCJQbGVhc2UgdXBkYXRlIHlvdXIgcnVudGltZSB0byBhIG5ld2VyIHZlcnNpb24gKFwiK2NvbXBpbGVySW5mb1sxXStcIikuXCIpO1xuICAgIH1cbiAgfVxufVxuXG5leHBvcnRzLmNoZWNrUmV2aXNpb24gPSBjaGVja1JldmlzaW9uOy8vIFRPRE86IFJlbW92ZSB0aGlzIGxpbmUgYW5kIGJyZWFrIHVwIGNvbXBpbGVQYXJ0aWFsXG5cbmZ1bmN0aW9uIHRlbXBsYXRlKHRlbXBsYXRlU3BlYywgZW52KSB7XG4gIGlmICghZW52KSB7XG4gICAgdGhyb3cgbmV3IEV4Y2VwdGlvbihcIk5vIGVudmlyb25tZW50IHBhc3NlZCB0byB0ZW1wbGF0ZVwiKTtcbiAgfVxuXG4gIC8vIE5vdGU6IFVzaW5nIGVudi5WTSByZWZlcmVuY2VzIHJhdGhlciB0aGFuIGxvY2FsIHZhciByZWZlcmVuY2VzIHRocm91Z2hvdXQgdGhpcyBzZWN0aW9uIHRvIGFsbG93XG4gIC8vIGZvciBleHRlcm5hbCB1c2VycyB0byBvdmVycmlkZSB0aGVzZSBhcyBwc3VlZG8tc3VwcG9ydGVkIEFQSXMuXG4gIHZhciBpbnZva2VQYXJ0aWFsV3JhcHBlciA9IGZ1bmN0aW9uKHBhcnRpYWwsIG5hbWUsIGNvbnRleHQsIGhlbHBlcnMsIHBhcnRpYWxzLCBkYXRhKSB7XG4gICAgdmFyIHJlc3VsdCA9IGVudi5WTS5pbnZva2VQYXJ0aWFsLmFwcGx5KHRoaXMsIGFyZ3VtZW50cyk7XG4gICAgaWYgKHJlc3VsdCAhPSBudWxsKSB7IHJldHVybiByZXN1bHQ7IH1cblxuICAgIGlmIChlbnYuY29tcGlsZSkge1xuICAgICAgdmFyIG9wdGlvbnMgPSB7IGhlbHBlcnM6IGhlbHBlcnMsIHBhcnRpYWxzOiBwYXJ0aWFscywgZGF0YTogZGF0YSB9O1xuICAgICAgcGFydGlhbHNbbmFtZV0gPSBlbnYuY29tcGlsZShwYXJ0aWFsLCB7IGRhdGE6IGRhdGEgIT09IHVuZGVmaW5lZCB9LCBlbnYpO1xuICAgICAgcmV0dXJuIHBhcnRpYWxzW25hbWVdKGNvbnRleHQsIG9wdGlvbnMpO1xuICAgIH0gZWxzZSB7XG4gICAgICB0aHJvdyBuZXcgRXhjZXB0aW9uKFwiVGhlIHBhcnRpYWwgXCIgKyBuYW1lICsgXCIgY291bGQgbm90IGJlIGNvbXBpbGVkIHdoZW4gcnVubmluZyBpbiBydW50aW1lLW9ubHkgbW9kZVwiKTtcbiAgICB9XG4gIH07XG5cbiAgLy8gSnVzdCBhZGQgd2F0ZXJcbiAgdmFyIGNvbnRhaW5lciA9IHtcbiAgICBlc2NhcGVFeHByZXNzaW9uOiBVdGlscy5lc2NhcGVFeHByZXNzaW9uLFxuICAgIGludm9rZVBhcnRpYWw6IGludm9rZVBhcnRpYWxXcmFwcGVyLFxuICAgIHByb2dyYW1zOiBbXSxcbiAgICBwcm9ncmFtOiBmdW5jdGlvbihpLCBmbiwgZGF0YSkge1xuICAgICAgdmFyIHByb2dyYW1XcmFwcGVyID0gdGhpcy5wcm9ncmFtc1tpXTtcbiAgICAgIGlmKGRhdGEpIHtcbiAgICAgICAgcHJvZ3JhbVdyYXBwZXIgPSBwcm9ncmFtKGksIGZuLCBkYXRhKTtcbiAgICAgIH0gZWxzZSBpZiAoIXByb2dyYW1XcmFwcGVyKSB7XG4gICAgICAgIHByb2dyYW1XcmFwcGVyID0gdGhpcy5wcm9ncmFtc1tpXSA9IHByb2dyYW0oaSwgZm4pO1xuICAgICAgfVxuICAgICAgcmV0dXJuIHByb2dyYW1XcmFwcGVyO1xuICAgIH0sXG4gICAgbWVyZ2U6IGZ1bmN0aW9uKHBhcmFtLCBjb21tb24pIHtcbiAgICAgIHZhciByZXQgPSBwYXJhbSB8fCBjb21tb247XG5cbiAgICAgIGlmIChwYXJhbSAmJiBjb21tb24gJiYgKHBhcmFtICE9PSBjb21tb24pKSB7XG4gICAgICAgIHJldCA9IHt9O1xuICAgICAgICBVdGlscy5leHRlbmQocmV0LCBjb21tb24pO1xuICAgICAgICBVdGlscy5leHRlbmQocmV0LCBwYXJhbSk7XG4gICAgICB9XG4gICAgICByZXR1cm4gcmV0O1xuICAgIH0sXG4gICAgcHJvZ3JhbVdpdGhEZXB0aDogZW52LlZNLnByb2dyYW1XaXRoRGVwdGgsXG4gICAgbm9vcDogZW52LlZNLm5vb3AsXG4gICAgY29tcGlsZXJJbmZvOiBudWxsXG4gIH07XG5cbiAgcmV0dXJuIGZ1bmN0aW9uKGNvbnRleHQsIG9wdGlvbnMpIHtcbiAgICBvcHRpb25zID0gb3B0aW9ucyB8fCB7fTtcbiAgICB2YXIgbmFtZXNwYWNlID0gb3B0aW9ucy5wYXJ0aWFsID8gb3B0aW9ucyA6IGVudixcbiAgICAgICAgaGVscGVycyxcbiAgICAgICAgcGFydGlhbHM7XG5cbiAgICBpZiAoIW9wdGlvbnMucGFydGlhbCkge1xuICAgICAgaGVscGVycyA9IG9wdGlvbnMuaGVscGVycztcbiAgICAgIHBhcnRpYWxzID0gb3B0aW9ucy5wYXJ0aWFscztcbiAgICB9XG4gICAgdmFyIHJlc3VsdCA9IHRlbXBsYXRlU3BlYy5jYWxsKFxuICAgICAgICAgIGNvbnRhaW5lcixcbiAgICAgICAgICBuYW1lc3BhY2UsIGNvbnRleHQsXG4gICAgICAgICAgaGVscGVycyxcbiAgICAgICAgICBwYXJ0aWFscyxcbiAgICAgICAgICBvcHRpb25zLmRhdGEpO1xuXG4gICAgaWYgKCFvcHRpb25zLnBhcnRpYWwpIHtcbiAgICAgIGVudi5WTS5jaGVja1JldmlzaW9uKGNvbnRhaW5lci5jb21waWxlckluZm8pO1xuICAgIH1cblxuICAgIHJldHVybiByZXN1bHQ7XG4gIH07XG59XG5cbmV4cG9ydHMudGVtcGxhdGUgPSB0ZW1wbGF0ZTtmdW5jdGlvbiBwcm9ncmFtV2l0aERlcHRoKGksIGZuLCBkYXRhIC8qLCAkZGVwdGggKi8pIHtcbiAgdmFyIGFyZ3MgPSBBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbChhcmd1bWVudHMsIDMpO1xuXG4gIHZhciBwcm9nID0gZnVuY3Rpb24oY29udGV4dCwgb3B0aW9ucykge1xuICAgIG9wdGlvbnMgPSBvcHRpb25zIHx8IHt9O1xuXG4gICAgcmV0dXJuIGZuLmFwcGx5KHRoaXMsIFtjb250ZXh0LCBvcHRpb25zLmRhdGEgfHwgZGF0YV0uY29uY2F0KGFyZ3MpKTtcbiAgfTtcbiAgcHJvZy5wcm9ncmFtID0gaTtcbiAgcHJvZy5kZXB0aCA9IGFyZ3MubGVuZ3RoO1xuICByZXR1cm4gcHJvZztcbn1cblxuZXhwb3J0cy5wcm9ncmFtV2l0aERlcHRoID0gcHJvZ3JhbVdpdGhEZXB0aDtmdW5jdGlvbiBwcm9ncmFtKGksIGZuLCBkYXRhKSB7XG4gIHZhciBwcm9nID0gZnVuY3Rpb24oY29udGV4dCwgb3B0aW9ucykge1xuICAgIG9wdGlvbnMgPSBvcHRpb25zIHx8IHt9O1xuXG4gICAgcmV0dXJuIGZuKGNvbnRleHQsIG9wdGlvbnMuZGF0YSB8fCBkYXRhKTtcbiAgfTtcbiAgcHJvZy5wcm9ncmFtID0gaTtcbiAgcHJvZy5kZXB0aCA9IDA7XG4gIHJldHVybiBwcm9nO1xufVxuXG5leHBvcnRzLnByb2dyYW0gPSBwcm9ncmFtO2Z1bmN0aW9uIGludm9rZVBhcnRpYWwocGFydGlhbCwgbmFtZSwgY29udGV4dCwgaGVscGVycywgcGFydGlhbHMsIGRhdGEpIHtcbiAgdmFyIG9wdGlvbnMgPSB7IHBhcnRpYWw6IHRydWUsIGhlbHBlcnM6IGhlbHBlcnMsIHBhcnRpYWxzOiBwYXJ0aWFscywgZGF0YTogZGF0YSB9O1xuXG4gIGlmKHBhcnRpYWwgPT09IHVuZGVmaW5lZCkge1xuICAgIHRocm93IG5ldyBFeGNlcHRpb24oXCJUaGUgcGFydGlhbCBcIiArIG5hbWUgKyBcIiBjb3VsZCBub3QgYmUgZm91bmRcIik7XG4gIH0gZWxzZSBpZihwYXJ0aWFsIGluc3RhbmNlb2YgRnVuY3Rpb24pIHtcbiAgICByZXR1cm4gcGFydGlhbChjb250ZXh0LCBvcHRpb25zKTtcbiAgfVxufVxuXG5leHBvcnRzLmludm9rZVBhcnRpYWwgPSBpbnZva2VQYXJ0aWFsO2Z1bmN0aW9uIG5vb3AoKSB7IHJldHVybiBcIlwiOyB9XG5cbmV4cG9ydHMubm9vcCA9IG5vb3A7IiwiXCJ1c2Ugc3RyaWN0XCI7XG4vLyBCdWlsZCBvdXQgb3VyIGJhc2ljIFNhZmVTdHJpbmcgdHlwZVxuZnVuY3Rpb24gU2FmZVN0cmluZyhzdHJpbmcpIHtcbiAgdGhpcy5zdHJpbmcgPSBzdHJpbmc7XG59XG5cblNhZmVTdHJpbmcucHJvdG90eXBlLnRvU3RyaW5nID0gZnVuY3Rpb24oKSB7XG4gIHJldHVybiBcIlwiICsgdGhpcy5zdHJpbmc7XG59O1xuXG5leHBvcnRzW1wiZGVmYXVsdFwiXSA9IFNhZmVTdHJpbmc7IiwiXCJ1c2Ugc3RyaWN0XCI7XG4vKmpzaGludCAtVzAwNCAqL1xudmFyIFNhZmVTdHJpbmcgPSByZXF1aXJlKFwiLi9zYWZlLXN0cmluZ1wiKVtcImRlZmF1bHRcIl07XG5cbnZhciBlc2NhcGUgPSB7XG4gIFwiJlwiOiBcIiZhbXA7XCIsXG4gIFwiPFwiOiBcIiZsdDtcIixcbiAgXCI+XCI6IFwiJmd0O1wiLFxuICAnXCInOiBcIiZxdW90O1wiLFxuICBcIidcIjogXCImI3gyNztcIixcbiAgXCJgXCI6IFwiJiN4NjA7XCJcbn07XG5cbnZhciBiYWRDaGFycyA9IC9bJjw+XCInYF0vZztcbnZhciBwb3NzaWJsZSA9IC9bJjw+XCInYF0vO1xuXG5mdW5jdGlvbiBlc2NhcGVDaGFyKGNocikge1xuICByZXR1cm4gZXNjYXBlW2Nocl0gfHwgXCImYW1wO1wiO1xufVxuXG5mdW5jdGlvbiBleHRlbmQob2JqLCB2YWx1ZSkge1xuICBmb3IodmFyIGtleSBpbiB2YWx1ZSkge1xuICAgIGlmKE9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbCh2YWx1ZSwga2V5KSkge1xuICAgICAgb2JqW2tleV0gPSB2YWx1ZVtrZXldO1xuICAgIH1cbiAgfVxufVxuXG5leHBvcnRzLmV4dGVuZCA9IGV4dGVuZDt2YXIgdG9TdHJpbmcgPSBPYmplY3QucHJvdG90eXBlLnRvU3RyaW5nO1xuZXhwb3J0cy50b1N0cmluZyA9IHRvU3RyaW5nO1xuLy8gU291cmNlZCBmcm9tIGxvZGFzaFxuLy8gaHR0cHM6Ly9naXRodWIuY29tL2Jlc3RpZWpzL2xvZGFzaC9ibG9iL21hc3Rlci9MSUNFTlNFLnR4dFxudmFyIGlzRnVuY3Rpb24gPSBmdW5jdGlvbih2YWx1ZSkge1xuICByZXR1cm4gdHlwZW9mIHZhbHVlID09PSAnZnVuY3Rpb24nO1xufTtcbi8vIGZhbGxiYWNrIGZvciBvbGRlciB2ZXJzaW9ucyBvZiBDaHJvbWUgYW5kIFNhZmFyaVxuaWYgKGlzRnVuY3Rpb24oL3gvKSkge1xuICBpc0Z1bmN0aW9uID0gZnVuY3Rpb24odmFsdWUpIHtcbiAgICByZXR1cm4gdHlwZW9mIHZhbHVlID09PSAnZnVuY3Rpb24nICYmIHRvU3RyaW5nLmNhbGwodmFsdWUpID09PSAnW29iamVjdCBGdW5jdGlvbl0nO1xuICB9O1xufVxudmFyIGlzRnVuY3Rpb247XG5leHBvcnRzLmlzRnVuY3Rpb24gPSBpc0Z1bmN0aW9uO1xudmFyIGlzQXJyYXkgPSBBcnJheS5pc0FycmF5IHx8IGZ1bmN0aW9uKHZhbHVlKSB7XG4gIHJldHVybiAodmFsdWUgJiYgdHlwZW9mIHZhbHVlID09PSAnb2JqZWN0JykgPyB0b1N0cmluZy5jYWxsKHZhbHVlKSA9PT0gJ1tvYmplY3QgQXJyYXldJyA6IGZhbHNlO1xufTtcbmV4cG9ydHMuaXNBcnJheSA9IGlzQXJyYXk7XG5cbmZ1bmN0aW9uIGVzY2FwZUV4cHJlc3Npb24oc3RyaW5nKSB7XG4gIC8vIGRvbid0IGVzY2FwZSBTYWZlU3RyaW5ncywgc2luY2UgdGhleSdyZSBhbHJlYWR5IHNhZmVcbiAgaWYgKHN0cmluZyBpbnN0YW5jZW9mIFNhZmVTdHJpbmcpIHtcbiAgICByZXR1cm4gc3RyaW5nLnRvU3RyaW5nKCk7XG4gIH0gZWxzZSBpZiAoIXN0cmluZyAmJiBzdHJpbmcgIT09IDApIHtcbiAgICByZXR1cm4gXCJcIjtcbiAgfVxuXG4gIC8vIEZvcmNlIGEgc3RyaW5nIGNvbnZlcnNpb24gYXMgdGhpcyB3aWxsIGJlIGRvbmUgYnkgdGhlIGFwcGVuZCByZWdhcmRsZXNzIGFuZFxuICAvLyB0aGUgcmVnZXggdGVzdCB3aWxsIGRvIHRoaXMgdHJhbnNwYXJlbnRseSBiZWhpbmQgdGhlIHNjZW5lcywgY2F1c2luZyBpc3N1ZXMgaWZcbiAgLy8gYW4gb2JqZWN0J3MgdG8gc3RyaW5nIGhhcyBlc2NhcGVkIGNoYXJhY3RlcnMgaW4gaXQuXG4gIHN0cmluZyA9IFwiXCIgKyBzdHJpbmc7XG5cbiAgaWYoIXBvc3NpYmxlLnRlc3Qoc3RyaW5nKSkgeyByZXR1cm4gc3RyaW5nOyB9XG4gIHJldHVybiBzdHJpbmcucmVwbGFjZShiYWRDaGFycywgZXNjYXBlQ2hhcik7XG59XG5cbmV4cG9ydHMuZXNjYXBlRXhwcmVzc2lvbiA9IGVzY2FwZUV4cHJlc3Npb247ZnVuY3Rpb24gaXNFbXB0eSh2YWx1ZSkge1xuICBpZiAoIXZhbHVlICYmIHZhbHVlICE9PSAwKSB7XG4gICAgcmV0dXJuIHRydWU7XG4gIH0gZWxzZSBpZiAoaXNBcnJheSh2YWx1ZSkgJiYgdmFsdWUubGVuZ3RoID09PSAwKSB7XG4gICAgcmV0dXJuIHRydWU7XG4gIH0gZWxzZSB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG59XG5cbmV4cG9ydHMuaXNFbXB0eSA9IGlzRW1wdHk7IiwiLy8gQ3JlYXRlIGEgc2ltcGxlIHBhdGggYWxpYXMgdG8gYWxsb3cgYnJvd3NlcmlmeSB0byByZXNvbHZlXG4vLyB0aGUgcnVudGltZSBvbiBhIHN1cHBvcnRlZCBwYXRoLlxubW9kdWxlLmV4cG9ydHMgPSByZXF1aXJlKCcuL2Rpc3QvY2pzL2hhbmRsZWJhcnMucnVudGltZScpO1xuIiwibW9kdWxlLmV4cG9ydHMgPSByZXF1aXJlKFwiaGFuZGxlYmFycy9ydW50aW1lXCIpW1wiZGVmYXVsdFwiXTtcbiIsIi8qKlxuICogQSBjbGllbnQgZm9yIHRoZSBlY2hvLmlvIHNlcnZlclxuICogQGNvbnN0cnVjdG9yXG4gKi9cbnZhciBFY2hvQ2xpZW50ID0gbW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiAoKSB7XG4gIHRoaXMudXJpID0gbnVsbDtcbiAgdGhpcy53cyA9IG51bGw7XG4gIHRoaXMubGFzdFNlbnRUaW1lc3RhbXAgPSBudWxsO1xuICB0aGlzLmxhc3RSZWNlaXZlZFRpbWVzdGFtcCA9IG51bGw7XG4gIHRoaXMuY2FjaGUgPSBudWxsO1xuXG4gIC8vIGhhbmRsZXJzXG4gIHRoaXMub25vcGVuID0gbnVsbDtcbiAgdGhpcy5vbmNsb3NlID0gbnVsbDtcbiAgdGhpcy5vbmVycm9yID0gbnVsbDtcbiAgdGhpcy5vbm1lc3NhZ2UgPSBudWxsO1xuICB0aGlzLm9uaGlzdG9yeSA9IG51bGw7XG59O1xuXG5cbkVjaG9DbGllbnQucHJvdG90eXBlLm9wZW4gPSBmdW5jdGlvbih1cmkpIHtcbiAgdmFyIHNlbGYgPSB0aGlzO1xuXG4gIGZ1bmN0aW9uIGNhbGxIYW5kbGVyKGV2ZW50KSB7XG4gICAgdmFyIGhhbmRsZXIgPSBzZWxmWydvbicgKyBldmVudF07XG4gICAgaWYgKHR5cGVvZiBoYW5kbGVyID09ICdmdW5jdGlvbicpIHtcbiAgICAgIGhhbmRsZXIuYXBwbHkoaGFuZGxlciwgW10uc2xpY2UuY2FsbChhcmd1bWVudHMsIDEpKTtcbiAgICB9XG4gIH1cblxuICBpZiAodGhpcy5pc09wZW4oKSkge1xuICAgIGNvbnNvbGUubG9nKCdlcnJvcjogYWxyZWFkeSBvcGVuIG9uIHVyaSAnICsgdGhpcy51cmkpO1xuICAgIGNhbGxIYW5kbGVyKCdlcnJvcicsICdhbHJlYWR5IG9wZW4gb24gdXJpICcgKyB0aGlzLnVyaSk7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgaWYgKCF0aGlzLnZhbGlkYXRlUG9ydCkge1xuICAgIGNvbnNvbGUubG9nKCdlcnJvcjogaW52YWxpZCBwb3J0OiAnICsgdGhpcy5wb3J0KTtcbiAgICBjYWxsSGFuZGxlcignZXJyb3InLCAnaW52YWxpZCBwb3J0Jyk7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgdGhpcy51cmkgPSB1cmk7XG4gIHRoaXMud3MgPSBuZXcgV2ViU29ja2V0KHVyaSk7XG5cbiAgdGhpcy53cy5vbm9wZW4gPSBmdW5jdGlvbiAoKSB7XG4gICAgY2FsbEhhbmRsZXIoJ29wZW4nKTtcbiAgfTtcblxuICB0aGlzLndzLm9uY2xvc2UgPSBmdW5jdGlvbigpIHtcbiAgICBjYWxsSGFuZGxlcignY2xvc2UnKTtcbiAgfTtcblxuICB0aGlzLndzLm9ubWVzc2FnZSA9IGZ1bmN0aW9uIChtZXNzYWdlRXZlbnQpIHtcbiAgICBzZWxmLmxhc3RSZWNlaXZlZFRpbWVzdGFtcCA9IG5ldyBEYXRlKCkuZ2V0VGltZSgpO1xuXG4gICAgdmFyIG1lc3NhZ2UgPSBKU09OLnBhcnNlKG1lc3NhZ2VFdmVudC5kYXRhKTtcblxuICAgIG1lc3NhZ2UucmVzcG9uc2VUaW1lID0gc2VsZi5sYXN0UmVjZWl2ZWRUaW1lc3RhbXAgLSBzZWxmLmxhc3RTZW50VGltZXN0YW1wO1xuXG4gICAgLy9pZiAobWVzc2FnZS5tZXNzYWdlcy5sZW5ndGggPiAxKSB7XG4gICAgaWYgKG1lc3NhZ2UudHlwZSA9PSAnaGlzdG9yeScpIHtcbiAgICAgIC8vIHRoaXMgaXMgYSBoaXN0b3J5IG1lc3NhZ2VcbiAgICAgIC8vIGNhY2hlIGl0IGluIGNhc2UgdGhlIHVzZXIgd2FudHMgdG8gZmlsdGVyXG4gICAgICAvLyAobm8gbmVlZCBmb3IgYW5vdGhlciByb3VuZCB0cmlwKVxuICAgICAgc2VsZi5jYWNoZSA9IG1lc3NhZ2U7XG4gICAgICBjYWxsSGFuZGxlcignaGlzdG9yeScsIG1lc3NhZ2UpO1xuICAgIH0gZWxzZSB7XG4gICAgICAvLyBjYWNoZSBpcyBub3cgc3RhbGUsIHNvIGp1c3QgY2xlYXIgaXRcbiAgICAgIHNlbGYuY2FjaGUgPSBudWxsO1xuICAgICAgY2FsbEhhbmRsZXIoJ21lc3NhZ2UnLCBtZXNzYWdlKTtcbiAgICB9XG4gIH07XG5cbiAgdGhpcy53cy5vbmVycm9yID0gZnVuY3Rpb24gKGVycikge1xuICAgIGNhbGxIYW5kbGVyKCdlcnJvcicsIGVycik7XG4gIH07XG59O1xuXG5cbkVjaG9DbGllbnQucHJvdG90eXBlLmNsb3NlID0gZnVuY3Rpb24oKSB7XG4gIGlmICh0aGlzLmlzQ2xvc2VkKCkpIHtcbiAgICBjb25zb2xlLmxvZygnYWxyZWFkeSBjbG9zZWQnKTtcbiAgICByZXR1cm47XG4gIH1cblxuICB0aGlzLndzLmNsb3NlKCk7XG4gIHRoaXMud3MgPSBudWxsO1xuICB0aGlzLnVyaSA9IG51bGw7XG59O1xuXG5cbkVjaG9DbGllbnQucHJvdG90eXBlLmlzT3BlbiA9IGZ1bmN0aW9uKCkge1xuICByZXR1cm4gdGhpcy53cyBpbnN0YW5jZW9mIFdlYlNvY2tldDtcbn07XG5cblxuRWNob0NsaWVudC5wcm90b3R5cGUuaXNDbG9zZWQgPSBmdW5jdGlvbigpIHtcbiAgcmV0dXJuICF0aGlzLmlzT3BlbigpO1xufTtcblxuXG5FY2hvQ2xpZW50LnByb3RvdHlwZS5zZW5kID0gZnVuY3Rpb24gKG1lc3NhZ2UpIHtcbiAgaWYgKCFtZXNzYWdlIHx8ICF0aGlzLmlzT3BlbigpKSByZXR1cm47XG4gIHRoaXMubGFzdFNlbnRUaW1lc3RhbXAgPSBuZXcgRGF0ZSgpLmdldFRpbWUoKTtcbiAgdGhpcy53cy5zZW5kKG1lc3NhZ2UpO1xufTtcblxuXG5FY2hvQ2xpZW50LnByb3RvdHlwZS5zZW5kSGlzdG9yeUNvbW1hbmQgPSBmdW5jdGlvbiAoKSB7XG4gIHRoaXMuc2VuZCgnW0hJU1RPUlldJyk7XG59O1xuXG5cbkVjaG9DbGllbnQucHJvdG90eXBlLmhpc3RvcnlGaWx0ZXIgPSBmdW5jdGlvbihwYXR0ZXJuKSB7XG4gIGlmICghdGhpcy5jYWNoZSB8fCAhdGhpcy5pc09wZW4oKSkgcmV0dXJuIFtdO1xuICBpZiAoIXBhdHRlcm4pIHJldHVybiB0aGlzLmNhY2hlO1xuXG4gIHZhciByZWdleCA9IG5ldyBSZWdFeHAocGF0dGVybiwgXCJpXCIpO1xuICB2YXIgZmlsdGVyZWQgPSBfLmZpbHRlcih0aGlzLmNhY2hlLm1lc3NhZ2VzLCBmdW5jdGlvbihtZXNzYWdlKSB7XG4gICAgcmV0dXJuIHJlZ2V4LnRlc3QobWVzc2FnZSk7XG4gIH0pO1xuXG4gIHJldHVybiB7XG4gICAgc3RhdHVzOiB0aGlzLmNhY2hlLnN0YXR1cyxcbiAgICByZXNwb25zZVRpbWU6IHRoaXMuY2FjaGUucmVzcG9uc2VUaW1lLFxuICAgIG1lc3NhZ2VzOiBmaWx0ZXJlZFxuICB9XG59O1xuXG5cbkVjaG9DbGllbnQucHJvdG90eXBlLnZhbGlkYXRlUG9ydCA9IGZ1bmN0aW9uKHBvcnQpIHtcbiAgcmV0dXJuIHBvcnQgPj0gMTAyNCAmJiBwb3J0IDwgNjU1MzU7XG59O1xuXG4iLCJtb2R1bGUuZXhwb3J0cyA9IHtcbiAgc3RhcnQ6IGZ1bmN0aW9uICgpIHtcbiAgICAvLyBtb2RlbHNcbiAgICB2YXIgQXBwID0gcmVxdWlyZSgnLi9tb2RlbHMvQXBwJylcbiAgICAgIDtcblxuICAgIC8vIHZpZXdzXG4gICAgdmFyIFNlcnZlckNvbnRyb2xWaWV3ID0gcmVxdWlyZSgnLi92aWV3cy9TZXJ2ZXJDb250cm9sVmlldycpXG4gICAgICAsIE1lc3NhZ2VQYW5lbFZpZXcgPSByZXF1aXJlKCcuL3ZpZXdzL01lc3NhZ2VQYW5lbFZpZXcnKVxuICAgICAgO1xuXG5cbiAgICB2YXIgYXBwID0gbmV3IEFwcCgpO1xuXG4gICAgLy8gd2lyZSB1cCB2aWV3c1xuICAgIC8vIGp1c3QgY3JlYXRpbmcgdGhlbSB3b3JrcyBzaW5jZSB0aGV5IHdpcmVcbiAgICAvLyB1cCB0aGUgcGFnZSBhbmQgcmVuZGVyIHdoZW4gaW5pdGlhbGl6ZWRcblxuICAgIG5ldyBTZXJ2ZXJDb250cm9sVmlldyh7XG4gICAgICBtb2RlbDogYXBwLFxuICAgICAgZWw6ICcjc2VydmVyLWNvbnRyb2wnXG4gICAgfSk7XG5cbiAgICBuZXcgTWVzc2FnZVBhbmVsVmlldyh7XG4gICAgICBtb2RlbDogYXBwLFxuICAgICAgZWw6ICcjbWVzc2FnZS1wYW5lbCdcbiAgICB9KTtcblxuICAgIC8vIGFsbCB3aXJlZCB1cCB0byB0aGUgcGFnZSBhbmQgcmVhZHkgZm9yIHVzZXIgaW5wdXRcbiAgfVxufTtcblxuXG4iLCJ2YXIgRWNob0NsaWVudCA9IHJlcXVpcmUoJy4vLi4vbGlicy9lY2hvY2xpZW50JylcbiAgLCBFY2hvUmVzcG9uc2UgPSByZXF1aXJlKCcuL0VjaG9SZXNwb25zZScpXG4gIDtcblxuLyoqXG4gKiBUaGUgQXBwIG1vZGVsIHByb3ZpZGVzIGEgYmFja2JvbmUgd3JhcHBlciBvdmVyIEVjaG9DbGllbnQgYW5kIHNlcnZlciBmdW5jdGlvbnNcbiAqL1xudmFyIEFwcCA9IEJhY2tib25lLk1vZGVsLmV4dGVuZCh7XG4gIGRlZmF1bHRzOiB7XG4gICAgaG9zdDogJ2xvY2FsaG9zdCcsXG4gICAgcG9ydDogNTU1NSxcbiAgICBzZXJ2ZXJTdGF0ZTogJ3N0b3BwZWQnXG4gIH0sXG5cbiAgaW5pdGlhbGl6ZTogZnVuY3Rpb24oKSB7XG4gICAgdGhpcy5jbGllbnQgPSBuZXcgRWNob0NsaWVudCgpO1xuXG4gICAgLy8gc3luYyB1cCB3aXRoIHNlcnZlciBzdGF0dXNcbiAgICB0aGlzLmNoZWNrU2VydmVyU3RhdHVzKCk7XG4gIH0sXG5cbiAgdmFsaWRhdGU6IGZ1bmN0aW9uKGF0dHJzKSB7XG4gICAgaWYgKCF0aGlzLmNsaWVudC52YWxpZGF0ZVBvcnQoYXR0cnMucG9ydCkpIHtcbiAgICAgIHJldHVybiAnaW52YWxpZCBwb3J0JztcbiAgICB9XG4gIH0sXG5cbiAgY2hlY2tTZXJ2ZXJTdGF0dXM6IGZ1bmN0aW9uKCkge1xuICAgIHZhciBzZWxmID0gdGhpcztcblxuICAgICQuZ2V0SlNPTignL2FwaS92MS9lY2hvc2VydmVyLycgKyB0aGlzLmdldCgncG9ydCcpLCBmdW5jdGlvbiAocmVzdWx0KSB7XG4gICAgICBpZiAocmVzdWx0ICYmIHJlc3VsdC5zdGF0dXMgPT0gJ2Vycm9yJykge1xuICAgICAgICBzZWxmLnRyaWdnZXIoJ3NlcnZlckVycm9yJywgcmVzdWx0Lm1lc3NhZ2UpO1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG5cbiAgICAgIGlmIChyZXN1bHQgJiYgcmVzdWx0LnN0YXR1cyA9PSAnT0snICYmIC9zdGFydGVkLy50ZXN0KHJlc3VsdC5tZXNzYWdlKSkge1xuICAgICAgICBzZWxmLnNldCgnc2VydmVyU3RhdGUnLCAnc3RhcnRlZCcpO1xuXG4gICAgICAgIC8vIGdvIGFoZWFkIGFuZCBvcGVuIGEgY2xpZW50IGlmIHRoZSBzZXJ2ZXIgaXMgbGlzdGVuaW5nXG4gICAgICAgIHNlbGYub3BlbigpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgc2VsZi5zZXQoJ3NlcnZlclN0YXRlJywgJ3N0b3BwZWQnKTtcbiAgICAgIH1cbiAgICB9KTtcbiAgfSxcblxuICBzdGFydFNlcnZlcjogZnVuY3Rpb24oKSB7XG4gICAgaWYgKCF0aGlzLmlzVmFsaWQoKSkgcmV0dXJuO1xuICAgIHRoaXMuc2VuZFNlcnZlckNvbW1hbmQoJ3N0YXJ0Jyk7XG4gIH0sXG5cbiAgc3RvcFNlcnZlcjogZnVuY3Rpb24oKSB7XG4gICAgaWYgKCF0aGlzLmlzVmFsaWQoKSkgcmV0dXJuO1xuICAgIHRoaXMuc2VuZFNlcnZlckNvbW1hbmQoJ3N0b3AnKTtcbiAgfSxcblxuICBzZW5kU2VydmVyQ29tbWFuZDogZnVuY3Rpb24oY29tbWFuZCkge1xuICAgIGlmICghdGhpcy5pc1ZhbGlkKCkpIHJldHVybjtcblxuICAgIHRoaXMuc2V0KCdzZXJ2ZXJFcnJvcicsICcnKTtcblxuICAgIHZhciBwb3J0ID0gdGhpcy5nZXQoJ3BvcnQnKTtcbiAgICB2YXIgc2VsZiA9IHRoaXM7XG5cbiAgICAkLnBvc3QoJy9hcGkvdjEvZWNob3NlcnZlci8nICsgcG9ydCArICcvJyArIGNvbW1hbmQsIGZ1bmN0aW9uIChyZXN1bHQpIHtcbiAgICAgIGlmIChyZXN1bHQgJiYgcmVzdWx0LnN0YXR1cyA9PSAnZXJyb3InKSB7XG4gICAgICAgIHNlbGYudHJpZ2dlcignc2VydmVyRXJyb3InLCByZXN1bHQubWVzc2FnZSk7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cblxuICAgICAgdmFyIHN0YXJ0ZWQgPSAvc3RhcnRlZC8udGVzdChyZXN1bHQubWVzc2FnZSwgXCJpXCIpO1xuXG4gICAgICAvLyBvbmNlIHRoZSBzZXJ2ZXIgaXMgc3RhcnRlZCwgb3BlbiBhIGNsaWVudCBjb25uZWN0aW9uXG4gICAgICBpZiAoc3RhcnRlZCkge1xuICAgICAgICBzZWxmLnNldCgnc2VydmVyU3RhdGUnLCAnc3RhcnRlZCcpO1xuICAgICAgICBzZWxmLm9wZW4oKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHNlbGYuc2V0KCdzZXJ2ZXJTdGF0ZScsICdzdG9wcGVkJyk7XG4gICAgICAgIHNlbGYuY2xvc2UoKTtcbiAgICAgIH1cbiAgICB9KTtcbiAgfSxcblxuICBvcGVuOiBmdW5jdGlvbigpIHtcbiAgICBpZiAodGhpcy5jbGllbnQuaXNPcGVuKCkpIHJldHVybjtcblxuICAgIHZhciBzZWxmID0gdGhpcztcblxuICAgIHNlbGYuY2xpZW50Lm9ub3BlbiA9IGZ1bmN0aW9uKCkge1xuICAgICAgc2VsZi50cmlnZ2VyKCdvcGVuJyk7XG4gICAgfTtcblxuICAgIHNlbGYuY2xpZW50Lm9uY2xvc2UgPSBmdW5jdGlvbigpIHtcbiAgICAgIC8vIHJlbGVhc2UgaGFuZGxlcnNcbiAgICAgIHNlbGYuY2xpZW50Lm9ub3BlbiA9IG51bGw7XG4gICAgICBzZWxmLmNsaWVudC5vbmNsb3NlID0gbnVsbDtcbiAgICAgIHNlbGYuY2xpZW50Lm9uZXJyb3IgPSBudWxsO1xuICAgICAgc2VsZi5jbGllbnQub25tZXNzYWdlID0gbnVsbDtcbiAgICAgIHNlbGYuY2xpZW50Lm9uaGlzdG9yeSA9IG51bGw7XG5cbiAgICAgIHNlbGYudHJpZ2dlcignY2xvc2UnKTtcbiAgICB9O1xuXG4gICAgc2VsZi5jbGllbnQub25lcnJvciA9IGZ1bmN0aW9uKGVycikge1xuICAgICAgc2VsZi50cmlnZ2VyKCdlcnJvcicsIGVycik7XG4gICAgfTtcblxuICAgIHNlbGYuY2xpZW50Lm9ubWVzc2FnZSA9IGZ1bmN0aW9uKHJlc3BvbnNlKSB7XG4gICAgICB2YXIgZXIgPSBuZXcgRWNob1Jlc3BvbnNlKHJlc3BvbnNlKTtcbiAgICAgIHNlbGYudHJpZ2dlcignbWVzc2FnZScsIGVyKTtcbiAgICB9O1xuXG4gICAgc2VsZi5jbGllbnQub25oaXN0b3J5ID0gZnVuY3Rpb24ocmVzcG9uc2UpIHtcbiAgICAgIHZhciBlciA9IG5ldyBFY2hvUmVzcG9uc2UocmVzcG9uc2UpO1xuICAgICAgc2VsZi50cmlnZ2VyKCdoaXN0b3J5JywgZXIpO1xuICAgIH07XG5cbiAgICB2YXIgdXJpID0gJ3dzOi8vJyArIHRoaXMuZ2V0KCdob3N0JykgKyAnOicgKyB0aGlzLmdldCgncG9ydCcpO1xuICAgIHRoaXMuY2xpZW50Lm9wZW4odXJpKTtcbiAgfSxcblxuICBjbG9zZTogZnVuY3Rpb24oKSB7XG4gICAgaWYgKHRoaXMuY2xpZW50LmlzQ2xvc2VkKCkpIHJldHVybjtcbiAgICB0aGlzLmNsaWVudC5jbG9zZSgpO1xuICB9LFxuXG4gIHNlbmQ6IGZ1bmN0aW9uKG1lc3NhZ2UpIHtcbiAgICBpZiAoIXRoaXMuY2xpZW50LmlzT3BlbigpKSByZXR1cm47XG4gICAgdGhpcy5jbGllbnQuc2VuZChtZXNzYWdlKTtcbiAgfSxcblxuICBzZW5kSGlzdG9yeUNvbW1hbmQ6IGZ1bmN0aW9uKCkge1xuICAgIC8vIGp1c3QgYSBzaG9ydGN1dCBmb3IgZW50ZXJpbmcgJ1tISVNUT1JZXSdcbiAgICBpZiAoIXRoaXMuY2xpZW50LmlzT3BlbigpKSByZXR1cm47XG4gICAgdGhpcy5jbGllbnQuc2VuZEhpc3RvcnlDb21tYW5kKCk7XG4gIH0sXG5cbiAgaGlzdG9yeUZpbHRlcjogZnVuY3Rpb24ocGF0dGVybikge1xuICAgIHJldHVybiB0aGlzLmNsaWVudC5oaXN0b3J5RmlsdGVyKHBhdHRlcm4pO1xuICB9XG59KTtcblxubW9kdWxlLmV4cG9ydHMgPSBBcHA7XG5cbiIsInZhciBFY2hvUmVzcG9uc2UgPSBCYWNrYm9uZS5Nb2RlbC5leHRlbmQoe1xuICBkZWZhdWx0czoge1xuICAgIHN0YXR1czogJycsXG4gICAgcmVzcG9uc2VUaW1lOiBuZXcgRGF0ZSgpLmdldFRpbWUoKSxcbiAgICB0eXBlOiAnbWVzc2FnZScsXG4gICAgbWVzc2FnZXM6IFsgJycgXVxuICB9LFxuXG4gIHRvRGlzcGxheVN0cmluZzogZnVuY3Rpb24oKSB7XG4gICAgLy8gaWYgbm90IGEgbWVzc2FnZSByZXNwb25zZSAoc3VjaCBhcyBhIGhpc3RvcnkgcmVzcG9uc2UpLFxuICAgIC8vIHRoZW4gb25seSBkaXNwbGF5IHRoZSByZXNwb25zZSB0aW1lXG4gICAgcmV0dXJuIHRoaXMuZ2V0KCd0eXBlJykgIT0gJ21lc3NhZ2UnXG4gICAgICA/ICdbcmVzcG9uc2VdICcgKyB0aGlzLmdldCgncmVzcG9uc2VUaW1lJykgKyAnbXMnXG4gICAgICA6ICdcIicgKyB0aGlzLmdldCgnbWVzc2FnZXMnKVswXSArICdcIiwgJyArIHRoaXMuZ2V0KCdyZXNwb25zZVRpbWUnKSArICdtcyc7XG4gIH1cbn0pO1xuXG5tb2R1bGUuZXhwb3J0cyA9IEVjaG9SZXNwb25zZTsiLCJ2YXIgRWNob1Jlc3BvbnNlID0gcmVxdWlyZSgnLi8uLi9tb2RlbHMvRWNob1Jlc3BvbnNlJyk7XG5cbm1vZHVsZS5leHBvcnRzID0gQmFja2JvbmUuVmlldy5leHRlbmQoe1xuICBpbml0aWFsaXplOiBmdW5jdGlvbihvcHRpb25zKSB7XG4gICAgdmFyIHNlbGYgPSB0aGlzO1xuXG4gICAgdGhpcy5yZW5kZXIoKTtcblxuICAgIHRoaXMubW9kZWwub24oJ2hpc3RvcnknLCBmdW5jdGlvbihyZXNwb25zZSkge1xuICAgICAgc2VsZi5yZW5kZXIocmVzcG9uc2UpO1xuICAgIH0pO1xuICB9LFxuXG4gIGV2ZW50czoge1xuICAgICdpbnB1dCAjc2VhcmNoZmlsdGVyJzogJ2ZpbHRlck1lc3NhZ2VzJyxcbiAgICAnY2xpY2sgI2J0bmdldGhpc3RvcnknOiAnZ2V0SGlzdG9yeSdcbiAgfSxcblxuICB0ZW1wbGF0ZTogcmVxdWlyZSgnLi90ZW1wbGF0ZXMvbWVzc2FnZS1oaXN0b3J5LmhicycpLFxuXG4gIHJlbmRlcjogZnVuY3Rpb24oKSB7XG4gICAgdmFyIHJlc3BvbnNlID0gYXJndW1lbnRzWzBdIHx8IFtdO1xuXG4gICAgLy8gdGhlIGNoZWNrIGlzIGJlY2F1c2UgY2FjaGVkIG1lc3NhZ2VzIGZyb20gdGhlIHNlcnZlciBhcmVuJ3RcbiAgICAvLyB3cmFwcGVkIGluIEVjaG9SZXNwb25zZSBiYWNrYm9uZSBvYmplY3RzLCBqdXN0IHBvam9zXG4gICAgdmFyIG1lc3NhZ2VzID0gcmVzcG9uc2UgaW5zdGFuY2VvZiBFY2hvUmVzcG9uc2VcbiAgICAgID8gcmVzcG9uc2UudG9KU09OKCkubWVzc2FnZXNcbiAgICAgIDogcmVzcG9uc2UubWVzc2FnZXM7XG5cbiAgICB2YXIgYXJncyA9IHtcbiAgICAgIG1lc3NhZ2VzOiBtZXNzYWdlc1xuICAgIH07XG5cbiAgICB0aGlzLiRlbC5odG1sKHRoaXMudGVtcGxhdGUoYXJncykpO1xuXG4gICAgdGhpcy5maWx0ZXJQYXR0ZXJuKHRoaXMucGF0dGVybik7XG5cbiAgICByZXR1cm4gdGhpcztcbiAgfSxcblxuICBnZXRIaXN0b3J5OiBmdW5jdGlvbigpIHtcbiAgICAvLyBqdXN0IGEgc2hvcnRjdXQgZm9yIGVudGVyaW5nICdbSElTVE9SWV0nXG4gICAgdGhpcy5tb2RlbC5zZW5kSGlzdG9yeUNvbW1hbmQoKTtcbiAgfSxcblxuICBmaWx0ZXJQYXR0ZXJuOiBmdW5jdGlvbigpIHtcbiAgICBpZiAoYXJndW1lbnRzLmxlbmd0aCA9PSAwKSB7XG4gICAgICByZXR1cm4gJCgnI3NlYXJjaGZpbHRlcicpLnZhbCgpO1xuICAgIH0gZWxzZSB7XG4gICAgICAkKCcjc2VhcmNoZmlsdGVyJykudmFsKGFyZ3VtZW50c1swXSk7XG4gICAgICAkKCcjc2VhcmNoZmlsdGVyJykuZm9jdXMoKTtcbiAgICB9XG4gIH0sXG5cbiAgZmlsdGVyTWVzc2FnZXM6IGZ1bmN0aW9uKCkge1xuICAgIHRoaXMucGF0dGVybiA9IHRoaXMuZmlsdGVyUGF0dGVybigpO1xuICAgIHZhciBmaWx0ZXJlZCA9IHRoaXMubW9kZWwuaGlzdG9yeUZpbHRlcih0aGlzLnBhdHRlcm4pO1xuICAgIHRoaXMucmVuZGVyKGZpbHRlcmVkKTtcbiAgfVxufSk7IiwidmFyIE1lc3NhZ2VTZW5kVmlldyA9IHJlcXVpcmUoJy4vTWVzc2FnZVNlbmRWaWV3JylcbiAgLCBNZXNzYWdlUmVjZWl2ZVZpZXcgPSByZXF1aXJlKCcuL01lc3NhZ2VSZWNlaXZlVmlldycpXG4gICwgTWVzc2FnZUhpc3RvcnlWaWV3ID0gcmVxdWlyZSgnLi9NZXNzYWdlSGlzdG9yeVZpZXcnKVxuICA7XG5cbm1vZHVsZS5leHBvcnRzID0gQmFja2JvbmUuVmlldy5leHRlbmQoe1xuICBpbml0aWFsaXplOiBmdW5jdGlvbiAoKSB7XG5cbiAgICB0aGlzLnNlbmRWaWV3ID0gbmV3IE1lc3NhZ2VTZW5kVmlldyh7XG4gICAgICBtb2RlbDogdGhpcy5tb2RlbFxuICAgIH0pO1xuXG4gICAgdGhpcy5yZWNlaXZlVmlldyA9IG5ldyBNZXNzYWdlUmVjZWl2ZVZpZXcoe1xuICAgICAgbW9kZWw6IHRoaXMubW9kZWxcbiAgICB9KTtcblxuICAgIHRoaXMuaGlzdG9yeVZpZXcgPSBuZXcgTWVzc2FnZUhpc3RvcnlWaWV3KHtcbiAgICAgIG1vZGVsOiB0aGlzLm1vZGVsLFxuICAgICAgZWw6ICcjbWVzc2FnZS1oaXN0b3J5J1xuICAgIH0pO1xuXG4gICAgdGhpcy5yZW5kZXIoKTtcblxuICAgIHRoaXMubGlzdGVuVG8odGhpcy5tb2RlbCwgJ2NoYW5nZTpzZXJ2ZXJTdGF0ZScsIHRoaXMucmVuZGVyKTtcbiAgfSxcblxuICB0ZW1wbGF0ZTogcmVxdWlyZSgnLi90ZW1wbGF0ZXMvbWVzc2FnZS1wYW5lbC5oYnMnKSxcblxuICByZW5kZXI6IGZ1bmN0aW9uICgpIHtcbiAgICB2YXIgc2VydmVyU3RhdGUgPSB0aGlzLm1vZGVsLmdldCgnc2VydmVyU3RhdGUnKTtcblxuICAgIHZhciBhcmdzID0ge1xuICAgICAgaGlkZGVuOiBzZXJ2ZXJTdGF0ZSA9PSAnc3RhcnRlZCcgPyAndmlzaWJsZScgOiAnY29sbGFwc2UnXG4gICAgfTtcblxuICAgIHRoaXMuJGVsLmh0bWwodGhpcy50ZW1wbGF0ZShhcmdzKSk7XG5cbiAgICB0aGlzLnNlbmRWaWV3LnNldEVsZW1lbnQodGhpcy4kKCcjbWVzc2FnZS1zZW5kJykpLnJlbmRlcigpO1xuICAgIHRoaXMucmVjZWl2ZVZpZXcuc2V0RWxlbWVudCh0aGlzLiQoJyNtZXNzYWdlLXJlY2VpdmUnKSkucmVuZGVyKCk7XG4gICAgdGhpcy5oaXN0b3J5Vmlldy5zZXRFbGVtZW50KHRoaXMuJCgnI21lc3NhZ2UtaGlzdG9yeScpKS5yZW5kZXIoKTtcblxuICAgIHJldHVybiB0aGlzO1xuICB9XG5cbn0pO1xuIiwidmFyIEVjaG9SZXNwb25zZSA9IHJlcXVpcmUoJy4vLi4vbW9kZWxzL0VjaG9SZXNwb25zZScpO1xuXG5tb2R1bGUuZXhwb3J0cyA9IEJhY2tib25lLlZpZXcuZXh0ZW5kKHtcbiAgaW5pdGlhbGl6ZTogZnVuY3Rpb24oKSB7XG4gICAgdmFyIHNlbGYgPSB0aGlzO1xuXG4gICAgdGhpcy5yZW5kZXIoKTtcblxuICAgIHRoaXMubW9kZWwub24oJ21lc3NhZ2UgaGlzdG9yeScsIGZ1bmN0aW9uKHJlc3BvbnNlKSB7XG4gICAgICBzZWxmLnJlbmRlcihyZXNwb25zZSk7XG4gICAgfSlcbiAgfSxcblxuICB0ZW1wbGF0ZTogcmVxdWlyZSgnLi90ZW1wbGF0ZXMvbWVzc2FnZS1yZWNlaXZlLmhicycpLFxuXG4gIHJlbmRlcjogZnVuY3Rpb24oKSB7XG4gICAgdmFyIHJlc3BvbnNlID0gYXJndW1lbnRzWzBdO1xuICAgIGlmICghKHJlc3BvbnNlIGluc3RhbmNlb2YgRWNob1Jlc3BvbnNlKSkgcmV0dXJuO1xuXG4gICAgdmFyIGFyZ3MgPSB7XG4gICAgICBtZXNzYWdlOiByZXNwb25zZS50b0Rpc3BsYXlTdHJpbmcoKVxuICAgIH07XG5cbiAgICB0aGlzLiRlbC5odG1sKHRoaXMudGVtcGxhdGUoYXJncykpO1xuXG4gICAgcmV0dXJuIHRoaXM7XG4gIH1cbn0pOyIsIm1vZHVsZS5leHBvcnRzID0gQmFja2JvbmUuVmlldy5leHRlbmQoe1xuICBpbml0aWFsaXplOiBmdW5jdGlvbigpIHtcbiAgICB0aGlzLnJlbmRlcigpO1xuICB9LFxuXG4gIGV2ZW50czoge1xuICAgICdjbGljayAjYnRuc2VuZG1lc3NhZ2UnOiAnc2VuZE1lc3NhZ2UnLFxuICAgICdpbnB1dCAjbWVzc2FnZSc6ICd0b2dnbGVFbmFibGVCdXR0b24nXG4gIH0sXG5cbiAgdGVtcGxhdGU6IHJlcXVpcmUoJy4vdGVtcGxhdGVzL21lc3NhZ2Utc2VuZC5oYnMnKSxcblxuICByZW5kZXI6IGZ1bmN0aW9uKCkge1xuICAgIHZhciBhcmdzID0ge1xuICAgIH07XG5cbiAgICB0aGlzLiRlbC5odG1sKHRoaXMudGVtcGxhdGUoYXJncykpO1xuXG4gICAgcmV0dXJuIHRoaXM7XG4gIH0sXG5cbiAgbWVzc2FnZVRleHQ6IGZ1bmN0aW9uKCkge1xuICAgIGlmIChhcmd1bWVudHMubGVuZ3RoID09IDApIHtcbiAgICAgIHJldHVybiAkKCcjbWVzc2FnZScpLnZhbCgpO1xuICAgIH0gZWxzZSB7XG4gICAgICAkKCcjbWVzc2FnZScpLnZhbChhcmd1bWVudHNbMF0pO1xuICAgIH1cbiAgfSxcblxuICB0b2dnbGVFbmFibGVCdXR0b246IGZ1bmN0aW9uKCkge1xuICAgIGlmICh0aGlzLm1lc3NhZ2VUZXh0KCkpIHtcbiAgICAgIGNvbnNvbGUubG9nKCd2YWx1ZScpO1xuICAgICAgJCgnI2J0bnNlbmRtZXNzYWdlJykucmVtb3ZlQ2xhc3MoJ2Rpc2FibGVkJyk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGNvbnNvbGUubG9nKCdlbXB0eScpO1xuICAgICAgJCgnI2J0bnNlbmRtZXNzYWdlJykuYWRkQ2xhc3MoJ2Rpc2FibGVkJyk7XG4gICAgfVxuICB9LFxuXG4gIHNlbmRNZXNzYWdlOiBmdW5jdGlvbigpIHtcbiAgICB2YXIgbWVzc2FnZSA9IHRoaXMubWVzc2FnZVRleHQoKTtcbiAgICBpZiAobWVzc2FnZSkgdGhpcy5tb2RlbC5zZW5kKG1lc3NhZ2UpO1xuICAgIHRoaXMubWVzc2FnZVRleHQoJycpO1xuICB9XG59KTtcbiIsIm1vZHVsZS5leHBvcnRzID0gQmFja2JvbmUuVmlldy5leHRlbmQoe1xuICBzZXJ2ZXJFcnJvck1lc3NhZ2U6IG51bGwsXG5cbiAgaW5pdGlhbGl6ZTogZnVuY3Rpb24oKSB7XG4gICAgdmFyIHNlbGYgPSB0aGlzO1xuXG4gICAgdGhpcy5yZW5kZXIoKTtcblxuICAgIHRoaXMubGlzdGVuVG8odGhpcy5tb2RlbCwgJ2NoYW5nZTpzZXJ2ZXJTdGF0ZScsIHRoaXMucmVuZGVyKTtcblxuICAgIHRoaXMubW9kZWwub24oJ3NlcnZlckVycm9yJywgZnVuY3Rpb24oZXJyKSB7XG4gICAgICBzZWxmLnNlcnZlckVycm9yID0gZXJyO1xuICAgICAgc2VsZi5yZW5kZXIoKTtcbiAgICB9KVxuICB9LFxuXG4gIGV2ZW50czoge1xuICAgICdjbGljayAjYnRuc2VydmVyJzogJ3RvZ2dsZXN0YXJ0J1xuICB9LFxuXG4gIC8vdGVtcGxhdGU6IEhhbmRsZWJhcnMuY29tcGlsZSgkKCcjc2VydmVyLWNvbnRyb2wtdGVtcGxhdGUnKS5odG1sKCkpLFxuICB0ZW1wbGF0ZTogcmVxdWlyZSgnLi90ZW1wbGF0ZXMvc2VydmVyLWNvbnRyb2wuaGJzJyksXG5cbiAgcmVuZGVyOiBmdW5jdGlvbigpIHtcbiAgICB2YXIgcG9ydCA9IHRoaXMubW9kZWwuZ2V0KCdwb3J0Jyk7XG4gICAgdmFyIHNlcnZlclN0YXRlID0gdGhpcy5tb2RlbC5nZXQoJ3NlcnZlclN0YXRlJyk7XG4gICAgdmFyIHNlcnZlclN0YXRlVGV4dCA9IHNlcnZlclN0YXRlID09ICdzdGFydGVkJ1xuICAgICAgPyAnc3RhcnRlZCAocG9ydCAnICsgcG9ydCArICcpJ1xuICAgICAgOiBzZXJ2ZXJTdGF0ZTtcbiAgICB2YXIgc2VydmVyRXJyb3IgPSB0aGlzLnNlcnZlckVycm9yID8gJyBFcnJvcjogJyArIHRoaXMuc2VydmVyRXJyb3IgOiBudWxsO1xuICAgIHZhciBzZXJ2ZXJFcnJvckNsYXNzID0gc2VydmVyRXJyb3IgPyAndmlzaWJsZScgOiAnaGlkZGVuJztcblxuICAgIHZhciBhcmdzID0ge1xuICAgICAgc3RhdGVDbGFzczogc2VydmVyU3RhdGUsXG4gICAgICBzZXJ2ZXJTdGF0ZTogc2VydmVyU3RhdGVUZXh0LFxuICAgICAgc2VydmVyUG9ydDogcG9ydCxcbiAgICAgIGlucHV0VmlzaWJpbGl0eTogc2VydmVyU3RhdGUgPT0gJ3N0YXJ0ZWQnID8gJ2NvbGxhcHNlJyA6ICd2aXNpYmxlJyxcbiAgICAgIHNlcnZlckNvbW1hbmQ6IHNlcnZlclN0YXRlID09ICdzdGFydGVkJyA/ICdTdG9wJyA6ICdTdGFydCcsXG4gICAgICBzZXJ2ZXJFcnJvckNsYXNzOiBzZXJ2ZXJFcnJvckNsYXNzLFxuICAgICAgc2VydmVyRXJyb3I6IHNlcnZlckVycm9yXG4gICAgfTtcblxuICAgIHRoaXMuJGVsLmh0bWwodGhpcy50ZW1wbGF0ZShhcmdzKSk7XG5cbiAgICAkKCcjcG9ydG51bWJlcicpLmZvY3VzKCk7XG5cbiAgICByZXR1cm4gdGhpcztcbiAgfSxcblxuICBwb3J0OiBmdW5jdGlvbigpIHtcbiAgICByZXR1cm4gJCgnI3BvcnRudW1iZXInKS52YWwoKTtcbiAgfSxcblxuICB0b2dnbGVzdGFydDogZnVuY3Rpb24oKSB7XG4gICAgLy8gY2xlYXIgcHJldmlvdXMgZXJyb3IgbWVzc2FnZVxuICAgIHRoaXMuc2VydmVyRXJyb3IgPSBudWxsO1xuICAgICQoJyNzZXJ2ZXItZXJyb3InKS5odG1sKCcnKTtcblxuICAgIHZhciBwb3J0ID0gdGhpcy5wb3J0KCk7XG4gICAgdGhpcy5tb2RlbC5zZXQoJ3BvcnQnLCBwb3J0LCB7IHZhbGlkYXRlOiB0cnVlIH0pO1xuICAgIGlmICh0aGlzLm1vZGVsLnZhbGlkYXRpb25FcnJvcikge1xuICAgICAgJCgnI3BvcnRudW1iZXInKS52YWwoJycpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIHZhciBjb21tYW5kID0gdGhpcy5tb2RlbC5nZXQoJ3NlcnZlclN0YXRlJykgPT0gJ3N0YXJ0ZWQnID8gJ3N0b3AnIDogJ3N0YXJ0JztcbiAgICB0aGlzLm1vZGVsLnNlbmRTZXJ2ZXJDb21tYW5kKGNvbW1hbmQpO1xuICB9XG59KTtcbiIsIi8vIGhic2Z5IGNvbXBpbGVkIEhhbmRsZWJhcnMgdGVtcGxhdGVcbnZhciBIYW5kbGViYXJzID0gcmVxdWlyZSgnaGJzZnkvcnVudGltZScpO1xubW9kdWxlLmV4cG9ydHMgPSBIYW5kbGViYXJzLnRlbXBsYXRlKGZ1bmN0aW9uIChIYW5kbGViYXJzLGRlcHRoMCxoZWxwZXJzLHBhcnRpYWxzLGRhdGEpIHtcbiAgdGhpcy5jb21waWxlckluZm8gPSBbNCwnPj0gMS4wLjAnXTtcbmhlbHBlcnMgPSB0aGlzLm1lcmdlKGhlbHBlcnMsIEhhbmRsZWJhcnMuaGVscGVycyk7IGRhdGEgPSBkYXRhIHx8IHt9O1xuICB2YXIgYnVmZmVyID0gXCJcIiwgc3RhY2sxLCBmdW5jdGlvblR5cGU9XCJmdW5jdGlvblwiLCBlc2NhcGVFeHByZXNzaW9uPXRoaXMuZXNjYXBlRXhwcmVzc2lvbiwgc2VsZj10aGlzO1xuXG5mdW5jdGlvbiBwcm9ncmFtMShkZXB0aDAsZGF0YSkge1xuICBcbiAgdmFyIGJ1ZmZlciA9IFwiXCI7XG4gIGJ1ZmZlciArPSBcIlxcbiAgICAgICAgICA8bGkgY2xhc3M9XFxcImxpc3QtZ3JvdXAtaXRlbVxcXCI+XFxuICAgICAgICAgICAgXCJcbiAgICArIGVzY2FwZUV4cHJlc3Npb24oKHR5cGVvZiBkZXB0aDAgPT09IGZ1bmN0aW9uVHlwZSA/IGRlcHRoMC5hcHBseShkZXB0aDApIDogZGVwdGgwKSlcbiAgICArIFwiXFxuICAgICAgICAgIDwvbGk+XFxuICAgICAgICBcIjtcbiAgcmV0dXJuIGJ1ZmZlcjtcbiAgfVxuXG4gIGJ1ZmZlciArPSBcIjxkaXYgY2xhc3M9XFxcInJvd1xcXCI+XFxuICA8ZGl2IGNsYXNzPVxcXCJjb2wtbWQtNCBjb2wtbWQtb2Zmc2V0LTRcXFwiPlxcbiAgICA8YnV0dG9uIHR5cGU9XFxcImJ1dHRvblxcXCIgY2xhc3M9XFxcImJ0biBidG4taW5mb1xcXCIgaWQ9XFxcImJ0bmdldGhpc3RvcnlcXFwiPlNob3dcXG4gICAgICBIaXN0b3J5XFxuICAgIDwvYnV0dG9uPlxcbiAgPC9kaXY+XFxuPC9kaXY+XFxuPGRpdiBjbGFzcz1cXFwicm93XFxcIj5cXG4gIDxkaXYgY2xhc3M9XFxcImNvbC1tZC00IGNvbC1tZC1vZmZzZXQtNFxcXCI+XFxuICAgIDxoMz5NZXNzYWdlczwvaDM+XFxuXFxuICAgIDxkaXYgY2xhc3M9XFxcImlucHV0LWdyb3VwXFxcIj5cXG4gICAgICA8aW5wdXQgdHlwZT1cXFwidGV4dFxcXCIgY2xhc3M9XFxcImZvcm0tY29udHJvbCBzZWFyY2hcXFwiIGlkPVxcXCJzZWFyY2hmaWx0ZXJcXFwiXFxuICAgICAgICAgICAgIHBsYWNlaG9sZGVyPVxcXCJ0eXBlIGhlcmUgdG8gc2VhcmNoXFxcIi8+XFxuICAgICAgICA8c3BhbiBjbGFzcz1cXFwiaW5wdXQtZ3JvdXAtYWRkb25cXFwiPjxpXFxuICAgICAgICAgICAgY2xhc3M9XFxcImdseXBoaWNvbiBnbHlwaGljb24tc2VhcmNoXFxcIj48L2k+PC9zcGFuPlxcbiAgICA8L2Rpdj5cXG5cXG4gICAgPGRpdiBpZD1cXFwiaGlzdG9yeVxcXCI+XFxuICAgICAgPHVsIGNsYXNzPVxcXCJsaXN0IGxpc3QtZ3JvdXBcXFwiPlxcbiAgICAgICAgXCI7XG4gIHN0YWNrMSA9IGhlbHBlcnMuZWFjaC5jYWxsKGRlcHRoMCwgKGRlcHRoMCAmJiBkZXB0aDAubWVzc2FnZXMpLCB7aGFzaDp7fSxpbnZlcnNlOnNlbGYubm9vcCxmbjpzZWxmLnByb2dyYW0oMSwgcHJvZ3JhbTEsIGRhdGEpLGRhdGE6ZGF0YX0pO1xuICBpZihzdGFjazEgfHwgc3RhY2sxID09PSAwKSB7IGJ1ZmZlciArPSBzdGFjazE7IH1cbiAgYnVmZmVyICs9IFwiXFxuICAgICAgPC91bD5cXG4gICAgPC9kaXY+XFxuICA8L2Rpdj5cXG48L2Rpdj5cXG5cIjtcbiAgcmV0dXJuIGJ1ZmZlcjtcbiAgfSk7XG4iLCIvLyBoYnNmeSBjb21waWxlZCBIYW5kbGViYXJzIHRlbXBsYXRlXG52YXIgSGFuZGxlYmFycyA9IHJlcXVpcmUoJ2hic2Z5L3J1bnRpbWUnKTtcbm1vZHVsZS5leHBvcnRzID0gSGFuZGxlYmFycy50ZW1wbGF0ZShmdW5jdGlvbiAoSGFuZGxlYmFycyxkZXB0aDAsaGVscGVycyxwYXJ0aWFscyxkYXRhKSB7XG4gIHRoaXMuY29tcGlsZXJJbmZvID0gWzQsJz49IDEuMC4wJ107XG5oZWxwZXJzID0gdGhpcy5tZXJnZShoZWxwZXJzLCBIYW5kbGViYXJzLmhlbHBlcnMpOyBkYXRhID0gZGF0YSB8fCB7fTtcbiAgdmFyIGJ1ZmZlciA9IFwiXCIsIHN0YWNrMSwgaGVscGVyLCBmdW5jdGlvblR5cGU9XCJmdW5jdGlvblwiLCBlc2NhcGVFeHByZXNzaW9uPXRoaXMuZXNjYXBlRXhwcmVzc2lvbjtcblxuXG4gIGJ1ZmZlciArPSBcIjxkaXYgY2xhc3M9XFxcIlwiO1xuICBpZiAoaGVscGVyID0gaGVscGVycy5oaWRkZW4pIHsgc3RhY2sxID0gaGVscGVyLmNhbGwoZGVwdGgwLCB7aGFzaDp7fSxkYXRhOmRhdGF9KTsgfVxuICBlbHNlIHsgaGVscGVyID0gKGRlcHRoMCAmJiBkZXB0aDAuaGlkZGVuKTsgc3RhY2sxID0gdHlwZW9mIGhlbHBlciA9PT0gZnVuY3Rpb25UeXBlID8gaGVscGVyLmNhbGwoZGVwdGgwLCB7aGFzaDp7fSxkYXRhOmRhdGF9KSA6IGhlbHBlcjsgfVxuICBidWZmZXIgKz0gZXNjYXBlRXhwcmVzc2lvbihzdGFjazEpXG4gICAgKyBcIlxcXCI+XFxuXFxuICA8ZGl2IGlkPVxcXCJtZXNzYWdlLXNlbmRcXFwiPiA8L2Rpdj5cXG5cXG4gIDxkaXYgaWQ9XFxcIm1lc3NhZ2UtcmVjZWl2ZVxcXCI+PC9kaXY+XFxuXFxuICA8ZGl2IGlkPVxcXCJtZXNzYWdlLWhpc3RvcnlcXFwiPjwvZGl2PlxcblxcbjwvZGl2PlxcblwiO1xuICByZXR1cm4gYnVmZmVyO1xuICB9KTtcbiIsIi8vIGhic2Z5IGNvbXBpbGVkIEhhbmRsZWJhcnMgdGVtcGxhdGVcbnZhciBIYW5kbGViYXJzID0gcmVxdWlyZSgnaGJzZnkvcnVudGltZScpO1xubW9kdWxlLmV4cG9ydHMgPSBIYW5kbGViYXJzLnRlbXBsYXRlKGZ1bmN0aW9uIChIYW5kbGViYXJzLGRlcHRoMCxoZWxwZXJzLHBhcnRpYWxzLGRhdGEpIHtcbiAgdGhpcy5jb21waWxlckluZm8gPSBbNCwnPj0gMS4wLjAnXTtcbmhlbHBlcnMgPSB0aGlzLm1lcmdlKGhlbHBlcnMsIEhhbmRsZWJhcnMuaGVscGVycyk7IGRhdGEgPSBkYXRhIHx8IHt9O1xuICB2YXIgYnVmZmVyID0gXCJcIiwgc3RhY2sxLCBoZWxwZXIsIGZ1bmN0aW9uVHlwZT1cImZ1bmN0aW9uXCIsIGVzY2FwZUV4cHJlc3Npb249dGhpcy5lc2NhcGVFeHByZXNzaW9uO1xuXG5cbiAgYnVmZmVyICs9IFwiPGRpdiBjbGFzcz1cXFwicm93XFxcIj5cXG4gIDxkaXYgY2xhc3M9XFxcImNvbC1tZC00IGNvbC1tZC1vZmZzZXQtNFxcXCIgaWQ9XFxcImluZm9cXFwiPlxcbiAgICA8ZGl2IGNsYXNzPVxcXCJhbGVydCBhbGVydC1pbmZvXFxcIj5cXG4gICAgICA8c3Ryb25nPlwiO1xuICBpZiAoaGVscGVyID0gaGVscGVycy5tZXNzYWdlKSB7IHN0YWNrMSA9IGhlbHBlci5jYWxsKGRlcHRoMCwge2hhc2g6e30sZGF0YTpkYXRhfSk7IH1cbiAgZWxzZSB7IGhlbHBlciA9IChkZXB0aDAgJiYgZGVwdGgwLm1lc3NhZ2UpOyBzdGFjazEgPSB0eXBlb2YgaGVscGVyID09PSBmdW5jdGlvblR5cGUgPyBoZWxwZXIuY2FsbChkZXB0aDAsIHtoYXNoOnt9LGRhdGE6ZGF0YX0pIDogaGVscGVyOyB9XG4gIGJ1ZmZlciArPSBlc2NhcGVFeHByZXNzaW9uKHN0YWNrMSlcbiAgICArIFwiPC9zdHJvbmc+XFxuICAgIDwvZGl2PlxcbiAgPC9kaXY+XFxuPC9kaXY+XFxuXCI7XG4gIHJldHVybiBidWZmZXI7XG4gIH0pO1xuIiwiLy8gaGJzZnkgY29tcGlsZWQgSGFuZGxlYmFycyB0ZW1wbGF0ZVxudmFyIEhhbmRsZWJhcnMgPSByZXF1aXJlKCdoYnNmeS9ydW50aW1lJyk7XG5tb2R1bGUuZXhwb3J0cyA9IEhhbmRsZWJhcnMudGVtcGxhdGUoZnVuY3Rpb24gKEhhbmRsZWJhcnMsZGVwdGgwLGhlbHBlcnMscGFydGlhbHMsZGF0YSkge1xuICB0aGlzLmNvbXBpbGVySW5mbyA9IFs0LCc+PSAxLjAuMCddO1xuaGVscGVycyA9IHRoaXMubWVyZ2UoaGVscGVycywgSGFuZGxlYmFycy5oZWxwZXJzKTsgZGF0YSA9IGRhdGEgfHwge307XG4gIFxuXG5cbiAgcmV0dXJuIFwiPGRpdiBjbGFzcz1cXFwicm93IHRvcG1hcmdpblxcXCI+XFxuICA8ZGl2IGNsYXNzPVxcXCJjb2wtbWQtNCBjb2wtbWQtb2Zmc2V0LTRcXFwiPlxcbiAgICA8ZGl2IGNsYXNzPVxcXCJ3ZWxsXFxcIj5cXG4gICAgICA8Zm9ybSByb2xlPVxcXCJmb3JtXFxcIiBpZD1cXFwiZm9ybW1lc3NhZ2VcXFwiPlxcbiAgICAgICAgPGRpdiBjbGFzcz1cXFwiZm9ybS1ncm91cFxcXCI+XFxuICAgICAgICAgIDxsYWJlbCBmb3I9XFxcIm1lc3NhZ2VcXFwiPk1lc3NhZ2U8L2xhYmVsPlxcblxcbiAgICAgICAgICA8ZGl2IGNsYXNzPVxcXCJpbnB1dC1ncm91cFxcXCI+XFxuICAgICAgICAgICAgPGlucHV0IHR5cGU9XFxcInRleHRcXFwiIGNsYXNzPVxcXCJmb3JtLWNvbnRyb2xcXFwiIGlkPVxcXCJtZXNzYWdlXFxcIlxcbiAgICAgICAgICAgICAgICAgICBwbGFjZWhvbGRlcj1cXFwiU2VuZCBtZXNzYWdlLi4uXFxcIj5cXG4gICAgICAgICAgICAgIDxzcGFuIGNsYXNzPVxcXCJpbnB1dC1ncm91cC1idG5cXFwiPlxcbiAgICAgICAgICAgICAgICA8YnV0dG9uIHR5cGU9XFxcInN1Ym1pdFxcXCIgY2xhc3M9XFxcImJ0biBidG4tZGVmYXVsdFxcXCJcXG4gICAgICAgICAgICAgICAgICAgICAgICBpZD1cXFwiYnRuc2VuZG1lc3NhZ2VcXFwiPlNlbmRcXG4gICAgICAgICAgICAgICAgPC9idXR0b24+XFxuICAgICAgICAgICAgICA8L3NwYW4+XFxuICAgICAgICAgIDwvZGl2PlxcbiAgICAgICAgPC9kaXY+XFxuICAgICAgPC9mb3JtPlxcbiAgICA8L2Rpdj5cXG4gIDwvZGl2PlxcbjwvZGl2PlxcblwiO1xuICB9KTtcbiIsIi8vIGhic2Z5IGNvbXBpbGVkIEhhbmRsZWJhcnMgdGVtcGxhdGVcbnZhciBIYW5kbGViYXJzID0gcmVxdWlyZSgnaGJzZnkvcnVudGltZScpO1xubW9kdWxlLmV4cG9ydHMgPSBIYW5kbGViYXJzLnRlbXBsYXRlKGZ1bmN0aW9uIChIYW5kbGViYXJzLGRlcHRoMCxoZWxwZXJzLHBhcnRpYWxzLGRhdGEpIHtcbiAgdGhpcy5jb21waWxlckluZm8gPSBbNCwnPj0gMS4wLjAnXTtcbmhlbHBlcnMgPSB0aGlzLm1lcmdlKGhlbHBlcnMsIEhhbmRsZWJhcnMuaGVscGVycyk7IGRhdGEgPSBkYXRhIHx8IHt9O1xuICB2YXIgYnVmZmVyID0gXCJcIiwgc3RhY2sxLCBoZWxwZXIsIGZ1bmN0aW9uVHlwZT1cImZ1bmN0aW9uXCIsIGVzY2FwZUV4cHJlc3Npb249dGhpcy5lc2NhcGVFeHByZXNzaW9uO1xuXG5cbiAgYnVmZmVyICs9IFwiPGRpdiBjbGFzcz1cXFwicm93XFxcIj5cXG4gIDxkaXYgY2xhc3M9XFxcImNvbC1tZC00IGNvbC1tZC1vZmZzZXQtNFxcXCI+XFxuICAgIDxkaXYgY2xhc3M9XFxcIndlbGxcXFwiPlxcbiAgICAgIDxmb3JtIHJvbGU9XFxcImZvcm1cXFwiIGFjdGlvbj1cXFwiLyNcXFwiPlxcbiAgICAgICAgPGRpdiBjbGFzcz1cXFwiZm9ybS1ncm91cFxcXCI+XFxuXFxuICAgICAgICAgIDxkaXYgY2xhc3M9XFxcImZvcm0taW5saW5lXFxcIj5cXG4gICAgICAgICAgICA8bGFiZWwgZm9yPVxcXCJwb3J0bnVtYmVyXFxcIj5FY2hvIFNlcnZlcjwvbGFiZWw+XFxuICAgICAgICAgICAgPHNwYW4gaWQ9XFxcInNlcnZlci1zdGF0ZVxcXCIgY2xhc3M9XFxcIlwiO1xuICBpZiAoaGVscGVyID0gaGVscGVycy5zdGF0ZUNsYXNzKSB7IHN0YWNrMSA9IGhlbHBlci5jYWxsKGRlcHRoMCwge2hhc2g6e30sZGF0YTpkYXRhfSk7IH1cbiAgZWxzZSB7IGhlbHBlciA9IChkZXB0aDAgJiYgZGVwdGgwLnN0YXRlQ2xhc3MpOyBzdGFjazEgPSB0eXBlb2YgaGVscGVyID09PSBmdW5jdGlvblR5cGUgPyBoZWxwZXIuY2FsbChkZXB0aDAsIHtoYXNoOnt9LGRhdGE6ZGF0YX0pIDogaGVscGVyOyB9XG4gIGJ1ZmZlciArPSBlc2NhcGVFeHByZXNzaW9uKHN0YWNrMSlcbiAgICArIFwiXFxcIj5cIjtcbiAgaWYgKGhlbHBlciA9IGhlbHBlcnMuc2VydmVyU3RhdGUpIHsgc3RhY2sxID0gaGVscGVyLmNhbGwoZGVwdGgwLCB7aGFzaDp7fSxkYXRhOmRhdGF9KTsgfVxuICBlbHNlIHsgaGVscGVyID0gKGRlcHRoMCAmJiBkZXB0aDAuc2VydmVyU3RhdGUpOyBzdGFjazEgPSB0eXBlb2YgaGVscGVyID09PSBmdW5jdGlvblR5cGUgPyBoZWxwZXIuY2FsbChkZXB0aDAsIHtoYXNoOnt9LGRhdGE6ZGF0YX0pIDogaGVscGVyOyB9XG4gIGJ1ZmZlciArPSBlc2NhcGVFeHByZXNzaW9uKHN0YWNrMSlcbiAgICArIFwiPC9zcGFuPlxcbiAgICAgICAgICA8L2Rpdj5cXG5cXG4gICAgICAgICAgPGlucHV0IHR5cGU9XFxcInRleHRcXFwiIGNsYXNzPVxcXCJmb3JtLWNvbnRyb2wgXCI7XG4gIGlmIChoZWxwZXIgPSBoZWxwZXJzLmlucHV0VmlzaWJpbGl0eSkgeyBzdGFjazEgPSBoZWxwZXIuY2FsbChkZXB0aDAsIHtoYXNoOnt9LGRhdGE6ZGF0YX0pOyB9XG4gIGVsc2UgeyBoZWxwZXIgPSAoZGVwdGgwICYmIGRlcHRoMC5pbnB1dFZpc2liaWxpdHkpOyBzdGFjazEgPSB0eXBlb2YgaGVscGVyID09PSBmdW5jdGlvblR5cGUgPyBoZWxwZXIuY2FsbChkZXB0aDAsIHtoYXNoOnt9LGRhdGE6ZGF0YX0pIDogaGVscGVyOyB9XG4gIGJ1ZmZlciArPSBlc2NhcGVFeHByZXNzaW9uKHN0YWNrMSlcbiAgICArIFwiXFxcIiBpZD1cXFwicG9ydG51bWJlclxcXCJcXG4gICAgICAgICAgICAgICAgIHBsYWNlaG9sZGVyPVxcXCJFbnRlciBwb3J0IGJldHdlZW4gMTAyNC02NTUzNVxcXCJcXG4gICAgICAgICAgICAgICAgIHZhbHVlPVxcXCJcIjtcbiAgaWYgKGhlbHBlciA9IGhlbHBlcnMuc2VydmVyUG9ydCkgeyBzdGFjazEgPSBoZWxwZXIuY2FsbChkZXB0aDAsIHtoYXNoOnt9LGRhdGE6ZGF0YX0pOyB9XG4gIGVsc2UgeyBoZWxwZXIgPSAoZGVwdGgwICYmIGRlcHRoMC5zZXJ2ZXJQb3J0KTsgc3RhY2sxID0gdHlwZW9mIGhlbHBlciA9PT0gZnVuY3Rpb25UeXBlID8gaGVscGVyLmNhbGwoZGVwdGgwLCB7aGFzaDp7fSxkYXRhOmRhdGF9KSA6IGhlbHBlcjsgfVxuICBidWZmZXIgKz0gZXNjYXBlRXhwcmVzc2lvbihzdGFjazEpXG4gICAgKyBcIlxcXCI+XFxuICAgICAgICA8L2Rpdj5cXG4gICAgICAgIDxkaXYgY2xhc3M9XFxcImZvcm0taW5saW5lXFxcIj5cXG4gICAgICAgICAgPGJ1dHRvbiB0eXBlPVxcXCJzdWJtaXRcXFwiIGNsYXNzPVxcXCJidG4gYnRuLWRlZmF1bHRcXFwiXFxuICAgICAgICAgICAgICAgICAgaWQ9XFxcImJ0bnNlcnZlclxcXCI+XCI7XG4gIGlmIChoZWxwZXIgPSBoZWxwZXJzLnNlcnZlckNvbW1hbmQpIHsgc3RhY2sxID0gaGVscGVyLmNhbGwoZGVwdGgwLCB7aGFzaDp7fSxkYXRhOmRhdGF9KTsgfVxuICBlbHNlIHsgaGVscGVyID0gKGRlcHRoMCAmJiBkZXB0aDAuc2VydmVyQ29tbWFuZCk7IHN0YWNrMSA9IHR5cGVvZiBoZWxwZXIgPT09IGZ1bmN0aW9uVHlwZSA/IGhlbHBlci5jYWxsKGRlcHRoMCwge2hhc2g6e30sZGF0YTpkYXRhfSkgOiBoZWxwZXI7IH1cbiAgYnVmZmVyICs9IGVzY2FwZUV4cHJlc3Npb24oc3RhY2sxKVxuICAgICsgXCJcXG4gICAgICAgICAgPC9idXR0b24+XFxuICAgICAgICAgIDxzcGFuIGlkPVxcXCJzZXJ2ZXItZXJyb3JcXFwiIGNsYXNzPVxcXCJcIjtcbiAgaWYgKGhlbHBlciA9IGhlbHBlcnMuc2VydmVyRXJyb3JDbGFzcykgeyBzdGFjazEgPSBoZWxwZXIuY2FsbChkZXB0aDAsIHtoYXNoOnt9LGRhdGE6ZGF0YX0pOyB9XG4gIGVsc2UgeyBoZWxwZXIgPSAoZGVwdGgwICYmIGRlcHRoMC5zZXJ2ZXJFcnJvckNsYXNzKTsgc3RhY2sxID0gdHlwZW9mIGhlbHBlciA9PT0gZnVuY3Rpb25UeXBlID8gaGVscGVyLmNhbGwoZGVwdGgwLCB7aGFzaDp7fSxkYXRhOmRhdGF9KSA6IGhlbHBlcjsgfVxuICBidWZmZXIgKz0gZXNjYXBlRXhwcmVzc2lvbihzdGFjazEpXG4gICAgKyBcIlxcXCI+XCI7XG4gIGlmIChoZWxwZXIgPSBoZWxwZXJzLnNlcnZlckVycm9yKSB7IHN0YWNrMSA9IGhlbHBlci5jYWxsKGRlcHRoMCwge2hhc2g6e30sZGF0YTpkYXRhfSk7IH1cbiAgZWxzZSB7IGhlbHBlciA9IChkZXB0aDAgJiYgZGVwdGgwLnNlcnZlckVycm9yKTsgc3RhY2sxID0gdHlwZW9mIGhlbHBlciA9PT0gZnVuY3Rpb25UeXBlID8gaGVscGVyLmNhbGwoZGVwdGgwLCB7aGFzaDp7fSxkYXRhOmRhdGF9KSA6IGhlbHBlcjsgfVxuICBidWZmZXIgKz0gZXNjYXBlRXhwcmVzc2lvbihzdGFjazEpXG4gICAgKyBcIjwvc3Bhbj5cXG4gICAgICAgIDwvZGl2PlxcbiAgICAgIDwvZm9ybT5cXG4gICAgPC9kaXY+XFxuICA8L2Rpdj5cXG48L2Rpdj5cXG5cIjtcbiAgcmV0dXJuIGJ1ZmZlcjtcbiAgfSk7XG4iXX0=
