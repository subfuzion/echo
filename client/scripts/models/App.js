var EchoClient = require('./../libs/echoclient')
  , EchoResponse = require('./EchoResponse')
  ;

/**
 * The App model provides a backbone wrapper over EchoClient and server functions
 */
var App = Backbone.Model.extend({
  defaults: {
    host: 'localhost',
    serverState: 'stopped'
  },

  initialize: function() {
  },

  validate: function(attrs) {
    if (!EchoClient.validatePort(attrs.port)) {
      console.log('port not valid: ' + attrs.port);
      return 'invalid port';
    }
  },

  /*
  checkServerStatus: function() {
    var self = this;

    $.getJSON('/api/v1/echoserver/' + this.get('port'), function (result) {
      if (result && result.status == 'error') {
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
  */

  startServer: function() {
    this.sendServerCommand('start');
  },

  stopServer: function() {
    this.sendServerCommand('stop');
  },

  sendServerCommand: function(command) {
    if (!this.isValid()) {
      console.log('sendServerCommand state not valid for command: ' + command);
      return;
    }

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
        if (command == 'stop') {
          self.set('serverState', 'stopped');
          return;
        }
        self.trigger('serverError', result.message);
        return;
      }

      var started = /started/.test(result.message, "i");

      // once the server is started, open a client connection
      if (started) {
        console.log('server started on port ' + self.get('port'));
        self.set('serverState', 'started');
      } else {
        console.log('server stopped on port ' + self.get('port'));
        self.set('serverState', 'stopped');
      }
    });
  },

  open: function() {
    //if (this.client.isOpen()) return;
    if (this.client != null) {
      console.log('error: client already open');
      return;
    }
    console.log('open connection to ' + this.get('port'));

    this.client = new EchoClient();

    var self = this;

    self.client.onopen = function() {
      console.log('connection is open');
      self.set('isOpen', true);
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
      self.client = null;

      self.set('isOpen', false);
      self.trigger('close');
    };

    self.client.onerror = function(err) {
      console.log('-----');
      console.log('client error:');
      console.log(err);
      console.log('-----');

      // release handlers
      self.client.onopen = null;
      self.client.onclose = null;
      self.client.onerror = null;
      self.client.onmessage = null;
      self.client.onhistory = null;
      self.client = null;

      self.set('isOpen', false);
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
    if (this.client == null || this.client.isClosed()) return;
    console.log('close connection to ' + this.get('port'));
    this.client.close();
  },

  send: function(message) {
    if (this.client && !this.client.isOpen()) return;
    this.client.send(message);
  },

  sendHistoryCommand: function() {
    // just a shortcut for entering '[HISTORY]'
    if (this.client && !this.client.isOpen()) return;
    this.client.sendHistoryCommand();
  },

  historyFilter: function(pattern) {
    if (!this.client) return [];
    return this.client.historyFilter(pattern);
  }
});

module.exports = App;

