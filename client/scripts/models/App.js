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

